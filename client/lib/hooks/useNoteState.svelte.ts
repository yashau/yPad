/**
 * Core note state management hook
 * Handles note metadata, session tracking, and view state
 */

export function useNoteState() {
  let noteId = $state('');
  let sessionId = $state('');
  let currentVersion = $state(1);
  let isInitialLoad = $state(false);
  let isLoading = $state(false);
  let saveStatus = $state('');
  let viewMode = $state(false);
  let maxViews = $state<number | null>(null);
  let expiresIn = $state<string>('null');
  let saveTimeout: ReturnType<typeof setTimeout> | null = null;

  function initializeSession() {
    const existingSessionId = sessionStorage.getItem('paste-session-id');
    if (existingSessionId) {
      sessionId = existingSessionId;
    } else {
      sessionId = crypto.randomUUID();
      sessionStorage.setItem('paste-session-id', sessionId);
    }
  }

  function clearSaveTimeout() {
    if (saveTimeout) {
      clearTimeout(saveTimeout);
      saveTimeout = null;
    }
  }

  function setSaveTimeout(callback: () => void, delay: number) {
    clearSaveTimeout();
    saveTimeout = setTimeout(callback, delay);
  }

  function resetNote() {
    noteId = '';
    maxViews = null;
    expiresIn = 'null';
    viewMode = false;
  }

  return {
    get noteId() { return noteId; },
    set noteId(value: string) { noteId = value; },

    get sessionId() { return sessionId; },
    set sessionId(value: string) { sessionId = value; },

    get currentVersion() { return currentVersion; },
    set currentVersion(value: number) { currentVersion = value; },

    get isInitialLoad() { return isInitialLoad; },
    set isInitialLoad(value: boolean) { isInitialLoad = value; },

    get isLoading() { return isLoading; },
    set isLoading(value: boolean) { isLoading = value; },

    get saveStatus() { return saveStatus; },
    set saveStatus(value: string) { saveStatus = value; },

    get viewMode() { return viewMode; },
    set viewMode(value: boolean) { viewMode = value; },

    get maxViews() { return maxViews; },
    set maxViews(value: number | null) { maxViews = value; },

    get expiresIn() { return expiresIn; },
    set expiresIn(value: string) { expiresIn = value; },

    initializeSession,
    clearSaveTimeout,
    setSaveTimeout,
    resetNote
  };
}
