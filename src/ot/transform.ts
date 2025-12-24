// Operational Transform - Transformation algorithm for concurrent operations

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
 * Transform Insert vs Insert
 * If positions equal, order by clientId for determinism
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
 * Transform Insert vs Delete
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
 * Transform Delete vs Delete
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
 * Returns null if operations cannot be composed
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
