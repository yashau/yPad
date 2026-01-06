/**
 * @fileoverview Types for the message handler context.
 *
 * The NoteSessionContext interface defines the shared state and methods
 * that handlers need to access from the main Durable Object. This allows
 * the handlers to be extracted into a separate file while still having
 * access to the necessary state.
 */

import type { ClientSession } from '../../types/messages';

/**
 * Context object passed to message handlers.
 * Contains the mutable state and helper methods from NoteSessionDurableObject.
 */
export interface NoteSessionContext {
  /** Unique identifier for this note */
  noteId: string;

  /** Current document content (plain text derived from Yjs) */
  currentContent: string;

  /** Binary Yjs document state */
  yjsState: Uint8Array | null;

  /** Number of updates since last database persist */
  updatesSincePersist: number;

  /** Session ID of the last edit (for persistence tracking) */
  lastEditSessionId: string | null;

  /** Whether the note is currently encrypted */
  isEncrypted: boolean;

  /** Current syntax highlighting mode */
  currentSyntax: string;

  /** Global sequence number for message ordering */
  globalSeqNum: number;

  /** Map of WebSocket connections to client sessions */
  sessions: Map<WebSocket, ClientSession>;

  /** Send an error message to a specific WebSocket */
  sendError(ws: WebSocket, message: string): void;

  /** Schedule persistence to database (debounced) */
  schedulePersistence(immediate: boolean): void;

  /** Persist syntax change to database */
  persistSyntaxToDB(syntax: string): void;

  /** Apply a Yjs update to the document */
  applyYjsUpdate(update: Uint8Array): void;

  /** Get the full Yjs state */
  getYjsState(): Uint8Array;

  /** Get the current content from Yjs */
  getContent(): string;
}
