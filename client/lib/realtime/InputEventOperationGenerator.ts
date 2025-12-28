// Generate operations from browser InputEvent for accurate position tracking
// This avoids the issues with fast-diff which doesn't know cursor position

import type { Operation, InsertOperation, DeleteOperation } from '../../../src/ot/types';

/**
 * Generate operations from an InputEvent
 * Uses the browser's native input data to get exact cursor position and changes
 *
 * CRITICAL: All positions must be relative to baseContent (oldContent parameter),
 * not the current DOM content!
 */
export function generateOperationsFromInputEvent(
  event: InputEvent | undefined,
  baseContent: string,
  newContent: string,
  cursorPosition: number,
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

  // If no event data, fall back to comparing strings at cursor position
  if (!event) {
    return generateOperationsFromCursor(baseContent, newContent, cursorPosition, clientId, version);
  }

  const inputType = event.inputType;
  const data = event.data;

  // Handle different input types
  if (inputType === 'insertText' && data) {
    // Simple text insertion
    // cursorPosition is AFTER the insert in newContent, so we need to subtract the inserted length
    operations.push({
      type: 'insert',
      position: cursorPosition - data.length,
      text: data,
      clientId,
      version,
    } as InsertOperation);
  } else if (inputType === 'insertLineBreak' || inputType === 'insertParagraph') {
    // Enter key pressed
    operations.push({
      type: 'insert',
      position: cursorPosition - 1,
      text: '\n',
      clientId,
      version,
    } as InsertOperation);
  } else if (inputType === 'deleteContentBackward') {
    // Backspace - cursor is at delete position in newContent
    // But we need position in baseContent, which is cursor position in newContent
    // since the deleted character was BEFORE the cursor
    const deletedLength = Math.abs(lengthDiff);
    if (deletedLength > 0) {
      operations.push({
        type: 'delete',
        position: cursorPosition, // Cursor is already at the right position in baseContent frame
        length: deletedLength,
        clientId,
        version,
      } as DeleteOperation);
    }
  } else if (inputType === 'deleteContentForward') {
    // Delete key - deleted character was AT cursor position
    const deletedLength = Math.abs(lengthDiff);
    if (deletedLength > 0) {
      operations.push({
        type: 'delete',
        position: cursorPosition,
        length: deletedLength,
        clientId,
        version,
      } as DeleteOperation);
    }
  } else if (inputType.startsWith('delete')) {
    // Other delete operations (word, line, etc.)
    const deletedLength = Math.abs(lengthDiff);
    if (deletedLength > 0) {
      operations.push({
        type: 'delete',
        position: cursorPosition,
        length: deletedLength,
        clientId,
        version,
      } as DeleteOperation);
    }
  } else if (inputType === 'insertFromPaste') {
    // Paste operation - might include deletes + inserts
    return generateOperationsFromCursor(baseContent, newContent, cursorPosition, clientId, version);
  } else {
    // Unknown input type - fall back to cursor-based diff
    return generateOperationsFromCursor(baseContent, newContent, cursorPosition, clientId, version);
  }

  return operations;
}

/**
 * Fallback: Generate operations by comparing strings at cursor position
 * This is used when InputEvent data is not available
 */
function generateOperationsFromCursor(
  oldContent: string,
  newContent: string,
  cursorPosition: number,
  clientId: string,
  version: number
): Operation[] {
  const operations: Operation[] = [];

  // Calculate the change at the cursor position
  const oldLength = oldContent.length;
  const newLength = newContent.length;
  const lengthDiff = newLength - oldLength;

  if (lengthDiff > 0) {
    // Content was added
    const insertedText = newContent.substring(cursorPosition - lengthDiff, cursorPosition);
    operations.push({
      type: 'insert',
      position: cursorPosition - lengthDiff,
      text: insertedText,
      clientId,
      version,
    } as InsertOperation);
  } else if (lengthDiff < 0) {
    // Content was deleted
    operations.push({
      type: 'delete',
      position: cursorPosition,
      length: -lengthDiff,
      clientId,
      version,
    } as DeleteOperation);
  }

  return operations;
}
