/**
 * @fileoverview Operational Transform (OT) algorithm for concurrent editing.
 *
 * Implements transformation functions that enable multiple users to edit the same
 * document simultaneously while maintaining consistency. The core invariant:
 *
 *   apply(apply(doc, op1), transform(op2, op1)) = apply(apply(doc, op2), transform(op1, op2))
 *
 * This means applying op1 then transformed-op2 yields the same result as
 * applying op2 then transformed-op1.
 */

import type { Operation, InsertOperation, DeleteOperation } from './types';

/**
 * Transform two concurrent operations (created at the same base version)
 * Returns transformed versions [op1', op2'] such that:
 * apply(apply(doc, op1), op2') = apply(apply(doc, op2), op1')
 */
export function transform(op1: Operation, op2: Operation): [Operation, Operation] {
  if (op1.type === 'insert' && op2.type === 'insert') {
    return transformInsertInsert(op1, op2);
  } else if (op1.type === 'insert' && op2.type === 'delete') {
    return transformInsertDelete(op1, op2);
  } else if (op1.type === 'delete' && op2.type === 'insert') {
    const [op2Prime, op1Prime] = transformInsertDelete(op2, op1);
    return [op1Prime, op2Prime];
  } else if (op1.type === 'delete' && op2.type === 'delete') {
    return transformDeleteDelete(op1, op2);
  }

  // Should never reach here with proper types
  return [op1, op2];
}

/**
 * Transform two concurrent Insert operations
 *
 * When two users insert text at different positions concurrently, we need to adjust
 * their positions so that both inserts can be applied without conflict.
 *
 * @param op1 - The first insert operation
 * @param op2 - The second insert operation
 * @returns Tuple of [transformed op1, transformed op2]
 *
 * @example
 * // User A inserts "hi" at position 5
 * // User B inserts "bye" at position 10
 * // After transform: A still at 5, B now at 12 (10 + "hi".length)
 *
 * @example
 * // User A and B both insert at position 5
 * // Use clientId for deterministic ordering (prevents tie-breaking conflicts)
 * // If A.clientId < B.clientId: A at 5, B at 7 (5 + "hi".length)
 */
function transformInsertInsert(
  op1: InsertOperation,
  op2: InsertOperation
): [InsertOperation, InsertOperation] {
  const op1Prime = { ...op1 };
  const op2Prime = { ...op2 };

  if (op1.position < op2.position) {
    // op1 is before op2, shift op2 position
    op2Prime.position = op2.position + op1.text.length;
  } else if (op1.position > op2.position) {
    // op2 is before op1, shift op1 position
    op1Prime.position = op1.position + op2.text.length;
  } else {
    // Same position - use clientId for deterministic ordering
    if (op1.clientId < op2.clientId) {
      op2Prime.position = op2.position + op1.text.length;
    } else {
      op1Prime.position = op1.position + op2.text.length;
    }
  }

  return [op1Prime, op2Prime];
}

/**
 * Transform Insert vs Delete operations
 *
 * When an insert and delete happen concurrently, we need to adjust their positions
 * to maintain document consistency. Three cases to handle:
 * 1. Insert before delete: shift delete position forward
 * 2. Insert after delete: shift insert position backward
 * 3. Insert inside delete range: insert at delete start, adjust delete
 *
 * @param insert - The insert operation
 * @param del - The delete operation
 * @returns Tuple of [transformed insert, transformed delete]
 *
 * @example
 * // User A inserts "hi" at position 5
 * // User B deletes 3 chars at position 10
 * // After transform: insert still at 5, delete now at 12 (10 + "hi".length)
 *
 * @example
 * // User A inserts "x" at position 8
 * // User B deletes chars 5-10 (position 5, length 5)
 * // Insert is inside delete range
 * // After transform: insert at 5, delete at 6 (5 + "x".length)
 */
function transformInsertDelete(
  insert: InsertOperation,
  del: DeleteOperation
): [InsertOperation, DeleteOperation] {
  const insertPrime = { ...insert };
  const delPrime = { ...del };

  const deleteEnd = del.position + del.length;

  if (insert.position <= del.position) {
    // Insert is before or at delete start, shift delete position
    delPrime.position = del.position + insert.text.length;
  } else if (insert.position >= deleteEnd) {
    // Insert is after delete, shift insert position back
    insertPrime.position = insert.position - del.length;
  } else {
    // Insert is inside delete range
    // Keep insert at delete start, adjust delete to be after insert
    insertPrime.position = del.position;
    delPrime.position = del.position + insert.text.length;
  }

  return [insertPrime, delPrime];
}

/**
 * Transform two concurrent Delete operations
 *
 * This is the most complex transformation case, handling multiple overlap scenarios:
 * 1. No overlap: adjust positions based on which delete comes first
 * 2. Complete overlap: both delete same range - make both no-ops (length 0)
 * 3. Partial overlap: adjust positions and lengths to handle overlapping ranges
 *
 * @param op1 - The first delete operation
 * @param op2 - The second delete operation
 * @returns Tuple of [transformed op1, transformed op2]
 *
 * @example
 * // No overlap: User A deletes chars 5-8, User B deletes chars 10-13
 * // After transform: A deletes 5-8, B deletes 7-10 (shifted back by 3)
 *
 * @example
 * // Complete overlap: Both users delete chars 5-10
 * // After transform: Both operations become no-ops (length 0)
 *
 * @example
 * // Partial overlap: A deletes 5-10, B deletes 7-12
 * // After transform: A deletes 5-7 (partial), B deletes 5-7 (remaining part)
 */
function transformDeleteDelete(
  op1: DeleteOperation,
  op2: DeleteOperation
): [DeleteOperation, DeleteOperation] {
  const op1Prime = { ...op1 };
  const op2Prime = { ...op2 };

  const op1End = op1.position + op1.length;
  const op2End = op2.position + op2.length;

  // Case 1: No overlap
  if (op1End <= op2.position) {
    // op1 is completely before op2
    op2Prime.position = op2.position - op1.length;
  } else if (op2End <= op1.position) {
    // op2 is completely before op1
    op1Prime.position = op1.position - op2.length;
  }
  // Case 2: Complete overlap - same position and length
  else if (op1.position === op2.position && op1.length === op2.length) {
    // Both delete the same range - make both no-ops
    op1Prime.length = 0;
    op2Prime.length = 0;
  }
  // Case 3: Partial overlap
  else if (op1.position === op2.position) {
    // Same start position
    if (op1.length < op2.length) {
      // op1 deletes less, op2 continues after
      op1Prime.length = 0;
      op2Prime.length = op2.length - op1.length;
    } else {
      // op2 deletes less, op1 continues after
      op1Prime.length = op1.length - op2.length;
      op2Prime.length = 0;
    }
  } else if (op1.position < op2.position) {
    // op1 starts before op2
    if (op1End <= op2End) {
      // op1 ends before or at op2 end
      const overlap = op1End - op2.position;
      op2Prime.position = op1.position;
      op2Prime.length = op2.length - overlap;
      op1Prime.length = op1.length - overlap;
    } else {
      // op1 completely contains op2
      op1Prime.length = op1.length - op2.length;
      op2Prime.length = 0;
    }
  } else {
    // op2 starts before op1
    if (op2End <= op1End) {
      // op2 ends before or at op1 end
      const overlap = op2End - op1.position;
      op1Prime.position = op2.position;
      op1Prime.length = op1.length - overlap;
      op2Prime.length = op2.length - overlap;
    } else {
      // op2 completely contains op1
      op2Prime.length = op2.length - op1.length;
      op1Prime.length = 0;
    }
  }

  return [op1Prime, op2Prime];
}

/**
 * Transform cursor position based on an operation
 *
 * Adjusts a cursor position to account for a concurrent edit operation.
 * This ensures that cursors remain at the correct logical position even
 * when other users modify the document.
 *
 * @param cursor - The current cursor position (character offset from start)
 * @param operation - The operation to transform the cursor against
 * @returns The adjusted cursor position
 *
 * @example
 * // Cursor at position 10, someone inserts "hi" at position 5
 * // Result: cursor moves to position 12 (10 + 2)
 *
 * @example
 * // Cursor at position 10, someone deletes 3 chars at position 5-8
 * // Result: cursor moves to position 7 (10 - 3)
 *
 * @example
 * // Cursor at position 7, someone deletes chars 5-10 (cursor inside delete)
 * // Result: cursor moves to position 5 (the delete start)
 */
export function transformCursorPosition(cursor: number, operation: Operation): number {
  if (operation.type === 'insert') {
    // If insert is at or before cursor, shift cursor right
    return operation.position <= cursor ? cursor + operation.text.length : cursor;
  } else if (operation.type === 'delete') {
    const deleteEnd = operation.position + operation.length;

    if (deleteEnd <= cursor) {
      // Delete is completely before cursor, shift cursor left
      return cursor - operation.length;
    } else if (operation.position < cursor) {
      // Cursor is inside delete range, move to delete position
      return operation.position;
    }
    // Delete is after cursor, no change
    return cursor;
  }

  return cursor;
}

/**
 * Compose two operations into a single operation (for compacting history)
 *
 * Combines consecutive operations from the same client into a single operation.
 * This is useful for reducing memory usage and network traffic by merging
 * multiple small edits into larger ones.
 *
 * @param op1 - The first operation (earlier in time)
 * @param op2 - The second operation (later in time)
 * @returns A single composed operation, or null if operations cannot be composed
 *
 * Composition rules:
 * - Operations must be from the same client
 * - Inserts can be composed if they're consecutive (op1 end = op2 start)
 * - Deletes can be composed if they're at the same position (backspace pattern)
 * - Mixed operation types cannot be composed
 *
 * @example
 * // User types "hel" then "lo" at positions 5, 8
 * // Compose: insert("hel", 5) + insert("lo", 8) = insert("hello", 5)
 *
 * @example
 * // User backspaces twice at position 10
 * // Compose: delete(1, 10) + delete(1, 10) = delete(2, 10)
 *
 * @example
 * // Cannot compose: different clients
 * // insert("a", 5, clientA) + insert("b", 6, clientB) = null
 */
export function compose(op1: Operation, op2: Operation): Operation | null {
  // Only compose operations from the same client
  if (op1.clientId !== op2.clientId) {
    return null;
  }

  // Compose consecutive inserts at same position
  if (
    op1.type === 'insert' &&
    op2.type === 'insert' &&
    op1.position + op1.text.length === op2.position
  ) {
    return {
      type: 'insert',
      position: op1.position,
      text: op1.text + op2.text,
      clientId: op1.clientId,
      version: op2.version,
    };
  }

  // Compose consecutive deletes at same position
  if (
    op1.type === 'delete' &&
    op2.type === 'delete' &&
    op1.position === op2.position
  ) {
    return {
      type: 'delete',
      position: op1.position,
      length: op1.length + op2.length,
      clientId: op1.clientId,
      version: op2.version,
    };
  }

  // Cannot compose
  return null;
}
