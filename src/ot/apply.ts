// Apply operations to strings

import type { Operation } from './types';

/**
 * Apply an operation to a string
 * Returns the transformed string
 */
export function applyOperation(content: string, operation: Operation): string {
  if (operation.type === 'insert') {
    return applyInsert(content, operation.position, operation.text);
  } else if (operation.type === 'delete') {
    return applyDelete(content, operation.position, operation.length);
  }

  return content;
}

/**
 * Apply multiple operations to a string in sequence
 */
export function applyOperations(content: string, operations: Operation[]): string {
  let result = content;
  for (const operation of operations) {
    result = applyOperation(result, operation);
  }
  return result;
}

/**
 * Insert text at a position
 */
function applyInsert(content: string, position: number, text: string): string {
  // Clamp position to valid range
  const safePosition = Math.max(0, Math.min(position, content.length));

  return content.slice(0, safePosition) + text + content.slice(safePosition);
}

/**
 * Delete text at a position
 */
function applyDelete(content: string, position: number, length: number): string {
  // Clamp position and length to valid range
  const safePosition = Math.max(0, Math.min(position, content.length));
  const safeEnd = Math.min(safePosition + length, content.length);
  const safeLength = safeEnd - safePosition;

  if (safeLength <= 0) {
    return content;
  }

  return content.slice(0, safePosition) + content.slice(safePosition + safeLength);
}

/**
 * Apply the inverse of an operation to undo it
 * Insert becomes delete, delete becomes insert (requires knowing deleted text)
 * Note: For delete operations, we need to know what text was deleted.
 * Since we don't store that, this is a best-effort approach that may not
 * perfectly undo deletes. For inserts, it works perfectly.
 */
export function applyInverse(content: string, operation: Operation): string {
  if (operation.type === 'insert') {
    // Inverse of insert is delete at the same position with the same length
    const deleteLength = operation.text.length;
    const safePosition = Math.max(0, Math.min(operation.position, content.length));
    const safeEnd = Math.min(safePosition + deleteLength, content.length);
    return content.slice(0, safePosition) + content.slice(safeEnd);
  } else if (operation.type === 'delete') {
    // Inverse of delete is insert - but we don't know the deleted text!
    // This is a limitation. For rebasing purposes, we need to track deleted text.
    // For now, return content unchanged for deletes (this will cause issues).
    // TODO: Store deleted text in delete operations for proper undo support.
    console.warn('applyInverse: Cannot undo delete operation without stored text');
    return content;
  }
  return content;
}
