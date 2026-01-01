/**
 * Tests for InputEvent Operation Generator
 * Tests generation of OT operations from browser InputEvents
 */

import { describe, it, expect } from 'vitest';
import { generateOperationsFromInputEvent } from '../../client/lib/realtime/InputEventOperationGenerator';
import type { InsertOperation, DeleteOperation } from '../../src/ot/types';

// Helper to create mock InputEvent
function createInputEvent(inputType: string, data: string | null = null): InputEvent {
  return {
    inputType,
    data,
    dataTransfer: null,
    getTargetRanges: () => [],
    isComposing: false,
  } as unknown as InputEvent;
}

describe('generateOperationsFromInputEvent', () => {
  const clientId = 'test-client';
  const version = 1;

  describe('insertText', () => {
    it('should generate insert for single character', () => {
      const event = createInputEvent('insertText', 'a');
      const baseContent = 'hello';
      const newContent = 'hellao';
      const cursorPosition = 5; // After 'a' in new content

      const ops = generateOperationsFromInputEvent(
        event, baseContent, newContent, cursorPosition, clientId, version
      );

      expect(ops).toHaveLength(1);
      expect(ops[0].type).toBe('insert');
      expect((ops[0] as InsertOperation).position).toBe(4); // cursorPosition - 'a'.length
      expect((ops[0] as InsertOperation).text).toBe('a');
    });

    it('should generate insert for multiple characters', () => {
      const event = createInputEvent('insertText', 'abc');
      const baseContent = 'hello';
      const newContent = 'helabclo';
      const cursorPosition = 6; // After 'abc' in new content

      const ops = generateOperationsFromInputEvent(
        event, baseContent, newContent, cursorPosition, clientId, version
      );

      expect(ops).toHaveLength(1);
      expect(ops[0].type).toBe('insert');
      expect((ops[0] as InsertOperation).position).toBe(3);
      expect((ops[0] as InsertOperation).text).toBe('abc');
    });

    it('should handle insert at beginning', () => {
      const event = createInputEvent('insertText', 'X');
      const baseContent = 'hello';
      const newContent = 'Xhello';
      const cursorPosition = 1;

      const ops = generateOperationsFromInputEvent(
        event, baseContent, newContent, cursorPosition, clientId, version
      );

      expect(ops).toHaveLength(1);
      expect((ops[0] as InsertOperation).position).toBe(0);
      expect((ops[0] as InsertOperation).text).toBe('X');
    });

    it('should handle insert at end', () => {
      const event = createInputEvent('insertText', '!');
      const baseContent = 'hello';
      const newContent = 'hello!';
      const cursorPosition = 6;

      const ops = generateOperationsFromInputEvent(
        event, baseContent, newContent, cursorPosition, clientId, version
      );

      expect(ops).toHaveLength(1);
      expect((ops[0] as InsertOperation).position).toBe(5);
      expect((ops[0] as InsertOperation).text).toBe('!');
    });
  });

  describe('insertLineBreak', () => {
    it('should generate newline insert', () => {
      const event = createInputEvent('insertLineBreak');
      const baseContent = 'hello';
      const newContent = 'hel\nlo';
      const cursorPosition = 4; // After newline

      const ops = generateOperationsFromInputEvent(
        event, baseContent, newContent, cursorPosition, clientId, version
      );

      expect(ops).toHaveLength(1);
      expect(ops[0].type).toBe('insert');
      expect((ops[0] as InsertOperation).position).toBe(3);
      expect((ops[0] as InsertOperation).text).toBe('\n');
    });

    it('should handle newline at beginning', () => {
      const event = createInputEvent('insertLineBreak');
      const baseContent = 'hello';
      const newContent = '\nhello';
      const cursorPosition = 1;

      const ops = generateOperationsFromInputEvent(
        event, baseContent, newContent, cursorPosition, clientId, version
      );

      expect(ops).toHaveLength(1);
      expect((ops[0] as InsertOperation).position).toBe(0);
      expect((ops[0] as InsertOperation).text).toBe('\n');
    });
  });

  describe('insertParagraph', () => {
    it('should generate newline insert for paragraph', () => {
      const event = createInputEvent('insertParagraph');
      const baseContent = 'hello';
      const newContent = 'hello\n';
      const cursorPosition = 6;

      const ops = generateOperationsFromInputEvent(
        event, baseContent, newContent, cursorPosition, clientId, version
      );

      expect(ops).toHaveLength(1);
      expect(ops[0].type).toBe('insert');
      expect((ops[0] as InsertOperation).text).toBe('\n');
    });
  });

  describe('deleteContentBackward (Backspace)', () => {
    it('should generate delete for single character backspace', () => {
      const event = createInputEvent('deleteContentBackward');
      const baseContent = 'hello';
      const newContent = 'helo';
      const cursorPosition = 3; // After 'hel' in new content

      const ops = generateOperationsFromInputEvent(
        event, baseContent, newContent, cursorPosition, clientId, version
      );

      expect(ops).toHaveLength(1);
      expect(ops[0].type).toBe('delete');
      expect((ops[0] as DeleteOperation).position).toBe(3);
      expect((ops[0] as DeleteOperation).length).toBe(1);
    });

    it('should handle backspace at end', () => {
      const event = createInputEvent('deleteContentBackward');
      const baseContent = 'hello';
      const newContent = 'hell';
      const cursorPosition = 4;

      const ops = generateOperationsFromInputEvent(
        event, baseContent, newContent, cursorPosition, clientId, version
      );

      expect(ops).toHaveLength(1);
      expect((ops[0] as DeleteOperation).position).toBe(4);
      expect((ops[0] as DeleteOperation).length).toBe(1);
    });

    it('should handle multiple character backspace (selection delete)', () => {
      const event = createInputEvent('deleteContentBackward');
      const baseContent = 'hello world';
      const newContent = 'hello';
      const cursorPosition = 5;

      const ops = generateOperationsFromInputEvent(
        event, baseContent, newContent, cursorPosition, clientId, version
      );

      expect(ops).toHaveLength(1);
      expect((ops[0] as DeleteOperation).length).toBe(6);
    });

    it('should not generate delete when nothing changed', () => {
      const event = createInputEvent('deleteContentBackward');
      const baseContent = 'hello';
      const newContent = 'hello';
      const cursorPosition = 5;

      const ops = generateOperationsFromInputEvent(
        event, baseContent, newContent, cursorPosition, clientId, version
      );

      expect(ops).toHaveLength(0);
    });
  });

  describe('deleteContentForward (Delete key)', () => {
    it('should generate delete for forward delete', () => {
      const event = createInputEvent('deleteContentForward');
      const baseContent = 'hello';
      const newContent = 'hllo';
      const cursorPosition = 1; // After 'h'

      const ops = generateOperationsFromInputEvent(
        event, baseContent, newContent, cursorPosition, clientId, version
      );

      expect(ops).toHaveLength(1);
      expect(ops[0].type).toBe('delete');
      expect((ops[0] as DeleteOperation).position).toBe(1);
      expect((ops[0] as DeleteOperation).length).toBe(1);
    });

    it('should handle multiple character forward delete', () => {
      const event = createInputEvent('deleteContentForward');
      const baseContent = 'hello world';
      const newContent = 'hello';
      const cursorPosition = 5;

      const ops = generateOperationsFromInputEvent(
        event, baseContent, newContent, cursorPosition, clientId, version
      );

      expect(ops).toHaveLength(1);
      expect((ops[0] as DeleteOperation).length).toBe(6);
    });
  });

  describe('other delete types', () => {
    it('should handle deleteWordBackward', () => {
      const event = createInputEvent('deleteWordBackward');
      const baseContent = 'hello world';
      const newContent = 'hello ';
      const cursorPosition = 6;

      const ops = generateOperationsFromInputEvent(
        event, baseContent, newContent, cursorPosition, clientId, version
      );

      expect(ops).toHaveLength(1);
      expect(ops[0].type).toBe('delete');
      expect((ops[0] as DeleteOperation).length).toBe(5);
    });

    it('should handle deleteWordForward', () => {
      const event = createInputEvent('deleteWordForward');
      const baseContent = 'hello world';
      const newContent = 'hello ';
      const cursorPosition = 6;

      const ops = generateOperationsFromInputEvent(
        event, baseContent, newContent, cursorPosition, clientId, version
      );

      expect(ops).toHaveLength(1);
      expect(ops[0].type).toBe('delete');
    });

    it('should handle deleteByCut', () => {
      const event = createInputEvent('deleteByCut');
      const baseContent = 'hello world';
      const newContent = 'hello';
      const cursorPosition = 5;

      const ops = generateOperationsFromInputEvent(
        event, baseContent, newContent, cursorPosition, clientId, version
      );

      expect(ops).toHaveLength(1);
      expect(ops[0].type).toBe('delete');
    });
  });

  describe('insertFromPaste', () => {
    it('should fall back to cursor-based diff for paste', () => {
      const event = createInputEvent('insertFromPaste');
      const baseContent = 'hello';
      const newContent = 'hello world';
      const cursorPosition = 11;

      const ops = generateOperationsFromInputEvent(
        event, baseContent, newContent, cursorPosition, clientId, version
      );

      expect(ops.length).toBeGreaterThanOrEqual(1);
    });

    it('should handle paste replacing selection', () => {
      const event = createInputEvent('insertFromPaste');
      const baseContent = 'hello world';
      const newContent = 'hello universe';
      const cursorPosition = 14;

      const ops = generateOperationsFromInputEvent(
        event, baseContent, newContent, cursorPosition, clientId, version
      );

      expect(ops.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('no event provided', () => {
    it('should fall back to cursor-based diff when event is undefined', () => {
      const baseContent = 'hello';
      const newContent = 'hello world';
      const cursorPosition = 11;

      const ops = generateOperationsFromInputEvent(
        undefined, baseContent, newContent, cursorPosition, clientId, version
      );

      expect(ops.length).toBeGreaterThanOrEqual(1);
      expect(ops[0].type).toBe('insert');
    });
  });

  describe('no change scenarios', () => {
    it('should return empty array when content unchanged', () => {
      const event = createInputEvent('insertText', 'a');
      const baseContent = 'hello';
      const newContent = 'hello';
      const cursorPosition = 5;

      const ops = generateOperationsFromInputEvent(
        event, baseContent, newContent, cursorPosition, clientId, version
      );

      expect(ops).toHaveLength(0);
    });
  });

  describe('unknown input types', () => {
    it('should fall back for unknown input type', () => {
      const event = createInputEvent('unknownInputType');
      const baseContent = 'hello';
      const newContent = 'hello world';
      const cursorPosition = 11;

      const ops = generateOperationsFromInputEvent(
        event, baseContent, newContent, cursorPosition, clientId, version
      );

      expect(ops.length).toBeGreaterThanOrEqual(1);
    });

    it('should handle historyUndo', () => {
      const event = createInputEvent('historyUndo');
      const baseContent = 'hello world';
      const newContent = 'hello';
      const cursorPosition = 5;

      const ops = generateOperationsFromInputEvent(
        event, baseContent, newContent, cursorPosition, clientId, version
      );

      // Falls back to cursor-based diff
      expect(ops.length).toBeGreaterThanOrEqual(1);
    });

    it('should handle historyRedo', () => {
      const event = createInputEvent('historyRedo');
      const baseContent = 'hello';
      const newContent = 'hello world';
      const cursorPosition = 11;

      const ops = generateOperationsFromInputEvent(
        event, baseContent, newContent, cursorPosition, clientId, version
      );

      expect(ops.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('clientId and version', () => {
    it('should set correct clientId on operations', () => {
      const event = createInputEvent('insertText', 'a');
      const customClientId = 'custom-client-123';

      const ops = generateOperationsFromInputEvent(
        event, 'hello', 'hellao', 5, customClientId, version
      );

      expect(ops[0].clientId).toBe(customClientId);
    });

    it('should set correct version on operations', () => {
      const event = createInputEvent('insertText', 'a');
      const customVersion = 42;

      const ops = generateOperationsFromInputEvent(
        event, 'hello', 'hellao', 5, clientId, customVersion
      );

      expect(ops[0].version).toBe(customVersion);
    });
  });

  describe('cursor position handling', () => {
    it('should correctly calculate position for insert at various cursor positions', () => {
      const testCases = [
        { cursorPos: 1, text: 'X', expected: 0 },
        { cursorPos: 5, text: 'XYZ', expected: 2 },
        { cursorPos: 10, text: 'ab', expected: 8 },
      ];

      for (const { cursorPos, text, expected } of testCases) {
        const event = createInputEvent('insertText', text);
        const ops = generateOperationsFromInputEvent(
          event, '', text, cursorPos, clientId, version
        );

        if (ops.length > 0 && ops[0].type === 'insert') {
          expect((ops[0] as InsertOperation).position).toBe(expected);
        }
      }
    });
  });
});

describe('cursor-based fallback generator', () => {
  const clientId = 'test-client';
  const version = 1;

  it('should handle simple addition', () => {
    const ops = generateOperationsFromInputEvent(
      undefined, 'hello', 'hello world', 11, clientId, version
    );

    expect(ops).toHaveLength(1);
    expect(ops[0].type).toBe('insert');
    expect((ops[0] as InsertOperation).text).toBe(' world');
  });

  it('should handle simple deletion', () => {
    const ops = generateOperationsFromInputEvent(
      undefined, 'hello world', 'hello', 5, clientId, version
    );

    expect(ops).toHaveLength(1);
    expect(ops[0].type).toBe('delete');
    expect((ops[0] as DeleteOperation).length).toBe(6);
  });

  it('should handle no change', () => {
    const ops = generateOperationsFromInputEvent(
      undefined, 'hello', 'hello', 5, clientId, version
    );

    expect(ops).toHaveLength(0);
  });
});
