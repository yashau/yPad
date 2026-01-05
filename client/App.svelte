<!--
  @fileoverview Main application component.

  Orchestrates note state, editor, encryption, and real-time collaboration.
  Handles URL routing, auto-save, and OT operation generation.
-->
<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import hljs from 'highlight.js';
  import { generateOperationsFromInputEvent } from './lib/realtime/InputEventOperationGenerator';
  import { transform } from '../src/ot/transform';
  import { applyOperation } from '../src/ot/apply';

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
    }
  });

  // Derived state for syntax highlighting
  const highlightedHtml = $derived.by(() => {
    if (editor.syntaxHighlight === 'plaintext' || !editor.content) {
      return editor.content;
    }
    try {
      return hljs.highlight(editor.content, { language: editor.syntaxHighlight }).value;
    } catch {
      return editor.content;
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

  // Track cursor position changes only on deliberate user actions
  // Uses beforeinput event which fires for all intentional user edits
  $effect(() => {
    if (!editor.editorRef && !editor.textareaScrollRef) return;

    const editorElement = editor.editorRef || editor.textareaScrollRef;
    if (!editorElement) return;

    const handleBeforeInput = () => {
      // Capture state before DOM changes for accurate OT position calculations
      const selectionRange = wsConnection.getCurrentSelectionRange();
      editor.preEditCursorPosition = selectionRange.start;
      editor.preEditSelectionEnd = selectionRange.end !== selectionRange.start ? selectionRange.end : null;
      editor.preEditContent = editor.content;
      collaboration.recentRemoteOps = [];

      // Cursor update will be sent after the input is processed
      // This captures typing, backspace, delete, enter, paste, etc.
      setTimeout(() => wsConnection.sendCursorUpdate(), 0);
    };

    const handleClick = () => {
      // Send cursor update on mouse click for cursor repositioning
      setTimeout(() => wsConnection.sendCursorUpdate(), 0);
    };

    const handleKeyDown = (e: Event) => {
      const keyEvent = e as KeyboardEvent;

      // Handle Tab key - insert spaces instead of changing focus
      if (keyEvent.key === 'Tab' && !keyEvent.ctrlKey && !keyEvent.altKey && !keyEvent.metaKey) {
        e.preventDefault();

        // Capture selection and content before modification
        const selectionRange = wsConnection.getCurrentSelectionRange();
        editor.preEditCursorPosition = selectionRange.start;
        editor.preEditSelectionEnd = selectionRange.end !== selectionRange.start ? selectionRange.end : null;
        editor.preEditContent = editor.content;
        collaboration.recentRemoteOps = [];

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

          // Trigger input handler to send OT operation
          const inputEvent = new InputEvent('input', { inputType: 'insertText', data: tabSpaces });
          handleEditorInput(() => textarea.value, inputEvent);
        } else if (editor.editorRef) {
          // For contenteditable, use execCommand or manual insertion
          document.execCommand('insertText', false, tabSpaces);
          // The input event handler will be triggered automatically
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

  // Auto-save effect
  $effect(() => {
    editor.content;
    editor.syntaxHighlight;

    if (noteState.isInitialLoad || collaboration.isSyncing) return;
    if (security.isEncrypted && editor.content === editor.lastLocalContent) return;

    if (editor.content && !noteState.viewMode && (!collaboration.isRealtimeEnabled || security.isEncrypted)) {
      noteState.setSaveTimeout(() => noteOps.saveNote(), 500);
    }
  });


  // Input handler - sends operations immediately without debouncing
  // The WebSocket client handles queuing and backpressure
  function handleEditorInput(getContent: () => string, event?: InputEvent) {
    if (editor.isUpdating) {
      return;
    }

    const newContent = getContent();

    if (collaboration.isSyncing) {
      collaboration.pending = { ...collaboration.pending, content: newContent };
      editor.content = newContent;
      return;
    }

    // Use pre-edit state captured in beforeinput for accurate OT position calculations
    const oldContent = editor.preEditContent ?? editor.content;
    const preEditPos = editor.preEditCursorPosition;
    const preEditSelEnd = editor.preEditSelectionEnd;
    const postEditRange = wsConnection.getCurrentSelectionRange();
    const selectionStart = preEditPos ?? postEditRange.start;
    const selectionEnd = preEditSelEnd ?? (preEditPos !== null ? null :
      (postEditRange.end !== postEditRange.start ? postEditRange.end : null));
    // Clear the pre-edit state after using it
    editor.preEditCursorPosition = null;
    editor.preEditSelectionEnd = null;
    editor.preEditContent = null;

    if (collaboration.wsClient && collaboration.isRealtimeEnabled && !noteState.viewMode && !security.isEncrypted) {
      // For realtime mode, update editor.content optimistically
      // This allows checksum verification to work correctly
      const baseVersion = noteState.currentVersion;

      // Generate operations from the actual DOM change (oldContent → newContent)
      const operations = generateOperationsFromInputEvent(
        event,
        oldContent,
        newContent,
        selectionStart,
        selectionEnd,
        collaboration.clientId,
        baseVersion
      );

      if (operations.length > 0) {
        // If this is the first pending operation, capture the base version
        if (collaboration.pending.content === null) {
          collaboration.pending = { ...collaboration.pending, baseVersion: noteState.currentVersion };
        }

        // Send each operation with correct incremental version
        // The version in each operation must increment because each operation
        // builds on the previous one in the same batch
        operations.forEach((op, index) => {
          // Update operation version to be baseVersion + index
          op.version = baseVersion + index;
          wsConnection.sendOperation(op);
        });

        collaboration.pending = { ...collaboration.pending, content: newContent };

        // Apply operations to editor content, transforming against any remote ops
        // that arrived between beforeinput and input events
        const recentRemoteOps = collaboration.recentRemoteOps;
        if (recentRemoteOps.length === 0) {
          editor.content = newContent;
        } else {
          // Transform local ops against concurrent remote ops before applying
          let currentContent = editor.content;
          for (let op of operations) {
            for (const remoteOp of recentRemoteOps) {
              const [transformedLocal] = transform(op, remoteOp);
              op = transformedLocal;
            }
            currentContent = applyOperation(currentContent, op);
          }
          editor.content = currentContent;
        }
        // Clear recent remote ops - they've been accounted for
        collaboration.recentRemoteOps = [];
      } else {
        // No operations generated, but still update content to match DOM
        editor.content = newContent;
        // Clear recent remote ops even if no operations generated
        collaboration.recentRemoteOps = [];
      }
    } else {
      // For non-realtime modes (encrypted notes, no WebSocket), update content immediately
      editor.content = newContent;
      // Don't update lastLocalContent here for encrypted notes - it should only be updated
      // after successful save so the auto-save effect can detect changes
      if (!security.isEncrypted) {
        editor.lastLocalContent = newContent;
      }
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

    // Clear any pending save timeout
    noteState.clearSaveTimeout();
  });
</script>

<div class="h-full flex flex-col">
  <AppHeader
    noteId={noteState.noteId}
    connectionStatus={collaboration.connectionStatus}
    clientId={collaboration.clientId}
    connectedUsers={collaboration.connectedUsers}
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
    onInput={handleEditorInput}
    onScroll={(e) => {
      const target = e.target as HTMLElement;
      if (editor.lineNumbersRef) {
        editor.lineNumbersRef.scrollTop = target.scrollTop;
      }
    }}
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
