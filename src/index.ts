import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { LIMITS, ALLOWED_SYNTAX_MODES, CUSTOM_ID_PATTERN, SECURITY_HEADERS } from '../config/constants';

type Bindings = {
  DB: D1Database;
  ASSETS: Fetcher;
  NOTE_SESSIONS: DurableObjectNamespace;
};

/**
 * Payload for creating a new note
 */
interface CreateNotePayload {
  id?: string;
  content: string;
  syntax_highlight?: string;
  password?: string;
  max_views?: number | null;
  expires_in?: number;
  is_encrypted?: boolean;
}

/**
 * Payload for updating an existing note
 */
interface UpdateNotePayload {
  content: string;
  syntax_highlight?: string;
  password?: string;
  max_views?: number | null;
  expires_in?: number;
  is_encrypted?: boolean;
  session_id?: string;
  expected_version?: number | null;
}

const app = new Hono<{ Bindings: Bindings }>();

app.use('/*', cors());

// Security headers middleware
app.use('*', async (c, next) => {
  await next();
  c.header('Content-Security-Policy', SECURITY_HEADERS.CONTENT_SECURITY_POLICY);
  c.header('X-Content-Type-Options', SECURITY_HEADERS.X_CONTENT_TYPE_OPTIONS);
  c.header('X-Frame-Options', SECURITY_HEADERS.X_FRAME_OPTIONS);
  c.header('Referrer-Policy', SECURITY_HEADERS.REFERRER_POLICY);
});

// API Routes
// WebSocket endpoint for real-time collaboration
app.get('/api/notes/:id/ws', async (c) => {
  const id = c.req.param('id');
  const password = c.req.query('password');

  // Validate note exists
  const note = await c.env.DB.prepare(
    'SELECT id, password_hash, expires_at FROM notes WHERE id = ?'
  ).bind(id).first();

  if (!note) {
    return c.json({ error: 'Note not found' }, 404);
  }

  // Check if note has expired
  if (note.expires_at && Date.now() > Number(note.expires_at)) {
    await c.env.DB.prepare('DELETE FROM notes WHERE id = ?').bind(id).run();
    return c.json({ error: 'Note has expired' }, 410);
  }

  // Check password if required
  const passwordError = await verifyNotePassword(note.password_hash as string | null, password, c);
  if (passwordError) return passwordError;

  // Get Durable Object instance (one per note ID)
  const doId = c.env.NOTE_SESSIONS.idFromName(id);
  const stub = c.env.NOTE_SESSIONS.get(doId);

  // Forward WebSocket upgrade to Durable Object
  return stub.fetch(c.req.raw);
});

app.get('/api/notes/:id', async (c) => {
  const id = c.req.param('id');
  const password = c.req.query('password');

  const note = await c.env.DB.prepare(
    'SELECT * FROM notes WHERE id = ?'
  ).bind(id).first();

  if (!note) {
    return c.json({ error: 'Note not found' }, 404);
  }

  // Check if note has expired
  if (note.expires_at && Date.now() > Number(note.expires_at)) {
    await c.env.DB.prepare('DELETE FROM notes WHERE id = ?').bind(id).run();
    return c.json({ error: 'Note has expired' }, 410);
  }

  // Check password protection
  const passwordError = await verifyNotePassword(note.password_hash as string | null, password, c);
  if (passwordError) return passwordError;

  // Increment view count first
  const newViewCount = Number(note.view_count) + 1;

  // Check max views - delete if this view reaches the limit
  if (note.max_views && newViewCount > Number(note.max_views)) {
    await c.env.DB.prepare('DELETE FROM notes WHERE id = ?').bind(id).run();
    return c.json({ error: 'Note has reached max views' }, 410);
  }

  // Update view count
  await c.env.DB.prepare(
    'UPDATE notes SET view_count = ? WHERE id = ?'
  ).bind(newViewCount, id).run();

  return c.json({
    id: note.id,
    content: note.content,
    syntax_highlight: note.syntax_highlight,
    view_count: newViewCount,
    max_views: note.max_views,
    expires_at: note.expires_at,
    created_at: note.created_at,
    version: note.version || 1,
    has_password: !!note.password_hash,
    is_encrypted: !!note.is_encrypted
  });
});

app.post('/api/notes', async (c) => {
  const body: CreateNotePayload = await c.req.json();
  const { id, content, password, syntax_highlight, max_views, expires_in, is_encrypted } = body;

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
  if (syntax_highlight && !ALLOWED_SYNTAX_MODES.includes(syntax_highlight)) {
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

  const noteId = id || generateId();

  const password_hash = password ? await hashPassword(password) : null;
  const expires_at = expires_in ? Date.now() + expires_in : null;
  const now = Date.now();

  await c.env.DB.prepare(
    `INSERT INTO notes (id, content, password_hash, syntax_highlight, max_views, expires_at, created_at, updated_at, version, last_session_id, is_encrypted)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, NULL, ?)`
  ).bind(
    noteId,
    content,
    password_hash,
    syntax_highlight || 'plaintext',
    max_views || null,
    expires_at,
    now,
    now,
    is_encrypted ? 1 : 0
  ).run();

  return c.json({ id: noteId, available: true, version: 1 });
});

app.put('/api/notes/:id', async (c) => {
  const id = c.req.param('id');
  const body: UpdateNotePayload = await c.req.json();
  const { content, syntax_highlight, password, max_views, expires_in, session_id, expected_version, is_encrypted } = body;

  const existing = await c.env.DB.prepare(
    'SELECT * FROM notes WHERE id = ?'
  ).bind(id).first();

  if (!existing) {
    return c.json({ error: 'Note not found' }, 404);
  }

  // Check password for updates
  const passwordError = await verifyNotePassword(existing.password_hash as string | null, password, c);
  if (passwordError) return passwordError;

  // Determine new password hash:
  // - If is_encrypted is explicitly false, remove password protection (set to null)
  // - Otherwise, if password provided, hash it
  // - Otherwise, keep existing password hash
  const password_hash = is_encrypted === false ? null :
                       (password && password !== '' ? await hashPassword(password) : existing.password_hash);
  const expires_at = expires_in ? Date.now() + expires_in : existing.expires_at;

  // Atomic SQL update with version checking and conditional increment
  const result = await c.env.DB.prepare(
    `UPDATE notes
     SET
       content = ?,
       syntax_highlight = ?,
       password_hash = ?,
       max_views = ?,
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
    password_hash,
    max_views !== undefined ? max_views : existing.max_views,
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

  // Check if encryption status or password changed
  const encryptionChanged = (is_encrypted !== undefined) &&
    (!!is_encrypted !== !!existing.is_encrypted);
  const passwordChanged = password_hash !== existing.password_hash;

  // Notify clients if encryption status changed OR password changed on an encrypted note
  if (encryptionChanged || (passwordChanged && !!password_hash)) {
    // Notify all connected clients via Durable Object
    try {
      const doId = c.env.NOTE_SESSIONS.idFromName(id);
      const stub = c.env.NOTE_SESSIONS.get(doId);

      // Send a POST request to notify about encryption change
      await stub.fetch(new Request(`http://do/notify-encryption-change`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          is_encrypted: !!is_encrypted !== undefined ? !!is_encrypted : !!existing.is_encrypted,
          has_password: !!password_hash,
          exclude_session_id: session_id // Don't notify the user who made the change
        })
      }));
    } catch (error) {
      console.error('Failed to notify encryption change:', error);
      // Don't fail the request if broadcast fails
    }
  }

  // For encrypted notes, notify other clients about the version update
  // (since they don't get operation-based updates via WebSocket)
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
          exclude_session_id: session_id // Don't notify the user who made the change
        })
      }));
    } catch (error) {
      console.error('Failed to notify version update:', error);
      // Don't fail the request if broadcast fails
    }
  }

  return c.json({ success: true, version: result.version });
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

app.delete('/api/notes/:id', async (c) => {
  const id = c.req.param('id');

  await c.env.DB.prepare('DELETE FROM notes WHERE id = ?').bind(id).run();

  // Notify Durable Object to clear its state
  try {
    const doId = c.env.NOTE_SESSIONS.idFromName(id);
    const stub = c.env.NOTE_SESSIONS.get(doId);

    // Send a DELETE request to the Durable Object to clear its state
    await stub.fetch(new Request(`http://internal/reset`, { method: 'DELETE' }));
  } catch (error) {
    console.error('Failed to reset Durable Object:', error);
    // Continue even if DO reset fails
  }

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

async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Constant-time string comparison to prevent timing attacks
 * @param a - First string to compare
 * @param b - Second string to compare
 * @returns true if strings are equal, false otherwise
 */
function constantTimeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false;

  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

/**
 * Verify password for a note
 * Returns error response if password is invalid, null if valid
 */
async function verifyNotePassword(
  passwordHash: string | null,
  providedPassword: string | null | undefined,
  context: any
): Promise<Response | null> {
  if (!passwordHash) return null; // No password protection

  if (!providedPassword) {
    return context.json({
      error: 'Password required',
      passwordRequired: true
    }, 401);
  }

  const providedHash = await hashPassword(providedPassword);
  if (!constantTimeCompare(providedHash, passwordHash)) {
    return context.json({ error: 'Invalid password' }, 401);
  }

  return null; // Password valid
}

export { NoteSessionDurableObject } from './durable-objects/NoteSessionDurableObject';

// Scheduled handler for cron trigger - runs every 15 minutes to clean up expired notes
export const scheduled: ExportedHandlerScheduledHandler<Bindings> = async (_event, env, _ctx) => {
  const now = Date.now();

  try {
    // Delete all expired notes
    const result = await env.DB.prepare(
      'DELETE FROM notes WHERE expires_at IS NOT NULL AND expires_at <= ?'
    ).bind(now).run();

    console.log(`Cron job: Cleaned up ${result.meta.changes} expired notes at ${new Date(now).toISOString()}`);
  } catch (error) {
    console.error('Error cleaning up expired notes:', error);
  }
};

export default app;
