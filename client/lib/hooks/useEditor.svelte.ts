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
    set lastLocalContent(value: string) { lastLocalContent = value; }
  };
}
