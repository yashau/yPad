/**
 * Note operations hook
 * Contains business logic for loading, saving, and deleting notes
 */

import { encryptContent, decryptContent } from '../crypto';
import type { useNoteState } from './useNoteState.svelte';
import type { useEditor } from './useEditor.svelte';
import type { useSecurity } from './useSecurity.svelte';

export interface NoteOperationsConfig {
  noteState: ReturnType<typeof useNoteState>;
  editor: ReturnType<typeof useEditor>;
  security: ReturnType<typeof useSecurity>;
  onLoadSuccess?: () => void;
  onEncryptionEnabled?: () => void;
  onEncryptionDisabled?: () => void;
  onConflict?: () => void;
  onNoteDeleted?: () => void;
  onPasswordRequired?: () => void;
  onNewNote?: () => void;
}

export function useNoteOperations(config: NoteOperationsConfig) {
  const { noteState, editor, security } = config;

  async function loadNote() {
    noteState.isLoading = true;
    noteState.isInitialLoad = true;

    try {
      const url = `/api/notes/${noteState.noteId}${security.passwordInput ? `?password=${encodeURIComponent(security.passwordInput)}` : ''}`;
      const response = await fetch(url);

      if (response.status === 401) {
        if (security.passwordInput) {
          security.passwordError = 'Invalid password. Please try again.';
          security.passwordInput = '';
        }
        security.passwordRequired = true;
        config.onPasswordRequired?.();
        noteState.isLoading = false;
        noteState.isInitialLoad = false;
        return;
      }

      if (!response.ok) {
        const error = await response.json() as { error?: string };
        alert(error.error || 'Failed to load note');
        window.history.pushState({}, '', '/');
        noteState.noteId = '';
        noteState.isLoading = false;
        noteState.isInitialLoad = false;
        return;
      }

      const data = await response.json() as {
        content: string;
        syntax_highlight: string;
        version: number;
        has_password: boolean;
        is_encrypted: boolean;
        view_count: number;
        max_views: number | null;
        expires_at: number | null;
        is_last_view: boolean;
      };

      // Decrypt content if encrypted
      if (data.is_encrypted && security.passwordInput) {
        try {
          editor.content = await decryptContent(data.content, security.passwordInput);
          security.passwordError = '';
        } catch (error) {
          console.error('Failed to decrypt content:', error);
          security.passwordError = 'Invalid password. Please try again.';
          security.passwordRequired = true;
          security.passwordInput = '';
          noteState.isLoading = false;
          noteState.isInitialLoad = false;
          return;
        }
      } else {
        editor.content = data.content;
      }

      security.hasPassword = data.has_password || false;
      security.isEncrypted = data.is_encrypted || false;

      if (security.hasPassword && security.passwordInput) {
        security.password = security.passwordInput;
      }

      editor.lastLocalContent = editor.content;
      editor.syntaxHighlight = data.syntax_highlight || 'plaintext';
      noteState.currentVersion = data.version || 1;
      noteState.viewMode = false;
      security.passwordRequired = false;
      security.passwordError = '';

      // Update server state for options display
      noteState.serverMaxViews = data.max_views;
      noteState.serverViewCount = data.view_count;
      noteState.serverExpiresAt = data.expires_at;

      // Check if this is the final view (note has been deleted on server)
      if (data.is_last_view) {
        noteState.isFinalView = true;
        noteState.viewMode = true;
        // Don't connect WebSocket for final view - note is already deleted
        noteState.isInitialLoad = false;
        noteState.isLoading = false;
        return;
      }

      config.onLoadSuccess?.();

      setTimeout(() => {
        noteState.isInitialLoad = false;
      }, 1000);
    } catch (error) {
      console.error('Failed to load note:', error);
      alert('Failed to load note');
      noteState.isInitialLoad = false;
    } finally {
      noteState.isLoading = false;
    }
  }

  async function saveNote() {
    if (!editor.content.trim()) return;

    noteState.saveStatus = 'Saving...';

    try {
      let contentToSave = editor.content;
      let shouldEncrypt = security.isEncrypted;

      if ((security.password && security.password.trim()) || security.isEncrypted) {
        if (security.isEncrypted && (!security.password || !security.password.trim())) {
          console.error('Cannot save encrypted note without password');
          noteState.saveStatus = 'Save failed: password required';
          return;
        }

        try {
          contentToSave = await encryptContent(editor.content, security.password);
          shouldEncrypt = true;
        } catch (error) {
          console.error('Failed to encrypt content:', error);
          noteState.saveStatus = 'Encryption failed';
          return;
        }
      }

      const payload: any = {
        content: contentToSave,
        syntax_highlight: editor.syntaxHighlight || 'plaintext',
        is_encrypted: shouldEncrypt
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

      if (noteState.noteId) {
        // Update existing note
        payload.session_id = noteState.sessionId;
        payload.expected_version = security.isEncrypted ? null : noteState.currentVersion;

        const response = await fetch(`/api/notes/${noteState.noteId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        if (response.status === 409) {
          noteState.saveStatus = 'Conflict!';
          config.onConflict?.();
          return;
        }

        if (response.status === 404) {
          noteState.saveStatus = '';
          return;
        }

        if (!response.ok) {
          throw new Error('Failed to update note');
        }

        const data = await response.json() as { version: number; expires_at: number | null };
        noteState.currentVersion = data.version;

        // Update server state after successful save
        if (noteState.maxViews !== null) {
          noteState.serverMaxViews = noteState.maxViews;
          noteState.serverViewCount = 0; // Backend resets view_count when max_views is set
        }
        if (noteState.expiresIn && noteState.expiresIn !== 'null') {
          noteState.serverExpiresAt = data.expires_at; // Use server-computed value
        }
        // Reset the input values after they've been applied
        noteState.maxViews = null;
        noteState.expiresIn = 'null';
      } else {
        // Create new note
        const response = await fetch('/api/notes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        if (!response.ok) {
          throw new Error('Failed to create note');
        }

        const data = await response.json() as { id: string; version: number };
        noteState.noteId = data.id;
        noteState.currentVersion = data.version || 1;

        // Update server state after successful create
        if (noteState.maxViews !== null) {
          noteState.serverMaxViews = noteState.maxViews;
          noteState.serverViewCount = 0;
        }
        if (noteState.expiresIn && noteState.expiresIn !== 'null') {
          noteState.serverExpiresAt = Date.now() + parseInt(noteState.expiresIn);
        }
        // Reset the input values after they've been applied
        noteState.maxViews = null;
        noteState.expiresIn = 'null';

        // Replace current URL with note ID (don't push, as we're still in the same "session")
        window.history.replaceState({}, '', `/${noteState.noteId}`);

        // Callback to connect WebSocket after note creation
        setTimeout(() => {
          config.onLoadSuccess?.();
        }, 100);
      }

      noteState.saveStatus = 'Saved';
      setTimeout(() => {
        noteState.saveStatus = '';
      }, 2000);
    } catch (error) {
      // Silent - UI handles save status display
      noteState.saveStatus = 'Failed to save';
    }
  }

  async function deleteNote() {
    if (!noteState.noteId) return;

    if (!confirm('Are you sure you want to delete this note? This action cannot be undone.')) {
      return;
    }

    try {
      noteState.clearSaveTimeout();

      const params = new URLSearchParams();
      if (security.password) {
        params.set('password', security.password);
      }
      params.set('session_id', noteState.sessionId);

      const url = `/api/notes/${noteState.noteId}?${params.toString()}`;

      const response = await fetch(url, {
        method: 'DELETE'
      });

      if (response.status === 401) {
        alert('This note is password-protected. Please decrypt it before deleting.');
        return;
      }

      if (!response.ok) {
        throw new Error('Failed to delete note');
      }

      config.onNoteDeleted?.();
    } catch (error) {
      console.error('Failed to delete note:', error);
      alert('Failed to delete note');
    }
  }

  async function setPasswordProtection(passwordToSet: string, onSuccess?: () => void) {
    if (!passwordToSet.trim()) {
      alert('Please enter a password');
      return;
    }

    // Check if there's content to protect
    if (!editor.content.trim()) {
      alert('Cannot password-protect an empty note. Please add some content first.');
      return;
    }

    // If note doesn't exist yet, create it first with encryption
    if (!noteState.noteId) {
      noteState.clearSaveTimeout();

      security.password = passwordToSet;
      security.hasPassword = true;
      security.isEncrypted = true;

      await saveNote(); // This will create the note with encryption

      if (noteState.noteId) {
        onSuccess?.();
      }
      return;
    }

    noteState.clearSaveTimeout();

    const wasEncrypted = security.isEncrypted;

    security.password = passwordToSet;
    security.hasPassword = true;
    security.isEncrypted = true;

    noteState.saveStatus = 'Saving...';

    try {
      let contentToSave = editor.content;
      try {
        contentToSave = await encryptContent(editor.content, security.password);
      } catch (error) {
        console.error('Failed to encrypt content:', error);
        noteState.saveStatus = 'Encryption failed';
        security.password = '';
        security.hasPassword = false;
        security.isEncrypted = false;
        return;
      }

      const payload: any = {
        content: contentToSave,
        syntax_highlight: editor.syntaxHighlight || 'plaintext',
        is_encrypted: true,
        password: security.password,
        session_id: noteState.sessionId,
        expected_version: null
      };

      if (noteState.maxViews) {
        payload.max_views = noteState.maxViews;
      }

      if (noteState.expiresIn && noteState.expiresIn !== 'null') {
        payload.expires_in = parseInt(noteState.expiresIn);
      }

      const response = await fetch(`/api/notes/${noteState.noteId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (response.status === 409) {
        noteState.saveStatus = 'Conflict!';
        config.onConflict?.();
        security.password = '';
        security.hasPassword = false;
        security.isEncrypted = wasEncrypted;
        return;
      }

      if (!response.ok) {
        throw new Error('Failed to enable password protection');
      }

      const data = await response.json() as { version: number };
      noteState.currentVersion = data.version;

      noteState.saveStatus = 'Saved';
      setTimeout(() => {
        noteState.saveStatus = '';
      }, 2000);

      onSuccess?.();
    } catch (error) {
      console.error('Failed to enable password protection:', error);
      noteState.saveStatus = 'Failed to save';
      security.password = '';
      security.hasPassword = false;
      security.isEncrypted = wasEncrypted;
    }
  }

  async function removePasswordProtection(removePasswordInput: string, onSuccess?: () => void, onError?: (error: string) => void) {
    noteState.clearSaveTimeout();

    noteState.saveStatus = 'Saving...';

    try {
      const payload: any = {
        content: editor.content,
        syntax_highlight: editor.syntaxHighlight || 'plaintext',
        is_encrypted: false,
        password: removePasswordInput,
        session_id: noteState.sessionId,
        expected_version: null
      };

      if (noteState.maxViews) {
        payload.max_views = noteState.maxViews;
      }

      if (noteState.expiresIn && noteState.expiresIn !== 'null') {
        payload.expires_in = parseInt(noteState.expiresIn);
      }

      const response = await fetch(`/api/notes/${noteState.noteId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (response.status === 401) {
        noteState.saveStatus = '';
        onError?.('Incorrect password');
        return;
      }

      if (response.status === 409) {
        noteState.saveStatus = 'Conflict!';
        config.onConflict?.();
        return;
      }

      if (!response.ok) {
        throw new Error('Failed to remove password protection');
      }

      const data = await response.json() as { version: number };
      noteState.currentVersion = data.version;

      security.password = '';
      security.passwordToSet = '';
      security.hasPassword = false;
      security.isEncrypted = false;

      noteState.saveStatus = 'Saved';
      setTimeout(() => {
        noteState.saveStatus = '';
      }, 2000);

      onSuccess?.();
    } catch (error) {
      console.error('Failed to remove password protection:', error);
      noteState.saveStatus = 'Failed to save';
      onError?.('Failed to remove password protection');
    }
  }

  function newNote() {
    editor.content = '';
    noteState.resetNote();
    security.password = '';
    security.passwordToSet = '';
    security.passwordRequired = false;
    security.hasPassword = false;
    security.isEncrypted = false;
    editor.syntaxHighlight = 'plaintext';
    window.history.pushState({}, '', '/');
    config.onNewNote?.();
  }

  async function resetMaxViews() {
    if (!noteState.noteId) return;

    noteState.saveStatus = 'Saving...';

    try {
      const payload: any = {
        content: editor.content,
        syntax_highlight: editor.syntaxHighlight || 'plaintext',
        max_views: null,
        session_id: noteState.sessionId,
        expected_version: security.isEncrypted ? null : noteState.currentVersion
      };

      if (security.password) {
        payload.password = security.password;
      }

      const response = await fetch(`/api/notes/${noteState.noteId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        throw new Error('Failed to reset max views');
      }

      const data = await response.json() as { version: number };
      noteState.currentVersion = data.version;
      noteState.serverMaxViews = null;
      noteState.serverViewCount = 0;

      noteState.saveStatus = 'Saved';
      setTimeout(() => {
        noteState.saveStatus = '';
      }, 2000);
    } catch (error) {
      console.error('Failed to reset max views:', error);
      noteState.saveStatus = 'Failed to save';
    }
  }

  async function resetExpiration() {
    if (!noteState.noteId) return;

    noteState.saveStatus = 'Saving...';

    try {
      // We need to send a special value to clear expires_at
      // The backend currently only sets expires_at if expires_in is provided
      // We need to update the backend to support clearing it
      const payload: any = {
        content: editor.content,
        syntax_highlight: editor.syntaxHighlight || 'plaintext',
        clear_expiration: true,
        session_id: noteState.sessionId,
        expected_version: security.isEncrypted ? null : noteState.currentVersion
      };

      if (security.password) {
        payload.password = security.password;
      }

      const response = await fetch(`/api/notes/${noteState.noteId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        throw new Error('Failed to reset expiration');
      }

      const data = await response.json() as { version: number };
      noteState.currentVersion = data.version;
      noteState.serverExpiresAt = null;

      noteState.saveStatus = 'Saved';
      setTimeout(() => {
        noteState.saveStatus = '';
      }, 2000);
    } catch (error) {
      console.error('Failed to reset expiration:', error);
      noteState.saveStatus = 'Failed to save';
    }
  }

  return {
    loadNote,
    saveNote,
    deleteNote,
    setPasswordProtection,
    removePasswordProtection,
    newNote,
    resetMaxViews,
    resetExpiration
  };
}
