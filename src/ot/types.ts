// Operation types for Operational Transform

export type InsertOperation = {
  type: 'insert';
  position: number;
  text: string;
  clientId: string;
  version: number;
};

export type DeleteOperation = {
  type: 'delete';
  position: number;
  length: number;
  clientId: string;
  version: number;
};

export type Operation = InsertOperation | DeleteOperation;

// WebSocket message types
export type OperationMessage = {
  type: 'operation';
  operation: Operation;
  baseVersion: number;
  clientId: string;
  sessionId: string;
  seqNum?: number; // Server-assigned global sequence number for ordering all events
};

export type SyncMessage = {
  type: 'sync';
  content: string;
  version: number;
  operations: Operation[];
  clientId: string; // Server-assigned client ID for this connection
  seqNum: number; // Current global sequence number - next broadcast will be seqNum + 1
  syntax?: string; // Current syntax highlighting mode
};

export type AckMessage = {
  type: 'ack';
  version: number;
  seqNum?: number; // Global sequence number for the broadcast triggered by this operation
};

export type ErrorMessage = {
  type: 'error';
  message: string;
};

export type ReloadMessage = {
  type: 'reload';
  reason: string;
};

export type NoteExpiredMessage = {
  type: 'note_expired';
};

export type NoteDeletedMessage = {
  type: 'note_deleted';
};

export type EncryptionChangedMessage = {
  type: 'encryption_changed';
  is_encrypted: boolean;
  has_password: boolean;
};

export type VersionUpdateMessage = {
  type: 'version_update';
  version: number;
  message: string;
};

export type CursorUpdateMessage = {
  type: 'cursor_update';
  clientId: string;
  position: number;
  sessionId?: string;
  seqNum?: number; // Server-assigned global sequence number for ordering all events
};

export type CursorAckMessage = {
  type: 'cursor_ack';
  seqNum: number; // The sequence number used for the cursor update broadcast
};

export type UserJoinedMessage = {
  type: 'user_joined';
  clientId: string;
  connectedUsers: string[]; // All currently connected client IDs
  seqNum?: number; // Server-assigned global sequence number for ordering all events
};

export type UserLeftMessage = {
  type: 'user_left';
  clientId: string;
  connectedUsers: string[]; // All currently connected client IDs
  seqNum?: number; // Server-assigned global sequence number for ordering all events
};

export type SyntaxChangeMessage = {
  type: 'syntax_change';
  syntax: string;
  clientId: string;
  seqNum?: number; // Server-assigned global sequence number for ordering all events
};

export type SyntaxAckMessage = {
  type: 'syntax_ack';
  seqNum: number; // The sequence number used for the syntax change broadcast
};

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
  | SyntaxAckMessage;

// Client session information
export interface ClientSession {
  clientId: string;
  sessionId: string;
  lastAckOperation: number;
  isAuthenticated: boolean;
  ws: WebSocket;
}
