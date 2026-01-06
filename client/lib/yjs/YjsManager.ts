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
  /**
   * Get the active editor element for direct DOM manipulation.
   * Returns textarea for plaintext mode, or contenteditable div for syntax highlight mode.
   * This is critical for cursor preservation - we need to update the content
   * and restore cursor position synchronously, bypassing framework reactivity.
   */
  getEditorElement?: () => { element: HTMLTextAreaElement | HTMLDivElement | null; isTextarea: boolean };
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

  // Flag to track if the current change originated from local textarea input
  private localTextfieldChanged = false;

  /**
   * Mark that the next change will come from local textarea input.
   * Call this BEFORE applying local changes to skip unnecessary DOM updates.
   */
  markLocalTextfieldChange(): void {
    this.localTextfieldChanged = true;
  }

  private setupObservers(): void {
    // Cursor state saved BEFORE any Yjs transaction for restoration after
    let savedRelPosStart: Y.RelativePosition | null = null;
    let savedRelPosEnd: Y.RelativePosition | null = null;
    let savedSelectionDirection: 'forward' | 'backward' | 'none' | null = null;

    // CRITICAL: Listen for beforeTransaction to save cursor position BEFORE any changes
    // This is the key to cursor preservation - we must capture the cursor state
    // before Yjs modifies the document, because after the transaction starts,
    // the editor value may already be out of sync with what we're trying to save.
    this.doc.on('beforeTransaction', () => {
      const editorInfo = this.options.getEditorElement?.();
      if (!editorInfo?.element) return;

      const { element, isTextarea } = editorInfo;

      if (isTextarea) {
        // Textarea mode: use selectionStart/selectionEnd
        const textarea = element as HTMLTextAreaElement;
        savedSelectionDirection = textarea.selectionDirection;
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        // Clamp to valid range
        const textLength = this.text.length;
        const clampedStart = Math.max(0, Math.min(start, textLength));
        const clampedEnd = Math.max(0, Math.min(end, textLength));
        savedRelPosStart = Y.createRelativePositionFromTypeIndex(this.text, clampedStart);
        savedRelPosEnd = Y.createRelativePositionFromTypeIndex(this.text, clampedEnd);
      } else {
        // Contenteditable mode: use window.getSelection()
        const selection = window.getSelection();
        if (!selection || selection.rangeCount === 0) return;

        const range = selection.getRangeAt(0);
        const rootNode = element.getRootNode() as Document;

        // Only save if the contenteditable is focused
        if (rootNode.activeElement !== element) return;

        // Calculate absolute character positions from the selection range
        const { start, end } = this.getCharacterOffsetsFromRange(element as HTMLDivElement, range);

        // Determine selection direction based on anchor/focus comparison
        if (selection.anchorNode && selection.focusNode) {
          const anchorOffset = this.getCharacterOffsetForNode(element as HTMLDivElement, selection.anchorNode, selection.anchorOffset);
          const focusOffset = this.getCharacterOffsetForNode(element as HTMLDivElement, selection.focusNode, selection.focusOffset);
          savedSelectionDirection = anchorOffset <= focusOffset ? 'forward' : 'backward';
        } else {
          savedSelectionDirection = 'forward';
        }

        // Clamp to valid range
        const textLength = this.text.length;
        const clampedStart = Math.max(0, Math.min(start, textLength));
        const clampedEnd = Math.max(0, Math.min(end, textLength));
        savedRelPosStart = Y.createRelativePositionFromTypeIndex(this.text, clampedStart);
        savedRelPosEnd = Y.createRelativePositionFromTypeIndex(this.text, clampedEnd);
      }
    });

    // Listen for local document updates (to send to server)
    this.doc.on('update', (update: Uint8Array, origin: unknown) => {
      // Only send updates that originated locally (not from remote)
      if (origin !== 'remote' && !this.isApplyingRemote) {
        this.queueUpdate(update);
      }
    });

    // Listen for text content changes
    this.text.observe((_event, transaction) => {
      const content = this.text.toString();

      // If this change originated from local editor input, skip DOM update
      // (the editor already has the correct value)
      if (transaction.local && this.localTextfieldChanged) {
        this.localTextfieldChanged = false;
        this.options.onContentChange?.(content);
        this.updateRemoteCursors();
        return;
      }

      // CRITICAL: Update editor value and restore cursor DIRECTLY,
      // bypassing framework reactivity. This is how y-textarea does it.
      const editorInfo = this.options.getEditorElement?.();
      if (editorInfo?.element) {
        const { element, isTextarea } = editorInfo;
        const rootNode = element.getRootNode() as Document;
        const isFocused = rootNode.activeElement === element;

        if (isTextarea) {
          // Textarea mode: update value directly
          const textarea = element as HTMLTextAreaElement;
          textarea.value = content;

          // Restore cursor if textarea is focused
          if (isFocused && savedRelPosStart && savedRelPosEnd) {
            const startPos = Y.createAbsolutePositionFromRelativePosition(savedRelPosStart, this.doc);
            const endPos = Y.createAbsolutePositionFromRelativePosition(savedRelPosEnd, this.doc);

            if (startPos !== null && endPos !== null) {
              textarea.setSelectionRange(
                startPos.index,
                endPos.index,
                savedSelectionDirection || 'forward'
              );
            }
          }
        } else {
          // Contenteditable mode: update innerHTML/textContent
          // For syntax highlighted content, we need to preserve the HTML structure
          // The framework will re-render with proper highlighting, but we need to restore cursor
          const div = element as HTMLDivElement;

          // For contenteditable, we update textContent which triggers the framework
          // to re-render with proper syntax highlighting via onContentChange callback.
          // We save cursor position and restore after the callback updates the DOM.

          // Restore cursor if contenteditable is focused
          if (isFocused && savedRelPosStart && savedRelPosEnd) {
            const startPos = Y.createAbsolutePositionFromRelativePosition(savedRelPosStart, this.doc);
            const endPos = Y.createAbsolutePositionFromRelativePosition(savedRelPosEnd, this.doc);

            if (startPos !== null && endPos !== null) {
              // Use requestAnimationFrame to restore cursor after framework updates DOM
              const savedStart = startPos.index;
              const savedEnd = endPos.index;
              requestAnimationFrame(() => {
                // Re-check if still focused after RAF
                if ((div.getRootNode() as Document).activeElement === div) {
                  this.setCursorInContentEditable(div, savedStart, savedEnd);
                }
              });
            }
          }
        }
      }

      // Still notify via callback for state sync (editor may already be updated for textarea)
      this.options.onContentChange?.(content);

      // Re-compute remote cursor positions when content changes
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
          // New format: relative positions stored as JSON
          // Convert JSON back to RelativePosition, then to absolute position
          try {
            const anchorRelPos = Y.createRelativePositionFromJSON(cursor.anchor);
            const anchorAbs = Y.createAbsolutePositionFromRelativePosition(anchorRelPos, this.doc);

            if (anchorAbs === null) {
              // The relative position couldn't be resolved - the referenced item doesn't exist
              // in this document. This can happen if the cursor was set on content that
              // hasn't synced to this client yet. Skip this cursor.
              console.warn('[YjsManager] Could not resolve relative position for client', clientId,
                '- item not found in local doc. Skipping cursor.');
              return;
            }

            position = anchorAbs.index;

            if (cursor.head) {
              const headRelPos = Y.createRelativePositionFromJSON(cursor.head);
              const headAbs = Y.createAbsolutePositionFromRelativePosition(headRelPos, this.doc);
              selectionEnd = headAbs?.index;
            }
          } catch (e) {
            console.warn('[YjsManager] Failed to parse cursor JSON, using fallback:', e);
            // Fallback: try using the object directly (old format)
            const anchorAbs = Y.createAbsolutePositionFromRelativePosition(cursor.anchor, this.doc);
            if (anchorAbs === null) {
              return;
            }
            position = anchorAbs.index;
            if (cursor.head) {
              const headAbs = Y.createAbsolutePositionFromRelativePosition(cursor.head, this.doc);
              selectionEnd = headAbs?.index;
            }
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
   * We store positions as JSON to ensure proper serialization through awareness protocol.
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

    // Convert to JSON format for awareness serialization
    // This ensures proper structure is maintained through JSON stringify/parse
    const anchorJSON = Y.relativePositionToJSON(anchor);
    const headJSON = Y.relativePositionToJSON(head);

    this.awareness.setLocalStateField('cursor', {
      anchor: anchorJSON,
      head: headJSON
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
   * Get character offsets from a Range within a contenteditable element.
   * Walks the DOM tree and counts characters to find absolute positions.
   */
  private getCharacterOffsetsFromRange(container: HTMLElement, range: Range): { start: number; end: number } {
    const start = this.getCharacterOffsetForNode(container, range.startContainer, range.startOffset);
    const end = this.getCharacterOffsetForNode(container, range.endContainer, range.endOffset);
    return { start: Math.min(start, end), end: Math.max(start, end) };
  }

  /**
   * Get the absolute character offset for a node and offset within a contenteditable.
   * This counts all text characters before the given position.
   */
  private getCharacterOffsetForNode(container: HTMLElement, targetNode: Node, targetOffset: number): number {
    const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
    let charCount = 0;
    let node: Node | null = null;

    while ((node = walker.nextNode())) {
      if (node === targetNode) {
        return charCount + targetOffset;
      }
      charCount += node.textContent?.length || 0;
    }

    // If targetNode is not a text node but an element, handle offset as child index
    if (targetNode === container || container.contains(targetNode)) {
      // If targeting the container itself, offset is the child index
      if (targetNode.nodeType === Node.ELEMENT_NODE) {
        const children = Array.from(targetNode.childNodes);
        for (let i = 0; i < Math.min(targetOffset, children.length); i++) {
          charCount += this.getTextContentLength(children[i]);
        }
        return charCount;
      }
    }

    // Fallback: return the total length if node wasn't found
    return container.textContent?.length || 0;
  }

  /**
   * Get the total text content length of a node and all its descendants.
   */
  private getTextContentLength(node: Node): number {
    if (node.nodeType === Node.TEXT_NODE) {
      return node.textContent?.length || 0;
    }
    let length = 0;
    node.childNodes.forEach(child => {
      length += this.getTextContentLength(child);
    });
    return length;
  }

  /**
   * Set the cursor position in a contenteditable element.
   * Creates a Range at the specified character offset.
   */
  private setCursorInContentEditable(container: HTMLElement, start: number, end: number): void {
    const selection = window.getSelection();
    if (!selection) return;

    const range = document.createRange();
    const startPos = this.findNodeAndOffsetAtCharacter(container, start);
    const endPos = this.findNodeAndOffsetAtCharacter(container, end);

    if (startPos && endPos) {
      range.setStart(startPos.node, startPos.offset);
      range.setEnd(endPos.node, endPos.offset);
      selection.removeAllRanges();
      selection.addRange(range);
    }
  }

  /**
   * Find the DOM node and offset for a given character position.
   */
  private findNodeAndOffsetAtCharacter(container: HTMLElement, charPosition: number): { node: Node; offset: number } | null {
    const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
    let charCount = 0;
    let node: Node | null = null;

    while ((node = walker.nextNode())) {
      const nodeLength = node.textContent?.length || 0;
      if (charCount + nodeLength >= charPosition) {
        return { node, offset: charPosition - charCount };
      }
      charCount += nodeLength;
    }

    // If position is beyond content, return end of last text node
    const lastTextNode = this.getLastTextNode(container);
    if (lastTextNode) {
      return { node: lastTextNode, offset: lastTextNode.textContent?.length || 0 };
    }

    // If no text nodes exist, return the container itself
    return { node: container, offset: 0 };
  }

  /**
   * Get the last text node in a container.
   */
  private getLastTextNode(container: HTMLElement): Text | null {
    const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
    let lastNode: Text | null = null;
    let node: Node | null = null;
    while ((node = walker.nextNode())) {
      lastNode = node as Text;
    }
    return lastNode;
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
