/**
 * @fileoverview Apply OT operations to document content.
 *
 * Provides functions to execute insert and delete operations on strings.
 * Handles edge cases like out-of-bounds positions by clamping to valid ranges.
 */

import type { Operation } from './types';

/**
 * Applies a single operation to document content.
 *
 * @param content - Current document content
 * @param operation - The operation to apply
 * @returns New content after applying the operation
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
 * Applies multiple operations to document content in sequence.
 *
 * @param content - Initial document content
 * @param operations - Array of operations to apply in order
 * @returns Final content after applying all operations
 */
export function applyOperations(content: string, operations: Operation[]): string {
  let result = content;
  for (const operation of operations) {
    result = applyOperation(result, operation);
  }
  return result;
}

/**
 * Inserts text at a position in the content.
 * Position is clamped to valid range to handle stale positions from concurrent edits.
 */
function applyInsert(content: string, position: number, text: string): string {
  const safePosition = Math.max(0, Math.min(position, content.length));
  return content.slice(0, safePosition) + text + content.slice(safePosition);
}

/**
 * Deletes characters starting at a position.
 * Position and length are clamped to valid ranges to handle concurrent edits.
 */
function applyDelete(content: string, position: number, length: number): string {
  const safePosition = Math.max(0, Math.min(position, content.length));
  const safeEnd = Math.min(safePosition + length, content.length);
  const safeLength = safeEnd - safePosition;

  if (safeLength <= 0) {
    return content;
  }

  return content.slice(0, safePosition) + content.slice(safePosition + safeLength);
}
