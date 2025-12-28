<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import hljs from 'highlight.js';
  import { generateOperationsFromInputEvent } from './lib/realtime/InputEventOperationGenerator';

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
  import CustomUrlDialog from './components/Dialogs/CustomUrlDialog.svelte';
  import ConflictDialog from './components/Dialogs/ConflictDialog.svelte';
  import ReloadBanner from './components/Banners/ReloadBanner.svelte';
  import EncryptionEnabledBanner from './components/Banners/EncryptionEnabledBanner.svelte';
  import EncryptionDisabledBanner from './components/Banners/EncryptionDisabledBanner.svelte';
  import NoteDeletedBanner from './components/Banners/NoteDeletedBanner.svelte';

  // Initialize hooks
  const noteState = useNoteState();
  const editor = useEditor();
  const security = useSecurity();
  const collaboration = useCollaboration();

  // UI state (not business logic)
  let showOptions = $state(false);
  let showPasswordDialog = $state(false);
  let showRemovePasswordDialog = $state(false);
  let showCustomUrlDialog = $state(false);
  let showConflictDialog = $state(false);
  let showReloadBanner = $state(false);
  let showPasswordEnabledBanner = $state(false);
  let showPasswordDisabledBanner = $state(false);
  let showPasswordDisabledByOtherBanner = $state(false);
  let showNoteDeletedBanner = $state(false);
  let noteDeletedByCurrentUser = $state(false);
  let customUrl = $state('');
  let customUrlAvailable = $state(true);

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
    onPasswordRequired: () => showPasswordDialog = true
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

  // Track cursor position changes (for clicks, arrow keys, etc.)
  $effect(() => {
    if (!editor.editorRef && !editor.textareaScrollRef) return;

    const handleSelectionChange = () => {
      wsConnection.sendCursorUpdate();
    };

    document.addEventListener('selectionchange', handleSelectionChange);

    return () => {
      document.removeEventListener('selectionchange', handleSelectionChange);
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
      collaboration.pendingLocalContent = newContent;
      editor.content = newContent;
      return;
    }

    // Capture the old content and cursor position before updating
    const oldContent = editor.content;
    const cursorPosition = wsConnection.getCurrentCursorPosition();

    if (collaboration.wsClient && collaboration.isRealtimeEnabled && !noteState.viewMode && !security.isEncrypted) {
      // For realtime mode, update editor.content optimistically
      // This allows checksum verification to work correctly
      const baseVersion = noteState.currentVersion;

      // CRITICAL: Use InputEvent-based generation for accurate cursor positions
      // oldContent→newContent represents the actual DOM change that just happened
      // This preserves edit locality regardless of pending operations
      const operations = generateOperationsFromInputEvent(
        event,
        oldContent,
        newContent,
        cursorPosition,
        collaboration.clientId,
        baseVersion
      );

      if (operations.length > 0) {
        // If this is the first pending operation, capture the base version
        if (collaboration.pendingLocalContent === null) {
          collaboration.pendingBaseVersion = noteState.currentVersion;
        }

        // Send each operation with correct incremental version
        // The version in each operation must increment because each operation
        // builds on the previous one in the same batch
        operations.forEach((op, index) => {
          // Update operation version to be baseVersion + index
          op.version = baseVersion + index;
          wsConnection.sendOperation(op);
        });

        // Track the optimistic state (what we expect after all pending ops apply)
        collaboration.pendingLocalContent = newContent;
      }

      // Update editor.content optimistically so checksum verification works
      editor.content = newContent;

      setTimeout(() => wsConnection.sendCursorUpdate(), 0);
    } else {
      // For non-realtime modes (encrypted notes, no WebSocket), update content immediately
      editor.content = newContent;
      editor.lastLocalContent = newContent;
    }
  }

  // Custom URL functions
  async function checkCustomUrl() {
    if (!customUrl.trim()) {
      customUrlAvailable = false;
      return;
    }

    try {
      const response = await fetch(`/api/check/${encodeURIComponent(customUrl)}`);
      const data = await response.json() as { available: boolean };
      customUrlAvailable = data.available;
    } catch (error) {
      console.error('Failed to check URL:', error);
      customUrlAvailable = false;
    }
  }

  async function setCustomUrl() {
    if (!customUrlAvailable || !customUrl.trim()) return;

    try {
      const payload: any = {
        id: customUrl,
        content: editor.content,
        syntax_highlight: editor.syntaxHighlight || 'plaintext'
      };

      if (security.password) {
        payload.password = security.password;
      }

      if (noteState.maxViews) {
        payload.max_views = noteState.maxViews;
      }

      if (noteState.expiresIn && noteState.expiresIn !== 'null') {
        payload.expires_in = parseInt(noteState.expiresIn);
      }

      const response = await fetch('/api/notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        throw new Error('Failed to set custom URL');
      }

      const data = await response.json() as { id: string };
      noteState.noteId = data.id;
      window.history.pushState({}, '', `/${noteState.noteId}`);
      showCustomUrlDialog = false;
      customUrl = '';

      wsConnection.connectWebSocket();
    } catch (error) {
      console.error('Failed to set custom URL:', error);
      alert('Failed to set custom URL');
    }
  }

  onMount(() => {
    noteState.initializeSession();

    const path = window.location.pathname;
    if (path !== '/' && path.length > 1) {
      noteState.noteId = path.substring(1);
      noteOps.loadNote();
    }
  });


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
    hasPassword={security.hasPassword}
    saveStatus={noteState.saveStatus}
    viewMode={noteState.viewMode}
    onNewNote={noteOps.newNote}
    onDeleteNote={noteOps.deleteNote}
    onToggleOptions={() => showOptions = !showOptions}
    onCustomUrl={() => showCustomUrlDialog = true}
  >
    {#snippet children()}
      {#if showOptions}
        <OptionsPanel
          syntaxHighlight={editor.syntaxHighlight}
          bind:passwordToSet={security.passwordToSet}
          hasPassword={security.hasPassword}
          bind:maxViews={noteState.maxViews}
          bind:expiresIn={noteState.expiresIn}
          viewMode={noteState.viewMode}
          onSyntaxChange={(lang) => {
            editor.syntaxHighlight = lang;
            wsConnection.sendSyntaxChange(lang);
          }}
          onSetPassword={() => {
            noteOps.setPasswordProtection(security.passwordToSet, () => {
              security.passwordToSet = '';
              showPasswordEnabledBanner = true;
            });
          }}
          onRemovePassword={() => {
            security.removePasswordInput = '';
            security.removePasswordError = '';
            showRemovePasswordDialog = true;
          }}
          onPasswordChange={(value) => security.passwordToSet = value}
          onMaxViewsChange={(value) => noteState.maxViews = value}
          onExpirationChange={(value) => noteState.expiresIn = value}
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
    onDismiss={() => showReloadBanner = false}
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
  bind:removePasswordInput={security.removePasswordInput}
  removePasswordError={security.removePasswordError}
  onSubmit={() => {
    noteOps.removePasswordProtection(
      security.removePasswordInput,
      () => {
        showPasswordDisabledBanner = true;
        showRemovePasswordDialog = false;
        security.removePasswordInput = '';
        security.removePasswordError = '';
      },
      (error) => {
        security.removePasswordError = error;
      }
    );
  }}
  onCancel={() => {
    showRemovePasswordDialog = false;
    security.removePasswordInput = '';
    security.removePasswordError = '';
  }}
  onPasswordChange={(value) => security.removePasswordInput = value}
/>

<CustomUrlDialog
  bind:open={showCustomUrlDialog}
  bind:customUrl
  customUrlAvailable={customUrlAvailable}
  onSubmit={setCustomUrl}
  onCancel={() => {
    showCustomUrlDialog = false;
    customUrl = '';
  }}
  onUrlChange={checkCustomUrl}
/>

<ConflictDialog
  bind:open={showConflictDialog}
  onReload={() => {
    showConflictDialog = false;
    location.reload();
  }}
  onKeepEditing={() => showConflictDialog = false}
/>
