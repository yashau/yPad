// Generate operations from browser InputEvent for accurate position tracking
// This avoids the issues with fast-diff which doesn't know cursor position

import type { Operation, InsertOperation, DeleteOperation } from '../../../src/ot/types';

/**
 * Generate operations from an InputEvent
 * Uses the browser's native input data to get exact cursor position and changes
 *
 * CRITICAL: cursorPosition must be the PRE-EDIT cursor position (captured in beforeinput),
 * not the post-edit position! This is essential for accurate OT position calculations.
 */
export function generateOperationsFromInputEvent(
  event: InputEvent | undefined,
  baseContent: string,
  newContent: string,
  cursorPosition: number, // PRE-EDIT cursor position
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
  // NOTE: cursorPosition is the PRE-EDIT position (before DOM was modified)
  if (inputType === 'insertText' && data) {
    // Simple text insertion - insert at where the cursor was
    operations.push({
      type: 'insert',
      position: cursorPosition,
      text: data,
      clientId,
      version,
    } as InsertOperation);
  } else if (inputType === 'insertLineBreak' || inputType === 'insertParagraph') {
    // Enter key pressed - insert newline at cursor position
    operations.push({
      type: 'insert',
      position: cursorPosition,
      text: '\n',
      clientId,
      version,
    } as InsertOperation);
  } else if (inputType === 'deleteContentBackward') {
    // Backspace - deletion happened BEFORE the cursor position
    const deletedLength = Math.abs(lengthDiff);
    if (deletedLength > 0) {
      operations.push({
        type: 'delete',
        position: cursorPosition - deletedLength,
        length: deletedLength,
        clientId,
        version,
      } as DeleteOperation);
    }
  } else if (inputType === 'deleteContentForward') {
    // Delete key - deletion happened AT the cursor position
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
    // These typically delete content before cursor (like Ctrl+Backspace)
    const deletedLength = Math.abs(lengthDiff);
    if (deletedLength > 0) {
      operations.push({
        type: 'delete',
        position: cursorPosition - deletedLength,
        length: deletedLength,
        clientId,
        version,
      } as DeleteOperation);
    }
  } else if (inputType === 'insertFromPaste') {
    // Paste operation - insert at cursor position
    return generateOperationsFromCursor(baseContent, newContent, cursorPosition, clientId, version);
  } else {
    // Unknown input type - fall back to cursor-based diff
    return generateOperationsFromCursor(baseContent, newContent, cursorPosition, clientId, version);
  }

  return operations;
}

/**
 * Fallback: Generate operations by comparing strings at cursor position
 * This is used when InputEvent data is not available (e.g., paste operations)
 *
 * cursorPosition is the PRE-EDIT cursor position
 */
function generateOperationsFromCursor(
  oldContent: string,
  newContent: string,
  cursorPosition: number, // PRE-EDIT cursor position
  clientId: string,
  version: number
): Operation[] {
  const operations: Operation[] = [];

  // Calculate the change at the cursor position
  const oldLength = oldContent.length;
  const newLength = newContent.length;
  const lengthDiff = newLength - oldLength;

  if (lengthDiff > 0) {
    // Content was added at the pre-edit cursor position
    const insertedText = newContent.substring(cursorPosition, cursorPosition + lengthDiff);
    operations.push({
      type: 'insert',
      position: cursorPosition,
      text: insertedText,
      clientId,
      version,
    } as InsertOperation);
  } else if (lengthDiff < 0) {
    // Content was deleted - assume deletion happened before cursor (like backspace)
    const deletedLength = -lengthDiff;
    operations.push({
      type: 'delete',
      position: cursorPosition - deletedLength,
      length: deletedLength,
      clientId,
      version,
    } as DeleteOperation);
  }

  return operations;
}
