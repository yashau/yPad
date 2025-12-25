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
};

export type SyncMessage = {
  type: 'sync';
  content: string;
  version: number;
  operations: Operation[];
  clientId: string; // Server-assigned client ID for this connection
};

export type AckMessage = {
  type: 'ack';
  version: number;
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
};

export type UserJoinedMessage = {
  type: 'user_joined';
  clientId: string;
  connectedUsers: string[]; // All currently connected client IDs
};

export type UserLeftMessage = {
  type: 'user_left';
  clientId: string;
  connectedUsers: string[]; // All currently connected client IDs
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
  | UserJoinedMessage
  | UserLeftMessage;

// Client session information
export interface ClientSession {
  clientId: string;
  sessionId: string;
  lastAckOperation: number;
  isAuthenticated: boolean;
  ws: WebSocket;
}
