<!--
  @fileoverview Main application component.

  Orchestrates note state, editor, encryption, and real-time collaboration.
  Handles URL routing, auto-save, and Yjs CRDT synchronization.
-->
<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { getHighlighter, highlightSync, isHighlighterLoaded } from './lib/utils/highlighter';

  // Hooks
  import { useNoteState } from './lib/hooks/useNoteState.svelte';
  import { useEditor } from './lib/hooks/useEditor.svelte';
  import { useSecurity } from './lib/hooks/useSecurity.svelte';
  import { useCollaboration } from './lib/hooks/useCollaboration.svelte';
  import { useNoteOperations } from './lib/hooks/useNoteOperations.svelte';
  import { useWebSocketConnection } from './lib/hooks/useWebSocketConnection.svelte';

  // Components
  import AppHeader from './components/Header/AppHeader.svelte';
  import OptionsPanel from './components/Toolbar/OptionsPanel.svelte';
  import EditorView from './components/Editor/EditorView.svelte';
  import PasswordDialog from './components/Dialogs/PasswordDialog.svelte';
  import RemovePasswordDialog from './components/Dialogs/RemovePasswordDialog.svelte';
  import ConflictDialog from './components/Dialogs/ConflictDialog.svelte';
  import ReloadBanner from './components/Banners/ReloadBanner.svelte';
  import EncryptionEnabledBanner from './components/Banners/EncryptionEnabledBanner.svelte';
  import EncryptionDisabledBanner from './components/Banners/EncryptionDisabledBanner.svelte';
  import NoteDeletedBanner from './components/Banners/NoteDeletedBanner.svelte';
  import FinalViewBanner from './components/Banners/FinalViewBanner.svelte';
  import EditorLimitBanner from './components/Banners/EditorLimitBanner.svelte';

  // Initialize hooks
  const noteState = useNoteState();
  const editor = useEditor();
  const security = useSecurity();
  const collaboration = useCollaboration();

  // UI state (not business logic)
  let showOptions = $state(false);
  let showPasswordDialog = $state(false);
  let showRemovePasswordDialog = $state(false);
  let showConflictDialog = $state(false);
  let showReloadBanner = $state(false);
  let showPasswordEnabledBanner = $state(false);
  let showPasswordDisabledBanner = $state(false);
  let showPasswordDisabledByOtherBanner = $state(false);
  let showNoteDeletedBanner = $state(false);
  let noteDeletedByCurrentUser = $state(false);

  // Initialize operations with callbacks
  const noteOps = useNoteOperations({
    noteState,
    editor,
    security,
    onLoadSuccess: () => wsConnection.connectWebSocket(),
    onConflict: () => showConflictDialog = true,
    onNoteDeleted: () => {
      // When user deletes via the delete button (not via WebSocket)
      // Show banner and set view mode, but don't clear content
      wsConnection.disconnectWebSocket();
      showNoteDeletedBanner = true;
      noteDeletedByCurrentUser = true;
      noteState.viewMode = true;
    },
    onPasswordRequired: () => showPasswordDialog = true,
    onNewNote: () => {
      showOptions = false;
      showNoteDeletedBanner = false;
      wsConnection.disconnectWebSocket();
      wsConnection.resetState();
    }
  });

  const wsConnection = useWebSocketConnection({
    noteState,
    editor,
    security,
    collaboration,
    onEncryptionEnabled: () => {
      noteState.clearSaveTimeout();
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
      security.password = '';
      security.passwordInput = '';
      security.hasPassword = true;
      security.isEncrypted = true;
      security.passwordRequired = true;
      showPasswordDialog = true;
    },
    onEncryptionDisabled: () => {
      noteState.clearSaveTimeout();
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
      security.hasPassword = false;
      security.isEncrypted = false;
      security.password = '';
      security.passwordInput = '';
      showPasswordDisabledByOtherBanner = true;
      noteOps.loadNote();
    },
    onVersionUpdate: () => {
      if (security.isEncrypted) {
        showReloadBanner = true;
      }
    },
    onNoteDeleted: (deletedByCurrentUser) => {
      // When note is deleted via WebSocket (either by current user or another user)
      showNoteDeletedBanner = true;
      noteDeletedByCurrentUser = deletedByCurrentUser;
      noteState.viewMode = true;
    },
    onNoteStatus: (viewCount, maxViews, expiresAt) => {
      // Update note status from periodic WebSocket broadcasts
      noteState.serverViewCount = viewCount;
      noteState.serverMaxViews = maxViews;
      noteState.serverExpiresAt = expiresAt;
    },
    onRequestEditResponse: (canEdit, activeEditorCount, viewerCount) => {
      noteState.activeEditorCount = activeEditorCount;
      noteState.viewerCount = viewerCount;
      if (canEdit) {
        noteState.viewMode = false;
        noteState.editorLimitReached = false;
      } else {
        noteState.viewMode = true;
        noteState.editorLimitReached = true;
      }
    },
    onEditorLimitReached: () => {
      noteState.viewMode = true;
      noteState.editorLimitReached = true;
    }
  });

  // State for syntax highlighting (async loading)
  let highlightedHtml = $state(editor.content);
  let highlighterReady = $state(false);

  // Load highlighter when syntax highlighting is needed
  $effect(() => {
    const lang = editor.syntaxHighlight;
    if (lang !== 'plaintext' && !isHighlighterLoaded()) {
      getHighlighter().then(() => {
        highlighterReady = true;
      });
    }
  });

  // Update highlighted HTML when content, language, or highlighter readiness changes
  $effect(() => {
    const content = editor.content;
    const lang = editor.syntaxHighlight;
    // Dependency on highlighterReady ensures re-run after loading
    const _ = highlighterReady;

    if (lang === 'plaintext' || !content) {
      highlightedHtml = content;
      return;
    }

    // If highlighter is loaded, use it
    if (isHighlighterLoaded()) {
      highlightedHtml = highlightSync(content, lang);
    } else {
      // Show plain content while loading
      highlightedHtml = content;
    }
  });

  // Update highlighted content when syntaxHighlight changes or content changes
  $effect(() => {
    if (editor.editorRef && editor.syntaxHighlight !== 'plaintext' && !editor.isUpdating) {
      editor.isUpdating = true;

      // Save cursor position
      const selection = window.getSelection();
      let cursorPos = 0;
      const hadFocus = document.activeElement === editor.editorRef;

      if (selection && selection.rangeCount > 0 && hadFocus) {
        cursorPos = wsConnection.getCurrentCursorPosition();
      }

      // Update HTML
      editor.editorRef.innerHTML = highlightedHtml || '';

      // Restore cursor position
      if (hadFocus) {
        const textContentStr = editor.editorRef.textContent || '';
        const newCursorPos = Math.min(cursorPos, textContentStr.length);

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

        if (targetNode && selection) {
          const newRange = document.createRange();
          newRange.setStart(targetNode, targetOffset);
          newRange.collapse(true);
          selection.removeAllRanges();
          selection.addRange(newRange);
        }
      }

      editor.isUpdating = false;
    }
  });

  // Track cursor position changes for awareness
  $effect(() => {
    if (!editor.editorRef && !editor.textareaScrollRef) return;

    const editorElement = editor.editorRef || editor.textareaScrollRef;
    if (!editorElement) return;

    const handleBeforeInput = () => {
      // Send cursor update after the input is processed
      setTimeout(() => wsConnection.sendCursorUpdate(), 0);
    };

    const handleClick = () => {
      // Send cursor update on mouse click for cursor repositioning
      setTimeout(() => wsConnection.sendCursorUpdate(), 0);
    };

    const handleKeyDown = (e: Event) => {
      const keyEvent = e as KeyboardEvent;

      // Handle Tab key - insert spaces instead of changing focus
      if (keyEvent.key === 'Tab' && !keyEvent.shiftKey && !keyEvent.ctrlKey && !keyEvent.altKey && !keyEvent.metaKey) {
        e.preventDefault();

        // Insert 2 spaces (common convention for code editors)
        const tabSpaces = '  ';

        if (editor.syntaxHighlight === 'plaintext' && editor.textareaScrollRef) {
          const textarea = editor.textareaScrollRef;
          const start = textarea.selectionStart;
          const end = textarea.selectionEnd;
          const value = textarea.value;

          // Insert spaces at cursor/replace selection
          textarea.value = value.substring(0, start) + tabSpaces + value.substring(end);

          // Move cursor after inserted spaces
          const newPos = start + tabSpaces.length;
          textarea.selectionStart = newPos;
          textarea.selectionEnd = newPos;

          // Trigger input handler
          handleEditorInput(() => textarea.value);
        } else if (editor.editorRef) {
          // For contenteditable, use Selection API to insert text
          const selection = window.getSelection();
          if (selection && selection.rangeCount > 0) {
            const range = selection.getRangeAt(0);
            range.deleteContents();
            range.insertNode(document.createTextNode(tabSpaces));
            range.collapse(false);
            selection.removeAllRanges();
            selection.addRange(range);
            // Trigger input handler with updated content
            handleEditorInput(() => editor.editorRef?.textContent || '');
          }
        }

        return;
      }

      // Handle Shift+Tab - dedent (remove leading spaces)
      if (keyEvent.key === 'Tab' && keyEvent.shiftKey && !keyEvent.ctrlKey && !keyEvent.altKey && !keyEvent.metaKey) {
        e.preventDefault();

        if (editor.syntaxHighlight === 'plaintext' && editor.textareaScrollRef) {
          const textarea = editor.textareaScrollRef;
          const start = textarea.selectionStart;
          const value = textarea.value;

          // Find the start of the current line
          const lineStart = value.lastIndexOf('\n', start - 1) + 1;
          const lineContent = value.substring(lineStart);

          // Check if line starts with spaces (up to 2)
          const leadingSpaces = lineContent.match(/^( {1,2})/);
          if (leadingSpaces) {
            const spacesToRemove = leadingSpaces[1].length;
            textarea.value = value.substring(0, lineStart) + value.substring(lineStart + spacesToRemove);

            // Adjust cursor position
            const newPos = Math.max(lineStart, start - spacesToRemove);
            textarea.selectionStart = newPos;
            textarea.selectionEnd = newPos;

            handleEditorInput(() => textarea.value);
          }
        } else if (editor.editorRef) {
          const selection = window.getSelection();
          if (selection && selection.rangeCount > 0) {
            const content = editor.editorRef.textContent || '';
            const cursorPos = wsConnection.getCurrentCursorPosition();

            // Find the start of the current line
            const lineStart = content.lastIndexOf('\n', cursorPos - 1) + 1;
            const lineContent = content.substring(lineStart);

            // Check if line starts with spaces (up to 2)
            const leadingSpaces = lineContent.match(/^( {1,2})/);
            if (leadingSpaces) {
              const spacesToRemove = leadingSpaces[1].length;
              const newContent = content.substring(0, lineStart) + content.substring(lineStart + spacesToRemove);

              handleEditorInput(() => newContent);
            }
          }
        }

        return;
      }

      // Handle navigation keys that don't trigger beforeinput
      const navigationKeys = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End', 'PageUp', 'PageDown'];
      if (navigationKeys.includes(keyEvent.key)) {
        setTimeout(() => wsConnection.sendCursorUpdate(), 0);
      }
    };

    editorElement.addEventListener('beforeinput', handleBeforeInput);
    editorElement.addEventListener('click', handleClick);
    editorElement.addEventListener('keydown', handleKeyDown);

    return () => {
      editorElement.removeEventListener('beforeinput', handleBeforeInput);
      editorElement.removeEventListener('click', handleClick);
      editorElement.removeEventListener('keydown', handleKeyDown);
    };
  });

  // Update document title based on note content
  $effect(() => {
    const content = editor.content.trim();
    if (!content) {
      document.title = 'yPad';
      return;
    }
    // Get first non-empty line, truncated to 100 chars
    const firstLine = content.split('\n').find(line => line.trim()) || '';
    if (!firstLine) {
      document.title = 'yPad';
      return;
    }
    const snippet = firstLine.length > 100 ? firstLine.substring(0, 100) + '…' : firstLine;
    document.title = `yPad · ${snippet}`;
  });

  // Auto-save effect
  $effect(() => {
    editor.content;
    editor.syntaxHighlight;

    if (noteState.isInitialLoad || collaboration.isSyncing) return;
    // Skip save if content hasn't changed (prevents spurious saves on WebSocket reconnect)
    if (editor.content === editor.lastLocalContent) return;

    if (editor.content && !noteState.viewMode && (!collaboration.isRealtimeEnabled || security.isEncrypted)) {
      noteState.setSaveTimeout(() => noteOps.saveNote(), 500);
    }
  });


  // Input handler - with Yjs, we just update the content and let Yjs handle sync
  function handleEditorInput(getContent: () => string) {
    if (editor.isUpdating) {
      return;
    }

    const newContent = getContent();

    if (collaboration.yjsManager && collaboration.isRealtimeEnabled && !noteState.viewMode && !security.isEncrypted) {
      // For realtime mode with Yjs, apply the change through YjsManager
      // This will automatically generate and send the Yjs update
      wsConnection.applyLocalChange(newContent);
      editor.content = newContent;
      editor.lastLocalContent = newContent;
    } else {
      // For non-realtime modes (encrypted notes, new notes without WebSocket), update content immediately
      // Don't update lastLocalContent here - it should only be updated after successful save
      // so the auto-save effect can detect changes and trigger saveNote()
      editor.content = newContent;
    }
  }

  onMount(() => {
    noteState.initializeSession();

    // Ensure current URL is in history
    window.history.replaceState({}, '', window.location.pathname);

    const path = window.location.pathname;
    if (path !== '/' && path.length > 1) {
      noteState.noteId = path.substring(1);
      noteOps.loadNote();
    } else {
      // Focus editor on initial page load when no note is being loaded
      editor.focusEditor();
    }

    // Handle browser back/forward navigation
    const handlePopState = () => {
      const newPath = window.location.pathname;

      if (newPath === '/' || newPath.length === 1) {
        // Navigated to home - create new note
        noteOps.newNote();
      } else {
        // Navigated to a note - load it
        const newNoteId = newPath.substring(1);
        noteState.noteId = newNoteId;
        noteOps.loadNote();
      }
    };

    window.addEventListener('popstate', handlePopState);

    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  });


  // Handle custom URL setting - update noteId and reconnect WebSocket
  function handleCustomUrlSet(newNoteId: string) {
    // Disconnect existing WebSocket
    wsConnection.disconnectWebSocket();

    // Update the noteId
    noteState.noteId = newNoteId;

    // Reconnect WebSocket with new noteId
    wsConnection.connectWebSocket();
  }

  onDestroy(() => {
    // Clean up WebSocket connection
    if (collaboration.wsClient) {
      collaboration.wsClient.close();
      collaboration.wsClient = null;
    }

    // Clean up Yjs manager
    if (collaboration.yjsManager) {
      collaboration.yjsManager.destroy();
      collaboration.yjsManager = null;
    }

    // Clear any pending save timeout
    noteState.clearSaveTimeout();
  });
</script>

<div class="h-full flex flex-col">
  <AppHeader
    noteId={noteState.noteId}
    connectionStatus={collaboration.connectionStatus}
    clientId={collaboration.clientId}
    activeEditorCount={noteState.activeEditorCount}
    viewerCount={noteState.viewerCount}
    isCurrentUserEditor={noteState.isCurrentUserEditor}
    isRealtimeEnabled={collaboration.isRealtimeEnabled}
    isEncrypted={security.isEncrypted}
    saveStatus={noteState.saveStatus}
    isSyncing={collaboration.isSyncing}
    viewMode={noteState.viewMode}
    isNoteDeleted={showNoteDeletedBanner}
    isFinalView={noteState.isFinalView}
    showOptions={showOptions}
    content={editor.content}
    syntaxHighlight={editor.syntaxHighlight}
    password={security.password}
    maxViews={noteState.maxViews === null ? undefined : noteState.maxViews}
    expiresIn={noteState.expiresIn}
    onNewNote={noteOps.newNote}
    onDeleteNote={noteOps.deleteNote}
    onToggleOptions={() => showOptions = !showOptions}
    onCustomUrlSet={handleCustomUrlSet}
  >
    {#snippet children()}
      {#if showOptions && !noteState.isFinalView}
        <OptionsPanel
          syntaxHighlight={editor.syntaxHighlight}
          bind:passwordToSet={security.passwordToSet}
          hasPassword={security.hasPassword}
          bind:maxViews={noteState.maxViews}
          bind:expiresIn={noteState.expiresIn}
          viewMode={noteState.viewMode}
          serverMaxViews={noteState.serverMaxViews}
          serverViewCount={noteState.serverViewCount}
          serverExpiresAt={noteState.serverExpiresAt}
          onSyntaxChange={(lang) => {
            editor.syntaxHighlight = lang;
            wsConnection.sendSyntaxChange(lang);
          }}
          onSetPassword={() => {
            noteOps.setPasswordProtection(security.passwordToSet, () => {
              security.passwordToSet = '';
              showPasswordEnabledBanner = true;
              showOptions = false;
              // Focus the appropriate editor element
              if (editor.syntaxHighlight === 'plaintext') {
                editor.textareaScrollRef?.focus();
              } else {
                editor.editorRef?.focus();
              }
            });
          }}
          onRemovePassword={() => {
            showRemovePasswordDialog = true;
          }}
          onPasswordChange={(value) => security.passwordToSet = value}
          onMaxViewsChange={(value) => noteState.maxViews = value}
          onMaxViewsSubmit={() => noteOps.saveNote()}
          onExpirationChange={(value) => {
            noteState.expiresIn = value;
            noteOps.saveNote();
          }}
          onResetMaxViews={() => noteOps.resetMaxViews()}
          onResetExpiration={() => noteOps.resetExpiration()}
        />
      {/if}
    {/snippet}
  </AppHeader>

  <ReloadBanner
    show={showReloadBanner}
    isEncrypted={security.isEncrypted}
    onReload={() => {
      showReloadBanner = false;
      noteOps.loadNote();
    }}
  />

  <EncryptionEnabledBanner
    show={showPasswordEnabledBanner}
    onDismiss={() => showPasswordEnabledBanner = false}
  />

  <EncryptionDisabledBanner
    show={showPasswordDisabledBanner || showPasswordDisabledByOtherBanner}
    byOtherUser={showPasswordDisabledByOtherBanner}
    onDismiss={() => {
      showPasswordDisabledBanner = false;
      showPasswordDisabledByOtherBanner = false;
    }}
  />

  <NoteDeletedBanner show={showNoteDeletedBanner} deletedByCurrentUser={noteDeletedByCurrentUser} />

  <FinalViewBanner show={noteState.isFinalView} />

  <EditorLimitBanner show={noteState.editorLimitReached} onRetry={() => wsConnection.sendRequestEdit()} />

  <EditorView
    bind:content={editor.content}
    syntaxHighlight={editor.syntaxHighlight}
    {highlightedHtml}
    bind:editorRef={editor.editorRef}
    bind:textareaScrollRef={editor.textareaScrollRef}
    bind:lineNumbersRef={editor.lineNumbersRef}
    isLoading={noteState.isLoading}
    viewMode={noteState.viewMode}
    remoteCursors={collaboration.remoteCursors}
    isRealtimeEnabled={collaboration.isRealtimeEnabled}
    isEncrypted={security.isEncrypted}
    isUpdating={editor.isUpdating}
    onInput={handleEditorInput}
  />
</div>

<PasswordDialog
  bind:open={showPasswordDialog}
  bind:passwordInput={security.passwordInput}
  passwordError={security.passwordError}
  onSubmit={async () => {
    security.passwordError = '';
    await noteOps.loadNote();
    if (!security.passwordRequired && !security.passwordError) {
      showPasswordDialog = false;
    }
  }}
  onCancel={() => {
    showPasswordDialog = false;
    security.passwordError = '';
    window.history.pushState({}, '', '/');
    noteState.noteId = '';
  }}
  onPasswordChange={(value) => security.passwordInput = value}
/>

<RemovePasswordDialog
  bind:open={showRemovePasswordDialog}
  onSubmit={() => {
    noteOps.removePasswordProtection(
      () => {
        showPasswordDisabledBanner = true;
        showRemovePasswordDialog = false;
        showOptions = false;
        // Focus the appropriate editor element
        if (editor.syntaxHighlight === 'plaintext') {
          editor.textareaScrollRef?.focus();
        } else {
          editor.editorRef?.focus();
        }
      },
      (error) => {
        alert(error);
        showRemovePasswordDialog = false;
      }
    );
  }}
  onCancel={() => {
    showRemovePasswordDialog = false;
  }}
/>

<ConflictDialog
  bind:open={showConflictDialog}
  onReload={() => {
    showConflictDialog = false;
    location.reload();
  }}
  onKeepEditing={() => showConflictDialog = false}
/>
