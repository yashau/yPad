/**
 * Editor state management hook
 * Handles content, syntax highlighting, and editor-related state
 */

export function useEditor() {
  let content = $state('');
  let syntaxHighlight = $state('plaintext');
  let highlightedContent = $state('');
  let editorRef = $state<HTMLDivElement | null>(null);
  let lineNumbersRef = $state<HTMLDivElement | null>(null);
  let textareaScrollRef = $state<HTMLTextAreaElement | null>(null);
  let isUpdating = false;
  let lastLocalContent = $state('');
  // Selection range captured BEFORE DOM changes (in beforeinput event)
  // This is critical for accurate OT position calculations
  // preEditCursorPosition is the selection start (where cursor/selection begins)
  // preEditSelectionEnd is the selection end (null if no selection, just a cursor)
  let preEditCursorPosition: number | null = null;
  let preEditSelectionEnd: number | null = null;
  // preEditContent captures the editor content BEFORE the DOM changes
  // This is essential for OT because if a remote operation arrives between
  // beforeinput and input events, editor.content would be modified and we'd
  // generate operations against the wrong base state
  let preEditContent: string | null = null;

  return {
    get content() { return content; },
    set content(value: string) { content = value; },

    get syntaxHighlight() { return syntaxHighlight; },
    set syntaxHighlight(value: string) { syntaxHighlight = value; },

    get highlightedContent() { return highlightedContent; },
    set highlightedContent(value: string) { highlightedContent = value; },

    get editorRef() { return editorRef; },
    set editorRef(value: HTMLDivElement | null) { editorRef = value; },

    get lineNumbersRef() { return lineNumbersRef; },
    set lineNumbersRef(value: HTMLDivElement | null) { lineNumbersRef = value; },

    get textareaScrollRef() { return textareaScrollRef; },
    set textareaScrollRef(value: HTMLTextAreaElement | null) { textareaScrollRef = value; },

    get isUpdating() { return isUpdating; },
    set isUpdating(value: boolean) { isUpdating = value; },

    get lastLocalContent() { return lastLocalContent; },
    set lastLocalContent(value: string) { lastLocalContent = value; },

    get preEditCursorPosition() { return preEditCursorPosition; },
    set preEditCursorPosition(value: number | null) { preEditCursorPosition = value; },

    get preEditSelectionEnd() { return preEditSelectionEnd; },
    set preEditSelectionEnd(value: number | null) { preEditSelectionEnd = value; },

    get preEditContent() { return preEditContent; },
    set preEditContent(value: string | null) { preEditContent = value; },

    focusEditor() {
      setTimeout(() => {
        if (syntaxHighlight === 'plaintext') {
          textareaScrollRef?.focus();
        } else {
          editorRef?.focus();
        }
      }, 0);
    }
  };
}
