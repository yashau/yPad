// Generate operations from browser InputEvent for accurate position tracking
// This avoids the issues with fast-diff which doesn't know cursor position
//
// Complete list of InputEvent.inputType values (from W3C Input Events Level 2):
// https://www.w3.org/TR/input-events-2/
//
// INSERTION TYPES:
// - insertText: insert typed plain text
// - insertReplacementText: insert via spell checker, auto-correct, or writing suggestions
// - insertLineBreak: insert a line break (Shift+Enter)
// - insertParagraph: insert a paragraph break (Enter)
// - insertOrderedList: insert a numbered list
// - insertUnorderedList: insert a bulleted list
// - insertHorizontalRule: insert a horizontal rule
// - insertFromYank: replace selection with kill buffer content
// - insertFromDrop: insert content by means of drop
// - insertFromPaste: paste content from clipboard
// - insertFromPasteAsQuotation: paste content from clipboard as quotation
// - insertTranspose: transpose the last two grapheme clusters
// - insertCompositionText: replace the current composition string (IME)
// - insertLink: insert a link
//
// DELETION TYPES:
// - deleteWordBackward: delete word before caret (Ctrl+Backspace)
// - deleteWordForward: delete word after caret (Ctrl+Delete)
// - deleteSoftLineBackward: delete to nearest visual line break before caret
// - deleteSoftLineForward: delete to nearest visual line break after caret
// - deleteEntireSoftLine: delete entire visual line
// - deleteHardLineBackward: delete to nearest block/br element before caret
// - deleteHardLineForward: delete to nearest block/br element after caret
// - deleteByDrag: remove content from the DOM by means of drag
// - deleteByCut: remove the current selection as part of a cut (Ctrl+X)
// - deleteContent: delete selection without specifying direction
// - deleteContentBackward: delete content before caret (Backspace)
// - deleteContentForward: delete content after caret (Delete key)
//
// HISTORY TYPES:
// - historyUndo: undo the last editing action (Ctrl+Z)
// - historyRedo: redo the last undone editing action (Ctrl+Y / Ctrl+Shift+Z)
//
// FORMAT TYPES (not applicable for plain text editor):
// - formatBold, formatItalic, formatUnderline, formatStrikeThrough,
// - formatSuperscript, formatSubscript, formatJustify*, formatIndent,
// - formatOutdent, formatRemove, formatSetBlockTextDirection,
// - formatSetInlineTextDirection, formatBackColor, formatFontColor, formatFontName
//
// NON-INPUT OPERATIONS (do not trigger input events):
// - Arrow keys, Home, End, PageUp, PageDown (navigation only)
// - Mouse clicks and selections (cursor/selection change only)
// - Tab key: handled via keydown event in App.svelte, inserts spaces as insertText

import type { Operation, InsertOperation, DeleteOperation } from '../../../src/ot/types';

/**
 * Generate operations from an InputEvent
 * Uses the browser's native input data to get exact cursor position and changes
 *
 * CRITICAL: selectionStart must be the PRE-EDIT selection start (captured in beforeinput),
 * not the post-edit position! This is essential for accurate OT position calculations.
 *
 * @param event - The InputEvent from the browser
 * @param baseContent - Content before the edit
 * @param newContent - Content after the edit
 * @param selectionStart - PRE-EDIT selection start position
 * @param selectionEnd - PRE-EDIT selection end position (null if no selection, just a cursor)
 * @param clientId - Client identifier
 * @param version - Operation version
 */
export function generateOperationsFromInputEvent(
  event: InputEvent | undefined,
  baseContent: string,
  newContent: string,
  selectionStart: number, // PRE-EDIT selection start
  selectionEnd: number | null, // PRE-EDIT selection end (null if no selection)
  clientId: string,
  version: number
): Operation[] {
  const operations: Operation[] = [];

  // Early return if content hasn't actually changed
  if (baseContent === newContent) {
    return operations;
  }

  // Calculate the actual change between base and new content
  const lengthDiff = newContent.length - baseContent.length;

  // If there was a selection, we need to handle replacement (delete + insert)
  const hadSelection = selectionEnd !== null && selectionEnd > selectionStart;
  const selectedLength = hadSelection ? (selectionEnd - selectionStart) : 0;

  // If no event data, fall back to comparing strings at cursor position
  if (!event) {
    return generateOperationsFromSelection(baseContent, newContent, selectionStart, selectionEnd, clientId, version);
  }

  const inputType = event.inputType;
  const data = event.data;

  // ========== INSERTION OPERATIONS ==========

  // insertText: Regular text typing
  if (inputType === 'insertText') {
    if (data) {
      return handleInsertWithData(data, selectionStart, selectedLength, hadSelection, clientId, version);
    } else {
      // No data provided, fall back to diff
      return generateOperationsFromSelection(baseContent, newContent, selectionStart, selectionEnd, clientId, version);
    }
  }

  // insertLineBreak (Shift+Enter) and insertParagraph (Enter): Insert newline
  if (inputType === 'insertLineBreak' || inputType === 'insertParagraph') {
    return handleInsertWithData('\n', selectionStart, selectedLength, hadSelection, clientId, version);
  }

  // insertReplacementText: Autocorrect, spell check, writing suggestions
  // insertCompositionText: IME composition (Chinese, Japanese, Korean input)
  if (inputType === 'insertReplacementText' || inputType === 'insertCompositionText') {
    // These replace selected text - first delete selection, then insert new text
    if (hadSelection) {
      operations.push({
        type: 'delete',
        position: selectionStart,
        length: selectedLength,
        clientId,
        version,
      } as DeleteOperation);
    }
    // Calculate inserted text from content difference
    const insertedLength = lengthDiff + selectedLength;
    if (insertedLength > 0) {
      const insertedText = newContent.substring(selectionStart, selectionStart + insertedLength);
      operations.push({
        type: 'insert',
        position: selectionStart,
        text: insertedText,
        clientId,
        version: version + (hadSelection ? 1 : 0),
      } as InsertOperation);
    }
    return operations;
  }

  // insertFromPaste: Paste from clipboard (Ctrl+V)
  // insertFromDrop: Drag and drop
  // insertFromYank: Kill buffer (Ctrl+Y on some systems)
  // insertFromPasteAsQuotation: Paste as quote
  // insertTranspose: Transpose characters (Ctrl+T on some systems)
  // insertLink: Insert hyperlink
  // insertHorizontalRule, insertOrderedList, insertUnorderedList: Rich text (use fallback)
  if (inputType.startsWith('insert')) {
    // Use selection-based diff for all other insert operations
    return generateOperationsFromSelection(baseContent, newContent, selectionStart, selectionEnd, clientId, version);
  }

  // ========== DELETION OPERATIONS ==========

  // deleteContentBackward: Backspace key
  if (inputType === 'deleteContentBackward') {
    if (hadSelection) {
      // Delete the selection
      operations.push({
        type: 'delete',
        position: selectionStart,
        length: selectedLength,
        clientId,
        version,
      } as DeleteOperation);
    } else {
      // Delete character(s) BEFORE cursor
      const deletedLength = Math.abs(lengthDiff);
      if (deletedLength > 0) {
        operations.push({
          type: 'delete',
          position: selectionStart - deletedLength,
          length: deletedLength,
          clientId,
          version,
        } as DeleteOperation);
      }
    }
    return operations;
  }

  // deleteContentForward: Delete key
  if (inputType === 'deleteContentForward') {
    if (hadSelection) {
      // Delete the selection
      operations.push({
        type: 'delete',
        position: selectionStart,
        length: selectedLength,
        clientId,
        version,
      } as DeleteOperation);
    } else {
      // Delete character(s) AT cursor position
      const deletedLength = Math.abs(lengthDiff);
      if (deletedLength > 0) {
        operations.push({
          type: 'delete',
          position: selectionStart,
          length: deletedLength,
          clientId,
          version,
        } as DeleteOperation);
      }
    }
    return operations;
  }

  // deleteWordBackward: Ctrl+Backspace (delete word before cursor)
  // deleteSoftLineBackward: Delete to visual line start
  // deleteHardLineBackward: Delete to block element start
  if (inputType === 'deleteWordBackward' ||
      inputType === 'deleteSoftLineBackward' ||
      inputType === 'deleteHardLineBackward') {
    if (hadSelection) {
      operations.push({
        type: 'delete',
        position: selectionStart,
        length: selectedLength,
        clientId,
        version,
      } as DeleteOperation);
    } else {
      // Deletion happened BEFORE cursor position
      const deletedLength = Math.abs(lengthDiff);
      if (deletedLength > 0) {
        operations.push({
          type: 'delete',
          position: selectionStart - deletedLength,
          length: deletedLength,
          clientId,
          version,
        } as DeleteOperation);
      }
    }
    return operations;
  }

  // deleteWordForward: Ctrl+Delete (delete word after cursor)
  // deleteSoftLineForward: Delete to visual line end
  // deleteHardLineForward: Delete to block element end
  if (inputType === 'deleteWordForward' ||
      inputType === 'deleteSoftLineForward' ||
      inputType === 'deleteHardLineForward') {
    if (hadSelection) {
      operations.push({
        type: 'delete',
        position: selectionStart,
        length: selectedLength,
        clientId,
        version,
      } as DeleteOperation);
    } else {
      // Deletion happened AT cursor position (forward)
      const deletedLength = Math.abs(lengthDiff);
      if (deletedLength > 0) {
        operations.push({
          type: 'delete',
          position: selectionStart,
          length: deletedLength,
          clientId,
          version,
        } as DeleteOperation);
      }
    }
    return operations;
  }

  // deleteEntireSoftLine: Delete entire visual line
  // deleteContent: Delete selection (direction unspecified)
  // deleteByCut: Cut selection (Ctrl+X)
  // deleteByDrag: Drag to delete
  if (inputType === 'deleteEntireSoftLine' ||
      inputType === 'deleteContent' ||
      inputType === 'deleteByCut' ||
      inputType === 'deleteByDrag') {
    if (hadSelection) {
      operations.push({
        type: 'delete',
        position: selectionStart,
        length: selectedLength,
        clientId,
        version,
      } as DeleteOperation);
      return operations;
    }
    // For non-selection cases, use diff-based approach
    return generateOperationsFromSelection(baseContent, newContent, selectionStart, selectionEnd, clientId, version);
  }

  // Catch-all for any other delete* types
  if (inputType.startsWith('delete')) {
    if (hadSelection) {
      operations.push({
        type: 'delete',
        position: selectionStart,
        length: selectedLength,
        clientId,
        version,
      } as DeleteOperation);
    } else {
      // Assume backward deletion (most common)
      const deletedLength = Math.abs(lengthDiff);
      if (deletedLength > 0) {
        operations.push({
          type: 'delete',
          position: selectionStart - deletedLength,
          length: deletedLength,
          clientId,
          version,
        } as DeleteOperation);
      }
    }
    return operations;
  }

  // ========== HISTORY OPERATIONS ==========

  // historyUndo (Ctrl+Z) and historyRedo (Ctrl+Y): Use diff-based approach
  // These can result in arbitrary content changes
  if (inputType === 'historyUndo' || inputType === 'historyRedo') {
    return generateOperationsFromSelection(baseContent, newContent, selectionStart, selectionEnd, clientId, version);
  }

  // ========== FORMAT OPERATIONS ==========

  // Format operations (formatBold, formatItalic, etc.) don't apply to plain text
  // They shouldn't change content in a plain text editor, but if they do, use fallback
  if (inputType.startsWith('format')) {
    return generateOperationsFromSelection(baseContent, newContent, selectionStart, selectionEnd, clientId, version);
  }

  // ========== FALLBACK ==========

  // Unknown input type - use selection-based diff
  return generateOperationsFromSelection(baseContent, newContent, selectionStart, selectionEnd, clientId, version);
}

/**
 * Helper: Handle insertion with known data text
 */
function handleInsertWithData(
  text: string,
  selectionStart: number,
  selectedLength: number,
  hadSelection: boolean,
  clientId: string,
  version: number
): Operation[] {
  const operations: Operation[] = [];

  if (hadSelection) {
    // Delete the selection first
    operations.push({
      type: 'delete',
      position: selectionStart,
      length: selectedLength,
      clientId,
      version,
    } as DeleteOperation);
    // Then insert the new text
    operations.push({
      type: 'insert',
      position: selectionStart,
      text: text,
      clientId,
      version: version + 1,
    } as InsertOperation);
  } else {
    // Simple text insertion at cursor position
    operations.push({
      type: 'insert',
      position: selectionStart,
      text: text,
      clientId,
      version,
    } as InsertOperation);
  }

  return operations;
}

/**
 * Fallback: Generate operations by comparing strings at selection position
 * This is used when InputEvent data is not available (e.g., paste, undo/redo)
 *
 * selectionStart is the PRE-EDIT selection start
 * selectionEnd is the PRE-EDIT selection end (null if no selection)
 */
function generateOperationsFromSelection(
  oldContent: string,
  newContent: string,
  selectionStart: number,
  selectionEnd: number | null,
  clientId: string,
  version: number
): Operation[] {
  const operations: Operation[] = [];

  const hadSelection = selectionEnd !== null && selectionEnd > selectionStart;
  const selectedLength = hadSelection ? (selectionEnd - selectionStart) : 0;

  // Calculate the change
  const lengthDiff = newContent.length - oldContent.length;

  if (hadSelection) {
    // If there was a selection, first delete it
    operations.push({
      type: 'delete',
      position: selectionStart,
      length: selectedLength,
      clientId,
      version,
    } as DeleteOperation);

    // Then calculate what was inserted
    const insertedLength = lengthDiff + selectedLength;
    if (insertedLength > 0) {
      const insertedText = newContent.substring(selectionStart, selectionStart + insertedLength);
      operations.push({
        type: 'insert',
        position: selectionStart,
        text: insertedText,
        clientId,
        version: version + 1,
      } as InsertOperation);
    }
  } else {
    // No selection - simple insert or delete
    if (lengthDiff > 0) {
      // Content was added at the pre-edit cursor position
      const insertedText = newContent.substring(selectionStart, selectionStart + lengthDiff);
      operations.push({
        type: 'insert',
        position: selectionStart,
        text: insertedText,
        clientId,
        version,
      } as InsertOperation);
    } else if (lengthDiff < 0) {
      // Content was deleted - assume deletion happened before cursor (like backspace)
      const deletedLength = -lengthDiff;
      operations.push({
        type: 'delete',
        position: selectionStart - deletedLength,
        length: deletedLength,
        clientId,
        version,
      } as DeleteOperation);
    }
  }

  return operations;
}
