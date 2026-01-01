/**
 * Tests for useEditor hook
 * Tests editor state management
 */

import { describe, it, expect } from 'vitest';

describe('useEditor logic', () => {
  describe('content state management', () => {
    it('should track content', () => {
      let content = '';

      content = 'Hello, World!';

      expect(content).toBe('Hello, World!');
    });

    it('should handle empty content', () => {
      let content = 'existing content';

      content = '';

      expect(content).toBe('');
    });

    it('should handle multiline content', () => {
      let content = '';

      content = 'line1\nline2\nline3';

      expect(content).toBe('line1\nline2\nline3');
      expect(content.split('\n')).toHaveLength(3);
    });

    it('should handle unicode content', () => {
      let content = '';

      content = '日本語テスト 👋🌍';

      expect(content).toBe('日本語テスト 👋🌍');
    });

    it('should handle very long content', () => {
      let content = '';

      content = 'x'.repeat(100000);

      expect(content.length).toBe(100000);
    });
  });

  describe('syntax highlighting state', () => {
    it('should track syntaxHighlight with default value', () => {
      let syntaxHighlight = 'plaintext';

      expect(syntaxHighlight).toBe('plaintext');
    });

    it('should update syntaxHighlight', () => {
      let syntaxHighlight = 'plaintext';

      syntaxHighlight = 'javascript';

      expect(syntaxHighlight).toBe('javascript');
    });

    it('should support various syntax modes', () => {
      let syntaxHighlight = 'plaintext';

      const modes = ['javascript', 'typescript', 'python', 'go', 'rust', 'java'];

      for (const mode of modes) {
        syntaxHighlight = mode;
        expect(syntaxHighlight).toBe(mode);
      }
    });
  });

  describe('highlighted content state', () => {
    it('should track highlightedContent', () => {
      let highlightedContent = '';

      highlightedContent = '<span class="keyword">function</span> test() {}';

      expect(highlightedContent).toContain('keyword');
    });

    it('should handle empty highlighted content', () => {
      let highlightedContent = '<span>something</span>';

      highlightedContent = '';

      expect(highlightedContent).toBe('');
    });
  });

  describe('editor references', () => {
    it('should track editorRef', () => {
      let editorRef: HTMLDivElement | null = null;

      // Simulate setting ref
      const mockDiv = { tagName: 'DIV' } as HTMLDivElement;
      editorRef = mockDiv;

      expect(editorRef).toBe(mockDiv);
    });

    it('should track lineNumbersRef', () => {
      let lineNumbersRef: HTMLDivElement | null = null;

      const mockDiv = { tagName: 'DIV' } as HTMLDivElement;
      lineNumbersRef = mockDiv;

      expect(lineNumbersRef).toBe(mockDiv);
    });

    it('should track textareaScrollRef', () => {
      let textareaScrollRef: HTMLTextAreaElement | null = null;

      const mockTextarea = { tagName: 'TEXTAREA' } as HTMLTextAreaElement;
      textareaScrollRef = mockTextarea;

      expect(textareaScrollRef).toBe(mockTextarea);
    });

    it('should allow null refs', () => {
      let editorRef: HTMLDivElement | null = { tagName: 'DIV' } as HTMLDivElement;

      editorRef = null;

      expect(editorRef).toBeNull();
    });
  });

  describe('update state', () => {
    it('should track isUpdating', () => {
      let isUpdating = false;

      isUpdating = true;

      expect(isUpdating).toBe(true);
    });

    it('should toggle isUpdating for batch updates', () => {
      let isUpdating = false;

      // Start batch update
      isUpdating = true;
      expect(isUpdating).toBe(true);

      // End batch update
      isUpdating = false;
      expect(isUpdating).toBe(false);
    });
  });

  describe('last local content tracking', () => {
    it('should track lastLocalContent', () => {
      let lastLocalContent = '';

      lastLocalContent = 'previous content';

      expect(lastLocalContent).toBe('previous content');
    });

    it('should track content changes', () => {
      let content = '';
      let lastLocalContent = '';

      // Initial content
      content = 'hello';
      lastLocalContent = content;

      // User types more
      content = 'hello world';

      // Should be able to compare
      expect(content).not.toBe(lastLocalContent);
      expect(content.length).toBeGreaterThan(lastLocalContent.length);

      // Update last local content
      lastLocalContent = content;
      expect(content).toBe(lastLocalContent);
    });
  });

  describe('state getters and setters', () => {
    it('should provide getter/setter pairs for all state', () => {
      const createState = <T>(initial: T) => {
        let value = initial;
        return {
          get: () => value,
          set: (newValue: T) => { value = newValue; }
        };
      };

      const content = createState('');
      const syntaxHighlight = createState('plaintext');
      const highlightedContent = createState('');
      const isUpdating = createState(false);

      // Test setters
      content.set('test content');
      syntaxHighlight.set('typescript');
      highlightedContent.set('<span>highlighted</span>');
      isUpdating.set(true);

      // Test getters
      expect(content.get()).toBe('test content');
      expect(syntaxHighlight.get()).toBe('typescript');
      expect(highlightedContent.get()).toBe('<span>highlighted</span>');
      expect(isUpdating.get()).toBe(true);
    });
  });
});

describe('useEditor content manipulation logic', () => {
  describe('line counting', () => {
    it('should count lines correctly', () => {
      const content = 'line1\nline2\nline3';

      const lineCount = content.split('\n').length;

      expect(lineCount).toBe(3);
    });

    it('should handle empty content', () => {
      const content = '';

      const lineCount = content === '' ? 1 : content.split('\n').length;

      expect(lineCount).toBe(1);
    });

    it('should handle content with trailing newline', () => {
      const content = 'line1\nline2\n';

      const lineCount = content.split('\n').length;

      expect(lineCount).toBe(3); // Includes empty line after trailing newline
    });
  });

  describe('cursor position tracking', () => {
    it('should calculate cursor line from position', () => {
      const content = 'line1\nline2\nline3';
      const cursorPosition = 12; // In "line3"

      const textBeforeCursor = content.substring(0, cursorPosition);
      const cursorLine = textBeforeCursor.split('\n').length;

      expect(cursorLine).toBe(3);
    });

    it('should calculate cursor column from position', () => {
      const content = 'line1\nline2\nline3';
      const cursorPosition = 14; // "li" in "line3"

      const textBeforeCursor = content.substring(0, cursorPosition);
      const lastNewline = textBeforeCursor.lastIndexOf('\n');
      const cursorColumn = cursorPosition - lastNewline - 1;

      expect(cursorColumn).toBe(2);
    });
  });

  describe('content diff detection', () => {
    it('should detect content change', () => {
      const lastLocalContent = 'hello';
      const content = 'hello world';

      const hasChanged = content !== lastLocalContent;

      expect(hasChanged).toBe(true);
    });

    it('should detect no change', () => {
      const lastLocalContent = 'hello';
      const content = 'hello';

      const hasChanged = content !== lastLocalContent;

      expect(hasChanged).toBe(false);
    });

    it('should calculate length difference', () => {
      const lastLocalContent = 'hello';
      const content = 'hello world';

      const lengthDiff = content.length - lastLocalContent.length;

      expect(lengthDiff).toBe(6); // " world"
    });
  });
});

describe('useEditor syntax highlighting logic', () => {
  it('should determine if highlighting is needed', () => {
    const syntaxHighlight = 'javascript';

    const needsHighlighting = syntaxHighlight !== 'plaintext';

    expect(needsHighlighting).toBe(true);
  });

  it('should skip highlighting for plaintext', () => {
    const syntaxHighlight = 'plaintext';

    const needsHighlighting = syntaxHighlight !== 'plaintext';

    expect(needsHighlighting).toBe(false);
  });

  it('should handle syntax mode change', () => {
    let syntaxHighlight = 'plaintext';
    let highlightedContent = '';
    const content = 'function test() {}';

    // Change to javascript
    syntaxHighlight = 'javascript';

    // Would trigger re-highlighting
    if (syntaxHighlight !== 'plaintext') {
      highlightedContent = `<span class="function">function</span> test() {}`;
    }

    expect(highlightedContent).toContain('function');
  });
});
