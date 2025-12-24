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

export type WSMessage =
  | OperationMessage
  | SyncMessage
  | AckMessage
  | ErrorMessage
  | ReloadMessage
  | NoteExpiredMessage
  | NoteDeletedMessage;

// Client session information
export interface ClientSession {
  clientId: string;
  sessionId: string;
  lastAckOperation: number;
  isAuthenticated: boolean;
  ws: WebSocket;
}
