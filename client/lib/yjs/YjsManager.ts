/**
 * YjsManager - Client-side Yjs document manager for collaborative editing
 *
 * Manages a Yjs document and provides methods for syncing with the server.
 * Uses Y.Text for plain text collaborative editing.
 */

import * as Y from 'yjs';
import { Awareness } from 'y-protocols/awareness';
import * as awarenessProtocol from 'y-protocols/awareness';

export interface YjsManagerOptions {
  onLocalUpdate?: (update: Uint8Array) => void;
  onAwarenessUpdate?: (update: Uint8Array) => void;
  onContentChange?: (content: string) => void;
  onRemoteCursorsChange?: (cursors: Map<number, RemoteCursorState>) => void;
  /** Debounce interval for batching updates (default: 50ms) */
  updateDebounceMs?: number;
}

export interface RemoteCursorState {
  position: number;
  selectionEnd?: number;
  color: string;
  name: string;
}

export interface LocalUserState {
  name: string;
  color: string;
}

/**
 * Saved cursor state using Yjs relative positions.
 * Relative positions survive document edits and can be converted back to absolute positions.
 */
export interface SavedCursorState {
  anchorRelative: Y.RelativePosition;
  headRelative: Y.RelativePosition;
}

/**
 * Encodes a Uint8Array to base64 string for JSON transport
 */
export function encodeBase64(data: Uint8Array): string {
  // Use browser's btoa with proper handling of binary data
  let binary = '';
  for (let i = 0; i < data.length; i++) {
    binary += String.fromCharCode(data[i]);
  }
  return btoa(binary);
}

/**
 * Decodes a base64 string back to Uint8Array
 */
export function decodeBase64(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export class YjsManager {
  private doc: Y.Doc;
  private text: Y.Text;
  private awareness: Awareness;
  private options: YjsManagerOptions;
  private isApplyingRemote = false;
  private localClientId: number;

  // Update batching state
  private pendingUpdates: Uint8Array[] = [];
  private updateDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly updateDebounceMs: number;

  constructor(options: YjsManagerOptions = {}) {
    this.options = options;
    this.updateDebounceMs = options.updateDebounceMs ?? 50;
    this.doc = new Y.Doc();
    this.text = this.doc.getText('content');
    this.awareness = new Awareness(this.doc);
    this.localClientId = this.doc.clientID;

    this.setupObservers();
  }

  private setupObservers(): void {
    // Listen for local document updates (to send to server)
    this.doc.on('update', (update: Uint8Array, origin: unknown) => {
      // Only send updates that originated locally (not from remote)
      if (origin !== 'remote' && !this.isApplyingRemote) {
        this.queueUpdate(update);
      }
    });

    // Listen for text content changes
    this.text.observe(() => {
      this.options.onContentChange?.(this.text.toString());
      // Re-compute remote cursor positions when content changes
      // (relative positions need to be converted to new absolute positions)
      this.updateRemoteCursors();
    });

    // Listen for awareness changes (remote cursors display)
    this.awareness.on('change', () => {
      this.updateRemoteCursors();
    });

    // Listen for local awareness updates (to send to server)
    this.awareness.on('update', ({ added, updated, removed }: { added: number[]; updated: number[]; removed: number[] }) => {
      // Only send if this is a local change (our client ID changed)
      const changedClients = [...added, ...updated, ...removed];
      if (changedClients.includes(this.localClientId)) {
        // Encode and send our awareness state
        const update = awarenessProtocol.encodeAwarenessUpdate(this.awareness, [this.localClientId]);
        this.options.onAwarenessUpdate?.(update);
      }
    });
  }

  /**
   * Queue an update for batching. Updates are merged and sent after a debounce interval.
   */
  private queueUpdate(update: Uint8Array): void {
    this.pendingUpdates.push(update);

    // Clear existing timer
    if (this.updateDebounceTimer !== null) {
      clearTimeout(this.updateDebounceTimer);
    }

    // Set new timer to flush updates
    this.updateDebounceTimer = setTimeout(() => {
      this.flushUpdates();
    }, this.updateDebounceMs);
  }

  /**
   * Flush all pending updates by merging them into a single update.
   */
  private flushUpdates(): void {
    if (this.pendingUpdates.length === 0) return;

    // Merge all pending updates into one
    const mergedUpdate = Y.mergeUpdates(this.pendingUpdates);
    this.pendingUpdates = [];
    this.updateDebounceTimer = null;

    // Send the merged update
    this.options.onLocalUpdate?.(mergedUpdate);
  }

  /**
   * Force flush any pending updates immediately (useful before disconnect).
   */
  flushPendingUpdates(): void {
    if (this.updateDebounceTimer !== null) {
      clearTimeout(this.updateDebounceTimer);
      this.updateDebounceTimer = null;
    }
    this.flushUpdates();
  }

  private updateRemoteCursors(): void {
    const cursors = new Map<number, RemoteCursorState>();
    const states = this.awareness.getStates();

    states.forEach((state, clientId) => {
      // Skip local client
      if (clientId === this.localClientId) return;

      const cursor = state.cursor as {
        anchor?: Y.RelativePosition;
        head?: Y.RelativePosition;
        // Legacy support for absolute positions
        position?: number;
        selectionEnd?: number;
      } | undefined;
      const user = state.user as { name: string; color: string } | undefined;

      if (cursor && user) {
        // Convert relative positions back to absolute positions
        let position: number;
        let selectionEnd: number | undefined;

        if (cursor.anchor) {
          // New format: relative positions
          const anchorAbs = Y.createAbsolutePositionFromRelativePosition(cursor.anchor, this.doc);
          position = anchorAbs?.index ?? 0;

          if (cursor.head) {
            const headAbs = Y.createAbsolutePositionFromRelativePosition(cursor.head, this.doc);
            selectionEnd = headAbs?.index;
          }
        } else {
          // Legacy format: absolute positions (for backwards compatibility)
          position = cursor.position ?? 0;
          selectionEnd = cursor.selectionEnd;
        }

        cursors.set(clientId, {
          position,
          selectionEnd,
          color: user.color,
          name: user.name
        });
      }
    });

    this.options.onRemoteCursorsChange?.(cursors);
  }

  /**
   * Get the current document content
   */
  getContent(): string {
    return this.text.toString();
  }

  /**
   * Initialize document with content (for new documents or initial sync)
   */
  initializeContent(content: string): void {
    this.doc.transact(() => {
      // Clear existing content
      if (this.text.length > 0) {
        this.text.delete(0, this.text.length);
      }
      // Insert new content
      if (content.length > 0) {
        this.text.insert(0, content);
      }
    }, 'init');
  }

  /**
   * Apply a full state update from the server (for initial sync)
   */
  applyFullState(state: Uint8Array): void {
    this.isApplyingRemote = true;
    try {
      Y.applyUpdate(this.doc, state, 'remote');
    } finally {
      this.isApplyingRemote = false;
    }
  }

  /**
   * Apply an incremental update from the server
   */
  applyUpdate(update: Uint8Array): void {
    this.isApplyingRemote = true;
    try {
      Y.applyUpdate(this.doc, update, 'remote');
    } finally {
      this.isApplyingRemote = false;
    }
  }

  /**
   * Get the full document state (for persistence or sync)
   */
  getFullState(): Uint8Array {
    return Y.encodeStateAsUpdate(this.doc);
  }

  /**
   * Get the state vector (for sync protocol)
   */
  getStateVector(): Uint8Array {
    return Y.encodeStateVector(this.doc);
  }

  /**
   * Get an update containing changes since a given state vector
   */
  getUpdateSince(stateVector: Uint8Array): Uint8Array {
    return Y.encodeStateAsUpdate(this.doc, stateVector);
  }

  /**
   * Insert text at a position
   */
  insert(position: number, text: string): void {
    this.text.insert(position, text);
  }

  /**
   * Delete text at a position
   */
  delete(position: number, length: number): void {
    this.text.delete(position, length);
  }

  /**
   * Replace the entire content (used when user pastes or performs other bulk operations)
   * This intelligently diffs and applies minimal changes
   */
  replaceContent(newContent: string): void {
    const oldContent = this.text.toString();
    if (oldContent === newContent) return;

    this.doc.transact(() => {
      // Find common prefix and suffix to minimize the change
      let prefixLen = 0;
      const minLen = Math.min(oldContent.length, newContent.length);

      while (prefixLen < minLen && oldContent[prefixLen] === newContent[prefixLen]) {
        prefixLen++;
      }

      let oldSuffixStart = oldContent.length;
      let newSuffixStart = newContent.length;

      while (
        oldSuffixStart > prefixLen &&
        newSuffixStart > prefixLen &&
        oldContent[oldSuffixStart - 1] === newContent[newSuffixStart - 1]
      ) {
        oldSuffixStart--;
        newSuffixStart--;
      }

      // Delete the changed portion
      const deleteLen = oldSuffixStart - prefixLen;
      if (deleteLen > 0) {
        this.text.delete(prefixLen, deleteLen);
      }

      // Insert the new portion
      const insertText = newContent.slice(prefixLen, newSuffixStart);
      if (insertText.length > 0) {
        this.text.insert(prefixLen, insertText);
      }
    });
  }

  /**
   * Set local cursor position for awareness.
   * Uses Yjs relative positions so cursors track correctly when other users edit.
   */
  setLocalCursor(position: number, selectionEnd?: number): void {
    // Clamp positions to valid range
    const textLength = this.text.length;
    const clampedPosition = Math.max(0, Math.min(position, textLength));
    const clampedEnd = selectionEnd !== undefined
      ? Math.max(0, Math.min(selectionEnd, textLength))
      : clampedPosition;

    // Convert absolute positions to relative positions
    // Relative positions track the logical location even when content changes
    const anchor = Y.createRelativePositionFromTypeIndex(this.text, clampedPosition);
    const head = Y.createRelativePositionFromTypeIndex(this.text, clampedEnd);

    this.awareness.setLocalStateField('cursor', {
      anchor,
      head
    });
  }

  /**
   * Set local user info for awareness
   */
  setLocalUser(user: LocalUserState): void {
    this.awareness.setLocalStateField('user', user);
  }

  /**
   * Apply awareness update from remote.
   * Returns the awareness client IDs that were in the update.
   */
  applyAwarenessUpdate(update: Uint8Array): number[] {
    // Decode the awareness update to extract client IDs
    // The format is: [clientID (varint), clock (varint), state (JSON string or null)]
    // We need to parse the varint to get the client IDs
    const clientIds: number[] = [];

    try {
      // Simple varint decoder for the update
      // Format: length (varint), then for each entry: clientId (varint), clock (varint), stateLen (varint), state (string)
      let pos = 0;

      // Read the number of entries (varint)
      let numEntries = 0;
      let shift = 0;
      while (pos < update.length) {
        const byte = update[pos++];
        numEntries |= (byte & 0x7f) << shift;
        if ((byte & 0x80) === 0) break;
        shift += 7;
      }

      // Read each entry
      for (let i = 0; i < numEntries && pos < update.length; i++) {
        // Read clientId (varint)
        let clientId = 0;
        shift = 0;
        while (pos < update.length) {
          const byte = update[pos++];
          clientId |= (byte & 0x7f) << shift;
          if ((byte & 0x80) === 0) break;
          shift += 7;
        }
        clientIds.push(clientId);

        // Read clock (varint) - skip
        while (pos < update.length && (update[pos++] & 0x80) !== 0) {}

        // Read state length (varint)
        let stateLen = 0;
        shift = 0;
        while (pos < update.length) {
          const byte = update[pos++];
          stateLen |= (byte & 0x7f) << shift;
          if ((byte & 0x80) === 0) break;
          shift += 7;
        }

        // Skip state bytes
        pos += stateLen;
      }
    } catch {
      // If parsing fails, just apply the update without extracting IDs
    }

    // Apply the update
    awarenessProtocol.applyAwarenessUpdate(this.awareness, update, 'remote');

    return clientIds;
  }

  /**
   * Remove a client from awareness (when they disconnect).
   * This clears their cursor from the display.
   */
  removeAwarenessClient(awarenessClientId: number): void {
    awarenessProtocol.removeAwarenessStates(this.awareness, [awarenessClientId], 'remote');
  }

  /**
   * Get all awareness client IDs (excluding local client)
   */
  getRemoteAwarenessClientIds(): number[] {
    const states = this.awareness.getStates();
    const clientIds: number[] = [];
    states.forEach((_, clientId) => {
      if (clientId !== this.localClientId) {
        clientIds.push(clientId);
      }
    });
    return clientIds;
  }

  /**
   * Get awareness update to send to server
   */
  getAwarenessUpdate(): Uint8Array {
    return awarenessProtocol.encodeAwarenessUpdate(
      this.awareness,
      [this.awareness.clientID]
    );
  }

  /**
   * Get full awareness state (for new connections)
   */
  getFullAwarenessState(): Uint8Array {
    return awarenessProtocol.encodeAwarenessUpdate(
      this.awareness,
      Array.from(this.awareness.getStates().keys())
    );
  }

  /**
   * Get the local client ID
   */
  getClientId(): number {
    return this.localClientId;
  }

  /**
   * Save cursor position as Yjs relative positions.
   * Call this BEFORE applying a remote update to preserve cursor across the update.
   */
  saveCursorPosition(start: number, end: number): SavedCursorState {
    const textLength = this.text.length;
    const clampedStart = Math.max(0, Math.min(start, textLength));
    const clampedEnd = Math.max(0, Math.min(end, textLength));

    // Use default assoc=0 (associate right) so that:
    // - Insertions BEFORE the position cause the cursor to shift right (correct behavior)
    // - Insertions AT the position also shift the cursor right (acceptable trade-off)
    // This ensures cursor tracking works correctly for the common case of
    // typing before or after another user's cursor position.
    return {
      anchorRelative: Y.createRelativePositionFromTypeIndex(this.text, clampedStart),
      headRelative: Y.createRelativePositionFromTypeIndex(this.text, clampedEnd)
    };
  }

  /**
   * Restore cursor position from saved relative positions.
   * Call this AFTER applying a remote update to get the new absolute positions.
   * Returns null if the positions can't be resolved (e.g., deleted content).
   */
  restoreCursorPosition(saved: SavedCursorState): { start: number; end: number } | null {
    const anchorAbs = Y.createAbsolutePositionFromRelativePosition(saved.anchorRelative, this.doc);
    const headAbs = Y.createAbsolutePositionFromRelativePosition(saved.headRelative, this.doc);

    if (anchorAbs === null || headAbs === null) {
      return null;
    }

    return {
      start: anchorAbs.index,
      end: headAbs.index
    };
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    // Clear any pending update timer
    if (this.updateDebounceTimer !== null) {
      clearTimeout(this.updateDebounceTimer);
      this.updateDebounceTimer = null;
    }
    // Flush any pending updates before destroying
    this.flushUpdates();

    this.awareness.destroy();
    this.doc.destroy();
  }
}
