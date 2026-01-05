/**
 * @fileoverview WebSocket message handlers for NoteSessionDurableObject.
 *
 * These handlers process incoming WebSocket messages and coordinate
 * the OT operations, cursor updates, syntax changes, and state recovery.
 * Extracted from the main Durable Object for better code organization.
 */

import { transform } from '../../ot/transform';
import { applyOperation } from '../../ot/apply';
import { simpleChecksum } from '../../ot/checksum';
import { RATE_LIMITS } from '../../../config/constants';
import type {
  Operation,
  ClientSession,
  OperationMessage,
  CursorUpdateMessage,
  SyntaxChangeMessage,
  SyntaxAckMessage,
  CursorAckMessage,
  AckMessage,
  ReplayRequestMessage,
  ReplayResponseMessage,
} from '../../ot/types';
import type { NoteSessionContext } from './types';

/**
 * Handle an incoming OT operation from a client.
 * Transforms the operation against history, applies it, and broadcasts to other clients.
 */
export async function handleOperation(
  ctx: NoteSessionContext,
  ws: WebSocket,
  message: OperationMessage
): Promise<void> {
  const session = ctx.sessions.get(ws);
  if (!session || !session.isAuthenticated) {
    ctx.sendError(ws, 'Unauthorized');
    return;
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

  let operation = message.operation;
  const baseVersion = message.baseVersion;

  // Transform against other clients' operations only - same client's ops are already sequential
  const operationsToTransform = ctx.operationHistory.filter(
    (op) => op.version > baseVersion && op.clientId !== operation.clientId
  );

  for (const historicalOp of operationsToTransform) {
    [operation] = transform(operation, historicalOp);
  }

  // Increment version and update operation
  ctx.operationVersion++;
  operation.version = ctx.operationVersion;

  // Apply operation to current content
  ctx.currentContent = applyOperation(ctx.currentContent, operation);

  // Add to history
  ctx.operationHistory.push(operation);

  // Compact history if needed (keep last 100 operations)
  if (ctx.operationHistory.length > 100) {
    ctx.operationHistory = ctx.operationHistory.slice(-100);
  }

  // Track operations since last persist and session ID
  ctx.operationsSincePersist++;
  ctx.lastOperationSessionId = session.sessionId;

  // Calculate checksum of server content after applying operation
  const contentChecksum = simpleChecksum(ctx.currentContent);

  // Broadcast to all other clients and get the sequence number
  const broadcastSeqNum = broadcastOperation(ctx, operation, session.clientId, contentChecksum);

  // ACK includes transformed operation so client can rebase to server's canonical version
  const ackMessage: AckMessage = {
    type: 'ack',
    version: ctx.operationVersion,
    seqNum: broadcastSeqNum,
    contentChecksum,
    transformedOperation: operation,
  };
  ws.send(JSON.stringify(ackMessage));

  // Schedule persistence (debounced)
  ctx.schedulePersistence(false);
}

/**
 * Handle a cursor position update from a client.
 * Broadcasts the cursor position to all other connected clients.
 */
export async function handleCursorUpdate(
  ctx: NoteSessionContext,
  ws: WebSocket,
  message: CursorUpdateMessage
): Promise<void> {
  const session = ctx.sessions.get(ws);
  if (!session || !session.isAuthenticated) {
    return;
  }

  // Broadcast cursor position to all other clients and get the sequence number
  const broadcastSeqNum = broadcastCursorUpdate(ctx, session.clientId, message.position);

  // Send acknowledgment to sender with the sequence number of the broadcast
  const ackMessage: CursorAckMessage = {
    type: 'cursor_ack',
    seqNum: broadcastSeqNum,
  };
  ws.send(JSON.stringify(ackMessage));
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
 * Handle a replay request from a client that detected state drift.
 * Sends back the current content and operation history so the client
 * can rebuild its state from a known good point.
 */
export async function handleReplayRequest(
  ctx: NoteSessionContext,
  ws: WebSocket,
  message: ReplayRequestMessage
): Promise<void> {
  const session = ctx.sessions.get(ws);
  if (!session || !session.isAuthenticated) {
    return;
  }

  // Get operations from the requested version onwards
  const fromVersion = message.fromVersion;
  const opsToReplay = ctx.operationHistory.filter(op => op.version > fromVersion);

  // Calculate the content checksum for verification
  const contentChecksum = simpleChecksum(ctx.currentContent);

  // Send the replay response with current server state
  const replayResponse: ReplayResponseMessage = {
    type: 'replay_response',
    baseContent: ctx.currentContent,
    baseVersion: ctx.operationVersion,
    operations: opsToReplay,
    currentVersion: ctx.operationVersion,
    contentChecksum,
  };

  ws.send(JSON.stringify(replayResponse));
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
 * Broadcast a cursor position update to all clients except the sender.
 */
export function broadcastCursorUpdate(
  ctx: NoteSessionContext,
  clientId: string,
  position: number
): number {
  const seqNum = getNextSeqNum(ctx);
  const message: CursorUpdateMessage = {
    type: 'cursor_update',
    clientId,
    position,
    seqNum,
  };
  broadcast(ctx, message, { excludeClientId: clientId });
  return seqNum;
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
 * Broadcast an OT operation to all clients except the sender.
 */
export function broadcastOperation(
  ctx: NoteSessionContext,
  operation: Operation,
  senderClientId: string,
  contentChecksum: number
): number {
  const seqNum = getNextSeqNum(ctx);
  const message: OperationMessage = {
    type: 'operation',
    operation,
    baseVersion: operation.version - 1,
    clientId: operation.clientId,
    sessionId: '',
    seqNum,
    contentChecksum,
  };
  broadcast(ctx, message, { excludeClientId: senderClientId });
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
  const message = {
    type: 'user_joined' as const,
    clientId: joinedClientId,
    connectedUsers,
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
  const message = {
    type: 'user_left' as const,
    clientId: leftClientId,
    connectedUsers,
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
