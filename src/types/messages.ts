/**
 * @fileoverview Type definitions for Yjs CRDT-based WebSocket messaging.
 *
 * This module defines the data structures used for:
 * - Yjs document synchronization
 * - Awareness (cursor/presence) updates
 * - WebSocket protocol messages between client and server
 * - Client session and rate limiting state
 */

// =============================================================================
// Yjs Sync Protocol Messages
// =============================================================================

/**
 * Initial sync message from server when client connects.
 * Contains the full Yjs document state.
 */
export type YjsSyncMessage = {
  type: 'yjs_sync';
  /** Base64-encoded full Yjs document state */
  state: string;
  /** Server-assigned client ID for this connection */
  clientId: string;
  /** Current sequence number for message ordering */
  seqNum: number;
  /** Current syntax highlighting mode */
  syntax?: string;
};

/**
 * Client sends a Yjs update to the server.
 */
export type YjsUpdateMessage = {
  type: 'yjs_update';
  /** Base64-encoded Yjs update */
  update: string;
  /** Client that originated this update */
  clientId: string;
  /** Session ID for validation */
  sessionId?: string;
  /** Server-assigned sequence number (set on broadcast) */
  seqNum?: number;
};

/**
 * Server acknowledges a Yjs update from client.
 */
export type YjsAckMessage = {
  type: 'yjs_ack';
  /** Sequence number of the broadcast */
  seqNum?: number;
};

/**
 * Awareness update for cursor positions and presence.
 */
export type AwarenessUpdateMessage = {
  type: 'awareness_update';
  /** Base64-encoded awareness protocol update */
  update: string;
  /** Client that sent this update */
  clientId: string;
  /** Server-assigned sequence number (set on broadcast) */
  seqNum?: number;
};

/**
 * Request full Yjs state (for recovery after disconnect).
 */
export type YjsStateRequestMessage = {
  type: 'yjs_state_request';
  clientId: string;
  sessionId: string;
};

/**
 * Server responds with full Yjs state.
 */
export type YjsStateResponseMessage = {
  type: 'yjs_state_response';
  /** Base64-encoded full Yjs document state */
  state: string;
  /** Base64-encoded awareness states */
  awarenessState?: string;
};

// =============================================================================
// Session & Presence Messages (Unchanged from OT)
// =============================================================================

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
 * Server notifies that a user joined the session.
 */
export type UserJoinedMessage = {
  type: 'user_joined';
  clientId: string;
  /** All currently connected client IDs */
  connectedUsers: string[];
  /** Current number of active editors */
  activeEditorCount: number;
  /** Current number of viewers */
  viewerCount: number;
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
  /** Current number of active editors */
  activeEditorCount: number;
  /** Current number of viewers */
  viewerCount: number;
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
 * Client requests permission to edit.
 * Sent after sync to check if client can become an active editor.
 */
export type RequestEditMessage = {
  type: 'request_edit';
  clientId: string;
  sessionId: string;
};

/**
 * Server responds to edit permission request.
 */
export type RequestEditResponseMessage = {
  type: 'request_edit_response';
  /** Whether the client is allowed to edit */
  canEdit: boolean;
  /** Current number of active editors */
  activeEditorCount: number;
  /** Current number of viewers */
  viewerCount: number;
};

/**
 * Server broadcasts updated editor/viewer counts.
 * Sent when a viewer becomes an active editor.
 */
export type EditorCountUpdateMessage = {
  type: 'editor_count_update';
  /** Current number of active editors */
  activeEditorCount: number;
  /** Current number of viewers */
  viewerCount: number;
  seqNum?: number;
};

// =============================================================================
// Union Type for All Messages
// =============================================================================

/**
 * Union type for all WebSocket messages.
 */
export type WSMessage =
  // Yjs sync messages
  | YjsSyncMessage
  | YjsUpdateMessage
  | YjsAckMessage
  | AwarenessUpdateMessage
  | YjsStateRequestMessage
  | YjsStateResponseMessage
  // Session/error messages
  | ErrorMessage
  | ReloadMessage
  | NoteExpiredMessage
  | NoteDeletedMessage
  | EncryptionChangedMessage
  | VersionUpdateMessage
  // Presence messages
  | UserJoinedMessage
  | UserLeftMessage
  // Syntax messages
  | SyntaxChangeMessage
  | SyntaxAckMessage
  // Status messages
  | NoteStatusMessage
  // Editor permission messages
  | RequestEditMessage
  | RequestEditResponseMessage
  | EditorCountUpdateMessage;

// =============================================================================
// Session State Types
// =============================================================================

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
  /** Whether the client has completed authentication */
  isAuthenticated: boolean;
  /** WebSocket connection */
  ws: WebSocket;
  /** Rate limiting state */
  rateLimit: RateLimitState;
  /** Timestamp of last edit by this client (null = viewer) */
  lastEditAt: number | null;
}

// =============================================================================
// Utility Types
// =============================================================================

/**
 * Yjs state stored in the database
 */
export interface YjsPersistedState {
  /** Binary Yjs document state */
  state: Uint8Array;
  /** Plain text content (for backward compatibility and search) */
  content: string;
}
