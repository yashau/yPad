/**
 * @fileoverview WebSocket connection management for real-time collaboration with Yjs.
 *
 * Handles WebSocket lifecycle, Yjs CRDT synchronization, awareness updates,
 * and state synchronization between client and server.
 */

import { WebSocketClient } from '../realtime/WebSocketClient';
import { YjsManager } from '../yjs/YjsManager';
import type { useNoteState } from './useNoteState.svelte';
import type { useEditor } from './useEditor.svelte';
import type { useSecurity } from './useSecurity.svelte';
import type { useCollaboration } from './useCollaboration.svelte';

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

  function connectWebSocket() {
    if (!noteState.noteId || collaboration.wsClient || noteWasDeleted) return;

    collaboration.connectionStatus = 'connecting';
    collaboration.isSyncing = true;

    // Create YjsManager for this session
    const yjsManager = new YjsManager({
      onLocalUpdate: (update) => {
        // Send local Yjs updates to server
        if (collaboration.wsClient && collaboration.isRealtimeEnabled && !security.isEncrypted) {
          collaboration.wsClient.sendYjsUpdate(update);
        }
      },
      onAwarenessUpdate: (update) => {
        // Send awareness updates to server
        if (collaboration.wsClient && collaboration.isRealtimeEnabled && !security.isEncrypted) {
          collaboration.wsClient.sendAwarenessUpdate(update);
        }
      },
      onContentChange: (content) => {
        // Update editor content state (textarea is already updated directly by YjsManager)
        // This keeps Svelte state in sync for other UI elements that depend on content
        editor.content = content;
        editor.lastLocalContent = content;
      },
      onRemoteCursorsChange: (cursors) => {
        // Update remote cursors from awareness
        collaboration.updateRemoteCursorsFromAwareness(cursors);
      },
      // CRITICAL: Provide editor element reference for direct DOM manipulation
      // This bypasses Svelte's reactivity to ensure cursor position is preserved
      // during remote updates (the same approach used by y-textarea)
      getEditorElement: () => {
        // Return the appropriate editor element based on current mode
        // Plaintext mode uses textarea, syntax highlight mode uses contenteditable div
        if (editor.syntaxHighlight === 'plaintext') {
          return {
            element: editor.textareaScrollRef,
            isTextarea: true
          };
        } else {
          return {
            element: editor.editorRef,
            isTextarea: false
          };
        }
      }
    });

    collaboration.yjsManager = yjsManager;

    // Set local user info for awareness
    const userColor = collaboration.getClientColor(noteState.sessionId);
    yjsManager.setLocalUser({
      name: `User ${noteState.sessionId.substring(0, 4)}`,
      color: userColor
    });

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
        onYjsSync: (state, serverClientId, syntax) => {
          collaboration.clientId = serverClientId;

          if (security.isEncrypted) {
            collaboration.isSyncing = false;
            return;
          }

          // Apply full Yjs state from server
          yjsManager.applyFullState(state);

          // Update editor content from Yjs
          const content = yjsManager.getContent();
          editor.isUpdating = true;
          editor.content = content;
          editor.lastLocalContent = content;
          editor.isUpdating = false;

          // Apply syntax from server if provided
          if (syntax && syntax !== editor.syntaxHighlight) {
            editor.syntaxHighlight = syntax;
          }

          collaboration.isSyncing = false;

          // Request edit permission after sync completes
          if (collaboration.wsClient && !security.isEncrypted) {
            collaboration.wsClient.sendRequestEdit();
          }
        },
        onYjsUpdate: (update, _clientId) => {
          // Set isUpdating to prevent EditorView from interfering with cursor
          // YjsManager handles cursor preservation internally via beforeTransaction
          editor.isUpdating = true;

          // Apply remote Yjs update - YjsManager will:
          // 1. Save cursor position (beforeTransaction)
          // 2. Apply the update
          // 3. Update textarea value directly and restore cursor (text observer)
          yjsManager.applyUpdate(update);

          // Reset isUpdating synchronously since YjsManager handles everything
          editor.isUpdating = false;
        },
        onAwarenessUpdate: (update, wsClientId) => {
          // Apply remote awareness update and get the awareness client IDs
          const awarenessClientIds = yjsManager.applyAwarenessUpdate(update);

          // Register the mapping from WebSocket client ID to awareness client ID
          // This is needed so we can clean up cursors when clients disconnect
          for (const awarenessClientId of awarenessClientIds) {
            collaboration.registerAwarenessClientId(wsClientId, awarenessClientId);
          }
        },
        onYjsAck: (_seqNum) => {
          // Update acknowledged - Yjs handles this automatically
          collaboration.isSyncing = false;
        },
        onYjsStateResponse: (state) => {
          // Recovery: apply full state from server
          yjsManager.applyFullState(state);
          const content = yjsManager.getContent();
          editor.isUpdating = true;
          editor.content = content;
          editor.lastLocalContent = content;
          editor.isUpdating = false;
        },
        onClose: () => {
          collaboration.isRealtimeEnabled = false;
          collaboration.connectionStatus = 'disconnected';
          collaboration.isSyncing = false;
          noteState.saveStatus = 'Disconnected';
          collaboration.wsClient = null;
          collaboration.remoteCursors = new Map();

          // Only attempt reconnection if note was not deleted and not encrypted
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
        onNoteDeleted: (deletedByCurrentUser) => {
          noteWasDeleted = true;
          if (collaboration.wsClient) {
            collaboration.wsClient.close();
            collaboration.wsClient = null;
          }
          if (collaboration.yjsManager) {
            collaboration.yjsManager.destroy();
            collaboration.yjsManager = null;
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
        onVersionUpdate: (_version, _message) => {
          if (security.isEncrypted) {
            config.onVersionUpdate?.();
          }
        },
        onUserJoined: (_joinedClientId, allConnectedUsers, activeEditorCount, viewerCount) => {
          collaboration.connectedUsers = new Set(allConnectedUsers);
          collaboration.cleanupStaleCursors(allConnectedUsers);
          noteState.activeEditorCount = activeEditorCount;
          noteState.viewerCount = viewerCount;
        },
        onUserLeft: (_leftClientId, allConnectedUsers, activeEditorCount, viewerCount) => {
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
    }
  }

  function disconnectWebSocket() {
    if (collaboration.wsClient) {
      collaboration.wsClient.close();
      collaboration.wsClient = null;
    }
    if (collaboration.yjsManager) {
      collaboration.yjsManager.destroy();
      collaboration.yjsManager = null;
    }
    collaboration.isRealtimeEnabled = false;
    collaboration.connectionStatus = 'disconnected';
  }

  function resetState() {
    noteWasDeleted = false;
    collaboration.isSyncing = false;
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

  /**
   * Send cursor position update via Yjs Awareness.
   */
  function sendCursorUpdate() {
    if (!collaboration.yjsManager || !collaboration.isRealtimeEnabled || security.isEncrypted) {
      return;
    }

    // Only send cursor updates when the document has focus
    if (!document.hasFocus()) {
      return;
    }

    const { start, end } = getCurrentSelectionRange();
    collaboration.yjsManager.setLocalCursor(start, end);
  }

  /**
   * Apply a local content change through Yjs.
   * This replaces the old sendOperation function.
   */
  function applyLocalChange(newContent: string) {
    if (!collaboration.yjsManager || !collaboration.isRealtimeEnabled || noteState.viewMode || security.isEncrypted) {
      return;
    }

    // Mark that this change comes from local textarea input
    // This prevents YjsManager from updating the DOM again (it already has the value)
    collaboration.yjsManager.markLocalTextfieldChange();

    // Yjs will automatically generate and send the update via onLocalUpdate callback
    collaboration.yjsManager.replaceContent(newContent);
    collaboration.isSyncing = true;

    // Mark current user as an active editor
    noteState.isCurrentUserEditor = true;
  }

  function sendSyntaxChange(syntax: string) {
    if (!collaboration.wsClient || !collaboration.isRealtimeEnabled || security.isEncrypted) {
      return;
    }

    collaboration.wsClient.sendSyntaxChange(syntax);
  }

  function sendRequestEdit() {
    if (!collaboration.wsClient || !collaboration.isRealtimeEnabled || security.isEncrypted) {
      return;
    }

    collaboration.wsClient.sendRequestEdit();
  }

  return {
    connectWebSocket,
    disconnectWebSocket,
    resetState,
    sendCursorUpdate,
    applyLocalChange,
    sendSyntaxChange,
    sendRequestEdit,
    getCurrentCursorPosition,
    getCurrentSelectionRange
  };
}
