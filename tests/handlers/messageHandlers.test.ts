/**
 * Tests for WebSocket message handlers in NoteSessionDurableObject.
 * Tests the extracted handler functions for OT operations, cursor updates,
 * syntax changes, and replay requests.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  handleOperation,
  handleCursorUpdate,
  handleSyntaxChange,
  handleReplayRequest,
  broadcast,
  broadcastCursorUpdate,
  broadcastSyntaxChange,
  broadcastOperation,
  broadcastEncryptionChange,
  broadcastVersionUpdate,
  broadcastUserJoined,
  broadcastUserLeft,
  broadcastNoteStatus,
} from '../../src/durable-objects/handlers/messageHandlers';
import type { NoteSessionContext } from '../../src/durable-objects/handlers/types';
import type { Operation, ClientSession, OperationMessage, CursorUpdateMessage, SyntaxChangeMessage, ReplayRequestMessage } from '../../src/ot/types';
import { RATE_LIMITS } from '../../config/constants';

// Helper to create insert operations
function insert(position: number, text: string, clientId = 'client1', version = 1): Operation {
  return { type: 'insert', position, text, clientId, version };
}

// Helper to create delete operations
function del(position: number, length: number, clientId = 'client1', version = 1): Operation {
  return { type: 'delete', position, length, clientId, version };
}

// Helper to create a mock WebSocket
function createMockWebSocket(): WebSocket {
  return {
    send: vi.fn(),
    close: vi.fn(),
    readyState: 1, // OPEN
  } as unknown as WebSocket;
}

// Helper to create an authenticated client session
function createMockSession(clientId: string, sessionId: string): ClientSession {
  return {
    clientId,
    sessionId,
    lastAckOperation: 0,
    isAuthenticated: true,
    ws: createMockWebSocket(),
    rateLimit: {
      tokens: RATE_LIMITS.WEBSOCKET.BURST_ALLOWANCE,
      lastRefill: Date.now(),
      violations: 0,
    },
  };
}

// Helper to create a mock NoteSessionContext
function createMockContext(overrides: Partial<NoteSessionContext> = {}): NoteSessionContext {
  const sessions = new Map<WebSocket, ClientSession>();

  return {
    noteId: 'test-note-id',
    currentContent: 'Hello World',
    operationVersion: 0,
    operationHistory: [],
    operationsSincePersist: 0,
    lastOperationSessionId: null,
    isEncrypted: false,
    currentSyntax: 'plaintext',
    globalSeqNum: 0,
    sessions,
    sendError: vi.fn(),
    schedulePersistence: vi.fn(),
    persistSyntaxToDB: vi.fn(),
    ...overrides,
  };
}

describe('handleOperation', () => {
  let ctx: NoteSessionContext;
  let ws: WebSocket;
  let session: ClientSession;

  beforeEach(() => {
    ctx = createMockContext();
    ws = createMockWebSocket();
    session = createMockSession('client-A', 'session-A');
    ctx.sessions.set(ws, session);
  });

  it('should reject unauthorized sessions', async () => {
    session.isAuthenticated = false;

    const message: OperationMessage = {
      type: 'operation',
      operation: insert(0, 'test'),
      baseVersion: 0,
      clientId: 'client-A',
      sessionId: 'session-A',
    };

    await handleOperation(ctx, ws, message);

    expect(ctx.sendError).toHaveBeenCalledWith(ws, 'Unauthorized');
    expect(ctx.operationVersion).toBe(0); // Version unchanged
  });

  it('should reject operations when session not found', async () => {
    const unknownWs = createMockWebSocket();

    const message: OperationMessage = {
      type: 'operation',
      operation: insert(0, 'test'),
      baseVersion: 0,
      clientId: 'client-A',
      sessionId: 'session-A',
    };

    await handleOperation(ctx, unknownWs, message);

    expect(ctx.sendError).toHaveBeenCalledWith(unknownWs, 'Unauthorized');
  });

  it('should apply insert operation and increment version', async () => {
    ctx.currentContent = 'Hello';
    ctx.operationVersion = 5;

    const message: OperationMessage = {
      type: 'operation',
      operation: insert(5, ' World', 'client-A', 0),
      baseVersion: 5,
      clientId: 'client-A',
      sessionId: 'session-A',
    };

    await handleOperation(ctx, ws, message);

    expect(ctx.currentContent).toBe('Hello World');
    expect(ctx.operationVersion).toBe(6);
    expect(ctx.operationHistory).toHaveLength(1);
    expect(ctx.operationHistory[0].version).toBe(6);
  });

  it('should apply delete operation correctly', async () => {
    ctx.currentContent = 'Hello World';
    ctx.operationVersion = 10;

    const message: OperationMessage = {
      type: 'operation',
      operation: del(5, 6, 'client-A', 0), // Delete " World"
      baseVersion: 10,
      clientId: 'client-A',
      sessionId: 'session-A',
    };

    await handleOperation(ctx, ws, message);

    expect(ctx.currentContent).toBe('Hello');
    expect(ctx.operationVersion).toBe(11);
  });

  it('should transform operation against concurrent operations from other clients', async () => {
    ctx.currentContent = 'AC'; // After historical op, content is "ABC"
    ctx.operationVersion = 1;

    // Historical operation: client-B inserted 'B' at position 1
    const historicalOp = insert(1, 'B', 'client-B', 1);
    ctx.operationHistory = [historicalOp];

    // Client-A sends an insert at position 1, based on version 0 (before B was inserted)
    const message: OperationMessage = {
      type: 'operation',
      operation: insert(1, 'X', 'client-A', 0),
      baseVersion: 0,
      clientId: 'client-A',
      sessionId: 'session-A',
    };

    await handleOperation(ctx, ws, message);

    // The operation should be transformed: X should go after B
    // Client-A's 'X' at pos 1 vs Client-B's 'B' at pos 1
    // Since 'client-A' < 'client-B', client-A wins tie-break, so X stays at 1
    // But content was 'AC', historical op was 'B' at 1, so current content is...
    // Actually let's trace through: currentContent is 'AC' (after we apply ops)
    // Historical op: insert 'B' at 1 -> transforms incoming op
    // With tie-breaking: 'client-A' < 'client-B', so client-A goes first at same position
    // This means the incoming op position stays at 1
    // Result: apply insert 'X' at position 1 on 'AC' -> 'AXC'
    expect(ctx.currentContent).toBe('AXC');
    expect(ctx.operationVersion).toBe(2);
  });

  it('should NOT transform against same client operations', async () => {
    ctx.currentContent = 'AB';
    ctx.operationVersion = 1;

    // Historical operation from SAME client
    const historicalOp = insert(1, 'X', 'client-A', 1);
    ctx.operationHistory = [historicalOp];

    // Same client sends another operation
    const message: OperationMessage = {
      type: 'operation',
      operation: insert(2, 'Y', 'client-A', 0),
      baseVersion: 0,
      clientId: 'client-A',
      sessionId: 'session-A',
    };

    await handleOperation(ctx, ws, message);

    // Should NOT transform against own operation
    // Insert 'Y' at position 2 in 'AB' -> 'ABY'
    expect(ctx.currentContent).toBe('ABY');
  });

  it('should send ACK with transformed operation and checksum', async () => {
    ctx.currentContent = 'Hello';
    ctx.operationVersion = 0;

    const message: OperationMessage = {
      type: 'operation',
      operation: insert(5, ' World', 'client-A', 0),
      baseVersion: 0,
      clientId: 'client-A',
      sessionId: 'session-A',
    };

    await handleOperation(ctx, ws, message);

    expect(ws.send).toHaveBeenCalled();
    const sentMessage = JSON.parse((ws.send as ReturnType<typeof vi.fn>).mock.calls[0][0]);

    expect(sentMessage.type).toBe('ack');
    expect(sentMessage.version).toBe(1);
    expect(sentMessage.transformedOperation).toBeDefined();
    expect(sentMessage.contentChecksum).toBeDefined();
    expect(typeof sentMessage.contentChecksum).toBe('number');
  });

  it('should broadcast operation to other clients', async () => {
    const ws2 = createMockWebSocket();
    const session2 = createMockSession('client-B', 'session-B');
    ctx.sessions.set(ws2, session2);

    ctx.currentContent = 'Hello';
    ctx.operationVersion = 0;

    const message: OperationMessage = {
      type: 'operation',
      operation: insert(5, ' World', 'client-A', 0),
      baseVersion: 0,
      clientId: 'client-A',
      sessionId: 'session-A',
    };

    await handleOperation(ctx, ws, message);

    // ws2 should receive broadcast (ws is the sender, so it gets ACK instead)
    expect(ws2.send).toHaveBeenCalled();
    const broadcastMsg = JSON.parse((ws2.send as ReturnType<typeof vi.fn>).mock.calls[0][0]);
    expect(broadcastMsg.type).toBe('operation');
  });

  it('should schedule persistence after operation', async () => {
    const message: OperationMessage = {
      type: 'operation',
      operation: insert(0, 'test', 'client-A', 0),
      baseVersion: 0,
      clientId: 'client-A',
      sessionId: 'session-A',
    };

    await handleOperation(ctx, ws, message);

    expect(ctx.schedulePersistence).toHaveBeenCalledWith(false);
  });

  it('should track operations since persist', async () => {
    ctx.operationsSincePersist = 5;

    const message: OperationMessage = {
      type: 'operation',
      operation: insert(0, 'test', 'client-A', 0),
      baseVersion: 0,
      clientId: 'client-A',
      sessionId: 'session-A',
    };

    await handleOperation(ctx, ws, message);

    expect(ctx.operationsSincePersist).toBe(6);
    expect(ctx.lastOperationSessionId).toBe('session-A');
  });

  it('should compact operation history when exceeding 100 operations', async () => {
    // Fill history with 100 operations
    ctx.operationHistory = Array.from({ length: 100 }, (_, i) =>
      insert(0, 'x', 'client-X', i + 1)
    );
    ctx.operationVersion = 100;

    const message: OperationMessage = {
      type: 'operation',
      operation: insert(0, 'new', 'client-A', 0),
      baseVersion: 100,
      clientId: 'client-A',
      sessionId: 'session-A',
    };

    await handleOperation(ctx, ws, message);

    expect(ctx.operationHistory.length).toBe(100); // Still 100 after compaction
    expect(ctx.operationHistory[ctx.operationHistory.length - 1].version).toBe(101);
  });

  describe('rate limiting', () => {
    it('should allow operations within rate limit', async () => {
      const message: OperationMessage = {
        type: 'operation',
        operation: insert(0, 'test', 'client-A', 0),
        baseVersion: 0,
        clientId: 'client-A',
        sessionId: 'session-A',
      };

      await handleOperation(ctx, ws, message);

      expect(ctx.operationVersion).toBe(1);
      expect(session.rateLimit.tokens).toBeLessThan(RATE_LIMITS.WEBSOCKET.BURST_ALLOWANCE);
    });

    it('should reject operations when rate limited', async () => {
      session.rateLimit.tokens = 0;
      session.rateLimit.lastRefill = Date.now(); // Just refilled but still 0

      const message: OperationMessage = {
        type: 'operation',
        operation: insert(0, 'test', 'client-A', 0),
        baseVersion: 0,
        clientId: 'client-A',
        sessionId: 'session-A',
      };

      await handleOperation(ctx, ws, message);

      expect(ctx.sendError).toHaveBeenCalledWith(ws, RATE_LIMITS.PENALTY.WARNING_MESSAGE);
      expect(ctx.operationVersion).toBe(0); // No change
      expect(session.rateLimit.violations).toBe(1);
    });

    it('should disconnect after exceeding violation threshold', async () => {
      session.rateLimit.tokens = 0;
      session.rateLimit.lastRefill = Date.now();
      session.rateLimit.violations = RATE_LIMITS.PENALTY.DISCONNECT_THRESHOLD;

      const message: OperationMessage = {
        type: 'operation',
        operation: insert(0, 'test', 'client-A', 0),
        baseVersion: 0,
        clientId: 'client-A',
        sessionId: 'session-A',
      };

      await handleOperation(ctx, ws, message);

      expect(ws.close).toHaveBeenCalledWith(1008, 'Rate limit exceeded');
      expect(ctx.sessions.has(ws)).toBe(false);
    });

    it('should refill tokens based on elapsed time', async () => {
      session.rateLimit.tokens = 0;
      // Set lastRefill to 2 seconds ago
      session.rateLimit.lastRefill = Date.now() - 2000;

      const message: OperationMessage = {
        type: 'operation',
        operation: insert(0, 'test', 'client-A', 0),
        baseVersion: 0,
        clientId: 'client-A',
        sessionId: 'session-A',
      };

      await handleOperation(ctx, ws, message);

      // Should have refilled ~60 tokens (30 ops/sec * 2 sec)
      // Operation should succeed
      expect(ctx.operationVersion).toBe(1);
    });
  });
});

describe('handleCursorUpdate', () => {
  let ctx: NoteSessionContext;
  let ws: WebSocket;
  let session: ClientSession;

  beforeEach(() => {
    ctx = createMockContext();
    ws = createMockWebSocket();
    session = createMockSession('client-A', 'session-A');
    ctx.sessions.set(ws, session);
  });

  it('should ignore unauthorized sessions', async () => {
    session.isAuthenticated = false;

    const message: CursorUpdateMessage = {
      type: 'cursor_update',
      clientId: 'client-A',
      position: 10,
    };

    await handleCursorUpdate(ctx, ws, message);

    expect(ws.send).not.toHaveBeenCalled();
  });

  it('should broadcast cursor update to other clients', async () => {
    const ws2 = createMockWebSocket();
    const session2 = createMockSession('client-B', 'session-B');
    ctx.sessions.set(ws2, session2);

    const message: CursorUpdateMessage = {
      type: 'cursor_update',
      clientId: 'client-A',
      position: 42,
    };

    await handleCursorUpdate(ctx, ws, message);

    // ws2 should receive broadcast
    expect(ws2.send).toHaveBeenCalled();
    const broadcastMsg = JSON.parse((ws2.send as ReturnType<typeof vi.fn>).mock.calls[0][0]);
    expect(broadcastMsg.type).toBe('cursor_update');
    expect(broadcastMsg.clientId).toBe('client-A');
    expect(broadcastMsg.position).toBe(42);
  });

  it('should send cursor_ack to sender', async () => {
    const message: CursorUpdateMessage = {
      type: 'cursor_update',
      clientId: 'client-A',
      position: 10,
    };

    await handleCursorUpdate(ctx, ws, message);

    expect(ws.send).toHaveBeenCalled();
    const ackMsg = JSON.parse((ws.send as ReturnType<typeof vi.fn>).mock.calls[0][0]);
    expect(ackMsg.type).toBe('cursor_ack');
    expect(ackMsg.seqNum).toBeDefined();
  });

  it('should increment global sequence number', async () => {
    ctx.globalSeqNum = 5;

    const message: CursorUpdateMessage = {
      type: 'cursor_update',
      clientId: 'client-A',
      position: 10,
    };

    await handleCursorUpdate(ctx, ws, message);

    expect(ctx.globalSeqNum).toBe(6);
  });
});

describe('handleSyntaxChange', () => {
  let ctx: NoteSessionContext;
  let ws: WebSocket;
  let session: ClientSession;

  beforeEach(() => {
    ctx = createMockContext();
    ws = createMockWebSocket();
    session = createMockSession('client-A', 'session-A');
    ctx.sessions.set(ws, session);
  });

  it('should ignore unauthorized sessions', async () => {
    session.isAuthenticated = false;

    const message: SyntaxChangeMessage = {
      type: 'syntax_change',
      syntax: 'javascript',
      clientId: 'client-A',
    };

    await handleSyntaxChange(ctx, ws, message);

    expect(ctx.currentSyntax).toBe('plaintext'); // Unchanged
  });

  it('should update current syntax', async () => {
    const message: SyntaxChangeMessage = {
      type: 'syntax_change',
      syntax: 'python',
      clientId: 'client-A',
    };

    await handleSyntaxChange(ctx, ws, message);

    expect(ctx.currentSyntax).toBe('python');
  });

  it('should broadcast syntax change to other clients', async () => {
    const ws2 = createMockWebSocket();
    const session2 = createMockSession('client-B', 'session-B');
    ctx.sessions.set(ws2, session2);

    const message: SyntaxChangeMessage = {
      type: 'syntax_change',
      syntax: 'typescript',
      clientId: 'client-A',
    };

    await handleSyntaxChange(ctx, ws, message);

    expect(ws2.send).toHaveBeenCalled();
    const broadcastMsg = JSON.parse((ws2.send as ReturnType<typeof vi.fn>).mock.calls[0][0]);
    expect(broadcastMsg.type).toBe('syntax_change');
    expect(broadcastMsg.syntax).toBe('typescript');
  });

  it('should send syntax_ack to sender', async () => {
    const message: SyntaxChangeMessage = {
      type: 'syntax_change',
      syntax: 'rust',
      clientId: 'client-A',
    };

    await handleSyntaxChange(ctx, ws, message);

    expect(ws.send).toHaveBeenCalled();
    const ackMsg = JSON.parse((ws.send as ReturnType<typeof vi.fn>).mock.calls[0][0]);
    expect(ackMsg.type).toBe('syntax_ack');
    expect(ackMsg.seqNum).toBeDefined();
  });

  it('should persist syntax to database', async () => {
    const message: SyntaxChangeMessage = {
      type: 'syntax_change',
      syntax: 'go',
      clientId: 'client-A',
    };

    await handleSyntaxChange(ctx, ws, message);

    expect(ctx.persistSyntaxToDB).toHaveBeenCalledWith('go');
  });
});

describe('handleReplayRequest', () => {
  let ctx: NoteSessionContext;
  let ws: WebSocket;
  let session: ClientSession;

  beforeEach(() => {
    ctx = createMockContext();
    ws = createMockWebSocket();
    session = createMockSession('client-A', 'session-A');
    ctx.sessions.set(ws, session);
  });

  it('should ignore unauthorized sessions', async () => {
    session.isAuthenticated = false;

    const message: ReplayRequestMessage = {
      type: 'replay_request',
      fromVersion: 0,
      clientId: 'client-A',
      sessionId: 'session-A',
    };

    await handleReplayRequest(ctx, ws, message);

    expect(ws.send).not.toHaveBeenCalled();
  });

  it('should send replay response with current content and history', async () => {
    ctx.currentContent = 'Hello World';
    ctx.operationVersion = 5;
    ctx.operationHistory = [
      insert(0, 'H', 'client-X', 3),
      insert(1, 'e', 'client-X', 4),
      insert(2, 'l', 'client-X', 5),
    ];

    const message: ReplayRequestMessage = {
      type: 'replay_request',
      fromVersion: 3,
      clientId: 'client-A',
      sessionId: 'session-A',
    };

    await handleReplayRequest(ctx, ws, message);

    expect(ws.send).toHaveBeenCalled();
    const response = JSON.parse((ws.send as ReturnType<typeof vi.fn>).mock.calls[0][0]);

    expect(response.type).toBe('replay_response');
    expect(response.baseContent).toBe('Hello World');
    expect(response.baseVersion).toBe(5);
    expect(response.currentVersion).toBe(5);
    expect(response.contentChecksum).toBeDefined();
    expect(response.operations).toHaveLength(2); // ops with version > 3
  });

  it('should filter operations from requested version', async () => {
    ctx.operationVersion = 10;
    ctx.operationHistory = [
      insert(0, 'a', 'client-X', 5),
      insert(1, 'b', 'client-X', 6),
      insert(2, 'c', 'client-X', 7),
      insert(3, 'd', 'client-X', 8),
    ];

    const message: ReplayRequestMessage = {
      type: 'replay_request',
      fromVersion: 6,
      clientId: 'client-A',
      sessionId: 'session-A',
    };

    await handleReplayRequest(ctx, ws, message);

    const response = JSON.parse((ws.send as ReturnType<typeof vi.fn>).mock.calls[0][0]);
    expect(response.operations).toHaveLength(2); // versions 7 and 8
    expect(response.operations[0].version).toBe(7);
    expect(response.operations[1].version).toBe(8);
  });

  it('should handle empty operation history', async () => {
    ctx.currentContent = 'Initial content';
    ctx.operationVersion = 0;
    ctx.operationHistory = [];

    const message: ReplayRequestMessage = {
      type: 'replay_request',
      fromVersion: 0,
      clientId: 'client-A',
      sessionId: 'session-A',
    };

    await handleReplayRequest(ctx, ws, message);

    const response = JSON.parse((ws.send as ReturnType<typeof vi.fn>).mock.calls[0][0]);
    expect(response.operations).toHaveLength(0);
    expect(response.baseContent).toBe('Initial content');
  });
});

describe('broadcast functions', () => {
  let ctx: NoteSessionContext;

  beforeEach(() => {
    ctx = createMockContext();
  });

  describe('broadcast', () => {
    it('should send message to all connected clients', () => {
      const ws1 = createMockWebSocket();
      const ws2 = createMockWebSocket();
      ctx.sessions.set(ws1, createMockSession('client-A', 'session-A'));
      ctx.sessions.set(ws2, createMockSession('client-B', 'session-B'));

      broadcast(ctx, { type: 'test', data: 'hello' });

      expect(ws1.send).toHaveBeenCalled();
      expect(ws2.send).toHaveBeenCalled();
    });

    it('should exclude specified clientId', () => {
      const ws1 = createMockWebSocket();
      const ws2 = createMockWebSocket();
      ctx.sessions.set(ws1, createMockSession('client-A', 'session-A'));
      ctx.sessions.set(ws2, createMockSession('client-B', 'session-B'));

      broadcast(ctx, { type: 'test' }, { excludeClientId: 'client-A' });

      expect(ws1.send).not.toHaveBeenCalled();
      expect(ws2.send).toHaveBeenCalled();
    });

    it('should exclude specified sessionId', () => {
      const ws1 = createMockWebSocket();
      const ws2 = createMockWebSocket();
      ctx.sessions.set(ws1, createMockSession('client-A', 'session-A'));
      ctx.sessions.set(ws2, createMockSession('client-B', 'session-B'));

      broadcast(ctx, { type: 'test' }, { excludeSessionId: 'session-B' });

      expect(ws1.send).toHaveBeenCalled();
      expect(ws2.send).not.toHaveBeenCalled();
    });

    it('should handle send errors gracefully', () => {
      const ws1 = createMockWebSocket();
      (ws1.send as ReturnType<typeof vi.fn>).mockImplementation(() => {
        throw new Error('Connection closed');
      });
      ctx.sessions.set(ws1, createMockSession('client-A', 'session-A'));

      // Should not throw
      expect(() => broadcast(ctx, { type: 'test' })).not.toThrow();
    });
  });

  describe('broadcastCursorUpdate', () => {
    it('should broadcast cursor position and return seqNum', () => {
      const ws = createMockWebSocket();
      ctx.sessions.set(ws, createMockSession('client-B', 'session-B'));
      ctx.globalSeqNum = 10;

      const seqNum = broadcastCursorUpdate(ctx, 'client-A', 42);

      expect(seqNum).toBe(11);
      expect(ctx.globalSeqNum).toBe(11);

      const msg = JSON.parse((ws.send as ReturnType<typeof vi.fn>).mock.calls[0][0]);
      expect(msg.type).toBe('cursor_update');
      expect(msg.clientId).toBe('client-A');
      expect(msg.position).toBe(42);
      expect(msg.seqNum).toBe(11);
    });

    it('should not send to the cursor owner', () => {
      const wsA = createMockWebSocket();
      const wsB = createMockWebSocket();
      ctx.sessions.set(wsA, createMockSession('client-A', 'session-A'));
      ctx.sessions.set(wsB, createMockSession('client-B', 'session-B'));

      broadcastCursorUpdate(ctx, 'client-A', 10);

      expect(wsA.send).not.toHaveBeenCalled();
      expect(wsB.send).toHaveBeenCalled();
    });
  });

  describe('broadcastSyntaxChange', () => {
    it('should broadcast syntax change and return seqNum', () => {
      const ws = createMockWebSocket();
      ctx.sessions.set(ws, createMockSession('client-B', 'session-B'));
      ctx.globalSeqNum = 5;

      const seqNum = broadcastSyntaxChange(ctx, 'client-A', 'python');

      expect(seqNum).toBe(6);

      const msg = JSON.parse((ws.send as ReturnType<typeof vi.fn>).mock.calls[0][0]);
      expect(msg.type).toBe('syntax_change');
      expect(msg.syntax).toBe('python');
      expect(msg.clientId).toBe('client-A');
    });
  });

  describe('broadcastOperation', () => {
    it('should broadcast operation with checksum and return seqNum', () => {
      const ws = createMockWebSocket();
      ctx.sessions.set(ws, createMockSession('client-B', 'session-B'));
      ctx.globalSeqNum = 20;

      const op = insert(5, 'test', 'client-A', 10);
      const seqNum = broadcastOperation(ctx, op, 'client-A', 12345);

      expect(seqNum).toBe(21);

      const msg = JSON.parse((ws.send as ReturnType<typeof vi.fn>).mock.calls[0][0]);
      expect(msg.type).toBe('operation');
      expect(msg.operation).toEqual(op);
      expect(msg.contentChecksum).toBe(12345);
      expect(msg.baseVersion).toBe(9); // operation.version - 1
    });
  });

  describe('broadcastEncryptionChange', () => {
    it('should update context and broadcast encryption status', () => {
      const ws = createMockWebSocket();
      ctx.sessions.set(ws, createMockSession('client-A', 'session-A'));
      ctx.isEncrypted = false;

      broadcastEncryptionChange(ctx, true);

      expect(ctx.isEncrypted).toBe(true);

      const msg = JSON.parse((ws.send as ReturnType<typeof vi.fn>).mock.calls[0][0]);
      expect(msg.type).toBe('encryption_changed');
      expect(msg.is_encrypted).toBe(true);
    });

    it('should exclude specified session', () => {
      const wsA = createMockWebSocket();
      const wsB = createMockWebSocket();
      ctx.sessions.set(wsA, createMockSession('client-A', 'session-A'));
      ctx.sessions.set(wsB, createMockSession('client-B', 'session-B'));

      broadcastEncryptionChange(ctx, true, 'session-A');

      expect(wsA.send).not.toHaveBeenCalled();
      expect(wsB.send).toHaveBeenCalled();
    });
  });

  describe('broadcastVersionUpdate', () => {
    it('should broadcast version update message', () => {
      const ws = createMockWebSocket();
      ctx.sessions.set(ws, createMockSession('client-A', 'session-A'));

      broadcastVersionUpdate(ctx, 42);

      const msg = JSON.parse((ws.send as ReturnType<typeof vi.fn>).mock.calls[0][0]);
      expect(msg.type).toBe('version_update');
      expect(msg.version).toBe(42);
      expect(msg.message).toBe('Note was updated by another user');
    });
  });

  describe('broadcastUserJoined', () => {
    it('should broadcast user joined with connected users list', () => {
      const wsA = createMockWebSocket();
      const wsB = createMockWebSocket();
      ctx.sessions.set(wsA, createMockSession('client-A', 'session-A'));
      ctx.sessions.set(wsB, createMockSession('client-B', 'session-B'));
      ctx.globalSeqNum = 0;

      broadcastUserJoined(ctx, 'client-B');

      const msg = JSON.parse((wsA.send as ReturnType<typeof vi.fn>).mock.calls[0][0]);
      expect(msg.type).toBe('user_joined');
      expect(msg.clientId).toBe('client-B');
      expect(msg.connectedUsers).toContain('client-A');
      expect(msg.connectedUsers).toContain('client-B');
      expect(msg.seqNum).toBe(1);
    });
  });

  describe('broadcastUserLeft', () => {
    it('should broadcast user left with remaining users list', () => {
      const wsA = createMockWebSocket();
      ctx.sessions.set(wsA, createMockSession('client-A', 'session-A'));
      ctx.globalSeqNum = 5;

      broadcastUserLeft(ctx, 'client-B');

      const msg = JSON.parse((wsA.send as ReturnType<typeof vi.fn>).mock.calls[0][0]);
      expect(msg.type).toBe('user_left');
      expect(msg.clientId).toBe('client-B');
      expect(msg.connectedUsers).toContain('client-A');
      expect(msg.connectedUsers).not.toContain('client-B');
      expect(msg.seqNum).toBe(6);
    });
  });

  describe('broadcastNoteStatus', () => {
    it('should broadcast note status information', () => {
      const ws = createMockWebSocket();
      ctx.sessions.set(ws, createMockSession('client-A', 'session-A'));

      broadcastNoteStatus(ctx, 5, 10, 1704067200000);

      const msg = JSON.parse((ws.send as ReturnType<typeof vi.fn>).mock.calls[0][0]);
      expect(msg.type).toBe('note_status');
      expect(msg.view_count).toBe(5);
      expect(msg.max_views).toBe(10);
      expect(msg.expires_at).toBe(1704067200000);
    });

    it('should handle null values for optional fields', () => {
      const ws = createMockWebSocket();
      ctx.sessions.set(ws, createMockSession('client-A', 'session-A'));

      broadcastNoteStatus(ctx, 1, null, null);

      const msg = JSON.parse((ws.send as ReturnType<typeof vi.fn>).mock.calls[0][0]);
      expect(msg.max_views).toBeNull();
      expect(msg.expires_at).toBeNull();
    });
  });
});
