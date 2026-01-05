/**
 * @fileoverview Type definitions for Operational Transform (OT) and WebSocket messaging.
 *
 * This module defines the data structures used for:
 * - OT operations (insert/delete)
 * - WebSocket protocol messages between client and server
 * - Client session and rate limiting state
 */

/**
 * Insert operation that adds text at a position.
 */
export type InsertOperation = {
  type: 'insert';
  /** 0-based character index where text is inserted */
  position: number;
  /** Text content to insert */
  text: string;
  /** Unique identifier for the client that created this operation */
  clientId: string;
  /** Server-assigned version after this operation is applied */
  version: number;
};

/**
 * Delete operation that removes characters starting at a position.
 */
export type DeleteOperation = {
  type: 'delete';
  /** 0-based character index where deletion starts */
  position: number;
  /** Number of characters to delete */
  length: number;
  /** Unique identifier for the client that created this operation */
  clientId: string;
  /** Server-assigned version after this operation is applied */
  version: number;
};

/**
 * Union type for all OT operations.
 */
export type Operation = InsertOperation | DeleteOperation;

/**
 * Client sends an operation to the server for processing.
 */
export type OperationMessage = {
  type: 'operation';
  operation: Operation;
  /** Server version the client had when creating this operation */
  baseVersion: number;
  clientId: string;
  sessionId: string;
  /** Server-assigned sequence number for ordering (set on broadcast) */
  seqNum?: number;
  /** Checksum for verifying content consistency */
  contentChecksum?: number;
};

/**
 * Server sends initial state when client connects.
 */
export type SyncMessage = {
  type: 'sync';
  /** Current document content */
  content: string;
  /** Current server version */
  version: number;
  /** Recent operation history for conflict resolution */
  operations: Operation[];
  /** Server-assigned client ID for this connection */
  clientId: string;
  /** Current sequence number for message ordering */
  seqNum: number;
  /** Current syntax highlighting mode */
  syntax?: string;
};

/**
 * Server acknowledges a client's operation.
 */
export type AckMessage = {
  type: 'ack';
  /** New server version after applying the operation */
  version: number;
  /** Sequence number of the broadcast triggered by this operation */
  seqNum?: number;
  /** Checksum for verifying content consistency */
  contentChecksum?: number;
  /** Server's canonical transformed version of the operation */
  transformedOperation?: Operation;
};

/**
 * Server reports an error to the client.
 */
export type ErrorMessage = {
  type: 'error';
  message: string;
};

/**
 * Server instructs client to reload the document.
 */
export type ReloadMessage = {
  type: 'reload';
  reason: string;
};

/**
 * Server notifies that the note has expired (max views reached or time expired).
 */
export type NoteExpiredMessage = {
  type: 'note_expired';
};

/**
 * Server notifies that the note was deleted.
 */
export type NoteDeletedMessage = {
  type: 'note_deleted';
  /** Session ID of the user who deleted the note */
  sessionId?: string;
};

/**
 * Server notifies that encryption status changed.
 */
export type EncryptionChangedMessage = {
  type: 'encryption_changed';
  is_encrypted: boolean;
};

/**
 * Server notifies that another client updated the note via REST API.
 */
export type VersionUpdateMessage = {
  type: 'version_update';
  version: number;
  message: string;
};

/**
 * Broadcast cursor position to other clients.
 */
export type CursorUpdateMessage = {
  type: 'cursor_update';
  clientId: string;
  /** 0-based character position of the cursor */
  position: number;
  sessionId?: string;
  seqNum?: number;
};

/**
 * Server acknowledges a cursor update.
 */
export type CursorAckMessage = {
  type: 'cursor_ack';
  seqNum: number;
};

/**
 * Server notifies that a user joined the session.
 */
export type UserJoinedMessage = {
  type: 'user_joined';
  clientId: string;
  /** All currently connected client IDs */
  connectedUsers: string[];
  seqNum?: number;
};

/**
 * Server notifies that a user left the session.
 */
export type UserLeftMessage = {
  type: 'user_left';
  clientId: string;
  /** All currently connected client IDs */
  connectedUsers: string[];
  seqNum?: number;
};

/**
 * Broadcast syntax highlighting mode change.
 */
export type SyntaxChangeMessage = {
  type: 'syntax_change';
  syntax: string;
  clientId: string;
  seqNum?: number;
};

/**
 * Server acknowledges a syntax change.
 */
export type SyntaxAckMessage = {
  type: 'syntax_ack';
  seqNum: number;
};

/**
 * Server broadcasts current note status (view count, expiration).
 */
export type NoteStatusMessage = {
  type: 'note_status';
  view_count: number;
  max_views: number | null;
  expires_at: number | null;
};

/**
 * Client requests replay of operations from a specific version.
 * Used for recovery when client state diverges from server.
 */
export type ReplayRequestMessage = {
  type: 'replay_request';
  /** Client wants operations from this version onwards */
  fromVersion: number;
  clientId: string;
  sessionId: string;
};

/**
 * Server responds with content and operations for replay recovery.
 */
export type ReplayResponseMessage = {
  type: 'replay_response';
  /** Content at the base version */
  baseContent: string;
  /** Version of the base content */
  baseVersion: number;
  /** Operations to apply on top of base content */
  operations: Operation[];
  /** Current server version after all operations */
  currentVersion: number;
  /** Checksum for verifying final content */
  contentChecksum: number;
};

/**
 * Union type for all WebSocket messages.
 */
export type WSMessage =
  | OperationMessage
  | SyncMessage
  | AckMessage
  | ErrorMessage
  | ReloadMessage
  | NoteExpiredMessage
  | NoteDeletedMessage
  | EncryptionChangedMessage
  | VersionUpdateMessage
  | CursorUpdateMessage
  | CursorAckMessage
  | UserJoinedMessage
  | UserLeftMessage
  | SyntaxChangeMessage
  | SyntaxAckMessage
  | NoteStatusMessage
  | ReplayRequestMessage
  | ReplayResponseMessage;

/**
 * Token bucket rate limiting state for WebSocket connections.
 */
export interface RateLimitState {
  /** Available tokens (each message consumes one) */
  tokens: number;
  /** Timestamp of last token refill */
  lastRefill: number;
  /** Number of rate limit violations */
  violations: number;
}

/**
 * Server-side session information for a connected client.
 */
export interface ClientSession {
  /** Unique client identifier (persists across reconnects) */
  clientId: string;
  /** Session identifier (unique per connection) */
  sessionId: string;
  /** Version of the last acknowledged operation */
  lastAckOperation: number;
  /** Whether the client has completed authentication */
  isAuthenticated: boolean;
  /** WebSocket connection */
  ws: WebSocket;
  /** Rate limiting state */
  rateLimit: RateLimitState;
}
