/**
 * @fileoverview WebSocket message handlers for NoteSessionDurableObject.
 *
 * These handlers process incoming WebSocket messages and coordinate
 * Yjs CRDT synchronization, awareness updates, and syntax changes.
 * Extracted from the main Durable Object for better code organization.
 */

import { RATE_LIMITS, EDITOR_LIMITS } from '../../../config/constants';
import type {
  ClientSession,
  YjsUpdateMessage,
  AwarenessUpdateMessage,
  SyntaxChangeMessage,
  SyntaxAckMessage,
  YjsAckMessage,
  RequestEditMessage,
  RequestEditResponseMessage,
  YjsStateRequestMessage,
} from '../../types/messages';
import type { NoteSessionContext } from './types';

/**
 * Encode Uint8Array to base64 string
 */
function encodeBase64(data: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < data.length; i++) {
    binary += String.fromCharCode(data[i]);
  }
  return btoa(binary);
}

/**
 * Decode base64 string to Uint8Array
 */
function decodeBase64(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * Check if a session is currently an active editor (sent an edit recently).
 */
function isSessionActiveEditor(session: ClientSession): boolean {
  if (session.lastEditAt === null) return false;
  return Date.now() - session.lastEditAt < EDITOR_LIMITS.ACTIVE_TIMEOUT_MS;
}

/**
 * Count the number of active editors (sessions that sent an edit recently).
 */
function countActiveEditors(sessions: Map<WebSocket, ClientSession>): number {
  let count = 0;
  for (const session of sessions.values()) {
    if (isSessionActiveEditor(session)) {
      count++;
    }
  }
  return count;
}

/**
 * Get the current editor and viewer counts.
 */
function getEditorViewerCounts(sessions: Map<WebSocket, ClientSession>): { activeEditorCount: number; viewerCount: number } {
  const activeEditorCount = countActiveEditors(sessions);
  const viewerCount = sessions.size - activeEditorCount;
  return { activeEditorCount, viewerCount };
}

/**
 * Handle a request to edit from a client.
 * Checks if the client can become an active editor based on the current limit.
 */
export async function handleRequestEdit(
  ctx: NoteSessionContext,
  ws: WebSocket,
  _message: RequestEditMessage
): Promise<void> {
  const session = ctx.sessions.get(ws);
  if (!session || !session.isAuthenticated) {
    ctx.sendError(ws, 'Unauthorized');
    return;
  }

  const isAlreadyActive = isSessionActiveEditor(session);
  const activeCount = countActiveEditors(ctx.sessions);

  // Can edit if: already active, or there's room for a new editor
  const canEdit = isAlreadyActive || activeCount < EDITOR_LIMITS.MAX_ACTIVE_EDITORS;

  const { activeEditorCount, viewerCount } = getEditorViewerCounts(ctx.sessions);

  const response: RequestEditResponseMessage = {
    type: 'request_edit_response',
    canEdit,
    activeEditorCount,
    viewerCount,
  };

  ws.send(JSON.stringify(response));
}

/**
 * Handle an incoming Yjs update from a client.
 * Applies the update to the document and broadcasts to other clients.
 */
export async function handleYjsUpdate(
  ctx: NoteSessionContext,
  ws: WebSocket,
  message: YjsUpdateMessage
): Promise<void> {
  const session = ctx.sessions.get(ws);
  if (!session || !session.isAuthenticated) {
    ctx.sendError(ws, 'Unauthorized');
    return;
  }

  // Check editor limit before allowing update
  const isAlreadyActive = isSessionActiveEditor(session);
  if (!isAlreadyActive) {
    const activeCount = countActiveEditors(ctx.sessions);
    if (activeCount >= EDITOR_LIMITS.MAX_ACTIVE_EDITORS) {
      ctx.sendError(ws, 'editor_limit_reached');
      return;
    }
  }

  // Check rate limit
  if (!checkRateLimit(session)) {
    if (session.rateLimit.violations >= RATE_LIMITS.PENALTY.DISCONNECT_THRESHOLD) {
      ws.close(1008, 'Rate limit exceeded');
      ctx.sessions.delete(ws);
      return;
    }
    ctx.sendError(ws, RATE_LIMITS.PENALTY.WARNING_MESSAGE);
    return;
  }

  // Track if this is a viewer becoming an active editor
  const wasViewer = !isAlreadyActive;

  // Mark session as active editor
  session.lastEditAt = Date.now();

  // Broadcast count update if a viewer just became an active editor
  if (wasViewer) {
    broadcastEditorCountUpdate(ctx);
  }

  // Decode and apply the Yjs update
  const update = decodeBase64(message.update);
  ctx.applyYjsUpdate(update);

  // Track updates since last persist and session ID
  ctx.updatesSincePersist++;
  ctx.lastEditSessionId = session.sessionId;

  // Broadcast to all other clients
  const broadcastSeqNum = broadcastYjsUpdate(ctx, message.update, session.clientId);

  // Send ACK to sender
  const ackMessage: YjsAckMessage = {
    type: 'yjs_ack',
    seqNum: broadcastSeqNum,
  };
  ws.send(JSON.stringify(ackMessage));

  // Schedule persistence (debounced)
  ctx.schedulePersistence(false);
}

/**
 * Handle an awareness update from a client.
 * Broadcasts cursor/presence information to other clients.
 */
export async function handleAwarenessUpdate(
  ctx: NoteSessionContext,
  ws: WebSocket,
  message: AwarenessUpdateMessage
): Promise<void> {
  const session = ctx.sessions.get(ws);
  if (!session || !session.isAuthenticated) {
    return;
  }

  // Broadcast awareness update to all other clients
  broadcastAwarenessUpdate(ctx, message.update, session.clientId);
}

/**
 * Handle a request for full Yjs state (for recovery).
 */
export async function handleYjsStateRequest(
  ctx: NoteSessionContext,
  ws: WebSocket,
  _message: YjsStateRequestMessage
): Promise<void> {
  const session = ctx.sessions.get(ws);
  if (!session || !session.isAuthenticated) {
    return;
  }

  // Send full state to the requesting client
  const state = ctx.getYjsState();
  ws.send(JSON.stringify({
    type: 'yjs_state_response',
    state: encodeBase64(state),
  }));
}

/**
 * Handle a syntax highlighting mode change from a client.
 * Updates the cached syntax mode and broadcasts to all other clients.
 */
export async function handleSyntaxChange(
  ctx: NoteSessionContext,
  ws: WebSocket,
  message: SyntaxChangeMessage
): Promise<void> {
  const session = ctx.sessions.get(ws);
  if (!session || !session.isAuthenticated) {
    return;
  }

  // Update the current syntax in memory
  ctx.currentSyntax = message.syntax;

  // Broadcast syntax change to all other clients and get the sequence number
  const broadcastSeqNum = broadcastSyntaxChange(ctx, session.clientId, message.syntax);

  // Send acknowledgment to sender with the sequence number of the broadcast
  const ackMessage: SyntaxAckMessage = {
    type: 'syntax_ack',
    seqNum: broadcastSeqNum,
  };
  ws.send(JSON.stringify(ackMessage));

  // Persist syntax change to database
  ctx.persistSyntaxToDB(message.syntax);
}

/**
 * Check rate limit for a client session using token bucket algorithm.
 * Returns true if request is allowed, false if rate limited.
 */
function checkRateLimit(session: ClientSession): boolean {
  const now = Date.now();
  const config = RATE_LIMITS.WEBSOCKET;

  // Refill tokens based on time elapsed
  const elapsed = now - session.rateLimit.lastRefill;
  const tokensToAdd = (elapsed / 1000) * config.OPS_PER_SECOND;

  session.rateLimit.tokens = Math.min(
    config.BURST_ALLOWANCE,
    session.rateLimit.tokens + tokensToAdd
  );
  session.rateLimit.lastRefill = now;

  // Check if we have tokens
  if (session.rateLimit.tokens < 1) {
    session.rateLimit.violations++;
    return false;
  }

  // Consume a token
  session.rateLimit.tokens--;
  return true;
}

/**
 * Get the next global sequence number for a broadcast message.
 */
function getNextSeqNum(ctx: NoteSessionContext): number {
  return ++ctx.globalSeqNum;
}

/**
 * Broadcast a message to connected clients with optional exclusion.
 */
export function broadcast(
  ctx: NoteSessionContext,
  message: Record<string, unknown>,
  options?: { excludeClientId?: string; excludeSessionId?: string }
): void {
  const messageStr = JSON.stringify(message);
  for (const [ws, session] of ctx.sessions) {
    if (options?.excludeClientId && session.clientId === options.excludeClientId) continue;
    if (options?.excludeSessionId && session.sessionId === options.excludeSessionId) continue;
    try {
      ws.send(messageStr);
    } catch (error) {
      console.error(`[DO ${ctx.noteId}] Broadcast error:`, error);
    }
  }
}

/**
 * Broadcast a Yjs update to all clients except the sender.
 */
export function broadcastYjsUpdate(
  ctx: NoteSessionContext,
  update: string,
  senderClientId: string
): number {
  const seqNum = getNextSeqNum(ctx);
  const message: YjsUpdateMessage = {
    type: 'yjs_update',
    update,
    clientId: senderClientId,
    seqNum,
  };
  broadcast(ctx, message, { excludeClientId: senderClientId });
  return seqNum;
}

/**
 * Broadcast an awareness update to all clients except the sender.
 * Note: Awareness updates do NOT use sequence numbers because:
 * 1. Cursor positions are ephemeral and don't need strict ordering
 * 2. The sender doesn't receive an ACK, which would cause sequence gaps
 */
export function broadcastAwarenessUpdate(
  ctx: NoteSessionContext,
  update: string,
  senderClientId: string
): void {
  const message: AwarenessUpdateMessage = {
    type: 'awareness_update',
    update,
    clientId: senderClientId,
    // No seqNum - awareness updates bypass sequence ordering
  };
  broadcast(ctx, message, { excludeClientId: senderClientId });
}

/**
 * Broadcast a syntax highlighting change to all clients except the sender.
 */
export function broadcastSyntaxChange(
  ctx: NoteSessionContext,
  clientId: string,
  syntax: string
): number {
  const seqNum = getNextSeqNum(ctx);
  const message: SyntaxChangeMessage = {
    type: 'syntax_change',
    clientId,
    syntax,
    seqNum,
  };
  broadcast(ctx, message, { excludeClientId: clientId });
  return seqNum;
}

/**
 * Broadcast encryption status change to all clients.
 */
export function broadcastEncryptionChange(
  ctx: NoteSessionContext,
  is_encrypted: boolean,
  excludeSessionId?: string
): void {
  ctx.isEncrypted = is_encrypted;
  const message = { type: 'encryption_changed' as const, is_encrypted };
  broadcast(ctx, message, { excludeSessionId });
}

/**
 * Broadcast version update notification to all clients.
 */
export function broadcastVersionUpdate(
  ctx: NoteSessionContext,
  version: number,
  excludeSessionId?: string
): void {
  const message = {
    type: 'version_update' as const,
    version,
    message: 'Note was updated by another user'
  };
  broadcast(ctx, message, { excludeSessionId });
}

/**
 * Broadcast user joined notification to all clients.
 */
export function broadcastUserJoined(
  ctx: NoteSessionContext,
  joinedClientId: string
): void {
  const seqNum = getNextSeqNum(ctx);
  const connectedUsers = Array.from(ctx.sessions.values()).map(s => s.clientId);
  const { activeEditorCount, viewerCount } = getEditorViewerCounts(ctx.sessions);
  const message = {
    type: 'user_joined' as const,
    clientId: joinedClientId,
    connectedUsers,
    activeEditorCount,
    viewerCount,
    seqNum,
  };
  broadcast(ctx, message);
}

/**
 * Broadcast user left notification to remaining clients.
 */
export function broadcastUserLeft(
  ctx: NoteSessionContext,
  leftClientId: string
): void {
  const seqNum = getNextSeqNum(ctx);
  const connectedUsers = Array.from(ctx.sessions.values()).map(s => s.clientId);
  const { activeEditorCount, viewerCount } = getEditorViewerCounts(ctx.sessions);
  const message = {
    type: 'user_left' as const,
    clientId: leftClientId,
    connectedUsers,
    activeEditorCount,
    viewerCount,
    seqNum,
  };
  broadcast(ctx, message);
}

/**
 * Broadcast current note status (view count, expiration) to all clients.
 */
export function broadcastNoteStatus(
  ctx: NoteSessionContext,
  viewCount: number,
  maxViews: number | null,
  expiresAt: number | null
): void {
  const message = {
    type: 'note_status' as const,
    view_count: viewCount,
    max_views: maxViews,
    expires_at: expiresAt,
  };
  broadcast(ctx, message);
}

/**
 * Broadcast updated editor/viewer counts to all clients.
 * Called when a viewer becomes an active editor.
 */
export function broadcastEditorCountUpdate(ctx: NoteSessionContext): void {
  const seqNum = getNextSeqNum(ctx);
  const { activeEditorCount, viewerCount } = getEditorViewerCounts(ctx.sessions);
  const message = {
    type: 'editor_count_update' as const,
    activeEditorCount,
    viewerCount,
    seqNum,
  };
  broadcast(ctx, message);
}
