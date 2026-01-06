/**
 * Tests for WebSocket message handlers in NoteSessionDurableObject.
 * Tests the extracted handler functions for Yjs updates, awareness updates,
 * syntax changes, and request edit functionality.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  handleYjsUpdate,
  handleAwarenessUpdate,
  handleSyntaxChange,
  handleYjsStateRequest,
  handleRequestEdit,
  broadcast,
  broadcastYjsUpdate,
  broadcastAwarenessUpdate,
  broadcastSyntaxChange,
  broadcastEncryptionChange,
  broadcastVersionUpdate,
  broadcastUserJoined,
  broadcastUserLeft,
  broadcastNoteStatus,
  broadcastEditorCountUpdate,
} from '../../src/durable-objects/handlers/messageHandlers';
import type { NoteSessionContext } from '../../src/durable-objects/handlers/types';
import type { ClientSession, YjsUpdateMessage, AwarenessUpdateMessage, SyntaxChangeMessage, RequestEditMessage, YjsStateRequestMessage } from '../../src/types/messages';
import { RATE_LIMITS, EDITOR_LIMITS } from '../../config/constants';

// Helper to encode Uint8Array to base64
function encodeBase64(data: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < data.length; i++) {
    binary += String.fromCharCode(data[i]);
  }
  return btoa(binary);
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
function createMockSession(clientId: string, sessionId: string, lastEditAt: number | null = null): ClientSession {
  return {
    clientId,
    sessionId,
    isAuthenticated: true,
    rateLimit: {
      tokens: RATE_LIMITS.WEBSOCKET.BURST_ALLOWANCE,
      lastRefill: Date.now(),
      violations: 0,
    },
    lastEditAt,
  };
}

// Helper to create a mock NoteSessionContext
function createMockContext(overrides: Partial<NoteSessionContext> = {}): NoteSessionContext {
  const sessions = new Map<WebSocket, ClientSession>();

  return {
    noteId: 'test-note-id',
    currentContent: 'Hello World',
    yjsState: null,
    updatesSincePersist: 0,
    lastEditSessionId: null,
    isEncrypted: false,
    currentSyntax: 'plaintext',
    globalSeqNum: 0,
    sessions,
    sendError: vi.fn(),
    schedulePersistence: vi.fn(),
    persistSyntaxToDB: vi.fn(),
    applyYjsUpdate: vi.fn(),
    getYjsState: vi.fn(() => new Uint8Array([1, 2, 3])),
    getContent: vi.fn(() => 'Hello World'),
    ...overrides,
  };
}

describe('handleYjsUpdate', () => {
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

    const message: YjsUpdateMessage = {
      type: 'yjs_update',
      update: encodeBase64(new Uint8Array([1, 2, 3])),
      clientId: 'client-A',
    };

    await handleYjsUpdate(ctx, ws, message);

    expect(ctx.sendError).toHaveBeenCalledWith(ws, 'Unauthorized');
    expect(ctx.applyYjsUpdate).not.toHaveBeenCalled();
  });

  it('should reject updates when session not found', async () => {
    const unknownWs = createMockWebSocket();

    const message: YjsUpdateMessage = {
      type: 'yjs_update',
      update: encodeBase64(new Uint8Array([1, 2, 3])),
      clientId: 'client-A',
    };

    await handleYjsUpdate(ctx, unknownWs, message);

    expect(ctx.sendError).toHaveBeenCalledWith(unknownWs, 'Unauthorized');
  });

  it('should apply Yjs update and broadcast to others', async () => {
    const ws2 = createMockWebSocket();
    const session2 = createMockSession('client-B', 'session-B');
    ctx.sessions.set(ws2, session2);

    const testUpdate = new Uint8Array([10, 20, 30]);
    const message: YjsUpdateMessage = {
      type: 'yjs_update',
      update: encodeBase64(testUpdate),
      clientId: 'client-A',
    };

    await handleYjsUpdate(ctx, ws, message);

    // Should apply the update
    expect(ctx.applyYjsUpdate).toHaveBeenCalled();

    // Should broadcast to other client
    expect(ws2.send).toHaveBeenCalled();
    // Find the yjs_update broadcast (there may also be an editor_count_update)
    const ws2Calls = (ws2.send as ReturnType<typeof vi.fn>).mock.calls;
    const yjsUpdateCall = ws2Calls.find((call: string[]) => {
      const msg = JSON.parse(call[0]);
      return msg.type === 'yjs_update';
    });
    expect(yjsUpdateCall).toBeDefined();
    const broadcastMsg = JSON.parse(yjsUpdateCall![0]);
    expect(broadcastMsg.type).toBe('yjs_update');
  });

  it('should send ACK to sender', async () => {
    const message: YjsUpdateMessage = {
      type: 'yjs_update',
      update: encodeBase64(new Uint8Array([1])),
      clientId: 'client-A',
    };

    await handleYjsUpdate(ctx, ws, message);

    // Find the ACK message
    const wsCalls = (ws.send as ReturnType<typeof vi.fn>).mock.calls;
    const ackCall = wsCalls.find((call: string[]) => {
      const msg = JSON.parse(call[0]);
      return msg.type === 'yjs_ack';
    });
    expect(ackCall).toBeDefined();
    const sentMessage = JSON.parse(ackCall![0]);
    expect(sentMessage.type).toBe('yjs_ack');
    expect(sentMessage.seqNum).toBeDefined();
  });

  it('should schedule persistence after update', async () => {
    const message: YjsUpdateMessage = {
      type: 'yjs_update',
      update: encodeBase64(new Uint8Array([1])),
      clientId: 'client-A',
    };

    await handleYjsUpdate(ctx, ws, message);

    expect(ctx.schedulePersistence).toHaveBeenCalledWith(false);
  });

  it('should track updates since persist', async () => {
    ctx.updatesSincePersist = 5;

    const message: YjsUpdateMessage = {
      type: 'yjs_update',
      update: encodeBase64(new Uint8Array([1])),
      clientId: 'client-A',
    };

    await handleYjsUpdate(ctx, ws, message);

    expect(ctx.updatesSincePersist).toBe(6);
    expect(ctx.lastEditSessionId).toBe('session-A');
  });

  describe('rate limiting', () => {
    it('should allow updates within rate limit', async () => {
      const message: YjsUpdateMessage = {
        type: 'yjs_update',
        update: encodeBase64(new Uint8Array([1])),
        clientId: 'client-A',
      };

      await handleYjsUpdate(ctx, ws, message);

      expect(ctx.applyYjsUpdate).toHaveBeenCalled();
      expect(session.rateLimit.tokens).toBeLessThan(RATE_LIMITS.WEBSOCKET.BURST_ALLOWANCE);
    });

    it('should reject updates when rate limited', async () => {
      session.rateLimit.tokens = 0;
      session.rateLimit.lastRefill = Date.now();

      const message: YjsUpdateMessage = {
        type: 'yjs_update',
        update: encodeBase64(new Uint8Array([1])),
        clientId: 'client-A',
      };

      await handleYjsUpdate(ctx, ws, message);

      expect(ctx.sendError).toHaveBeenCalledWith(ws, RATE_LIMITS.PENALTY.WARNING_MESSAGE);
      expect(ctx.applyYjsUpdate).not.toHaveBeenCalled();
      expect(session.rateLimit.violations).toBe(1);
    });

    it('should disconnect after exceeding violation threshold', async () => {
      session.rateLimit.tokens = 0;
      session.rateLimit.lastRefill = Date.now();
      session.rateLimit.violations = RATE_LIMITS.PENALTY.DISCONNECT_THRESHOLD;

      const message: YjsUpdateMessage = {
        type: 'yjs_update',
        update: encodeBase64(new Uint8Array([1])),
        clientId: 'client-A',
      };

      await handleYjsUpdate(ctx, ws, message);

      expect(ws.close).toHaveBeenCalledWith(1008, 'Rate limit exceeded');
      expect(ctx.sessions.has(ws)).toBe(false);
    });
  });
});

describe('handleAwarenessUpdate', () => {
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

    const message: AwarenessUpdateMessage = {
      type: 'awareness_update',
      update: encodeBase64(new Uint8Array([1])),
      clientId: 'client-A',
    };

    await handleAwarenessUpdate(ctx, ws, message);

    expect(ws.send).not.toHaveBeenCalled();
  });

  it('should broadcast awareness update to other clients', async () => {
    const ws2 = createMockWebSocket();
    const session2 = createMockSession('client-B', 'session-B');
    ctx.sessions.set(ws2, session2);

    const message: AwarenessUpdateMessage = {
      type: 'awareness_update',
      update: encodeBase64(new Uint8Array([100, 200])),
      clientId: 'client-A',
    };

    await handleAwarenessUpdate(ctx, ws, message);

    // ws2 should receive broadcast
    expect(ws2.send).toHaveBeenCalled();
    const broadcastMsg = JSON.parse((ws2.send as ReturnType<typeof vi.fn>).mock.calls[0][0]);
    expect(broadcastMsg.type).toBe('awareness_update');
    expect(broadcastMsg.clientId).toBe('client-A');
  });
});

describe('handleYjsStateRequest', () => {
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

    const message: YjsStateRequestMessage = {
      type: 'yjs_state_request',
      clientId: 'client-A',
    };

    await handleYjsStateRequest(ctx, ws, message);

    expect(ws.send).not.toHaveBeenCalled();
  });

  it('should send full Yjs state in response', async () => {
    const message: YjsStateRequestMessage = {
      type: 'yjs_state_request',
      clientId: 'client-A',
    };

    await handleYjsStateRequest(ctx, ws, message);

    expect(ws.send).toHaveBeenCalled();
    const response = JSON.parse((ws.send as ReturnType<typeof vi.fn>).mock.calls[0][0]);
    expect(response.type).toBe('yjs_state_response');
    expect(response.state).toBeDefined();
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

    it('should handle send errors gracefully', () => {
      const ws1 = createMockWebSocket();
      (ws1.send as ReturnType<typeof vi.fn>).mockImplementation(() => {
        throw new Error('Connection closed');
      });
      ctx.sessions.set(ws1, createMockSession('client-A', 'session-A'));

      expect(() => broadcast(ctx, { type: 'test' })).not.toThrow();
    });
  });

  describe('broadcastYjsUpdate', () => {
    it('should broadcast Yjs update and return seqNum', () => {
      const ws = createMockWebSocket();
      ctx.sessions.set(ws, createMockSession('client-B', 'session-B'));
      ctx.globalSeqNum = 10;

      const seqNum = broadcastYjsUpdate(ctx, encodeBase64(new Uint8Array([1])), 'client-A');

      expect(seqNum).toBe(11);
      expect(ctx.globalSeqNum).toBe(11);

      const msg = JSON.parse((ws.send as ReturnType<typeof vi.fn>).mock.calls[0][0]);
      expect(msg.type).toBe('yjs_update');
      expect(msg.clientId).toBe('client-A');
      expect(msg.seqNum).toBe(11);
    });
  });

  describe('broadcastAwarenessUpdate', () => {
    it('should broadcast awareness update without seqNum (ephemeral cursor data)', () => {
      const ws = createMockWebSocket();
      ctx.sessions.set(ws, createMockSession('client-B', 'session-B'));
      ctx.globalSeqNum = 5;

      // Awareness updates don't return seqNum - they bypass sequence ordering
      broadcastAwarenessUpdate(ctx, encodeBase64(new Uint8Array([1])), 'client-A');

      // globalSeqNum should NOT have been incremented
      expect(ctx.globalSeqNum).toBe(5);

      const msg = JSON.parse((ws.send as ReturnType<typeof vi.fn>).mock.calls[0][0]);
      expect(msg.type).toBe('awareness_update');
      expect(msg.clientId).toBe('client-A');
      expect(msg.seqNum).toBeUndefined();
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
  });

  describe('broadcastVersionUpdate', () => {
    it('should broadcast version update message', () => {
      const ws = createMockWebSocket();
      ctx.sessions.set(ws, createMockSession('client-A', 'session-A'));

      broadcastVersionUpdate(ctx, 42);

      const msg = JSON.parse((ws.send as ReturnType<typeof vi.fn>).mock.calls[0][0]);
      expect(msg.type).toBe('version_update');
      expect(msg.version).toBe(42);
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
  });

  describe('broadcastEditorCountUpdate', () => {
    it('should broadcast editor and viewer counts to all clients', () => {
      const ws1 = createMockWebSocket();
      const ws2 = createMockWebSocket();
      ctx.sessions.set(ws1, createMockSession('editor-1', 'session-1', Date.now()));
      ctx.sessions.set(ws2, createMockSession('viewer-1', 'session-2', null));

      broadcastEditorCountUpdate(ctx);

      expect(ws1.send).toHaveBeenCalled();
      expect(ws2.send).toHaveBeenCalled();

      const msg = JSON.parse((ws1.send as ReturnType<typeof vi.fn>).mock.calls[0][0]);
      expect(msg.type).toBe('editor_count_update');
      expect(msg.activeEditorCount).toBe(1);
      expect(msg.viewerCount).toBe(1);
    });
  });
});

describe('handleRequestEdit', () => {
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

    const message: RequestEditMessage = {
      type: 'request_edit',
    };

    await handleRequestEdit(ctx, ws, message);

    expect(ctx.sendError).toHaveBeenCalledWith(ws, 'Unauthorized');
  });

  it('should allow edit when under the limit', async () => {
    const message: RequestEditMessage = {
      type: 'request_edit',
    };

    await handleRequestEdit(ctx, ws, message);

    const response = JSON.parse((ws.send as ReturnType<typeof vi.fn>).mock.calls[0][0]);
    expect(response.type).toBe('request_edit_response');
    expect(response.canEdit).toBe(true);
  });

  it('should allow edit for already active editors', async () => {
    session.lastEditAt = Date.now();

    for (let i = 0; i < EDITOR_LIMITS.MAX_ACTIVE_EDITORS; i++) {
      const otherWs = createMockWebSocket();
      const otherSession = createMockSession(`client-${i}`, `session-${i}`, Date.now());
      ctx.sessions.set(otherWs, otherSession);
    }

    const message: RequestEditMessage = {
      type: 'request_edit',
    };

    await handleRequestEdit(ctx, ws, message);

    const response = JSON.parse((ws.send as ReturnType<typeof vi.fn>).mock.calls[0][0]);
    expect(response.canEdit).toBe(true);
  });

  it('should deny edit when at limit and not already active', async () => {
    for (let i = 0; i < EDITOR_LIMITS.MAX_ACTIVE_EDITORS; i++) {
      const otherWs = createMockWebSocket();
      const otherSession = createMockSession(`client-${i}`, `session-${i}`, Date.now());
      ctx.sessions.set(otherWs, otherSession);
    }

    const message: RequestEditMessage = {
      type: 'request_edit',
    };

    await handleRequestEdit(ctx, ws, message);

    const response = JSON.parse((ws.send as ReturnType<typeof vi.fn>).mock.calls[0][0]);
    expect(response.canEdit).toBe(false);
  });
});

describe('handleYjsUpdate with editor limits', () => {
  let ctx: NoteSessionContext;
  let ws: WebSocket;
  let session: ClientSession;

  beforeEach(() => {
    ctx = createMockContext();
    ws = createMockWebSocket();
    session = createMockSession('client-A', 'session-A');
    ctx.sessions.set(ws, session);
  });

  it('should reject update when at limit and not already active', async () => {
    for (let i = 0; i < EDITOR_LIMITS.MAX_ACTIVE_EDITORS; i++) {
      const otherWs = createMockWebSocket();
      const otherSession = createMockSession(`client-${i}`, `session-${i}`, Date.now());
      ctx.sessions.set(otherWs, otherSession);
    }

    const message: YjsUpdateMessage = {
      type: 'yjs_update',
      update: encodeBase64(new Uint8Array([1])),
      clientId: 'client-A',
    };

    await handleYjsUpdate(ctx, ws, message);

    expect(ctx.sendError).toHaveBeenCalledWith(ws, 'editor_limit_reached');
    expect(ctx.applyYjsUpdate).not.toHaveBeenCalled();
  });

  it('should allow update when already an active editor', async () => {
    session.lastEditAt = Date.now();

    for (let i = 0; i < EDITOR_LIMITS.MAX_ACTIVE_EDITORS - 1; i++) {
      const otherWs = createMockWebSocket();
      const otherSession = createMockSession(`client-${i}`, `session-${i}`, Date.now());
      ctx.sessions.set(otherWs, otherSession);
    }

    const message: YjsUpdateMessage = {
      type: 'yjs_update',
      update: encodeBase64(new Uint8Array([1])),
      clientId: 'client-A',
    };

    await handleYjsUpdate(ctx, ws, message);

    expect(ctx.sendError).not.toHaveBeenCalled();
    expect(ctx.applyYjsUpdate).toHaveBeenCalled();
  });

  it('should update lastEditAt after successful update', async () => {
    expect(session.lastEditAt).toBeNull();

    const message: YjsUpdateMessage = {
      type: 'yjs_update',
      update: encodeBase64(new Uint8Array([1])),
      clientId: 'client-A',
    };

    await handleYjsUpdate(ctx, ws, message);

    expect(session.lastEditAt).not.toBeNull();
  });

  it('should broadcast editor count update when viewer becomes active editor', async () => {
    const otherWs = createMockWebSocket();
    const otherSession = createMockSession('client-B', 'session-B', null);
    ctx.sessions.set(otherWs, otherSession);

    expect(session.lastEditAt).toBeNull();

    const message: YjsUpdateMessage = {
      type: 'yjs_update',
      update: encodeBase64(new Uint8Array([1])),
      clientId: 'client-A',
    };

    await handleYjsUpdate(ctx, ws, message);

    const otherWsSendCalls = (otherWs.send as ReturnType<typeof vi.fn>).mock.calls;
    const countUpdateMsg = otherWsSendCalls.find((call: string[]) => {
      const msg = JSON.parse(call[0]);
      return msg.type === 'editor_count_update';
    });

    expect(countUpdateMsg).toBeDefined();
  });
});
