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
