/**
 * Tests for InputEvent Operation Generator
 * Tests generation of OT operations from browser InputEvents
 *
 * IMPORTANT: selectionStart is the PRE-EDIT selection start (before the DOM changed)
 * selectionEnd is the PRE-EDIT selection end (null if no selection, just a cursor)
 * These are captured in the 'beforeinput' event, not after the edit.
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
      const selectionStart = 4; // PRE-EDIT: cursor was after 'hell', before 'o'

      const ops = generateOperationsFromInputEvent(
        event, baseContent, newContent, selectionStart, null, clientId, version
      );

      expect(ops).toHaveLength(1);
      expect(ops[0].type).toBe('insert');
      expect((ops[0] as InsertOperation).position).toBe(4);
      expect((ops[0] as InsertOperation).text).toBe('a');
    });

    it('should generate insert for multiple characters', () => {
      const event = createInputEvent('insertText', 'abc');
      const baseContent = 'hello';
      const newContent = 'helabclo';
      const selectionStart = 3; // PRE-EDIT: cursor was after 'hel'

      const ops = generateOperationsFromInputEvent(
        event, baseContent, newContent, selectionStart, null, clientId, version
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
      const selectionStart = 0; // PRE-EDIT: cursor was at start

      const ops = generateOperationsFromInputEvent(
        event, baseContent, newContent, selectionStart, null, clientId, version
      );

      expect(ops).toHaveLength(1);
      expect((ops[0] as InsertOperation).position).toBe(0);
      expect((ops[0] as InsertOperation).text).toBe('X');
    });

    it('should handle insert at end', () => {
      const event = createInputEvent('insertText', '!');
      const baseContent = 'hello';
      const newContent = 'hello!';
      const selectionStart = 5; // PRE-EDIT: cursor was at end

      const ops = generateOperationsFromInputEvent(
        event, baseContent, newContent, selectionStart, null, clientId, version
      );

      expect(ops).toHaveLength(1);
      expect((ops[0] as InsertOperation).position).toBe(5);
      expect((ops[0] as InsertOperation).text).toBe('!');
    });

    it('should handle typing over selection (replacement)', () => {
      const event = createInputEvent('insertText', 'X');
      const baseContent = 'hello world';
      const newContent = 'hello X';
      // PRE-EDIT: "world" was selected (positions 6-11)
      const selectionStart = 6;
      const selectionEnd = 11;

      const ops = generateOperationsFromInputEvent(
        event, baseContent, newContent, selectionStart, selectionEnd, clientId, version
      );

      // Should generate delete then insert
      expect(ops).toHaveLength(2);
      expect(ops[0].type).toBe('delete');
      expect((ops[0] as DeleteOperation).position).toBe(6);
      expect((ops[0] as DeleteOperation).length).toBe(5);
      expect(ops[1].type).toBe('insert');
      expect((ops[1] as InsertOperation).position).toBe(6);
      expect((ops[1] as InsertOperation).text).toBe('X');
    });
  });

  describe('insertLineBreak', () => {
    it('should generate newline insert', () => {
      const event = createInputEvent('insertLineBreak');
      const baseContent = 'hello';
      const newContent = 'hel\nlo';
      const selectionStart = 3; // PRE-EDIT: cursor was after 'hel'

      const ops = generateOperationsFromInputEvent(
        event, baseContent, newContent, selectionStart, null, clientId, version
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
      const selectionStart = 0; // PRE-EDIT: cursor was at start

      const ops = generateOperationsFromInputEvent(
        event, baseContent, newContent, selectionStart, null, clientId, version
      );

      expect(ops).toHaveLength(1);
      expect((ops[0] as InsertOperation).position).toBe(0);
      expect((ops[0] as InsertOperation).text).toBe('\n');
    });

    it('should handle newline replacing selection', () => {
      const event = createInputEvent('insertLineBreak');
      const baseContent = 'hello world';
      const newContent = 'hello \n';
      const selectionStart = 6;
      const selectionEnd = 11; // "world" selected

      const ops = generateOperationsFromInputEvent(
        event, baseContent, newContent, selectionStart, selectionEnd, clientId, version
      );

      expect(ops).toHaveLength(2);
      expect(ops[0].type).toBe('delete');
      expect((ops[0] as DeleteOperation).position).toBe(6);
      expect((ops[0] as DeleteOperation).length).toBe(5);
      expect(ops[1].type).toBe('insert');
      expect((ops[1] as InsertOperation).text).toBe('\n');
    });
  });

  describe('insertParagraph', () => {
    it('should generate newline insert for paragraph', () => {
      const event = createInputEvent('insertParagraph');
      const baseContent = 'hello';
      const newContent = 'hello\n';
      const selectionStart = 5; // PRE-EDIT: cursor was at end

      const ops = generateOperationsFromInputEvent(
        event, baseContent, newContent, selectionStart, null, clientId, version
      );

      expect(ops).toHaveLength(1);
      expect(ops[0].type).toBe('insert');
      expect((ops[0] as InsertOperation).position).toBe(5);
      expect((ops[0] as InsertOperation).text).toBe('\n');
    });
  });

  describe('deleteContentBackward (Backspace)', () => {
    it('should generate delete for single character backspace', () => {
      const event = createInputEvent('deleteContentBackward');
      const baseContent = 'hello';
      const newContent = 'helo';
      const selectionStart = 4; // PRE-EDIT: cursor was after 'hell' (before backspace)

      const ops = generateOperationsFromInputEvent(
        event, baseContent, newContent, selectionStart, null, clientId, version
      );

      expect(ops).toHaveLength(1);
      expect(ops[0].type).toBe('delete');
      expect((ops[0] as DeleteOperation).position).toBe(3); // Deletes char BEFORE cursor
      expect((ops[0] as DeleteOperation).length).toBe(1);
    });

    it('should handle backspace at end', () => {
      const event = createInputEvent('deleteContentBackward');
      const baseContent = 'hello';
      const newContent = 'hell';
      const selectionStart = 5; // PRE-EDIT: cursor was at end

      const ops = generateOperationsFromInputEvent(
        event, baseContent, newContent, selectionStart, null, clientId, version
      );

      expect(ops).toHaveLength(1);
      expect((ops[0] as DeleteOperation).position).toBe(4); // Deletes char BEFORE cursor
      expect((ops[0] as DeleteOperation).length).toBe(1);
    });

    it('should handle backspace with selection (deletes selection)', () => {
      const event = createInputEvent('deleteContentBackward');
      const baseContent = 'hello world';
      const newContent = 'hello';
      const selectionStart = 5;
      const selectionEnd = 11; // " world" selected

      const ops = generateOperationsFromInputEvent(
        event, baseContent, newContent, selectionStart, selectionEnd, clientId, version
      );

      expect(ops).toHaveLength(1);
      expect(ops[0].type).toBe('delete');
      expect((ops[0] as DeleteOperation).position).toBe(5);
      expect((ops[0] as DeleteOperation).length).toBe(6);
    });

    it('should not generate delete when nothing changed', () => {
      const event = createInputEvent('deleteContentBackward');
      const baseContent = 'hello';
      const newContent = 'hello';
      const selectionStart = 5;

      const ops = generateOperationsFromInputEvent(
        event, baseContent, newContent, selectionStart, null, clientId, version
      );

      expect(ops).toHaveLength(0);
    });
  });

  describe('deleteContentForward (Delete key)', () => {
    it('should generate delete for forward delete', () => {
      const event = createInputEvent('deleteContentForward');
      const baseContent = 'hello';
      const newContent = 'hllo';
      const selectionStart = 1; // PRE-EDIT: cursor was after 'h'

      const ops = generateOperationsFromInputEvent(
        event, baseContent, newContent, selectionStart, null, clientId, version
      );

      expect(ops).toHaveLength(1);
      expect(ops[0].type).toBe('delete');
      expect((ops[0] as DeleteOperation).position).toBe(1); // Deletes char AT cursor
      expect((ops[0] as DeleteOperation).length).toBe(1);
    });

    it('should handle multiple character forward delete', () => {
      const event = createInputEvent('deleteContentForward');
      const baseContent = 'hello world';
      const newContent = 'hello';
      const selectionStart = 5; // PRE-EDIT: cursor was after 'hello'

      const ops = generateOperationsFromInputEvent(
        event, baseContent, newContent, selectionStart, null, clientId, version
      );

      expect(ops).toHaveLength(1);
      expect((ops[0] as DeleteOperation).position).toBe(5);
      expect((ops[0] as DeleteOperation).length).toBe(6);
    });

    it('should handle forward delete with selection', () => {
      const event = createInputEvent('deleteContentForward');
      const baseContent = 'hello world';
      const newContent = 'hello';
      const selectionStart = 5;
      const selectionEnd = 11; // " world" selected

      const ops = generateOperationsFromInputEvent(
        event, baseContent, newContent, selectionStart, selectionEnd, clientId, version
      );

      expect(ops).toHaveLength(1);
      expect(ops[0].type).toBe('delete');
      expect((ops[0] as DeleteOperation).position).toBe(5);
      expect((ops[0] as DeleteOperation).length).toBe(6);
    });
  });

  describe('deleteWordBackward (Ctrl+Backspace)', () => {
    it('should delete word before cursor', () => {
      const event = createInputEvent('deleteWordBackward');
      const baseContent = 'hello world';
      const newContent = 'hello ';
      const selectionStart = 11; // PRE-EDIT: cursor was at end

      const ops = generateOperationsFromInputEvent(
        event, baseContent, newContent, selectionStart, null, clientId, version
      );

      expect(ops).toHaveLength(1);
      expect(ops[0].type).toBe('delete');
      expect((ops[0] as DeleteOperation).position).toBe(6); // position = cursor - deleted
      expect((ops[0] as DeleteOperation).length).toBe(5);
    });

    it('should delete selection if present', () => {
      const event = createInputEvent('deleteWordBackward');
      const baseContent = 'hello world';
      const newContent = 'hello';
      const selectionStart = 5;
      const selectionEnd = 11;

      const ops = generateOperationsFromInputEvent(
        event, baseContent, newContent, selectionStart, selectionEnd, clientId, version
      );

      expect(ops).toHaveLength(1);
      expect(ops[0].type).toBe('delete');
      expect((ops[0] as DeleteOperation).position).toBe(5);
      expect((ops[0] as DeleteOperation).length).toBe(6);
    });
  });

  describe('deleteWordForward (Ctrl+Delete)', () => {
    it('should delete word after cursor', () => {
      const event = createInputEvent('deleteWordForward');
      const baseContent = 'hello world';
      const newContent = 'hello';
      const selectionStart = 5; // PRE-EDIT: cursor after "hello"

      const ops = generateOperationsFromInputEvent(
        event, baseContent, newContent, selectionStart, null, clientId, version
      );

      expect(ops).toHaveLength(1);
      expect(ops[0].type).toBe('delete');
      expect((ops[0] as DeleteOperation).position).toBe(5); // Forward delete at cursor
      expect((ops[0] as DeleteOperation).length).toBe(6);
    });
  });

  describe('deleteSoftLineBackward', () => {
    it('should delete to visual line start', () => {
      const event = createInputEvent('deleteSoftLineBackward');
      const baseContent = 'hello world';
      const newContent = 'world';
      const selectionStart = 6; // PRE-EDIT: cursor after "hello "

      const ops = generateOperationsFromInputEvent(
        event, baseContent, newContent, selectionStart, null, clientId, version
      );

      expect(ops).toHaveLength(1);
      expect(ops[0].type).toBe('delete');
      expect((ops[0] as DeleteOperation).position).toBe(0); // Deleted from start
      expect((ops[0] as DeleteOperation).length).toBe(6);
    });
  });

  describe('deleteSoftLineForward', () => {
    it('should delete to visual line end', () => {
      const event = createInputEvent('deleteSoftLineForward');
      const baseContent = 'hello world';
      const newContent = 'hello';
      const selectionStart = 5; // PRE-EDIT: cursor after "hello"

      const ops = generateOperationsFromInputEvent(
        event, baseContent, newContent, selectionStart, null, clientId, version
      );

      expect(ops).toHaveLength(1);
      expect(ops[0].type).toBe('delete');
      expect((ops[0] as DeleteOperation).position).toBe(5); // Forward delete
      expect((ops[0] as DeleteOperation).length).toBe(6);
    });
  });

  describe('deleteHardLineBackward', () => {
    it('should delete to block element start', () => {
      const event = createInputEvent('deleteHardLineBackward');
      const baseContent = 'hello world';
      const newContent = 'world';
      const selectionStart = 6;

      const ops = generateOperationsFromInputEvent(
        event, baseContent, newContent, selectionStart, null, clientId, version
      );

      expect(ops).toHaveLength(1);
      expect(ops[0].type).toBe('delete');
      expect((ops[0] as DeleteOperation).length).toBe(6);
    });
  });

  describe('deleteHardLineForward', () => {
    it('should delete to block element end', () => {
      const event = createInputEvent('deleteHardLineForward');
      const baseContent = 'hello world';
      const newContent = 'hello';
      const selectionStart = 5;

      const ops = generateOperationsFromInputEvent(
        event, baseContent, newContent, selectionStart, null, clientId, version
      );

      expect(ops).toHaveLength(1);
      expect(ops[0].type).toBe('delete');
      expect((ops[0] as DeleteOperation).position).toBe(5);
    });
  });

  describe('deleteEntireSoftLine', () => {
    it('should delete entire visual line with selection', () => {
      const event = createInputEvent('deleteEntireSoftLine');
      const baseContent = 'hello world';
      const newContent = '';
      const selectionStart = 0;
      const selectionEnd = 11;

      const ops = generateOperationsFromInputEvent(
        event, baseContent, newContent, selectionStart, selectionEnd, clientId, version
      );

      expect(ops).toHaveLength(1);
      expect(ops[0].type).toBe('delete');
      expect((ops[0] as DeleteOperation).position).toBe(0);
      expect((ops[0] as DeleteOperation).length).toBe(11);
    });
  });

  describe('deleteByCut (Ctrl+X)', () => {
    it('should cut selected text', () => {
      const event = createInputEvent('deleteByCut');
      const baseContent = 'hello world';
      const newContent = 'hello';
      const selectionStart = 5;
      const selectionEnd = 11; // " world" was selected and cut

      const ops = generateOperationsFromInputEvent(
        event, baseContent, newContent, selectionStart, selectionEnd, clientId, version
      );

      expect(ops).toHaveLength(1);
      expect(ops[0].type).toBe('delete');
      expect((ops[0] as DeleteOperation).position).toBe(5);
      expect((ops[0] as DeleteOperation).length).toBe(6);
    });
  });

  describe('deleteByDrag', () => {
    it('should delete dragged content', () => {
      const event = createInputEvent('deleteByDrag');
      const baseContent = 'hello world';
      const newContent = 'hello';
      const selectionStart = 5;
      const selectionEnd = 11;

      const ops = generateOperationsFromInputEvent(
        event, baseContent, newContent, selectionStart, selectionEnd, clientId, version
      );

      expect(ops).toHaveLength(1);
      expect(ops[0].type).toBe('delete');
      expect((ops[0] as DeleteOperation).position).toBe(5);
      expect((ops[0] as DeleteOperation).length).toBe(6);
    });
  });

  describe('deleteContent', () => {
    it('should delete selection (direction unspecified)', () => {
      const event = createInputEvent('deleteContent');
      const baseContent = 'hello world';
      const newContent = 'hello';
      const selectionStart = 5;
      const selectionEnd = 11;

      const ops = generateOperationsFromInputEvent(
        event, baseContent, newContent, selectionStart, selectionEnd, clientId, version
      );

      expect(ops).toHaveLength(1);
      expect(ops[0].type).toBe('delete');
      expect((ops[0] as DeleteOperation).position).toBe(5);
      expect((ops[0] as DeleteOperation).length).toBe(6);
    });
  });

  describe('insertFromPaste', () => {
    it('should fall back to selection-based diff for paste', () => {
      const event = createInputEvent('insertFromPaste');
      const baseContent = 'hello';
      const newContent = 'hello world';
      const selectionStart = 5; // PRE-EDIT: cursor was at end before paste

      const ops = generateOperationsFromInputEvent(
        event, baseContent, newContent, selectionStart, null, clientId, version
      );

      expect(ops.length).toBeGreaterThanOrEqual(1);
      expect(ops[0].type).toBe('insert');
      expect((ops[0] as InsertOperation).position).toBe(5);
      expect((ops[0] as InsertOperation).text).toBe(' world');
    });

    it('should handle paste replacing selection', () => {
      const event = createInputEvent('insertFromPaste');
      const baseContent = 'hello world';
      const newContent = 'hello universe';
      const selectionStart = 6; // PRE-EDIT: start of "world"
      const selectionEnd = 11; // PRE-EDIT: end of "world"

      const ops = generateOperationsFromInputEvent(
        event, baseContent, newContent, selectionStart, selectionEnd, clientId, version
      );

      // Should generate delete then insert
      expect(ops).toHaveLength(2);
      expect(ops[0].type).toBe('delete');
      expect((ops[0] as DeleteOperation).position).toBe(6);
      expect((ops[0] as DeleteOperation).length).toBe(5);
      expect(ops[1].type).toBe('insert');
      expect((ops[1] as InsertOperation).position).toBe(6);
      expect((ops[1] as InsertOperation).text).toBe('universe');
    });
  });

  describe('insertReplacementText (autocorrect)', () => {
    it('should handle autocorrect replacing a word', () => {
      const event = createInputEvent('insertReplacementText');
      const baseContent = 'hello wrold';
      const newContent = 'hello world';
      const selectionStart = 6; // PRE-EDIT: start of "wrold"
      const selectionEnd = 11; // PRE-EDIT: end of "wrold"

      const ops = generateOperationsFromInputEvent(
        event, baseContent, newContent, selectionStart, selectionEnd, clientId, version
      );

      // Should generate delete then insert
      expect(ops).toHaveLength(2);
      expect(ops[0].type).toBe('delete');
      expect((ops[0] as DeleteOperation).position).toBe(6);
      expect((ops[0] as DeleteOperation).length).toBe(5);
      expect(ops[1].type).toBe('insert');
      expect((ops[1] as InsertOperation).position).toBe(6);
      expect((ops[1] as InsertOperation).text).toBe('world');
    });

    it('should handle autocorrect with no selection (insert only)', () => {
      const event = createInputEvent('insertReplacementText');
      const baseContent = 'hello';
      const newContent = 'hello world';
      const selectionStart = 5; // No selection, just cursor at end

      const ops = generateOperationsFromInputEvent(
        event, baseContent, newContent, selectionStart, null, clientId, version
      );

      expect(ops).toHaveLength(1);
      expect(ops[0].type).toBe('insert');
      expect((ops[0] as InsertOperation).position).toBe(5);
      expect((ops[0] as InsertOperation).text).toBe(' world');
    });
  });

  describe('insertCompositionText (IME)', () => {
    it('should handle IME composition replacing text', () => {
      const event = createInputEvent('insertCompositionText');
      const baseContent = 'hello ni';
      const newContent = 'hello 你好';
      const selectionStart = 6; // PRE-EDIT: start of "ni"
      const selectionEnd = 8; // PRE-EDIT: end of "ni"

      const ops = generateOperationsFromInputEvent(
        event, baseContent, newContent, selectionStart, selectionEnd, clientId, version
      );

      expect(ops).toHaveLength(2);
      expect(ops[0].type).toBe('delete');
      expect((ops[0] as DeleteOperation).position).toBe(6);
      expect((ops[0] as DeleteOperation).length).toBe(2);
      expect(ops[1].type).toBe('insert');
      expect((ops[1] as InsertOperation).position).toBe(6);
      expect((ops[1] as InsertOperation).text).toBe('你好');
    });
  });

  describe('insertFromDrop', () => {
    it('should handle drag and drop insert', () => {
      const event = createInputEvent('insertFromDrop');
      const baseContent = 'hello';
      const newContent = 'hello world';
      const selectionStart = 5;

      const ops = generateOperationsFromInputEvent(
        event, baseContent, newContent, selectionStart, null, clientId, version
      );

      expect(ops).toHaveLength(1);
      expect(ops[0].type).toBe('insert');
      expect((ops[0] as InsertOperation).position).toBe(5);
      expect((ops[0] as InsertOperation).text).toBe(' world');
    });

    it('should handle drop replacing selection', () => {
      const event = createInputEvent('insertFromDrop');
      const baseContent = 'hello world';
      const newContent = 'hello universe';
      const selectionStart = 6;
      const selectionEnd = 11;

      const ops = generateOperationsFromInputEvent(
        event, baseContent, newContent, selectionStart, selectionEnd, clientId, version
      );

      expect(ops).toHaveLength(2);
      expect(ops[0].type).toBe('delete');
      expect(ops[1].type).toBe('insert');
    });
  });

  describe('insertTranspose', () => {
    it('should handle character transpose (Ctrl+T on some systems)', () => {
      // Note: Transpose is complex - same length content, just reordered characters
      // The fallback generator won't detect this as a change since lengths are equal
      // In practice, browsers may represent this differently
      const event = createInputEvent('insertTranspose');
      const baseContent = 'hello';
      const newContent = 'hello'; // Same content (transpose is a no-op in this case)
      const selectionStart = 3;

      const ops = generateOperationsFromInputEvent(
        event, baseContent, newContent, selectionStart, null, clientId, version
      );

      // No actual change detected
      expect(ops).toHaveLength(0);
    });

    it('should handle transpose that adds/removes characters', () => {
      // Some transpose implementations might change length
      const event = createInputEvent('insertTranspose');
      const baseContent = 'hello';
      const newContent = 'hellox'; // Added a character
      const selectionStart = 5;

      const ops = generateOperationsFromInputEvent(
        event, baseContent, newContent, selectionStart, null, clientId, version
      );

      expect(ops.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('insertFromYank', () => {
    it('should handle kill buffer yank (Ctrl+Y on some systems)', () => {
      const event = createInputEvent('insertFromYank');
      const baseContent = 'hello';
      const newContent = 'hello world';
      const selectionStart = 5;

      const ops = generateOperationsFromInputEvent(
        event, baseContent, newContent, selectionStart, null, clientId, version
      );

      expect(ops).toHaveLength(1);
      expect(ops[0].type).toBe('insert');
      expect((ops[0] as InsertOperation).text).toBe(' world');
    });
  });

  describe('insertFromPasteAsQuotation', () => {
    it('should handle paste as quotation', () => {
      const event = createInputEvent('insertFromPasteAsQuotation');
      const baseContent = 'hello';
      const newContent = 'hello > quoted';
      const selectionStart = 5;

      const ops = generateOperationsFromInputEvent(
        event, baseContent, newContent, selectionStart, null, clientId, version
      );

      expect(ops.length).toBeGreaterThanOrEqual(1);
      expect(ops[0].type).toBe('insert');
    });
  });

  describe('format operations (should not change content in plain text)', () => {
    it('should handle formatBold with no actual change', () => {
      const event = createInputEvent('formatBold');
      const baseContent = 'hello';
      const newContent = 'hello';
      const selectionStart = 5;

      const ops = generateOperationsFromInputEvent(
        event, baseContent, newContent, selectionStart, null, clientId, version
      );

      // No change, no operations
      expect(ops).toHaveLength(0);
    });

    it('should fall back to diff if format somehow changes content', () => {
      const event = createInputEvent('formatBold');
      const baseContent = 'hello';
      const newContent = '**hello**'; // Hypothetical markdown
      const selectionStart = 5;

      const ops = generateOperationsFromInputEvent(
        event, baseContent, newContent, selectionStart, null, clientId, version
      );

      // Should fall back and generate operations
      expect(ops.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('no event provided', () => {
    it('should fall back to selection-based diff when event is undefined', () => {
      const baseContent = 'hello';
      const newContent = 'hello world';
      const selectionStart = 5; // PRE-EDIT: cursor was at end

      const ops = generateOperationsFromInputEvent(
        undefined, baseContent, newContent, selectionStart, null, clientId, version
      );

      expect(ops.length).toBeGreaterThanOrEqual(1);
      expect(ops[0].type).toBe('insert');
      expect((ops[0] as InsertOperation).position).toBe(5);
      expect((ops[0] as InsertOperation).text).toBe(' world');
    });

    it('should handle selection replacement when event is undefined', () => {
      const baseContent = 'hello world';
      const newContent = 'hello universe';
      const selectionStart = 6;
      const selectionEnd = 11;

      const ops = generateOperationsFromInputEvent(
        undefined, baseContent, newContent, selectionStart, selectionEnd, clientId, version
      );

      expect(ops).toHaveLength(2);
      expect(ops[0].type).toBe('delete');
      expect(ops[1].type).toBe('insert');
    });
  });

  describe('no change scenarios', () => {
    it('should return empty array when content unchanged', () => {
      const event = createInputEvent('insertText', 'a');
      const baseContent = 'hello';
      const newContent = 'hello';
      const selectionStart = 5;

      const ops = generateOperationsFromInputEvent(
        event, baseContent, newContent, selectionStart, null, clientId, version
      );

      expect(ops).toHaveLength(0);
    });
  });

  describe('unknown input types', () => {
    it('should fall back for unknown input type', () => {
      const event = createInputEvent('unknownInputType');
      const baseContent = 'hello';
      const newContent = 'hello world';
      const selectionStart = 5; // PRE-EDIT cursor

      const ops = generateOperationsFromInputEvent(
        event, baseContent, newContent, selectionStart, null, clientId, version
      );

      expect(ops.length).toBeGreaterThanOrEqual(1);
    });

    it('should handle historyUndo', () => {
      const event = createInputEvent('historyUndo');
      const baseContent = 'hello world';
      const newContent = 'hello';
      const selectionStart = 11; // PRE-EDIT: cursor was at end

      const ops = generateOperationsFromInputEvent(
        event, baseContent, newContent, selectionStart, null, clientId, version
      );

      // Falls back to selection-based diff
      expect(ops.length).toBeGreaterThanOrEqual(1);
    });

    it('should handle historyRedo', () => {
      const event = createInputEvent('historyRedo');
      const baseContent = 'hello';
      const newContent = 'hello world';
      const selectionStart = 5; // PRE-EDIT cursor

      const ops = generateOperationsFromInputEvent(
        event, baseContent, newContent, selectionStart, null, clientId, version
      );

      expect(ops.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('clientId and version', () => {
    it('should set correct clientId on operations', () => {
      const event = createInputEvent('insertText', 'a');
      const customClientId = 'custom-client-123';

      const ops = generateOperationsFromInputEvent(
        event, 'hello', 'hellao', 4, null, customClientId, version
      );

      expect(ops[0].clientId).toBe(customClientId);
    });

    it('should set correct version on operations', () => {
      const event = createInputEvent('insertText', 'a');
      const customVersion = 42;

      const ops = generateOperationsFromInputEvent(
        event, 'hello', 'hellao', 4, null, clientId, customVersion
      );

      expect(ops[0].version).toBe(customVersion);
    });
  });

  describe('cursor position handling', () => {
    it('should correctly calculate position for insert at various cursor positions', () => {
      // PRE-EDIT cursor positions: insert happens AT the cursor position
      const testCases = [
        { cursorPos: 0, text: 'X', baseContent: '', expected: 0 },
        { cursorPos: 2, text: 'XYZ', baseContent: 'ab', expected: 2 },
        { cursorPos: 5, text: 'ab', baseContent: 'hello', expected: 5 },
      ];

      for (const { cursorPos, text, baseContent, expected } of testCases) {
        const event = createInputEvent('insertText', text);
        const newContent = baseContent.slice(0, cursorPos) + text + baseContent.slice(cursorPos);
        const ops = generateOperationsFromInputEvent(
          event, baseContent, newContent, cursorPos, null, clientId, version
        );

        if (ops.length > 0 && ops[0].type === 'insert') {
          expect((ops[0] as InsertOperation).position).toBe(expected);
        }
      }
    });
  });
});

describe('selection-based fallback generator', () => {
  const clientId = 'test-client';
  const version = 1;

  it('should handle simple addition', () => {
    // PRE-EDIT: cursor was at position 5 (end of "hello")
    const ops = generateOperationsFromInputEvent(
      undefined, 'hello', 'hello world', 5, null, clientId, version
    );

    expect(ops).toHaveLength(1);
    expect(ops[0].type).toBe('insert');
    expect((ops[0] as InsertOperation).position).toBe(5);
    expect((ops[0] as InsertOperation).text).toBe(' world');
  });

  it('should handle simple deletion', () => {
    // PRE-EDIT: cursor was at position 11 (end), backspace deleted " world"
    const ops = generateOperationsFromInputEvent(
      undefined, 'hello world', 'hello', 11, null, clientId, version
    );

    expect(ops).toHaveLength(1);
    expect(ops[0].type).toBe('delete');
    expect((ops[0] as DeleteOperation).position).toBe(5); // cursor - deletedLength
    expect((ops[0] as DeleteOperation).length).toBe(6);
  });

  it('should handle no change', () => {
    const ops = generateOperationsFromInputEvent(
      undefined, 'hello', 'hello', 5, null, clientId, version
    );

    expect(ops).toHaveLength(0);
  });

  it('should handle selection replacement', () => {
    // "world" was selected (positions 6-11) and replaced with "universe"
    const ops = generateOperationsFromInputEvent(
      undefined, 'hello world', 'hello universe', 6, 11, clientId, version
    );

    expect(ops).toHaveLength(2);
    expect(ops[0].type).toBe('delete');
    expect((ops[0] as DeleteOperation).position).toBe(6);
    expect((ops[0] as DeleteOperation).length).toBe(5);
    expect(ops[1].type).toBe('insert');
    expect((ops[1] as InsertOperation).position).toBe(6);
    expect((ops[1] as InsertOperation).text).toBe('universe');
  });
});
