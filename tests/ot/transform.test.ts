/**
 * Tests for Operational Transform algorithm
 * Tests the transform functions that handle concurrent edits
 */

import { describe, it, expect } from 'vitest';
import { transform, transformCursorPosition, compose } from '../../src/ot/transform';
import type { InsertOperation, DeleteOperation, Operation } from '../../src/ot/types';

// Helper to create insert operations
function insert(position: number, text: string, clientId = 'client1', version = 1): InsertOperation {
  return { type: 'insert', position, text, clientId, version };
}

// Helper to create delete operations
function del(position: number, length: number, clientId = 'client1', version = 1): DeleteOperation {
  return { type: 'delete', position, length, clientId, version };
}

describe('transform', () => {
  describe('Insert-Insert transformations', () => {
    it('should shift second insert when first insert is before', () => {
      const op1 = insert(5, 'hello', 'clientA');
      const op2 = insert(10, 'world', 'clientB');

      const [op1Prime, op2Prime] = transform(op1, op2);

      expect(op1Prime).toEqual(op1); // op1 unchanged
      expect(op2Prime.position).toBe(15); // 10 + 5 (hello.length)
    });

    it('should shift first insert when second insert is before', () => {
      const op1 = insert(10, 'world', 'clientA');
      const op2 = insert(5, 'hello', 'clientB');

      const [op1Prime, op2Prime] = transform(op1, op2);

      expect(op1Prime.position).toBe(15); // 10 + 5
      expect(op2Prime).toEqual(op2); // op2 unchanged
    });

    it('should use clientId for tie-breaking at same position', () => {
      const op1 = insert(5, 'aaa', 'clientA');
      const op2 = insert(5, 'bbb', 'clientB');

      const [op1Prime, op2Prime] = transform(op1, op2);

      // clientA < clientB, so op1 goes first
      expect(op1Prime.position).toBe(5);
      expect(op2Prime.position).toBe(8); // 5 + 3
    });

    it('should handle reverse clientId ordering', () => {
      const op1 = insert(5, 'aaa', 'clientZ');
      const op2 = insert(5, 'bbb', 'clientA');

      const [op1Prime, op2Prime] = transform(op1, op2);

      // clientA < clientZ, so op2 goes first
      expect(op1Prime.position).toBe(8); // 5 + 3
      expect(op2Prime.position).toBe(5);
    });

    it('should handle empty insert text', () => {
      const op1 = insert(5, '', 'clientA');
      const op2 = insert(10, 'world', 'clientB');

      const [op1Prime, op2Prime] = transform(op1, op2);

      expect(op1Prime.position).toBe(5);
      expect(op2Prime.position).toBe(10); // No shift because op1 is empty
    });

    it('should handle adjacent inserts', () => {
      const op1 = insert(0, 'hello', 'clientA');
      const op2 = insert(5, 'world', 'clientB');

      const [op1Prime, op2Prime] = transform(op1, op2);

      expect(op1Prime.position).toBe(0);
      expect(op2Prime.position).toBe(10); // 5 + 5
    });
  });

  describe('Insert-Delete transformations', () => {
    it('should shift delete when insert is before', () => {
      const op1 = insert(5, 'hello', 'clientA');
      const op2 = del(10, 3, 'clientB');

      const [insertPrime, delPrime] = transform(op1, op2);

      expect(insertPrime.position).toBe(5);
      expect((delPrime as DeleteOperation).position).toBe(15); // 10 + 5
    });

    it('should shift insert when delete is before', () => {
      const op1 = insert(10, 'hello', 'clientA');
      const op2 = del(5, 3, 'clientB');

      const [insertPrime, delPrime] = transform(op1, op2);

      expect((insertPrime as InsertOperation).position).toBe(7); // 10 - 3
      expect((delPrime as DeleteOperation).position).toBe(5);
    });

    it('should handle insert at delete position', () => {
      const op1 = insert(5, 'hello', 'clientA');
      const op2 = del(5, 3, 'clientB');

      const [insertPrime, delPrime] = transform(op1, op2);

      expect((insertPrime as InsertOperation).position).toBe(5);
      expect((delPrime as DeleteOperation).position).toBe(10); // 5 + 5
    });

    it('should handle insert inside delete range', () => {
      const op1 = insert(7, 'x', 'clientA');
      const op2 = del(5, 5, 'clientB'); // deletes positions 5-10

      const [insertPrime, delPrime] = transform(op1, op2);

      expect((insertPrime as InsertOperation).position).toBe(5); // Moved to delete start
      expect((delPrime as DeleteOperation).position).toBe(6); // 5 + 1 (x.length)
    });

    it('should handle insert at delete end', () => {
      const op1 = insert(10, 'hello', 'clientA');
      const op2 = del(5, 5, 'clientB'); // deletes positions 5-10

      const [insertPrime, delPrime] = transform(op1, op2);

      expect((insertPrime as InsertOperation).position).toBe(5); // 10 - 5
      expect((delPrime as DeleteOperation).position).toBe(5);
    });
  });

  describe('Delete-Insert transformations', () => {
    it('should handle delete before insert correctly', () => {
      const op1 = del(5, 3, 'clientA');
      const op2 = insert(10, 'hello', 'clientB');

      const [delPrime, insertPrime] = transform(op1, op2);

      expect((delPrime as DeleteOperation).position).toBe(5);
      expect((insertPrime as InsertOperation).position).toBe(7); // 10 - 3
    });

    it('should handle delete after insert', () => {
      const op1 = del(10, 3, 'clientA');
      const op2 = insert(5, 'hello', 'clientB');

      const [delPrime, insertPrime] = transform(op1, op2);

      expect((delPrime as DeleteOperation).position).toBe(15); // 10 + 5
      expect((insertPrime as InsertOperation).position).toBe(5);
    });
  });

  describe('Delete-Delete transformations', () => {
    it('should handle non-overlapping deletes (first before second)', () => {
      const op1 = del(5, 3, 'clientA'); // deletes 5-8
      const op2 = del(10, 3, 'clientB'); // deletes 10-13

      const [op1Prime, op2Prime] = transform(op1, op2);

      expect((op1Prime as DeleteOperation).position).toBe(5);
      expect((op1Prime as DeleteOperation).length).toBe(3);
      expect((op2Prime as DeleteOperation).position).toBe(7); // 10 - 3
      expect((op2Prime as DeleteOperation).length).toBe(3);
    });

    it('should handle non-overlapping deletes (second before first)', () => {
      const op1 = del(10, 3, 'clientA'); // deletes 10-13
      const op2 = del(5, 3, 'clientB'); // deletes 5-8

      const [op1Prime, op2Prime] = transform(op1, op2);

      expect((op1Prime as DeleteOperation).position).toBe(7); // 10 - 3
      expect((op1Prime as DeleteOperation).length).toBe(3);
      expect((op2Prime as DeleteOperation).position).toBe(5);
      expect((op2Prime as DeleteOperation).length).toBe(3);
    });

    it('should handle complete overlap (same range)', () => {
      const op1 = del(5, 3, 'clientA');
      const op2 = del(5, 3, 'clientB');

      const [op1Prime, op2Prime] = transform(op1, op2);

      expect((op1Prime as DeleteOperation).length).toBe(0);
      expect((op2Prime as DeleteOperation).length).toBe(0);
    });

    it('should handle partial overlap (same start, different lengths)', () => {
      const op1 = del(5, 3, 'clientA'); // deletes 5-8
      const op2 = del(5, 5, 'clientB'); // deletes 5-10

      const [op1Prime, op2Prime] = transform(op1, op2);

      expect((op1Prime as DeleteOperation).length).toBe(0);
      expect((op2Prime as DeleteOperation).length).toBe(2); // 5 - 3
    });

    it('should handle partial overlap (op1 starts before, extends into op2)', () => {
      const op1 = del(5, 5, 'clientA'); // deletes 5-10
      const op2 = del(8, 4, 'clientB'); // deletes 8-12

      const [op1Prime, op2Prime] = transform(op1, op2);

      const overlap = 10 - 8; // 2
      expect((op1Prime as DeleteOperation).length).toBe(5 - overlap); // 3
      expect((op2Prime as DeleteOperation).position).toBe(5);
      expect((op2Prime as DeleteOperation).length).toBe(4 - overlap); // 2
    });

    it('should handle op1 completely containing op2', () => {
      const op1 = del(5, 10, 'clientA'); // deletes 5-15
      const op2 = del(7, 3, 'clientB'); // deletes 7-10

      const [op1Prime, op2Prime] = transform(op1, op2);

      expect((op1Prime as DeleteOperation).length).toBe(7); // 10 - 3
      expect((op2Prime as DeleteOperation).length).toBe(0);
    });

    it('should handle op2 completely containing op1', () => {
      const op1 = del(7, 3, 'clientA'); // deletes 7-10
      const op2 = del(5, 10, 'clientB'); // deletes 5-15

      const [op1Prime, op2Prime] = transform(op1, op2);

      expect((op1Prime as DeleteOperation).length).toBe(0);
      expect((op2Prime as DeleteOperation).length).toBe(7); // 10 - 3
    });

    it('should handle adjacent deletes', () => {
      const op1 = del(5, 3, 'clientA'); // deletes 5-8
      const op2 = del(8, 3, 'clientB'); // deletes 8-11

      const [op1Prime, op2Prime] = transform(op1, op2);

      expect((op1Prime as DeleteOperation).position).toBe(5);
      expect((op1Prime as DeleteOperation).length).toBe(3);
      expect((op2Prime as DeleteOperation).position).toBe(5); // 8 - 3
      expect((op2Prime as DeleteOperation).length).toBe(3);
    });

    it('should handle zero-length delete', () => {
      const op1 = del(5, 0, 'clientA');
      const op2 = del(10, 3, 'clientB');

      const [op1Prime, op2Prime] = transform(op1, op2);

      expect((op1Prime as DeleteOperation).length).toBe(0);
      expect((op2Prime as DeleteOperation).position).toBe(10);
    });
  });
});

describe('transformCursorPosition', () => {
  describe('with insert operations', () => {
    it('should shift cursor right when insert is at cursor position', () => {
      const cursor = 10;
      const op = insert(10, 'hello');

      const newCursor = transformCursorPosition(cursor, op);

      expect(newCursor).toBe(15); // 10 + 5
    });

    it('should shift cursor right when insert is before cursor', () => {
      const cursor = 10;
      const op = insert(5, 'hello');

      const newCursor = transformCursorPosition(cursor, op);

      expect(newCursor).toBe(15); // 10 + 5
    });

    it('should not shift cursor when insert is after cursor', () => {
      const cursor = 10;
      const op = insert(15, 'hello');

      const newCursor = transformCursorPosition(cursor, op);

      expect(newCursor).toBe(10);
    });

    it('should handle cursor at position 0', () => {
      const cursor = 0;
      const op = insert(0, 'hello');

      const newCursor = transformCursorPosition(cursor, op);

      expect(newCursor).toBe(5);
    });
  });

  describe('with delete operations', () => {
    it('should shift cursor left when delete is completely before cursor', () => {
      const cursor = 10;
      const op = del(5, 3); // deletes 5-8

      const newCursor = transformCursorPosition(cursor, op);

      expect(newCursor).toBe(7); // 10 - 3
    });

    it('should not shift cursor when delete is after cursor', () => {
      const cursor = 10;
      const op = del(15, 3);

      const newCursor = transformCursorPosition(cursor, op);

      expect(newCursor).toBe(10);
    });

    it('should move cursor to delete start when cursor is inside delete range', () => {
      const cursor = 7;
      const op = del(5, 5); // deletes 5-10

      const newCursor = transformCursorPosition(cursor, op);

      expect(newCursor).toBe(5);
    });

    it('should handle delete ending exactly at cursor', () => {
      const cursor = 10;
      const op = del(7, 3); // deletes 7-10

      const newCursor = transformCursorPosition(cursor, op);

      expect(newCursor).toBe(7); // 10 - 3
    });

    it('should handle cursor at delete start', () => {
      const cursor = 5;
      const op = del(5, 3);

      const newCursor = transformCursorPosition(cursor, op);

      expect(newCursor).toBe(5);
    });
  });
});

describe('compose', () => {
  describe('insert composition', () => {
    it('should compose consecutive inserts from same client', () => {
      const op1 = insert(5, 'hel', 'client1', 1);
      const op2 = insert(8, 'lo', 'client1', 2); // Continues at 5 + 3

      const composed = compose(op1, op2);

      expect(composed).not.toBeNull();
      expect(composed?.type).toBe('insert');
      expect((composed as InsertOperation).position).toBe(5);
      expect((composed as InsertOperation).text).toBe('hello');
      expect(composed?.version).toBe(2);
    });

    it('should not compose non-consecutive inserts', () => {
      const op1 = insert(5, 'hello', 'client1', 1);
      const op2 = insert(15, 'world', 'client1', 2);

      const composed = compose(op1, op2);

      expect(composed).toBeNull();
    });

    it('should not compose inserts from different clients', () => {
      const op1 = insert(5, 'hel', 'client1', 1);
      const op2 = insert(8, 'lo', 'client2', 2);

      const composed = compose(op1, op2);

      expect(composed).toBeNull();
    });
  });

  describe('delete composition', () => {
    it('should compose deletes at same position', () => {
      const op1 = del(10, 1, 'client1', 1);
      const op2 = del(10, 1, 'client1', 2);

      const composed = compose(op1, op2);

      expect(composed).not.toBeNull();
      expect(composed?.type).toBe('delete');
      expect((composed as DeleteOperation).position).toBe(10);
      expect((composed as DeleteOperation).length).toBe(2);
      expect(composed?.version).toBe(2);
    });

    it('should not compose deletes at different positions', () => {
      const op1 = del(10, 1, 'client1', 1);
      const op2 = del(5, 1, 'client1', 2);

      const composed = compose(op1, op2);

      expect(composed).toBeNull();
    });

    it('should not compose deletes from different clients', () => {
      const op1 = del(10, 1, 'client1', 1);
      const op2 = del(10, 1, 'client2', 2);

      const composed = compose(op1, op2);

      expect(composed).toBeNull();
    });
  });

  describe('mixed operations', () => {
    it('should not compose insert and delete', () => {
      const op1 = insert(5, 'hello', 'client1', 1);
      const op2 = del(10, 3, 'client1', 2);

      const composed = compose(op1, op2);

      expect(composed).toBeNull();
    });

    it('should not compose delete and insert', () => {
      const op1 = del(10, 3, 'client1', 1);
      const op2 = insert(5, 'hello', 'client1', 2);

      const composed = compose(op1, op2);

      expect(composed).toBeNull();
    });
  });
});

describe('OT convergence property', () => {
  // These tests verify that transformed operations lead to the same result
  // regardless of the order they're applied

  it('should converge for two inserts at different positions', () => {
    const doc = 'hello world';
    const op1 = insert(0, 'AAA', 'clientA');
    const op2 = insert(6, 'BBB', 'clientB');

    const [op1Prime, op2Prime] = transform(op1, op2);

    // Path 1: apply op1 then op2'
    let result1 = doc.slice(0, op1.position) + op1.text + doc.slice(op1.position);
    result1 = result1.slice(0, (op2Prime as InsertOperation).position) + (op2Prime as InsertOperation).text + result1.slice((op2Prime as InsertOperation).position);

    // Path 2: apply op2 then op1'
    let result2 = doc.slice(0, op2.position) + op2.text + doc.slice(op2.position);
    result2 = result2.slice(0, (op1Prime as InsertOperation).position) + (op1Prime as InsertOperation).text + result2.slice((op1Prime as InsertOperation).position);

    expect(result1).toBe(result2);
  });

  it('should converge for two inserts at same position', () => {
    const doc = 'hello';
    const op1 = insert(2, 'AA', 'clientA');
    const op2 = insert(2, 'BB', 'clientB');

    const [op1Prime, op2Prime] = transform(op1, op2);

    // Path 1
    let result1 = doc.slice(0, op1.position) + op1.text + doc.slice(op1.position);
    result1 = result1.slice(0, (op2Prime as InsertOperation).position) + (op2Prime as InsertOperation).text + result1.slice((op2Prime as InsertOperation).position);

    // Path 2
    let result2 = doc.slice(0, op2.position) + op2.text + doc.slice(op2.position);
    result2 = result2.slice(0, (op1Prime as InsertOperation).position) + (op1Prime as InsertOperation).text + result2.slice((op1Prime as InsertOperation).position);

    expect(result1).toBe(result2);
  });

  it('should converge for insert and delete', () => {
    const doc = 'hello world';
    const op1 = insert(6, 'beautiful ', 'clientA');
    const op2 = del(0, 6, 'clientB'); // Delete "hello "

    const [op1Prime, op2Prime] = transform(op1, op2);

    // Path 1: apply op1 then op2'
    let result1 = doc.slice(0, op1.position) + op1.text + doc.slice(op1.position);
    const del1 = op2Prime as DeleteOperation;
    result1 = result1.slice(0, del1.position) + result1.slice(del1.position + del1.length);

    // Path 2: apply op2 then op1'
    let result2 = doc.slice(0, op2.position) + doc.slice(op2.position + op2.length);
    const ins1 = op1Prime as InsertOperation;
    result2 = result2.slice(0, ins1.position) + ins1.text + result2.slice(ins1.position);

    expect(result1).toBe(result2);
  });

  it('should converge for two overlapping deletes', () => {
    const doc = 'abcdefghij';
    const op1 = del(2, 4, 'clientA'); // Delete "cdef"
    const op2 = del(4, 4, 'clientB'); // Delete "efgh"

    const [op1Prime, op2Prime] = transform(op1, op2);

    // Path 1: apply op1 then op2'
    let result1 = doc.slice(0, op1.position) + doc.slice(op1.position + op1.length);
    const del1Prime = op1Prime as DeleteOperation;
    const del2Prime = op2Prime as DeleteOperation;
    if (del2Prime.length > 0) {
      result1 = result1.slice(0, del2Prime.position) + result1.slice(del2Prime.position + del2Prime.length);
    }

    // Path 2: apply op2 then op1'
    let result2 = doc.slice(0, op2.position) + doc.slice(op2.position + op2.length);
    if (del1Prime.length > 0) {
      result2 = result2.slice(0, del1Prime.position) + result2.slice(del1Prime.position + del1Prime.length);
    }

    expect(result1).toBe(result2);
  });
});
