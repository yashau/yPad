/**
 * @fileoverview WebSocket connection management for real-time collaboration.
 *
 * Handles WebSocket lifecycle, OT operation processing, cursor updates,
 * and state synchronization between client and server.
 */

import { WebSocketClient } from '../realtime/WebSocketClient';
import { generateOperations } from '../realtime/OperationGenerator';
import { transform, transformCursorPosition } from '../../../src/ot/transform';
import { applyOperation } from '../../../src/ot/apply';
import { simpleChecksum } from '../../../src/ot/checksum';
import type { Operation } from '../../../src/ot/types';
import type { useNoteState } from './useNoteState.svelte';
import type { useEditor } from './useEditor.svelte';
import type { useSecurity } from './useSecurity.svelte';
import type { useCollaboration, PendingOperation } from './useCollaboration.svelte';

/** Configuration for WebSocket connection hook. */
export interface WebSocketConfig {
  noteState: ReturnType<typeof useNoteState>;
  editor: ReturnType<typeof useEditor>;
  security: ReturnType<typeof useSecurity>;
  collaboration: ReturnType<typeof useCollaboration>;
  onEncryptionEnabled?: () => void;
  onEncryptionDisabled?: () => void;
  onVersionUpdate?: () => void;
  onNoteDeleted?: (deletedByCurrentUser: boolean) => void;
  onNoteStatus?: (viewCount: number, maxViews: number | null, expiresAt: number | null) => void;
  onRequestEditResponse?: (canEdit: boolean, activeEditorCount: number, viewerCount: number) => void;
  onEditorLimitReached?: () => void;
}

export function useWebSocketConnection(config: WebSocketConfig) {
  const { noteState, editor, security, collaboration } = config;
  let noteWasDeleted = $state(false);
  let checksumMismatchCount = 0; // Track consecutive checksum mismatches

  function connectWebSocket() {
    if (!noteState.noteId || collaboration.wsClient || noteWasDeleted) return;

    collaboration.connectionStatus = 'connecting';
    collaboration.isSyncing = true;

    if (editor.content && editor.content !== editor.lastLocalContent) {
      collaboration.pending = { ...collaboration.pending, content: editor.content };
    }

    try {
      collaboration.wsClient = new WebSocketClient(noteState.noteId, {
        password: security.passwordInput,
        sessionId: noteState.sessionId,
        autoReconnect: false,
        onOpen: () => {
          collaboration.isRealtimeEnabled = true;
          collaboration.connectionStatus = 'connected';
          noteState.saveStatus = 'Real-time sync active';
        },
        onOperation: (operation, contentChecksum) => {
          applyRemoteOperation(operation, contentChecksum);
        },
        onClose: () => {
          collaboration.isRealtimeEnabled = false;
          collaboration.connectionStatus = 'disconnected';
          collaboration.isSyncing = false;
          noteState.saveStatus = 'Disconnected';
          collaboration.wsClient = null;

          collaboration.remoteCursors = new Map();

          // Clear pending operations - they'll be recalculated on reconnect sync
          // This prevents duplicate operations from being sent after reconnection
          collaboration.pending = { content: null, baseVersion: null, operations: [] };

          // Only attempt reconnection if note was not deleted and not encrypted
          // Encrypted notes don't use WebSocket for realtime sync
          if (!noteWasDeleted && !security.isEncrypted) {
            setTimeout(() => {
              if (noteState.noteId && !collaboration.wsClient && !noteWasDeleted && !security.isEncrypted) {
                connectWebSocket();
              }
            }, 2000);
          }
        },
        onError: (error) => {
          console.error('[WebSocket] error:', error);
          collaboration.connectionStatus = 'disconnected';
        },
        onSync: (syncContent, version, operations, serverClientId, syntax) => {
          collaboration.clientId = serverClientId;

          if (security.isEncrypted) {
            noteState.currentVersion = version;
            collaboration.isSyncing = false;
            return;
          }

          noteState.currentVersion = version;
          collaboration.lastSentCursorPos = syncContent.length;

          // Apply syntax from server if provided
          if (syntax && syntax !== editor.syntaxHighlight) {
            editor.syntaxHighlight = syntax;
          }

          // Check for local content that differs from server sync content
          // This handles both:
          // 1. pending.content from typing while WebSocket was connecting
          // 2. editor.content changes made during initial PUT request (race condition)
          const localContent = collaboration.pending.content ?? editor.content;

          if (localContent !== syncContent) {
            const ops = generateOperations(syncContent, localContent, collaboration.clientId, noteState.currentVersion);

            // Send each operation with correct incremental version
            // Also add to pending.operations so client-side OT works correctly
            ops.forEach((op, index) => {
              if (collaboration.wsClient) {
                const baseVersion = noteState.currentVersion + index;
                // Update operation version to be currentVersion + index
                op.version = baseVersion;
                // Add to pending operations for OT transform against incoming remote ops
                // Track the baseVersion so we know what server state this was based on
                const pendingOp: PendingOperation = { operation: op, baseVersion };
                collaboration.pending = {
                  ...collaboration.pending,
                  operations: [...collaboration.pending.operations, pendingOp]
                };
                collaboration.wsClient.sendOperation(op, baseVersion);
                noteState.currentVersion++;
              }
            });

            editor.isUpdating = true;
            editor.content = localContent;
            editor.lastLocalContent = localContent;
            editor.isUpdating = false;

            collaboration.pending = { ...collaboration.pending, content: null };
          } else {
            // Content matches, just ensure editor state is in sync
            editor.isUpdating = true;
            editor.content = syncContent;
            editor.lastLocalContent = syncContent;
            editor.isUpdating = false;
          }

          collaboration.isSyncing = false;

          // Request edit permission after sync completes
          // Server will respond with whether we can edit based on active editor limit
          if (collaboration.wsClient && !security.isEncrypted) {
            collaboration.wsClient.sendRequestEdit(serverClientId);
          }
        },
        onAck: (version, contentChecksum?: number, transformedOperation?: Operation) => {
          noteState.currentVersion = version;

          // Remove the acknowledged operation from pending list (FIFO order)
          // When we send an operation, it's added to pending.operations.
          // When we receive ACK, the server has applied it, so remove from pending.
          const pendingOps = collaboration.pending.operations;
          if (pendingOps.length > 0) {
            collaboration.pending = {
              ...collaboration.pending,
              operations: pendingOps.slice(1)
            };
          }

          // Update lastLocalContent to confirm this operation is now server-side
          editor.lastLocalContent = editor.content;

          // If no more pending operations, clear pending state
          if (collaboration.pending.operations.length === 0) {
            collaboration.pending = { content: null, baseVersion: null, operations: [] };
          }

          // Verify content checksum if provided
          // Only verify when we have no pending ops (local content matches server)
          if (contentChecksum !== undefined && collaboration.pending.operations.length === 0) {
            verifyContentChecksum(contentChecksum);
          }
        },
        onNoteDeleted: (deletedByCurrentUser) => {
          noteWasDeleted = true;
          if (collaboration.wsClient) {
            collaboration.wsClient.close();
            collaboration.wsClient = null;
          }
          collaboration.isRealtimeEnabled = false;
          collaboration.connectionStatus = 'disconnected';
          noteState.saveStatus = '';
          config.onNoteDeleted?.(deletedByCurrentUser);
        },
        onEncryptionChanged: (is_encrypted) => {
          if (is_encrypted) {
            config.onEncryptionEnabled?.();
          } else {
            config.onEncryptionDisabled?.();
          }
        },
        onVersionUpdate: (version, message) => {
          if (security.isEncrypted) {
            config.onVersionUpdate?.();
          }
        },
        onCursorUpdate: (remoteClientId, position) => {
          if (remoteClientId !== collaboration.clientId) {
            const color = collaboration.getClientColor(remoteClientId);
            const label = `User ${remoteClientId.substring(0, 4)}`;

            collaboration.remoteCursors = new Map(collaboration.remoteCursors).set(remoteClientId, {
              position,
              color,
              label
            });
          }
        },
        onUserJoined: (joinedClientId, allConnectedUsers, activeEditorCount, viewerCount) => {
          collaboration.connectedUsers = new Set(allConnectedUsers);
          collaboration.cleanupStaleCursors(allConnectedUsers);
          noteState.activeEditorCount = activeEditorCount;
          noteState.viewerCount = viewerCount;
        },
        onUserLeft: (leftClientId, allConnectedUsers, activeEditorCount, viewerCount) => {
          collaboration.connectedUsers = new Set(allConnectedUsers);
          collaboration.cleanupStaleCursors(allConnectedUsers);
          noteState.activeEditorCount = activeEditorCount;
          noteState.viewerCount = viewerCount;
        },
        onSyntaxChange: (syntax) => {
          if (syntax !== editor.syntaxHighlight) {
            editor.syntaxHighlight = syntax;
          }
        },
        onNoteStatus: (viewCount, maxViews, expiresAt) => {
          config.onNoteStatus?.(viewCount, maxViews, expiresAt);
        },
        onReplayResponse: (baseContent, baseVersion, operations, currentVersion, contentChecksum) => {
          // Server sent us the authoritative state - adopt it
          console.log(`[OT] Replay response: version ${baseVersion} -> ${currentVersion}, ${operations.length} ops`);

          // Clear pending operations - they're no longer valid after replay
          collaboration.pending = { content: null, baseVersion: null, operations: [] };

          // Adopt the server's content
          editor.isUpdating = true;
          editor.content = baseContent;
          editor.lastLocalContent = baseContent;
          editor.isUpdating = false;

          // Update version
          noteState.currentVersion = currentVersion;

          // Verify the checksum matches
          const localChecksum = simpleChecksum(editor.content);
          if (localChecksum === contentChecksum) {
            checksumMismatchCount = 0;
            console.log('[OT] Replay successful - checksums match');
          } else {
            console.error('[OT] Replay checksum mismatch - this should not happen');
          }
        },
        onRequestEditResponse: (canEdit, activeEditorCount, viewerCount) => {
          config.onRequestEditResponse?.(canEdit, activeEditorCount, viewerCount);
        },
        onEditorLimitReached: () => {
          config.onEditorLimitReached?.();
        },
        onEditorCountUpdate: (activeEditorCount, viewerCount) => {
          noteState.activeEditorCount = activeEditorCount;
          noteState.viewerCount = viewerCount;
        }
      });
    } catch (error) {
      console.error('[WebSocket] Failed to create client:', error);
      collaboration.connectionStatus = 'disconnected';
      collaboration.isSyncing = false;
      collaboration.pending = { ...collaboration.pending, content: null };
    }
  }

  function disconnectWebSocket() {
    if (collaboration.wsClient) {
      collaboration.wsClient.close();
      collaboration.wsClient = null;
    }
    collaboration.isRealtimeEnabled = false;
    collaboration.connectionStatus = 'disconnected';
  }

  function resetState() {
    // Reset the noteWasDeleted flag to allow WebSocket reconnection for new notes
    noteWasDeleted = false;
    checksumMismatchCount = 0;
    // Clear pending operations on reset
    collaboration.pending = { content: null, baseVersion: null, operations: [] };
  }

  function verifyContentChecksum(serverChecksum: number) {
    const localChecksum = simpleChecksum(editor.content);

    if (localChecksum !== serverChecksum) {
      checksumMismatchCount++;
      console.warn(`[OT] Checksum mismatch: local=${localChecksum}, server=${serverChecksum}, count=${checksumMismatchCount}`);

      // If we have a mismatch and no pending operations, request a replay immediately.
      // The server's content is authoritative, so we should sync to it ASAP.
      if (collaboration.pending.operations.length === 0) {
        console.warn('[OT] Requesting replay due to checksum mismatch (no pending ops)');
        if (collaboration.wsClient && collaboration.clientId) {
          collaboration.wsClient.sendReplayRequest(noteState.currentVersion, collaboration.clientId);
        }
      }
    } else {
      // Reset mismatch counter on successful verification
      checksumMismatchCount = 0;
    }
  }

  function applyRemoteOperation(operation: Operation, contentChecksum?: number) {
    // This function is ONLY called for remote operations (from other clients).
    // Our own operations are acknowledged via onAck callback, not onOperation.
    // The server excludes the sender from broadcasts.

    editor.isUpdating = true;

    try {
      // Transform remote op against pending local ops, and update pending ops accordingly.
      // This follows the OT algorithm: both sides must be transformed for convergence.
      let transformedOp = operation;
      const newPendingOps: PendingOperation[] = [];

      for (const pendingOp of collaboration.pending.operations) {
        const [transformedPending, transformedRemote] = transform(pendingOp.operation, transformedOp);
        newPendingOps.push({ operation: transformedPending, baseVersion: pendingOp.baseVersion });
        transformedOp = transformedRemote;
      }

      // Update pending operations with their transformed versions
      collaboration.pending = { ...collaboration.pending, operations: newPendingOps };

      // Now apply the transformed remote operation
      collaboration.lastSentCursorPos = transformCursorPosition(collaboration.lastSentCursorPos, transformedOp);

      let cursorPos = getCurrentCursorPosition();
      cursorPos = transformCursorPosition(cursorPos, transformedOp);

      // Update cursor positions and trigger reactivity
      // Only transform cursors that are NOT from the operation's client
      // The operation client's cursor position comes from their cursor_update messages
      const updatedCursors = new Map(collaboration.remoteCursors);
      updatedCursors.forEach((cursorData, remoteClientId) => {
        if (remoteClientId !== transformedOp.clientId) {
          cursorData.position = transformCursorPosition(cursorData.position, transformedOp);
        }
      });
      collaboration.remoteCursors = updatedCursors;

      editor.content = applyOperation(editor.content, transformedOp);

      // Track this remote operation for transformation of local operations that are
      // currently being input. If the user is typing (beforeinput fired but input hasn't),
      // the new local operation will need to be transformed against this remote op.
      // We already transformed it against pending ops, so this is the "effective" remote op.
      collaboration.recentRemoteOps = [...collaboration.recentRemoteOps, transformedOp];

      // Note: We don't verify checksum here because our local content includes
      // pending operations that the server doesn't know about yet.
      // Checksum verification only makes sense when we have no pending operations.
      if (contentChecksum !== undefined && collaboration.pending.operations.length === 0) {
        verifyContentChecksum(contentChecksum);
      }

      // Update lastLocalContent to stay in sync (but preserve pending ops effect)
      // lastLocalContent should reflect what we've sent to the server
      // Since we have pending ops, don't update it here
      if (collaboration.pending.operations.length === 0) {
        editor.lastLocalContent = editor.content;
      }

      if (operation.version > noteState.currentVersion) {
        noteState.currentVersion = operation.version;
      }

      restoreCursorPosition(cursorPos);
    } finally {
      editor.isUpdating = false;
    }
  }

  function getCurrentCursorPosition(): number {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) {
      return 0;
    }

    const range = selection.getRangeAt(0);
    const activeElement = document.activeElement;

    if (activeElement === editor.editorRef && editor.editorRef) {
      const walker = document.createTreeWalker(editor.editorRef, NodeFilter.SHOW_TEXT);
      let charCount = 0;
      let node: Node | null = null;

      while ((node = walker.nextNode())) {
        if (node === range.startContainer) {
          charCount += range.startOffset;
          break;
        }

        const nodeLength = node.textContent?.length || 0;
        charCount += nodeLength;
      }

      return charCount;
    } else if (activeElement === editor.textareaScrollRef && editor.textareaScrollRef) {
      return editor.textareaScrollRef.selectionStart;
    }

    return 0;
  }

  function getCurrentSelectionRange(): { start: number; end: number } {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) {
      return { start: 0, end: 0 };
    }

    const range = selection.getRangeAt(0);
    const activeElement = document.activeElement;

    if (activeElement === editor.editorRef && editor.editorRef) {
      const walker = document.createTreeWalker(editor.editorRef, NodeFilter.SHOW_TEXT);
      let charCount = 0;
      let startPos = 0;
      let endPos = 0;
      let foundStart = false;
      let foundEnd = false;
      let node: Node | null = null;

      while ((node = walker.nextNode())) {
        const nodeLength = node.textContent?.length || 0;

        if (!foundStart && node === range.startContainer) {
          startPos = charCount + range.startOffset;
          foundStart = true;
        }

        if (!foundEnd && node === range.endContainer) {
          endPos = charCount + range.endOffset;
          foundEnd = true;
        }

        if (foundStart && foundEnd) break;
        charCount += nodeLength;
      }

      return { start: startPos, end: endPos };
    } else if (activeElement === editor.textareaScrollRef && editor.textareaScrollRef) {
      return {
        start: editor.textareaScrollRef.selectionStart,
        end: editor.textareaScrollRef.selectionEnd
      };
    }

    return { start: 0, end: 0 };
  }

  function restoreCursorPosition(cursorPos: number) {
    const selection = window.getSelection();
    const activeElement = document.activeElement;

    if (activeElement === editor.editorRef && editor.editorRef && selection) {
      const textContent = editor.editorRef.textContent || '';
      const newCursorPos = Math.min(cursorPos, textContent.length);

      const walker = document.createTreeWalker(editor.editorRef, NodeFilter.SHOW_TEXT);
      let charCount = 0;
      let targetNode: Node | null = null;
      let targetOffset = 0;

      while (walker.nextNode()) {
        const node = walker.currentNode;
        const nodeLength = node.textContent?.length || 0;

        if (charCount + nodeLength >= newCursorPos) {
          targetNode = node;
          targetOffset = newCursorPos - charCount;
          break;
        }
        charCount += nodeLength;
      }

      if (targetNode) {
        const newRange = document.createRange();
        newRange.setStart(targetNode, targetOffset);
        newRange.collapse(true);
        selection.removeAllRanges();
        selection.addRange(newRange);
      }
    } else if (activeElement === editor.textareaScrollRef && editor.textareaScrollRef) {
      const newCursorPos = Math.min(cursorPos, editor.textareaScrollRef.value.length);
      editor.textareaScrollRef.setSelectionRange(newCursorPos, newCursorPos);
    }
  }

  function sendCursorUpdate() {
    if (!collaboration.wsClient || !collaboration.isRealtimeEnabled || security.isEncrypted) {
      return;
    }

    // Only send cursor updates when the document has focus
    // This prevents sending incorrect cursor positions when the tab is not active
    if (!document.hasFocus()) {
      return;
    }

    const cursorPos = getCurrentCursorPosition();
    collaboration.wsClient.sendCursorUpdate(cursorPos, collaboration.clientId);
    collaboration.lastSentCursorPos = cursorPos;
  }

  function sendOperation(operation: Operation) {
    if (collaboration.wsClient && collaboration.isRealtimeEnabled && !noteState.viewMode && !security.isEncrypted) {
      const baseVersion = noteState.currentVersion;
      // Add to pending operations list for OT transform against incoming remote ops
      // Track the baseVersion so we know what server state this was based on
      const pendingOp: PendingOperation = { operation, baseVersion };
      collaboration.pending = {
        ...collaboration.pending,
        operations: [...collaboration.pending.operations, pendingOp]
      };
      collaboration.wsClient.sendOperation(operation, baseVersion);
      noteState.currentVersion++;
    }
  }

  function sendSyntaxChange(syntax: string) {
    if (!collaboration.wsClient || !collaboration.isRealtimeEnabled || security.isEncrypted) {
      return;
    }

    collaboration.wsClient.sendSyntaxChange(syntax, collaboration.clientId);
  }

  function sendRequestEdit() {
    if (!collaboration.wsClient || !collaboration.isRealtimeEnabled || security.isEncrypted) {
      return;
    }

    collaboration.wsClient.sendRequestEdit(collaboration.clientId);
  }

  return {
    connectWebSocket,
    disconnectWebSocket,
    resetState,
    sendCursorUpdate,
    sendOperation,
    sendSyntaxChange,
    sendRequestEdit,
    getCurrentCursorPosition,
    getCurrentSelectionRange
  };
}
