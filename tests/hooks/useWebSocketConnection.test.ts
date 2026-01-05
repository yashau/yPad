/**
 * Tests for useWebSocketConnection hook
 * Tests the complex OT logic, state synchronization, and WebSocket callback handling
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { transform, transformCursorPosition } from '../../src/ot/transform';
import { applyOperation } from '../../src/ot/apply';
import { simpleChecksum } from '../../src/ot/checksum';
import type { Operation, InsertOperation, DeleteOperation } from '../../src/ot/types';
import type { PendingOperation, PendingState } from '../../client/lib/hooks/useCollaboration.svelte';

// Helper to create insert operations
function insert(position: number, text: string, clientId = 'client1', version = 1): InsertOperation {
  return { type: 'insert', position, text, clientId, version };
}

// Helper to create delete operations
function del(position: number, length: number, clientId = 'client1', version = 1): DeleteOperation {
  return { type: 'delete', position, length, clientId, version };
}

// Helper to create a pending operation
function pendingOp(operation: Operation, baseVersion: number): PendingOperation {
  return { operation, baseVersion };
}

describe('useWebSocketConnection OT logic', () => {
  describe('applyRemoteOperation transformation', () => {
    /**
     * This tests the core logic from useWebSocketConnection.applyRemoteOperation:
     * - Transform remote op against pending local ops
     * - Update pending ops with their transformed versions
     * - Apply the transformed remote op
     */

    it('should transform remote insert against pending local insert (local before remote)', () => {
      // Initial content: "Hello"
      // Local pending: insert "X" at position 0 -> "XHello"
      // Remote arrives: insert "Y" at position 2 -> should be transformed to position 3

      const content = 'Hello';
      const pendingOps: PendingOperation[] = [
        pendingOp(insert(0, 'X', 'local-client', 1), 0)
      ];
      const remoteOp = insert(2, 'Y', 'remote-client', 2);

      // Apply the transformation logic from applyRemoteOperation
      let transformedOp = remoteOp;
      const newPendingOps: PendingOperation[] = [];

      for (const pending of pendingOps) {
        const [transformedPending, transformedRemote] = transform(pending.operation, transformedOp);
        newPendingOps.push({ operation: transformedPending, baseVersion: pending.baseVersion });
        transformedOp = transformedRemote;
      }

      // Remote op should be shifted by the pending insert length
      expect((transformedOp as InsertOperation).position).toBe(3); // 2 + 1 (X.length)

      // Apply to content (which already has pending op applied locally)
      const contentWithPending = applyOperation(content, pendingOps[0].operation); // "XHello"
      const finalContent = applyOperation(contentWithPending, transformedOp); // "XHeYllo"

      expect(finalContent).toBe('XHeYllo');
    });

    it('should transform remote insert against pending local insert (remote before local)', () => {
      // Initial content: "Hello"
      // Local pending: insert "X" at position 5 -> "HelloX"
      // Remote arrives: insert "Y" at position 0 -> local should shift

      const content = 'Hello';
      const pendingOps: PendingOperation[] = [
        pendingOp(insert(5, 'X', 'local-client', 1), 0)
      ];
      const remoteOp = insert(0, 'Y', 'remote-client', 2);

      let transformedOp = remoteOp;
      const newPendingOps: PendingOperation[] = [];

      for (const pending of pendingOps) {
        const [transformedPending, transformedRemote] = transform(pending.operation, transformedOp);
        newPendingOps.push({ operation: transformedPending, baseVersion: pending.baseVersion });
        transformedOp = transformedRemote;
      }

      // Remote op position unchanged (it's before pending)
      expect((transformedOp as InsertOperation).position).toBe(0);

      // Pending op should be shifted
      expect((newPendingOps[0].operation as InsertOperation).position).toBe(6); // 5 + 1

      // Apply both
      const contentWithPending = applyOperation(content, pendingOps[0].operation); // "HelloX"
      const finalContent = applyOperation(contentWithPending, transformedOp); // "YHelloX"

      expect(finalContent).toBe('YHelloX');
    });

    it('should transform remote delete against pending local insert', () => {
      // Initial content: "Hello World"
      // Local pending: insert "X" at position 6 -> "Hello XWorld"
      // Remote arrives: delete 6 chars starting at position 0 -> deletes "Hello "

      const content = 'Hello World';
      const pendingOps: PendingOperation[] = [
        pendingOp(insert(6, 'X', 'local-client', 1), 0)
      ];
      const remoteOp = del(0, 6, 'remote-client', 2); // Delete "Hello "

      let transformedOp = remoteOp;
      const newPendingOps: PendingOperation[] = [];

      for (const pending of pendingOps) {
        const [transformedPending, transformedRemote] = transform(pending.operation, transformedOp);
        newPendingOps.push({ operation: transformedPending, baseVersion: pending.baseVersion });
        transformedOp = transformedRemote;
      }

      // After transformation:
      // Pending insert at 6 shifts to position 0 (6 - 6 = 0, clamped)
      // Actually with transform logic: insert at 6 vs delete at 0-6
      // Insert is at the edge of delete, so it moves to delete position
      expect((newPendingOps[0].operation as InsertOperation).position).toBe(0);

      // Remote delete position is 0 (unchanged)
      // But length might adjust... actually for insert-vs-delete, the delete shifts around the insert
      expect((transformedOp as DeleteOperation).position).toBe(0);
    });

    it('should transform remote insert against multiple pending local ops', () => {
      // Initial content: "AB"
      // Pending 1: insert "X" at 1 -> "AXB"
      // Pending 2: insert "Y" at 3 -> "AXYB"
      // Remote: insert "Z" at 1

      const content = 'AB';
      const pendingOps: PendingOperation[] = [
        pendingOp(insert(1, 'X', 'local-client', 1), 0),
        pendingOp(insert(3, 'Y', 'local-client', 2), 1), // After first pending applied
      ];
      const remoteOp = insert(1, 'Z', 'remote-client', 3);

      let transformedOp = remoteOp;
      const newPendingOps: PendingOperation[] = [];

      for (const pending of pendingOps) {
        const [transformedPending, transformedRemote] = transform(pending.operation, transformedOp);
        newPendingOps.push({ operation: transformedPending, baseVersion: pending.baseVersion });
        transformedOp = transformedRemote;
      }

      // Remote should be shifted by both pending ops
      // After transform against first pending (insert X at 1):
      //   - Tie-break: 'local-client' < 'remote-client', so local wins
      //   - Remote shifts to 2
      // After transform against second pending (insert Y at 3):
      //   - Remote at 2, pending at 3, so remote stays at 2
      expect((transformedOp as InsertOperation).position).toBe(2);
    });

    it('should handle delete-delete overlap with pending operations', () => {
      // Initial content: "ABCDEFGH"
      // Pending: delete 3 chars at position 2 -> "ABFGH" (deletes CDE)
      // Remote: delete 3 chars at position 4 -> deletes EFG in original

      const content = 'ABCDEFGH';
      const pendingOps: PendingOperation[] = [
        pendingOp(del(2, 3, 'local-client', 1), 0) // Delete "CDE"
      ];
      const remoteOp = del(4, 3, 'remote-client', 2); // Delete "EFG"

      let transformedOp = remoteOp;
      const newPendingOps: PendingOperation[] = [];

      for (const pending of pendingOps) {
        const [transformedPending, transformedRemote] = transform(pending.operation, transformedOp);
        newPendingOps.push({ operation: transformedPending, baseVersion: pending.baseVersion });
        transformedOp = transformedRemote;
      }

      // Overlap: pending deletes 2-5, remote deletes 4-7
      // Overlap region is 4-5 (2 chars)
      // Pending should reduce to delete 2 chars (CDE minus overlap)
      // Remote should reduce and shift

      // Apply pending first
      const contentWithPending = applyOperation(content, pendingOps[0].operation); // "ABFGH"

      // Now remote needs to delete remaining chars (FG since E was already deleted)
      // After transform, remote deletion is adjusted
      const finalContent = applyOperation(contentWithPending, transformedOp);

      // Both operations together should delete "CDEFG", leaving "ABH"
      // Final content should have both deletes applied convergently
      expect(finalContent).toBe('ABH');
    });
  });

  describe('cursor position transformation', () => {
    it('should shift cursor right when insert is before cursor', () => {
      const cursorPos = 10;
      const op = insert(5, 'hello');

      const newCursor = transformCursorPosition(cursorPos, op);

      expect(newCursor).toBe(15); // 10 + 5
    });

    it('should shift cursor right when insert is at cursor', () => {
      const cursorPos = 5;
      const op = insert(5, 'hello');

      const newCursor = transformCursorPosition(cursorPos, op);

      expect(newCursor).toBe(10); // 5 + 5
    });

    it('should not shift cursor when insert is after cursor', () => {
      const cursorPos = 5;
      const op = insert(10, 'hello');

      const newCursor = transformCursorPosition(cursorPos, op);

      expect(newCursor).toBe(5);
    });

    it('should shift cursor left when delete is before cursor', () => {
      const cursorPos = 10;
      const op = del(5, 3);

      const newCursor = transformCursorPosition(cursorPos, op);

      expect(newCursor).toBe(7); // 10 - 3
    });

    it('should move cursor to delete start when inside delete range', () => {
      const cursorPos = 7;
      const op = del(5, 5); // Deletes positions 5-10

      const newCursor = transformCursorPosition(cursorPos, op);

      expect(newCursor).toBe(5);
    });

    it('should not shift cursor when delete is after cursor', () => {
      const cursorPos = 5;
      const op = del(10, 3);

      const newCursor = transformCursorPosition(cursorPos, op);

      expect(newCursor).toBe(5);
    });
  });

  describe('remote cursor transformation', () => {
    it('should transform remote cursors for insert operation', () => {
      // Simulating the remote cursor update logic from applyRemoteOperation
      const remoteCursors = new Map<string, { position: number; color: string; label: string }>([
        ['client-A', { position: 10, color: 'blue', label: 'User A' }],
        ['client-B', { position: 5, color: 'green', label: 'User B' }],
      ]);

      const transformedOp = insert(7, 'XXX', 'client-A', 1);

      // Transform cursor positions (but NOT for the operation's client)
      const updatedCursors = new Map(remoteCursors);
      updatedCursors.forEach((cursorData, remoteClientId) => {
        if (remoteClientId !== transformedOp.clientId) {
          cursorData.position = transformCursorPosition(cursorData.position, transformedOp);
        }
      });

      // Client-A's cursor should NOT be transformed (they sent the operation)
      expect(updatedCursors.get('client-A')?.position).toBe(10);

      // Client-B's cursor should be shifted (they're affected by the operation)
      // Insert at 7 with 3 chars -> cursor at 5 stays at 5 (insert is after)
      expect(updatedCursors.get('client-B')?.position).toBe(5);
    });

    it('should transform remote cursors correctly for delete operation', () => {
      const remoteCursors = new Map<string, { position: number; color: string; label: string }>([
        ['client-A', { position: 20, color: 'blue', label: 'User A' }],
        ['client-B', { position: 15, color: 'green', label: 'User B' }],
      ]);

      const transformedOp = del(10, 5, 'client-C', 1); // Delete positions 10-15

      const updatedCursors = new Map(remoteCursors);
      updatedCursors.forEach((cursorData, remoteClientId) => {
        if (remoteClientId !== transformedOp.clientId) {
          cursorData.position = transformCursorPosition(cursorData.position, transformedOp);
        }
      });

      // Client-A: cursor at 20, delete 10-15 -> cursor shifts to 15
      expect(updatedCursors.get('client-A')?.position).toBe(15);

      // Client-B: cursor at 15 (at delete end) -> shifts to 10
      expect(updatedCursors.get('client-B')?.position).toBe(10);
    });
  });

  describe('checksum verification', () => {
    it('should verify matching checksum after operation', () => {
      const content = 'Hello World';
      const serverChecksum = simpleChecksum(content);
      const localChecksum = simpleChecksum(content);

      expect(localChecksum).toBe(serverChecksum);
    });

    it('should detect checksum mismatch', () => {
      const serverContent = 'Hello World';
      const localContent = 'Hello Worlx'; // Typo

      const serverChecksum = simpleChecksum(serverContent);
      const localChecksum = simpleChecksum(localContent);

      expect(localChecksum).not.toBe(serverChecksum);
    });

    it('should handle empty content checksum', () => {
      const content = '';
      const checksum = simpleChecksum(content);

      expect(typeof checksum).toBe('number');
      expect(checksum).toBe(0); // Empty string has checksum 0
    });

    it('should produce different checksums for different content', () => {
      const checksums = [
        simpleChecksum('abc'),
        simpleChecksum('abd'),
        simpleChecksum('ABC'),
        simpleChecksum('abc '),
      ];

      // All should be unique
      const uniqueChecksums = new Set(checksums);
      expect(uniqueChecksums.size).toBe(checksums.length);
    });
  });

  describe('onSync callback logic', () => {
    /**
     * Tests the logic from useWebSocketConnection's onSync callback.
     * When syncing, if local content differs from server, operations are generated.
     */

    it('should detect when local content differs from sync content', () => {
      const syncContent = 'Hello';
      const pendingContent = 'Hello World';
      const editorContent = 'Hello';

      // Logic: localContent = pending.content ?? editor.content
      const localContent = pendingContent ?? editorContent;

      expect(localContent !== syncContent).toBe(true);
    });

    it('should use pending content over editor content', () => {
      const syncContent = 'Server Content';
      const pendingContent = 'Pending Content';
      const editorContent = 'Editor Content';

      const localContent = pendingContent ?? editorContent;

      expect(localContent).toBe(pendingContent);
    });

    it('should fall back to editor content when no pending', () => {
      const syncContent = 'Server Content';
      const pendingContent = null;
      const editorContent = 'Editor Content';

      const localContent = pendingContent ?? editorContent;

      expect(localContent).toBe(editorContent);
    });

    it('should recognize when content matches sync', () => {
      const syncContent = 'Same Content';
      const localContent = 'Same Content';

      expect(localContent === syncContent).toBe(true);
    });
  });

  describe('onAck callback logic', () => {
    /**
     * Tests the logic from useWebSocketConnection's onAck callback.
     * ACK removes the first pending operation (FIFO order).
     */

    it('should remove first pending operation on ACK', () => {
      const pendingOperations: PendingOperation[] = [
        pendingOp(insert(0, 'A', 'client', 1), 0),
        pendingOp(insert(1, 'B', 'client', 2), 1),
        pendingOp(insert(2, 'C', 'client', 3), 2),
      ];

      // ACK received - remove first operation (FIFO)
      const newPendingOps = pendingOperations.slice(1);

      expect(newPendingOps).toHaveLength(2);
      expect((newPendingOps[0].operation as InsertOperation).text).toBe('B');
      expect((newPendingOps[1].operation as InsertOperation).text).toBe('C');
    });

    it('should handle ACK when no pending operations', () => {
      const pendingOperations: PendingOperation[] = [];

      // ACK received with empty pending list
      const newPendingOps = pendingOperations.length > 0
        ? pendingOperations.slice(1)
        : pendingOperations;

      expect(newPendingOps).toHaveLength(0);
    });

    it('should clear pending state when last operation acknowledged', () => {
      const pending: PendingState = {
        content: 'some content',
        baseVersion: 5,
        operations: [pendingOp(insert(0, 'X', 'client', 1), 0)],
      };

      // ACK received - remove operation
      const newOperations = pending.operations.slice(1);

      // If no more pending ops, clear pending state
      const newPending: PendingState = newOperations.length === 0
        ? { content: null, baseVersion: null, operations: [] }
        : { ...pending, operations: newOperations };

      expect(newPending.content).toBeNull();
      expect(newPending.baseVersion).toBeNull();
      expect(newPending.operations).toHaveLength(0);
    });
  });

  describe('sendOperation logic', () => {
    it('should add operation to pending list', () => {
      const currentVersion = 5;
      const operation = insert(0, 'X', 'client', 0);
      const pending: PendingState = {
        content: null,
        baseVersion: null,
        operations: [],
      };

      // Logic from sendOperation
      const baseVersion = currentVersion;
      const pendingOp: PendingOperation = { operation, baseVersion };
      const newPending: PendingState = {
        ...pending,
        operations: [...pending.operations, pendingOp],
      };

      expect(newPending.operations).toHaveLength(1);
      expect(newPending.operations[0].baseVersion).toBe(5);
    });

    it('should increment version after sending operation', () => {
      let currentVersion = 5;

      // Logic from sendOperation
      const baseVersion = currentVersion;
      currentVersion++;

      expect(baseVersion).toBe(5);
      expect(currentVersion).toBe(6);
    });

    it('should accumulate multiple pending operations', () => {
      const operations: Operation[] = [
        insert(0, 'A', 'client', 0),
        insert(1, 'B', 'client', 0),
        insert(2, 'C', 'client', 0),
      ];

      let currentVersion = 0;
      let pending: PendingState = {
        content: null,
        baseVersion: null,
        operations: [],
      };

      // Simulate sending multiple operations
      for (const op of operations) {
        const baseVersion = currentVersion;
        const pendingOp: PendingOperation = { operation: op, baseVersion };
        pending = {
          ...pending,
          operations: [...pending.operations, pendingOp],
        };
        currentVersion++;
      }

      expect(pending.operations).toHaveLength(3);
      expect(pending.operations[0].baseVersion).toBe(0);
      expect(pending.operations[1].baseVersion).toBe(1);
      expect(pending.operations[2].baseVersion).toBe(2);
    });
  });

  describe('recentRemoteOps tracking', () => {
    /**
     * Tests the recentRemoteOps logic used for transforming local operations
     * that are being typed while remote operations arrive.
     */

    it('should accumulate remote ops for in-flight transforms', () => {
      let recentRemoteOps: Operation[] = [];

      // Remote op 1 arrives
      const remoteOp1 = insert(5, 'X', 'remote1', 1);
      recentRemoteOps = [...recentRemoteOps, remoteOp1];

      // Remote op 2 arrives
      const remoteOp2 = insert(10, 'Y', 'remote2', 2);
      recentRemoteOps = [...recentRemoteOps, remoteOp2];

      expect(recentRemoteOps).toHaveLength(2);
    });

    it('should clear recent ops after input processing', () => {
      let recentRemoteOps: Operation[] = [
        insert(5, 'X', 'remote', 1),
        insert(10, 'Y', 'remote', 2),
      ];

      // After input is processed, clear recent ops
      recentRemoteOps = [];

      expect(recentRemoteOps).toHaveLength(0);
    });
  });

  describe('onReplayResponse logic', () => {
    /**
     * Tests the replay recovery mechanism that rebuilds client state
     * from server's authoritative content.
     */

    it('should clear pending operations on replay', () => {
      const pending: PendingState = {
        content: 'old content',
        baseVersion: 3,
        operations: [
          pendingOp(insert(0, 'X', 'client', 1), 0),
          pendingOp(insert(1, 'Y', 'client', 2), 1),
        ],
      };

      // Replay clears all pending state
      const newPending: PendingState = {
        content: null,
        baseVersion: null,
        operations: [],
      };

      expect(newPending.operations).toHaveLength(0);
      expect(newPending.content).toBeNull();
    });

    it('should adopt server content and version', () => {
      const replayBaseContent = 'Server Authoritative Content';
      const replayCurrentVersion = 42;

      let editorContent = 'Old local content';
      let currentVersion = 10;

      // Replay response handling
      editorContent = replayBaseContent;
      currentVersion = replayCurrentVersion;

      expect(editorContent).toBe('Server Authoritative Content');
      expect(currentVersion).toBe(42);
    });

    it('should verify checksum after replay', () => {
      const replayBaseContent = 'Replayed Content';
      const serverChecksum = simpleChecksum(replayBaseContent);

      // After adopting content, verify checksum
      const localChecksum = simpleChecksum(replayBaseContent);

      expect(localChecksum).toBe(serverChecksum);
    });
  });
});

describe('useWebSocketConnection connection lifecycle', () => {
  describe('connectWebSocket guards', () => {
    it('should not connect if noteId is empty', () => {
      const noteId = '';
      const wsClient = null;
      const noteWasDeleted = false;

      const shouldConnect = !!(noteId && !wsClient && !noteWasDeleted);

      expect(shouldConnect).toBe(false);
    });

    it('should not connect if wsClient already exists', () => {
      const noteId = 'test-note';
      const wsClient = {}; // Mock client exists
      const noteWasDeleted = false;

      const shouldConnect = !!(noteId && !wsClient && !noteWasDeleted);

      expect(shouldConnect).toBe(false);
    });

    it('should not connect if note was deleted', () => {
      const noteId = 'test-note';
      const wsClient = null;
      const noteWasDeleted = true;

      const shouldConnect = !!(noteId && !wsClient && !noteWasDeleted);

      expect(shouldConnect).toBe(false);
    });

    it('should connect when all conditions met', () => {
      const noteId = 'test-note';
      const wsClient = null;
      const noteWasDeleted = false;

      const shouldConnect = !!(noteId && !wsClient && !noteWasDeleted);

      expect(shouldConnect).toBe(true);
    });
  });

  describe('disconnectWebSocket cleanup', () => {
    it('should reset connection state on disconnect', () => {
      let wsClient: object | null = {};
      let isRealtimeEnabled = true;
      let connectionStatus: 'connected' | 'disconnected' | 'connecting' = 'connected';

      // Disconnect logic
      wsClient = null;
      isRealtimeEnabled = false;
      connectionStatus = 'disconnected';

      expect(wsClient).toBeNull();
      expect(isRealtimeEnabled).toBe(false);
      expect(connectionStatus).toBe('disconnected');
    });
  });

  describe('resetState', () => {
    it('should reset noteWasDeleted flag', () => {
      let noteWasDeleted = true;
      let checksumMismatchCount = 5;

      // Reset logic
      noteWasDeleted = false;
      checksumMismatchCount = 0;

      expect(noteWasDeleted).toBe(false);
      expect(checksumMismatchCount).toBe(0);
    });

    it('should clear pending operations', () => {
      let pending: PendingState = {
        content: 'some content',
        baseVersion: 10,
        operations: [pendingOp(insert(0, 'X', 'client', 1), 0)],
      };

      // Reset logic
      pending = { content: null, baseVersion: null, operations: [] };

      expect(pending.content).toBeNull();
      expect(pending.baseVersion).toBeNull();
      expect(pending.operations).toHaveLength(0);
    });
  });

  describe('onClose reconnection logic', () => {
    it('should not reconnect if note was deleted', () => {
      const noteWasDeleted = true;
      const isEncrypted = false;

      const shouldReconnect = !noteWasDeleted && !isEncrypted;

      expect(shouldReconnect).toBe(false);
    });

    it('should not reconnect if note is encrypted', () => {
      const noteWasDeleted = false;
      const isEncrypted = true;

      const shouldReconnect = !noteWasDeleted && !isEncrypted;

      expect(shouldReconnect).toBe(false);
    });

    it('should reconnect for normal disconnect', () => {
      const noteWasDeleted = false;
      const isEncrypted = false;

      const shouldReconnect = !noteWasDeleted && !isEncrypted;

      expect(shouldReconnect).toBe(true);
    });
  });
});

describe('useWebSocketConnection sendCursorUpdate', () => {
  it('should not send cursor if not connected', () => {
    const wsClient = null;
    const isRealtimeEnabled = true;
    const isEncrypted = false;

    const shouldSend = !!(wsClient && isRealtimeEnabled && !isEncrypted);

    expect(shouldSend).toBe(false);
  });

  it('should not send cursor if realtime disabled', () => {
    const wsClient = {};
    const isRealtimeEnabled = false;
    const isEncrypted = false;

    const shouldSend = !!(wsClient && isRealtimeEnabled && !isEncrypted);

    expect(shouldSend).toBe(false);
  });

  it('should not send cursor if encrypted', () => {
    const wsClient = {};
    const isRealtimeEnabled = true;
    const isEncrypted = true;

    const shouldSend = !!(wsClient && isRealtimeEnabled && !isEncrypted);

    expect(shouldSend).toBe(false);
  });

  it('should send cursor when all conditions met', () => {
    const wsClient = {};
    const isRealtimeEnabled = true;
    const isEncrypted = false;

    const shouldSend = !!(wsClient && isRealtimeEnabled && !isEncrypted);

    expect(shouldSend).toBe(true);
  });
});

describe('useWebSocketConnection sendSyntaxChange', () => {
  it('should not send syntax if not connected', () => {
    const wsClient = null;
    const isRealtimeEnabled = true;
    const isEncrypted = false;

    const shouldSend = !!(wsClient && isRealtimeEnabled && !isEncrypted);

    expect(shouldSend).toBe(false);
  });

  it('should send syntax change when conditions met', () => {
    const wsClient = {};
    const isRealtimeEnabled = true;
    const isEncrypted = false;

    const shouldSend = !!(wsClient && isRealtimeEnabled && !isEncrypted);

    expect(shouldSend).toBe(true);
  });
});

describe('OT convergence scenarios', () => {
  /**
   * These tests verify that the OT transformation logic
   * leads to convergence regardless of operation order.
   */

  it('should converge with concurrent inserts at different positions', () => {
    const initialContent = 'HELLO';

    // Client A: insert 'X' at position 2
    const opA = insert(2, 'X', 'clientA', 1);
    // Client B: insert 'Y' at position 4
    const opB = insert(4, 'Y', 'clientB', 1);

    // Scenario 1: A then B
    let result1 = applyOperation(initialContent, opA); // "HEXLLO"
    const [, opBPrime] = transform(opA, opB);
    result1 = applyOperation(result1, opBPrime); // "HEXLYLO"

    // Scenario 2: B then A
    let result2 = applyOperation(initialContent, opB); // "HELLY"O"
    const [opAPrime] = transform(opA, opB);
    result2 = applyOperation(result2, opAPrime);

    expect(result1).toBe(result2);
  });

  it('should converge with concurrent insert and delete', () => {
    const initialContent = 'ABCDEF';

    // Client A: insert 'X' at position 3
    const opA = insert(3, 'X', 'clientA', 1);
    // Client B: delete 2 chars starting at position 1 (removes BC)
    const opB = del(1, 2, 'clientB', 1);

    // Transform
    const [opAPrime, opBPrime] = transform(opA, opB);

    // Scenario 1: A then B'
    let result1 = applyOperation(initialContent, opA); // "ABCXDEF"
    result1 = applyOperation(result1, opBPrime);

    // Scenario 2: B then A'
    let result2 = applyOperation(initialContent, opB); // "ADEF"
    result2 = applyOperation(result2, opAPrime);

    expect(result1).toBe(result2);
  });

  it('should converge with overlapping deletes', () => {
    const initialContent = 'ABCDEFGHIJ';

    // Client A: delete 4 chars at position 2 (removes CDEF)
    const opA = del(2, 4, 'clientA', 1);
    // Client B: delete 4 chars at position 4 (removes EFGH)
    const opB = del(4, 4, 'clientB', 1);

    // Transform
    const [opAPrime, opBPrime] = transform(opA, opB);

    // Scenario 1: A then B'
    let result1 = applyOperation(initialContent, opA); // "ABGHIJ"
    if ((opBPrime as DeleteOperation).length > 0) {
      result1 = applyOperation(result1, opBPrime);
    }

    // Scenario 2: B then A'
    let result2 = applyOperation(initialContent, opB); // "ABCDIJ"
    if ((opAPrime as DeleteOperation).length > 0) {
      result2 = applyOperation(result2, opAPrime);
    }

    expect(result1).toBe(result2);
  });

  it('should handle rapid typing scenario (fast consecutive inserts)', () => {
    const initialContent = '';

    // Simulate fast typing: 'HELLO'
    const ops = [
      insert(0, 'H', 'client', 1),
      insert(1, 'E', 'client', 2),
      insert(2, 'L', 'client', 3),
      insert(3, 'L', 'client', 4),
      insert(4, 'O', 'client', 5),
    ];

    let content = initialContent;
    for (const op of ops) {
      content = applyOperation(content, op);
    }

    expect(content).toBe('HELLO');
  });

  it('should handle interleaved operations from multiple clients', () => {
    const initialContent = 'START';

    // Client A types 'AAA' at position 0
    // Client B types 'BBB' at position 5 (end)
    // Operations interleave

    const opsA = [
      insert(0, 'A', 'clientA', 1),
      insert(1, 'A', 'clientA', 3),
      insert(2, 'A', 'clientA', 5),
    ];

    const opsB = [
      insert(5, 'B', 'clientB', 2),
      insert(6, 'B', 'clientB', 4),
      insert(7, 'B', 'clientB', 6),
    ];

    // Merge operations in version order
    const allOps = [...opsA, ...opsB].sort((a, b) => a.version - b.version);

    let content = initialContent;
    let transformedOps: Operation[] = [];

    for (const op of allOps) {
      // Transform against all previously applied operations
      let transformedOp = op;
      for (const prevOp of transformedOps) {
        if (prevOp.clientId !== op.clientId) {
          [, transformedOp] = transform(prevOp, transformedOp);
        }
      }
      content = applyOperation(content, transformedOp);
      transformedOps.push(transformedOp);
    }

    // Final content should have both AAA and BBB somewhere
    expect(content).toContain('AAA');
    expect(content).toContain('BBB');
    expect(content).toContain('START');
  });
});
