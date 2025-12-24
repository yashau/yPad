// Generate operations from content diffs using fast-diff

import diff from 'fast-diff';
import type { Operation, InsertOperation, DeleteOperation } from '../../../src/ot/types';

/**
 * Generate operations from the difference between old and new content
 * Uses fast-diff library to compute minimal change set
 */
export function generateOperations(
  oldContent: string,
  newContent: string,
  clientId: string,
  version: number
): Operation[] {
  const diffs = diff(oldContent, newContent);
  const operations: Operation[] = [];
  let position = 0;

  for (const [type, text] of diffs) {
    if (type === diff.INSERT) {
      // Insert operation
      operations.push({
        type: 'insert',
        position,
        text,
        clientId,
        version,
      } as InsertOperation);
      position += text.length;
    } else if (type === diff.DELETE) {
      // Delete operation
      operations.push({
        type: 'delete',
        position,
        length: text.length,
        clientId,
        version,
      } as DeleteOperation);
      // Position doesn't move forward for deletes
    } else if (type === diff.EQUAL) {
      // No operation, just advance position
      position += text.length;
    }
  }

  return operations;
}

/**
 * Batch rapid edits into a single operation set
 * Debounces operation generation to avoid sending too many small ops
 */
export class OperationBatcher {
  private lastContent: string;
  private batchTimeout: number | null = null;
  private batchDelay: number;
  private onBatch: (operations: Operation[]) => void;
  private clientId: string;
  private version: number;

  constructor(
    initialContent: string,
    clientId: string,
    version: number,
    onBatch: (operations: Operation[]) => void,
    batchDelay = 50
  ) {
    this.lastContent = initialContent;
    this.clientId = clientId;
    this.version = version;
    this.onBatch = onBatch;
    this.batchDelay = batchDelay;
  }

  updateContent(newContent: string): void {
    if (this.batchTimeout !== null) {
      clearTimeout(this.batchTimeout);
    }

    this.batchTimeout = setTimeout(() => {
      const operations = generateOperations(
        this.lastContent,
        newContent,
        this.clientId,
        this.version
      );

      if (operations.length > 0) {
        this.lastContent = newContent;
        this.onBatch(operations);
      }

      this.batchTimeout = null;
    }, this.batchDelay) as unknown as number;
  }

  updateVersion(version: number): void {
    this.version = version;
  }

  setLastContent(content: string): void {
    this.lastContent = content;
  }

  cancel(): void {
    if (this.batchTimeout !== null) {
      clearTimeout(this.batchTimeout);
      this.batchTimeout = null;
    }
  }
}
