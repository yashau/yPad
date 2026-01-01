/**
 * Tests for operation application
 * Tests applying insert and delete operations to strings
 */

import { describe, it, expect } from 'vitest';
import { applyOperation, applyOperations } from '../../src/ot/apply';
import type { InsertOperation, DeleteOperation, Operation } from '../../src/ot/types';

// Helper to create insert operations
function insert(position: number, text: string, clientId = 'client1', version = 1): InsertOperation {
  return { type: 'insert', position, text, clientId, version };
}

// Helper to create delete operations
function del(position: number, length: number, clientId = 'client1', version = 1): DeleteOperation {
  return { type: 'delete', position, length, clientId, version };
}

describe('applyOperation', () => {
  describe('insert operations', () => {
    it('should insert text at the beginning', () => {
      const content = 'world';
      const op = insert(0, 'hello ');

      const result = applyOperation(content, op);

      expect(result).toBe('hello world');
    });

    it('should insert text at the end', () => {
      const content = 'hello';
      const op = insert(5, ' world');

      const result = applyOperation(content, op);

      expect(result).toBe('hello world');
    });

    it('should insert text in the middle', () => {
      const content = 'helloworld';
      const op = insert(5, ' ');

      const result = applyOperation(content, op);

      expect(result).toBe('hello world');
    });

    it('should handle inserting into empty string', () => {
      const content = '';
      const op = insert(0, 'hello');

      const result = applyOperation(content, op);

      expect(result).toBe('hello');
    });

    it('should handle empty insert text', () => {
      const content = 'hello';
      const op = insert(2, '');

      const result = applyOperation(content, op);

      expect(result).toBe('hello');
    });

    it('should clamp position to start if negative', () => {
      const content = 'hello';
      const op = insert(-5, 'world');

      const result = applyOperation(content, op);

      expect(result).toBe('worldhello');
    });

    it('should clamp position to end if beyond content length', () => {
      const content = 'hello';
      const op = insert(100, ' world');

      const result = applyOperation(content, op);

      expect(result).toBe('hello world');
    });

    it('should handle multi-line text insertion', () => {
      const content = 'hello world';
      const op = insert(5, '\nbeautiful\n');

      const result = applyOperation(content, op);

      expect(result).toBe('hello\nbeautiful\n world');
    });

    it('should handle special characters', () => {
      const content = 'hello';
      const op = insert(5, ' wörld 日本語');

      const result = applyOperation(content, op);

      expect(result).toBe('hello wörld 日本語');
    });

    it('should handle emoji insertion', () => {
      const content = 'hello';
      const op = insert(5, ' 👋🌍');

      const result = applyOperation(content, op);

      expect(result).toBe('hello 👋🌍');
    });
  });

  describe('delete operations', () => {
    it('should delete text from the beginning', () => {
      const content = 'hello world';
      const op = del(0, 6);

      const result = applyOperation(content, op);

      expect(result).toBe('world');
    });

    it('should delete text from the end', () => {
      const content = 'hello world';
      const op = del(5, 6);

      const result = applyOperation(content, op);

      expect(result).toBe('hello');
    });

    it('should delete text from the middle', () => {
      const content = 'hello beautiful world';
      const op = del(5, 10);

      const result = applyOperation(content, op);

      expect(result).toBe('hello world');
    });

    it('should handle deleting entire content', () => {
      const content = 'hello';
      const op = del(0, 5);

      const result = applyOperation(content, op);

      expect(result).toBe('');
    });

    it('should handle zero length delete', () => {
      const content = 'hello';
      const op = del(2, 0);

      const result = applyOperation(content, op);

      expect(result).toBe('hello');
    });

    it('should clamp position to start if negative', () => {
      const content = 'hello';
      const op = del(-5, 2);

      const result = applyOperation(content, op);

      expect(result).toBe('llo');
    });

    it('should clamp delete to content end if length exceeds', () => {
      const content = 'hello';
      const op = del(3, 100);

      const result = applyOperation(content, op);

      expect(result).toBe('hel');
    });

    it('should handle delete at position beyond content', () => {
      const content = 'hello';
      const op = del(100, 5);

      const result = applyOperation(content, op);

      expect(result).toBe('hello');
    });

    it('should handle deleting from empty string', () => {
      const content = '';
      const op = del(0, 5);

      const result = applyOperation(content, op);

      expect(result).toBe('');
    });

    it('should handle multi-byte character deletion', () => {
      const content = 'hello 日本語 world';
      const op = del(6, 3);

      const result = applyOperation(content, op);

      expect(result).toBe('hello  world');
    });
  });

  describe('unknown operation type', () => {
    it('should return content unchanged for unknown operation type', () => {
      const content = 'hello';
      const op = { type: 'unknown', position: 0 } as any;

      const result = applyOperation(content, op);

      expect(result).toBe('hello');
    });
  });
});

describe('applyOperations', () => {
  it('should apply multiple operations in sequence', () => {
    const content = 'hello';
    const operations: Operation[] = [
      insert(5, ' world'),
      insert(11, '!'),
    ];

    const result = applyOperations(content, operations);

    expect(result).toBe('hello world!');
  });

  it('should handle mixed insert and delete operations', () => {
    const content = 'hello world';
    const operations: Operation[] = [
      del(5, 6),  // 'hello'
      insert(5, ' there'), // 'hello there'
    ];

    const result = applyOperations(content, operations);

    expect(result).toBe('hello there');
  });

  it('should handle empty operations array', () => {
    const content = 'hello';
    const operations: Operation[] = [];

    const result = applyOperations(content, operations);

    expect(result).toBe('hello');
  });

  it('should handle operations that result in empty string', () => {
    const content = 'hello';
    const operations: Operation[] = [
      del(0, 5),
    ];

    const result = applyOperations(content, operations);

    expect(result).toBe('');
  });

  it('should handle complex sequence of operations', () => {
    const content = 'The quick brown fox';
    // Start: 'The quick brown fox' (19 chars)
    const operations: Operation[] = [
      del(4, 5),          // 'The  brown fox' (14 chars) - delete "quick"
      insert(4, 'slow'),  // 'The slow brown fox' (18 chars)
      del(14, 4),         // 'The slow brown' (14 chars) - delete " fox"
      insert(14, ' dog'), // 'The slow brown dog' (18 chars)
    ];

    const result = applyOperations(content, operations);

    expect(result).toBe('The slow brown dog');
  });

  it('should handle single operation', () => {
    const content = 'hello';
    const operations: Operation[] = [
      insert(5, ' world'),
    ];

    const result = applyOperations(content, operations);

    expect(result).toBe('hello world');
  });

  it('should handle consecutive inserts at same position', () => {
    const content = '';
    const operations: Operation[] = [
      insert(0, 'a'),
      insert(1, 'b'),
      insert(2, 'c'),
    ];

    const result = applyOperations(content, operations);

    expect(result).toBe('abc');
  });

  it('should handle consecutive deletes (backspace pattern)', () => {
    const content = 'hello';
    const operations: Operation[] = [
      del(4, 1), // 'hell'
      del(3, 1), // 'hel'
      del(2, 1), // 'he'
    ];

    const result = applyOperations(content, operations);

    expect(result).toBe('he');
  });

  it('should handle operations on unicode content', () => {
    const content = '你好世界';
    const operations: Operation[] = [
      del(2, 2),     // '你好'
      insert(2, 'WORLD'), // '你好WORLD'
    ];

    const result = applyOperations(content, operations);

    expect(result).toBe('你好WORLD');
  });
});

describe('Edge cases and boundary conditions', () => {
  it('should handle very long strings', () => {
    const content = 'a'.repeat(10000);
    const op = insert(5000, 'X');

    const result = applyOperation(content, op);

    expect(result.length).toBe(10001);
    expect(result[5000]).toBe('X');
  });

  it('should handle very long insert text', () => {
    const content = 'hello';
    const longText = 'x'.repeat(10000);
    const op = insert(2, longText);

    const result = applyOperation(content, op);

    expect(result.length).toBe(10005);
    expect(result.startsWith('he')).toBe(true);
    expect(result.endsWith('llo')).toBe(true);
  });

  it('should handle delete of entire large content', () => {
    const content = 'x'.repeat(10000);
    const op = del(0, 10000);

    const result = applyOperation(content, op);

    expect(result).toBe('');
  });

  it('should handle whitespace-only operations', () => {
    const content = 'hello';
    const operations: Operation[] = [
      insert(5, '   '),
      insert(8, '\t'),
      insert(9, '\n'),
    ];

    const result = applyOperations(content, operations);

    expect(result).toBe('hello   \t\n');
  });

  it('should preserve newlines correctly', () => {
    const content = 'line1\nline2\nline3';
    const op = del(6, 5); // Delete 'line2'

    const result = applyOperation(content, op);

    expect(result).toBe('line1\n\nline3');
  });

  it('should handle carriage return and newline', () => {
    const content = 'line1\r\nline2';
    const op = insert(7, 'test\r\n');

    const result = applyOperation(content, op);

    expect(result).toBe('line1\r\ntest\r\nline2');
  });
});
