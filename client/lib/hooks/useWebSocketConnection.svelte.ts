/**
 * WebSocket connection management hook
 * Contains business logic for establishing and managing real-time collaboration
 */

import { WebSocketClient } from '../realtime/WebSocketClient';
import { generateOperations } from '../realtime/OperationGenerator';
import { transformCursorPosition } from '../../../src/ot/transform';
import { applyOperation } from '../../../src/ot/apply';
import { simpleChecksum } from '../../../src/ot/checksum';
import type { Operation } from '../../../src/ot/types';
import type { useNoteState } from './useNoteState.svelte';
import type { useEditor } from './useEditor.svelte';
import type { useSecurity } from './useSecurity.svelte';
import type { useCollaboration, RemoteCursorData } from './useCollaboration.svelte';

export interface WebSocketConfig {
  noteState: ReturnType<typeof useNoteState>;
  editor: ReturnType<typeof useEditor>;
  security: ReturnType<typeof useSecurity>;
  collaboration: ReturnType<typeof useCollaboration>;
  onEncryptionEnabled?: () => void;
  onEncryptionDisabled?: () => void;
  onVersionUpdate?: () => void;
  onNoteDeleted?: (deletedByCurrentUser: boolean) => void;
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
      collaboration.pendingLocalContent = editor.content;
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
          noteState.saveStatus = 'Disconnected';
          collaboration.wsClient = null;

          collaboration.remoteCursors = new Map();

          // Clear pending operations - they'll be recalculated on reconnect sync
          // This prevents duplicate operations from being sent after reconnection
          collaboration.pendingLocalContent = null;
          collaboration.pendingBaseVersion = null;

          // Only attempt reconnection if note was not deleted
          if (!noteWasDeleted) {
            setTimeout(() => {
              if (noteState.noteId && !collaboration.wsClient && !noteWasDeleted) {
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

          if (collaboration.pendingLocalContent !== null && collaboration.pendingLocalContent !== syncContent) {
            const ops = generateOperations(syncContent, collaboration.pendingLocalContent, collaboration.clientId, noteState.currentVersion);

            // Send each operation with correct incremental version
            ops.forEach((op, index) => {
              if (collaboration.wsClient) {
                // Update operation version to be currentVersion + index
                op.version = noteState.currentVersion + index;
                collaboration.wsClient.sendOperation(op, noteState.currentVersion + index);
                noteState.currentVersion++;
              }
            });

            editor.isUpdating = true;
            editor.content = collaboration.pendingLocalContent;
            editor.lastLocalContent = collaboration.pendingLocalContent;
            editor.isUpdating = false;

            collaboration.pendingLocalContent = null;
          } else if (syncContent !== editor.content) {
            editor.isUpdating = true;
            editor.content = syncContent;
            editor.lastLocalContent = syncContent;
            editor.isUpdating = false;
          }

          collaboration.isSyncing = false;
        },
        onAck: (version, contentChecksum?: number) => {
          noteState.currentVersion = version;

          // Verify content checksum if provided
          if (contentChecksum !== undefined) {
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
        onEncryptionChanged: (is_encrypted, has_password) => {
          if (is_encrypted && has_password) {
            config.onEncryptionEnabled?.();
          } else if (!is_encrypted && !has_password) {
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
        onUserJoined: (joinedClientId, allConnectedUsers) => {
          collaboration.connectedUsers = new Set(allConnectedUsers);
          collaboration.cleanupStaleCursors(allConnectedUsers);
        },
        onUserLeft: (leftClientId, allConnectedUsers) => {
          collaboration.connectedUsers = new Set(allConnectedUsers);
          collaboration.cleanupStaleCursors(allConnectedUsers);
        },
        onSyntaxChange: (syntax) => {
          if (syntax !== editor.syntaxHighlight) {
            editor.syntaxHighlight = syntax;
          }
        }
      });
    } catch (error) {
      console.error('[WebSocket] Failed to create client:', error);
      collaboration.connectionStatus = 'disconnected';
      collaboration.isSyncing = false;
      collaboration.pendingLocalContent = null;
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

  function verifyContentChecksum(serverChecksum: number) {
    const localChecksum = simpleChecksum(editor.content);

    if (localChecksum !== serverChecksum) {
      checksumMismatchCount++;
      // Log for debugging - don't force resync automatically
      // User can manually refresh if needed
    } else {
      // Reset mismatch counter on successful verification
      checksumMismatchCount = 0;
    }
  }

  function applyRemoteOperation(operation: Operation, contentChecksum?: number) {
    const isOwnOp = operation.clientId === collaboration.clientId;

    editor.isUpdating = true;

    try {
      // For our own operations, we already applied them optimistically
      // Just verify checksum and update tracking
      if (isOwnOp) {
        // Verify checksum if provided
        if (contentChecksum !== undefined) {
          verifyContentChecksum(contentChecksum);
        }

        // Update lastLocalContent to confirm this operation is now server-side
        editor.lastLocalContent = editor.content;

        // If content matches pending state, clear pending
        if (editor.content === collaboration.pendingLocalContent) {
          collaboration.pendingLocalContent = null;
          collaboration.pendingBaseVersion = null;
        }

        if (operation.version > noteState.currentVersion) {
          noteState.currentVersion = operation.version;
        }
      } else {
        // Remote operation - apply it
        collaboration.lastSentCursorPos = transformCursorPosition(collaboration.lastSentCursorPos, operation);

        let cursorPos = getCurrentCursorPosition();
        cursorPos = transformCursorPosition(cursorPos, operation);

        // Update cursor positions and trigger reactivity
        // Only transform cursors that are NOT from the operation's client
        // The operation client's cursor position comes from their cursor_update messages
        const updatedCursors = new Map(collaboration.remoteCursors);
        updatedCursors.forEach((cursorData, remoteClientId) => {
          if (remoteClientId !== operation.clientId) {
            cursorData.position = transformCursorPosition(cursorData.position, operation);
          }
        });
        collaboration.remoteCursors = updatedCursors;

        editor.content = applyOperation(editor.content, operation);

        // Verify checksum if provided
        if (contentChecksum !== undefined) {
          verifyContentChecksum(contentChecksum);
        }

        // Update lastLocalContent to stay in sync
        editor.lastLocalContent = editor.content;

        if (operation.version > noteState.currentVersion) {
          noteState.currentVersion = operation.version;
        }

        restoreCursorPosition(cursorPos);
      }
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
      collaboration.wsClient.sendOperation(operation, noteState.currentVersion);
      noteState.currentVersion++;
    }
  }

  function sendSyntaxChange(syntax: string) {
    if (!collaboration.wsClient || !collaboration.isRealtimeEnabled || security.isEncrypted) {
      return;
    }

    collaboration.wsClient.sendSyntaxChange(syntax, collaboration.clientId);
  }

  return {
    connectWebSocket,
    disconnectWebSocket,
    sendCursorUpdate,
    sendOperation,
    sendSyntaxChange,
    getCurrentCursorPosition
  };
}
