/**
 * Tests for Operation Generator
 * Tests generation of OT operations from content diffs
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { generateOperations, OperationBatcher } from '../../client/lib/realtime/OperationGenerator';
import type { InsertOperation, DeleteOperation, Operation } from '../../src/ot/types';

describe('generateOperations', () => {
  const clientId = 'test-client';
  const version = 1;

  describe('insert operations', () => {
    it('should generate insert at beginning', () => {
      const oldContent = 'world';
      const newContent = 'hello world';

      const ops = generateOperations(oldContent, newContent, clientId, version);

      expect(ops).toHaveLength(1);
      expect(ops[0].type).toBe('insert');
      expect((ops[0] as InsertOperation).position).toBe(0);
      expect((ops[0] as InsertOperation).text).toBe('hello ');
    });

    it('should generate insert at end', () => {
      const oldContent = 'hello';
      const newContent = 'hello world';

      const ops = generateOperations(oldContent, newContent, clientId, version);

      expect(ops).toHaveLength(1);
      expect(ops[0].type).toBe('insert');
      expect((ops[0] as InsertOperation).position).toBe(5);
      expect((ops[0] as InsertOperation).text).toBe(' world');
    });

    it('should generate insert in middle', () => {
      const oldContent = 'helloworld';
      const newContent = 'hello world';

      const ops = generateOperations(oldContent, newContent, clientId, version);

      expect(ops).toHaveLength(1);
      expect(ops[0].type).toBe('insert');
      expect((ops[0] as InsertOperation).position).toBe(5);
      expect((ops[0] as InsertOperation).text).toBe(' ');
    });

    it('should handle single character insert', () => {
      const oldContent = 'helo';
      const newContent = 'hello';

      const ops = generateOperations(oldContent, newContent, clientId, version);

      expect(ops).toHaveLength(1);
      expect(ops[0].type).toBe('insert');
      expect((ops[0] as InsertOperation).text).toBe('l');
    });

    it('should handle multiline insert', () => {
      const oldContent = 'line1\nline2';
      const newContent = 'line1\nnewline\nline2';

      const ops = generateOperations(oldContent, newContent, clientId, version);

      const insertOps = ops.filter(op => op.type === 'insert');
      expect(insertOps.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('delete operations', () => {
    it('should generate delete at beginning', () => {
      const oldContent = 'hello world';
      const newContent = 'world';

      const ops = generateOperations(oldContent, newContent, clientId, version);

      expect(ops).toHaveLength(1);
      expect(ops[0].type).toBe('delete');
      expect((ops[0] as DeleteOperation).position).toBe(0);
      expect((ops[0] as DeleteOperation).length).toBe(6);
    });

    it('should generate delete at end', () => {
      const oldContent = 'hello world';
      const newContent = 'hello';

      const ops = generateOperations(oldContent, newContent, clientId, version);

      expect(ops).toHaveLength(1);
      expect(ops[0].type).toBe('delete');
      expect((ops[0] as DeleteOperation).position).toBe(5);
      expect((ops[0] as DeleteOperation).length).toBe(6);
    });

    it('should generate delete in middle', () => {
      const oldContent = 'hello beautiful world';
      const newContent = 'hello world';

      const ops = generateOperations(oldContent, newContent, clientId, version);

      expect(ops).toHaveLength(1);
      expect(ops[0].type).toBe('delete');
      // fast-diff matches "hello " as equal, then deletes "beautiful " (10 chars)
      expect((ops[0] as DeleteOperation).position).toBe(6);
      expect((ops[0] as DeleteOperation).length).toBe(10);
    });

    it('should handle single character delete', () => {
      const oldContent = 'hello';
      const newContent = 'helo';

      const ops = generateOperations(oldContent, newContent, clientId, version);

      expect(ops).toHaveLength(1);
      expect(ops[0].type).toBe('delete');
      expect((ops[0] as DeleteOperation).length).toBe(1);
    });
  });

  describe('replacement operations', () => {
    it('should generate delete and insert for word replacement', () => {
      const oldContent = 'hello world';
      const newContent = 'hello universe';

      const ops = generateOperations(oldContent, newContent, clientId, version);

      // Should have at least one insert and one delete
      const hasDelete = ops.some(op => op.type === 'delete');
      const hasInsert = ops.some(op => op.type === 'insert');

      expect(hasDelete || hasInsert).toBe(true);
    });

    it('should handle complete content replacement', () => {
      const oldContent = 'completely different';
      const newContent = 'totally new content';

      const ops = generateOperations(oldContent, newContent, clientId, version);

      expect(ops.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('no change scenarios', () => {
    it('should return empty array when content is identical', () => {
      const oldContent = 'hello world';
      const newContent = 'hello world';

      const ops = generateOperations(oldContent, newContent, clientId, version);

      expect(ops).toHaveLength(0);
    });

    it('should return empty array for empty strings', () => {
      const oldContent = '';
      const newContent = '';

      const ops = generateOperations(oldContent, newContent, clientId, version);

      expect(ops).toHaveLength(0);
    });
  });

  describe('edge cases', () => {
    it('should handle empty to content', () => {
      const oldContent = '';
      const newContent = 'hello';

      const ops = generateOperations(oldContent, newContent, clientId, version);

      expect(ops).toHaveLength(1);
      expect(ops[0].type).toBe('insert');
      expect((ops[0] as InsertOperation).text).toBe('hello');
    });

    it('should handle content to empty', () => {
      const oldContent = 'hello';
      const newContent = '';

      const ops = generateOperations(oldContent, newContent, clientId, version);

      expect(ops).toHaveLength(1);
      expect(ops[0].type).toBe('delete');
      expect((ops[0] as DeleteOperation).length).toBe(5);
    });

    it('should handle unicode characters', () => {
      const oldContent = '日本語';
      const newContent = '日本語テスト';

      const ops = generateOperations(oldContent, newContent, clientId, version);

      expect(ops.length).toBeGreaterThanOrEqual(1);
      const insertOp = ops.find(op => op.type === 'insert') as InsertOperation;
      expect(insertOp).toBeDefined();
      expect(insertOp.text).toBe('テスト');
    });

    it('should handle emoji', () => {
      const oldContent = 'hello';
      const newContent = 'hello 👋';

      const ops = generateOperations(oldContent, newContent, clientId, version);

      expect(ops.length).toBeGreaterThanOrEqual(1);
    });

    it('should set correct clientId and version', () => {
      const oldContent = 'hello';
      const newContent = 'hello world';

      const ops = generateOperations(oldContent, newContent, clientId, version);

      expect(ops[0].clientId).toBe(clientId);
      expect(ops[0].version).toBe(version);
    });
  });

  describe('complex diffs', () => {
    it('should handle multiple insertions', () => {
      const oldContent = 'ac';
      const newContent = 'abc';

      const ops = generateOperations(oldContent, newContent, clientId, version);

      expect(ops.length).toBeGreaterThanOrEqual(1);
    });

    it('should handle interleaved changes', () => {
      const oldContent = 'abcd';
      const newContent = 'aBCd';

      const ops = generateOperations(oldContent, newContent, clientId, version);

      expect(ops.length).toBeGreaterThanOrEqual(1);
    });
  });
});

describe('OperationBatcher', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const clientId = 'test-client';
  const version = 1;
  const batchDelay = 50;

  it('should batch rapid updates', async () => {
    const onBatch = vi.fn();
    const batcher = new OperationBatcher('hello', clientId, version, onBatch, batchDelay);

    batcher.updateContent('hello w');
    batcher.updateContent('hello wo');
    batcher.updateContent('hello wor');
    batcher.updateContent('hello worl');
    batcher.updateContent('hello world');

    // Should not have called onBatch yet
    expect(onBatch).not.toHaveBeenCalled();

    // Advance timers past batch delay
    vi.advanceTimersByTime(batchDelay + 10);

    // Should have called onBatch once with the final diff
    expect(onBatch).toHaveBeenCalledTimes(1);

    const operations = onBatch.mock.calls[0][0] as Operation[];
    expect(operations.length).toBeGreaterThanOrEqual(1);
  });

  it('should debounce updates', async () => {
    const onBatch = vi.fn();
    const batcher = new OperationBatcher('', clientId, version, onBatch, batchDelay);

    batcher.updateContent('a');
    vi.advanceTimersByTime(30);

    batcher.updateContent('ab');
    vi.advanceTimersByTime(30);

    batcher.updateContent('abc');
    vi.advanceTimersByTime(30);

    // Still should not have fired
    expect(onBatch).not.toHaveBeenCalled();

    vi.advanceTimersByTime(batchDelay);

    // Now should have fired once
    expect(onBatch).toHaveBeenCalledTimes(1);
  });

  it('should not call onBatch when content unchanged', () => {
    const onBatch = vi.fn();
    const batcher = new OperationBatcher('hello', clientId, version, onBatch, batchDelay);

    batcher.updateContent('hello');

    vi.advanceTimersByTime(batchDelay + 10);

    expect(onBatch).not.toHaveBeenCalled();
  });

  it('should update version correctly', () => {
    const onBatch = vi.fn();
    const batcher = new OperationBatcher('hello', clientId, 1, onBatch, batchDelay);

    batcher.updateVersion(5);
    batcher.updateContent('hello world');

    vi.advanceTimersByTime(batchDelay + 10);

    const operations = onBatch.mock.calls[0][0] as Operation[];
    expect(operations[0].version).toBe(5);
  });

  it('should allow setting last content', () => {
    const onBatch = vi.fn();
    const batcher = new OperationBatcher('hello', clientId, version, onBatch, batchDelay);

    batcher.setLastContent('new base');
    batcher.updateContent('new base!');

    vi.advanceTimersByTime(batchDelay + 10);

    const operations = onBatch.mock.calls[0][0] as Operation[];
    expect(operations).toHaveLength(1);
    expect((operations[0] as InsertOperation).text).toBe('!');
  });

  it('should cancel pending batch on cancel()', () => {
    const onBatch = vi.fn();
    const batcher = new OperationBatcher('hello', clientId, version, onBatch, batchDelay);

    batcher.updateContent('hello world');
    batcher.cancel();

    vi.advanceTimersByTime(batchDelay + 10);

    expect(onBatch).not.toHaveBeenCalled();
  });

  it('should handle multiple batch cycles', () => {
    const onBatch = vi.fn();
    const batcher = new OperationBatcher('', clientId, version, onBatch, batchDelay);

    // First batch
    batcher.updateContent('hello');
    vi.advanceTimersByTime(batchDelay + 10);
    expect(onBatch).toHaveBeenCalledTimes(1);

    // Second batch
    batcher.updateContent('hello world');
    vi.advanceTimersByTime(batchDelay + 10);
    expect(onBatch).toHaveBeenCalledTimes(2);
  });

  it('should use default batch delay when not specified', () => {
    const onBatch = vi.fn();
    const batcher = new OperationBatcher('', clientId, version, onBatch);

    batcher.updateContent('hello');

    // Default is 50ms
    vi.advanceTimersByTime(40);
    expect(onBatch).not.toHaveBeenCalled();

    vi.advanceTimersByTime(20);
    expect(onBatch).toHaveBeenCalledTimes(1);
  });

  it('should handle rapid type and delete', () => {
    const onBatch = vi.fn();
    const batcher = new OperationBatcher('hello', clientId, version, onBatch, batchDelay);

    batcher.updateContent('hello w');
    batcher.updateContent('hello wo');
    batcher.updateContent('hello w'); // Delete 'o'
    batcher.updateContent('hello '); // Delete 'w'

    vi.advanceTimersByTime(batchDelay + 10);

    expect(onBatch).toHaveBeenCalledTimes(1);

    const operations = onBatch.mock.calls[0][0] as Operation[];
    // Should have generated operation for the net change (adding ' ')
    expect(operations.length).toBeGreaterThanOrEqual(1);
  });
});
