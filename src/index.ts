/**
 * @fileoverview REST API server for yPad note management.
 *
 * Endpoints:
 * - POST /api/notes - Create note
 * - GET /api/notes/:id - Get note
 * - PUT /api/notes/:id - Update note
 * - DELETE /api/notes/:id - Delete note
 * - GET /api/notes/:id/ws - WebSocket connection for real-time editing
 * - POST /api/notes/:id/view - Increment view count
 * - GET /api/check/:id - Check if custom ID is available
 *
 * Uses Cloudflare Workers with D1 database and Durable Objects.
 */

import { Hono, Context, Next } from 'hono';
import { cors } from 'hono/cors';
import { LIMITS, CUSTOM_ID_PATTERN, SECURITY_HEADERS, RATE_LIMITS } from '../config/constants';
import { ALLOWED_SYNTAX_MODES } from '../config/languages';

/** Request body for creating a new note. */
interface CreateNotePayload {
  id?: string;
  content: string;
  syntax_highlight?: string;
  max_views?: number | null;
  expires_in?: number;
  is_encrypted?: boolean;
}

/** Request body for updating an existing note. */
interface UpdateNotePayload {
  content: string;
  syntax_highlight?: string;
  max_views?: number | null;
  expires_in?: number;
  clear_expiration?: boolean;
  is_encrypted?: boolean;
  session_id?: string;
  expected_version?: number | null;
}

const app = new Hono<{ Bindings: Env }>();

app.use('/*', cors());

// Add security headers to all responses
app.use('*', async (c, next) => {
  await next();
  c.header('Content-Security-Policy', SECURITY_HEADERS.CONTENT_SECURITY_POLICY);
  c.header('X-Content-Type-Options', SECURITY_HEADERS.X_CONTENT_TYPE_OPTIONS);
  c.header('X-Frame-Options', SECURITY_HEADERS.X_FRAME_OPTIONS);
  c.header('Referrer-Policy', SECURITY_HEADERS.REFERRER_POLICY);
});

/**
 * Creates rate limiting middleware using Durable Objects.
 * @param limit - Maximum requests per window
 * @param windowMs - Window duration in milliseconds
 */
function rateLimit(limit: number, windowMs: number = 60000) {
  return async (c: Context<{ Bindings: Env }>, next: Next) => {
    // Skip rate limiting if disabled (for local development/testing)
    if (c.env.DISABLE_RATE_LIMITS === 'true') {
      await next();
      return;
    }

    const sessionId = c.req.query('session_id') ||
                      c.req.header('X-Session-ID') ||
                      'anonymous';

    const endpoint = c.req.method + ':' + c.req.routePath;
    const doId = c.env.RATE_LIMITER.idFromName(sessionId);
    const stub = c.env.RATE_LIMITER.get(doId);

    const response = await stub.fetch(new Request('http://do/check', {
      method: 'POST',
      body: JSON.stringify({ endpoint, limit, windowMs }),
    }));

    if (!response.ok) {
      const retryAfter = response.headers.get('Retry-After');
      const headers: Record<string, string> = {};
      if (retryAfter) headers['Retry-After'] = retryAfter;
      return c.json({ error: 'Rate limit exceeded' }, 429, headers);
    }

    await next();
  };
}
// WebSocket endpoint for real-time collaboration
app.get('/api/notes/:id/ws', rateLimit(RATE_LIMITS.API.WS_UPGRADE_PER_MINUTE), async (c) => {
  const id = c.req.param('id');

  // Validate note exists
  const note = await c.env.DB.prepare(
    'SELECT id, expires_at FROM notes WHERE id = ?'
  ).bind(id).first();

  if (!note) {
    return c.json({ error: 'Note not found' }, 404);
  }

  // Check if note has expired
  if (note.expires_at && Date.now() > Number(note.expires_at)) {
    await c.env.DB.prepare('DELETE FROM notes WHERE id = ?').bind(id).run();
    return c.json({ error: 'Note has expired' }, 410);
  }

  // Update last accessed timestamp
  await c.env.DB.prepare(
    'UPDATE notes SET last_accessed_at = ? WHERE id = ?'
  ).bind(Date.now(), id).run();

  // Get Durable Object instance (one per note ID)
  const doId = c.env.NOTE_SESSIONS.idFromName(id);
  const stub = c.env.NOTE_SESSIONS.get(doId);

  // Forward WebSocket upgrade to Durable Object
  return stub.fetch(c.req.raw);
});

app.get('/api/notes/:id', rateLimit(RATE_LIMITS.API.READ_PER_MINUTE), async (c) => {
  const id = c.req.param('id');

  // First, check note metadata from D1 (for expiry, view count)
  const note = await c.env.DB.prepare(
    'SELECT id, expires_at, view_count, max_views, created_at, is_encrypted FROM notes WHERE id = ?'
  ).bind(id).first();

  if (!note) {
    return c.json({ error: 'Note not found' }, 404);
  }

  // Check if note has expired
  if (note.expires_at && Date.now() > Number(note.expires_at)) {
    await c.env.DB.prepare('DELETE FROM notes WHERE id = ?').bind(id).run();
    return c.json({ error: 'Note has expired' }, 410);
  }

  const currentViewCount = Number(note.view_count);
  let newViewCount = currentViewCount;
  let isLastView = false;

  // For encrypted notes, don't increment view count here - client will confirm after decryption
  // For non-encrypted notes, increment view count immediately
  if (!note.is_encrypted) {
    newViewCount = currentViewCount + 1;

    // Check if this view exceeds the limit (note was already fully consumed)
    if (note.max_views && newViewCount > Number(note.max_views)) {
      await c.env.DB.prepare('DELETE FROM notes WHERE id = ?').bind(id).run();
      return c.json({ error: 'Note has reached max views' }, 410);
    }

    // Check if this is the final allowed view
    isLastView = !!(note.max_views && newViewCount >= Number(note.max_views));

    // Update view count and last accessed timestamp (non-blocking)
    c.env.DB.prepare(
      'UPDATE notes SET view_count = ?, last_accessed_at = ? WHERE id = ?'
    ).bind(newViewCount, Date.now(), id).run().catch((error: any) => {
      console.error(`Failed to update view count for ${id}:`, error);
    });

    // If this was the last allowed view, delete the note (non-blocking)
    if (isLastView) {
      c.env.DB.prepare('DELETE FROM notes WHERE id = ?').bind(id).run().catch((error: any) => {
        console.error(`Failed to delete note ${id} after last view:`, error);
      });
    }
  } else {
    // For encrypted notes, just update last accessed timestamp
    c.env.DB.prepare(
      'UPDATE notes SET last_accessed_at = ? WHERE id = ?'
    ).bind(Date.now(), id).run().catch((error: any) => {
      console.error(`Failed to update last_accessed_at for ${id}:`, error);
    });
  }

  // Get Durable Object for this note
  const doId = c.env.NOTE_SESSIONS.idFromName(id);
  const stub = c.env.NOTE_SESSIONS.get(doId);

  // Fetch note content from DO cache (DO will lazy-load from D1 if needed)
  const doResponse = await stub.fetch(new Request(`http://do/fetch?noteId=${encodeURIComponent(id)}`, { method: 'GET' }));

  if (!doResponse.ok) {
    return c.json({ error: 'Failed to fetch note content' }, 500);
  }

  const doData = await doResponse.json() as {
    content: string;
    version: number;
    syntax_highlight: string;
    is_encrypted: boolean;
  };

  return c.json({
    id: note.id,
    content: doData.content,
    syntax_highlight: doData.syntax_highlight,
    view_count: newViewCount,
    max_views: note.max_views,
    expires_at: note.expires_at,
    created_at: note.created_at,
    version: doData.version,
    is_encrypted: !!note.is_encrypted,
    is_last_view: isLastView
  });
});

// Confirm view for encrypted notes (called after successful decryption)
app.post('/api/notes/:id/view', rateLimit(RATE_LIMITS.API.READ_PER_MINUTE), async (c) => {
  const id = c.req.param('id');

  const note = await c.env.DB.prepare(
    'SELECT id, view_count, max_views, is_encrypted FROM notes WHERE id = ?'
  ).bind(id).first();

  if (!note) {
    return c.json({ error: 'Note not found' }, 404);
  }

  // Only count views for encrypted notes through this endpoint
  if (!note.is_encrypted) {
    return c.json({ error: 'This endpoint is only for encrypted notes' }, 400);
  }

  const newViewCount = Number(note.view_count) + 1;

  // Check if this view exceeds the limit
  if (note.max_views && newViewCount > Number(note.max_views)) {
    await c.env.DB.prepare('DELETE FROM notes WHERE id = ?').bind(id).run();
    return c.json({ error: 'Note has reached max views' }, 410);
  }

  const isLastView = !!(note.max_views && newViewCount >= Number(note.max_views));

  // Update view count
  await c.env.DB.prepare(
    'UPDATE notes SET view_count = ? WHERE id = ?'
  ).bind(newViewCount, id).run();

  // If this was the last allowed view, delete the note
  if (isLastView) {
    await c.env.DB.prepare('DELETE FROM notes WHERE id = ?').bind(id).run();
  }

  return c.json({
    view_count: newViewCount,
    is_last_view: isLastView
  });
});

app.post('/api/notes', rateLimit(RATE_LIMITS.API.CREATE_PER_MINUTE), async (c) => {
  const body: CreateNotePayload = await c.req.json();
  const { id, content, syntax_highlight, max_views, expires_in, is_encrypted } = body;

  // Validate content
  if (!content || content.length === 0) {
    return c.json({ error: 'Content is required' }, 400);
  }
  if (content.length > LIMITS.MAX_CONTENT_SIZE) {
    return c.json({ error: 'Content too large (max 1MB)' }, 413);
  }

  // Validate custom ID format
  if (id) {
    if (id.length > LIMITS.MAX_ID_LENGTH) {
      return c.json({ error: 'ID too long (max 100 chars)' }, 400);
    }
    if (!CUSTOM_ID_PATTERN.test(id)) {
      return c.json({ error: 'ID can only contain letters, numbers, hyphens, and underscores' }, 400);
    }

    // Check if custom ID is already taken
    const existing = await c.env.DB.prepare(
      'SELECT id FROM notes WHERE id = ?'
    ).bind(id).first();

    if (existing) {
      return c.json({ error: 'ID already taken', available: false }, 409);
    }
  }

  // Validate syntax highlighting mode
  if (syntax_highlight && !ALLOWED_SYNTAX_MODES.includes(syntax_highlight as any)) {
    return c.json({ error: 'Invalid syntax highlighting mode' }, 400);
  }

  // Validate max_views range
  if (max_views !== undefined && max_views !== null) {
    if (max_views < LIMITS.MIN_VIEWS || max_views > LIMITS.MAX_VIEWS) {
      return c.json({ error: `max_views must be between ${LIMITS.MIN_VIEWS} and ${LIMITS.MAX_VIEWS.toLocaleString()}` }, 400);
    }
  }

  // Validate expiration time range
  if (expires_in !== undefined && expires_in !== null) {
    if (expires_in < LIMITS.MIN_EXPIRATION || expires_in > LIMITS.MAX_EXPIRATION) {
      return c.json({ error: 'expires_in must be between 1 minute and 1 year' }, 400);
    }
  }

  // Generate unique ID with adaptive length
  let noteId = id;
  if (!id) {
    let length = 4; // Start with 4 characters
    let attempts = 0;
    const maxAttemptsPerLength = 3;

    while (!noteId) {
      attempts++;
      const candidateId = generateId(length);

      // Check if ID already exists
      const existing = await c.env.DB.prepare(
        'SELECT id FROM notes WHERE id = ?'
      ).bind(candidateId).first();

      if (!existing) {
        noteId = candidateId;
      } else if (attempts >= maxAttemptsPerLength) {
        // After 3 failed attempts, increase length and reset attempts
        length++;
        attempts = 0;

        // Safety limit: don't exceed 10 characters
        if (length > 10) {
          return c.json({ error: 'Failed to generate unique ID' }, 500);
        }
      }
    }
  }

  const expires_at = expires_in ? Date.now() + expires_in : null;
  const now = Date.now();

  await c.env.DB.prepare(
    `INSERT INTO notes (id, content, syntax_highlight, max_views, expires_at, created_at, updated_at, version, last_session_id, is_encrypted, last_accessed_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 1, NULL, ?, ?)`
  ).bind(
    noteId,
    content,
    syntax_highlight || 'plaintext',
    max_views || null,
    expires_at,
    now,
    now,
    is_encrypted ? 1 : 0,
    now
  ).run();

  return c.json({ id: noteId, available: true, version: 1 });
});

app.put('/api/notes/:id', rateLimit(RATE_LIMITS.API.UPDATE_PER_MINUTE), async (c) => {
  const id = c.req.param('id');
  const body: UpdateNotePayload = await c.req.json();
  const { content, syntax_highlight, max_views, expires_in, clear_expiration, session_id, expected_version, is_encrypted } = body;

  const existing = await c.env.DB.prepare(
    'SELECT * FROM notes WHERE id = ?'
  ).bind(id).first();

  if (!existing) {
    return c.json({ error: 'Note not found' }, 404);
  }

  // Handle expiration: clear_expiration sets to null, expires_in sets new value, otherwise keep existing
  const expires_at = clear_expiration ? null : (expires_in ? Date.now() + expires_in : existing.expires_at);

  // Determine if max_views is being changed (set to a new value)
  // When max_views is set, reset view_count to 0 so it represents "X more views from now"
  const isSettingMaxViews = max_views !== undefined && max_views !== null && max_views !== existing.max_views;

  // Atomic SQL update with version checking and conditional increment
  const result = await c.env.DB.prepare(
    `UPDATE notes
     SET
       content = ?,
       syntax_highlight = ?,
       max_views = ?,
       view_count = CASE WHEN ? THEN 0 ELSE view_count END,
       expires_at = ?,
       updated_at = ?,
       is_encrypted = ?,
       version = CASE
         WHEN last_session_id = ? OR last_session_id IS NULL THEN version
         ELSE version + 1
       END,
       last_session_id = ?
     WHERE id = ? AND (version = ? OR ? IS NULL)
     RETURNING version`
  ).bind(
    content !== undefined ? content : existing.content,
    syntax_highlight || existing.syntax_highlight,
    max_views !== undefined ? max_views : existing.max_views,
    isSettingMaxViews ? 1 : 0,  // Reset view_count if setting new max_views
    expires_at,
    Date.now(),
    is_encrypted !== undefined ? (is_encrypted ? 1 : 0) : existing.is_encrypted,
    session_id || null,  // for CASE check
    session_id || null,  // new session_id
    id,
    expected_version,    // WHERE condition for version check
    expected_version     // Allow NULL expected_version to skip check
  ).first();

  if (!result) {
    // Update failed - version mismatch = conflict
    const current = await c.env.DB.prepare(
      'SELECT version FROM notes WHERE id = ?'
    ).bind(id).first();

    return c.json({
      error: 'Conflict: Someone else edited this paste',
      current_version: current?.version || 1
    }, 409);
  }

  // Check if encryption status changed
  const encryptionChanged = (is_encrypted !== undefined) &&
    (!!is_encrypted !== !!existing.is_encrypted);

  // Notify clients if encryption status changed
  if (encryptionChanged) {
    // Notify all connected clients via Durable Object
    try {
      const doId = c.env.NOTE_SESSIONS.idFromName(id);
      const stub = c.env.NOTE_SESSIONS.get(doId);

      // Send a POST request to notify about encryption change
      await stub.fetch(new Request(`http://do/notify-encryption-change`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          is_encrypted: !!is_encrypted,
          exclude_session_id: session_id // Don't notify the user who made the change
        })
      }));
    } catch (error) {
      console.error('Failed to notify encryption change:', error);
      // Don't fail the request if broadcast fails
    }
  }

  // For encrypted notes, notify other clients about the version update
  // and update the DO cache (since they don't get operation-based updates via WebSocket)
  const finalIsEncrypted = is_encrypted !== undefined ? !!is_encrypted : !!existing.is_encrypted;
  if (finalIsEncrypted && content !== undefined) {
    try {
      const doId = c.env.NOTE_SESSIONS.idFromName(id);
      const stub = c.env.NOTE_SESSIONS.get(doId);

      await stub.fetch(new Request(`http://do/notify-version-update`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          version: result.version,
          content: content, // Update DO cache with new content
          syntax_highlight: syntax_highlight || existing.syntax_highlight,
          exclude_session_id: session_id // Don't notify the user who made the change
        })
      }));
    } catch (error) {
      console.error('Failed to notify version update:', error);
      // Don't fail the request if broadcast fails
    }
  }

  return c.json({ success: true, version: result.version, expires_at });
});

app.get('/api/check/:id', async (c) => {
  const id = c.req.param('id');

  const note = await c.env.DB.prepare(
    'SELECT id FROM notes WHERE id = ?'
  ).bind(id).first();

  return c.json({ available: !note });
});

app.post('/api/notes/:id/refresh', async (c) => {
  const id = c.req.param('id');

  // Force Durable Object to refresh from database
  try {
    const doId = c.env.NOTE_SESSIONS.idFromName(id);
    const stub = c.env.NOTE_SESSIONS.get(doId);

    await stub.fetch(new Request(`http://internal/refresh`, { method: 'POST' }));
    return c.json({ success: true, message: 'Durable Object refreshed from database' });
  } catch (error) {
    console.error('Failed to refresh Durable Object:', error);
    return c.json({ success: false, error: 'Failed to refresh' }, 500);
  }
});

// Test endpoint: Set artificial latency for WebSocket message processing (E2E testing only)
app.post('/api/notes/:id/test-latency', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json() as { latencyMs: number };

  try {
    const doId = c.env.NOTE_SESSIONS.idFromName(id);
    const stub = c.env.NOTE_SESSIONS.get(doId);

    const response = await stub.fetch(new Request(`http://internal/test-latency`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ latencyMs: body.latencyMs || 0 })
    }));

    if (response.ok) {
      return c.json({ success: true, latencyMs: body.latencyMs || 0 });
    }
    return c.json({ success: false, error: 'Failed to set latency' }, 500);
  } catch (error) {
    console.error('Failed to set test latency:', error);
    return c.json({ success: false, error: 'Failed to set latency' }, 500);
  }
});

app.delete('/api/notes/:id', rateLimit(RATE_LIMITS.API.DELETE_PER_MINUTE), async (c) => {
  const id = c.req.param('id');
  const sessionId = c.req.query('session_id');

  // Check if note exists
  const note = await c.env.DB.prepare(
    'SELECT id FROM notes WHERE id = ?'
  ).bind(id).first();

  if (!note) {
    return c.json({ error: 'Note not found' }, 404);
  }

  // Notify connected clients before deleting
  try {
    const doId = c.env.NOTE_SESSIONS.idFromName(id);
    const stub = c.env.NOTE_SESSIONS.get(doId);

    // Send a DELETE request to the Durable Object to notify clients and clear state
    await stub.fetch(new Request(`http://internal/reset`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: sessionId })
    }));
  } catch (error) {
    console.error('Failed to notify Durable Object:', error);
    // Continue even if DO notification fails
  }

  // Delete the note from database after notifying clients
  await c.env.DB.prepare('DELETE FROM notes WHERE id = ?').bind(id).run();

  return c.json({ success: true });
});

// Serve static assets as fallback
app.get('*', async (c) => {
  // Check if ASSETS binding is available
  if (c.env.ASSETS) {
    const url = new URL(c.req.url);

    // For asset files (JS, CSS, etc.), serve them directly
    if (url.pathname.startsWith('/assets/')) {
      return c.env.ASSETS.fetch(url.toString());
    }

    // For all other routes (root, note IDs, etc.), serve index.html
    // This enables client-side routing for the SPA
    url.pathname = '/client/index.html';
    return c.env.ASSETS.fetch(url.toString());
  }
  // Fallback for when ASSETS is not available
  return c.text('Static assets not configured', 404);
});

// Helper functions
function generateId(length = 4): string {
  // Exclude uppercase I and lowercase l to avoid ambiguity
  const chars = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}


export { NoteSessionDurableObject } from './durable-objects/NoteSessionDurableObject';
export { RateLimiterDurableObject } from './durable-objects/RateLimiterDurableObject';

// Scheduled handler for cron trigger - runs every 15 minutes to clean up expired notes
const scheduled: ExportedHandlerScheduledHandler<Env> = async (_event, env, _ctx) => {
  const now = Date.now();
  const inactiveThreshold = now - (LIMITS.INACTIVE_NOTE_EXPIRY_DAYS * 24 * 60 * 60 * 1000);

  try {
    // Delete all expired notes (by expires_at timestamp)
    const expiredResult = await env.DB.prepare(
      'DELETE FROM notes WHERE expires_at IS NOT NULL AND expires_at <= ?'
    ).bind(now).run();

    console.log(`Cron job: Cleaned up ${expiredResult.meta.changes} expired notes at ${new Date(now).toISOString()}`);

    // Delete all inactive notes (not accessed in INACTIVE_NOTE_EXPIRY_DAYS)
    const inactiveResult = await env.DB.prepare(
      'DELETE FROM notes WHERE last_accessed_at IS NOT NULL AND last_accessed_at <= ?'
    ).bind(inactiveThreshold).run();

    console.log(`Cron job: Cleaned up ${inactiveResult.meta.changes} inactive notes at ${new Date(now).toISOString()}`);
  } catch (error) {
    console.error('Error cleaning up notes:', error);
  }
};

export default {
  fetch: app.fetch,
  scheduled,
};
