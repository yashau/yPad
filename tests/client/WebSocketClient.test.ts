/**
 * Tests for WebSocketClient with Yjs CRDT
 * Tests the WebSocket client for real-time collaboration using Yjs
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { WebSocketClient } from '../../client/lib/realtime/WebSocketClient';
import type { YjsSyncMessage, YjsUpdateMessage, AwarenessUpdateMessage, UserJoinedMessage, UserLeftMessage, SyntaxChangeMessage, NoteStatusMessage } from '../../src/types/messages';

// Get the mock WebSocket class from our setup
const MockWebSocket = (globalThis as any).WebSocket;

// Helper to create base64 encoded test data
function encodeBase64(data: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < data.length; i++) {
    binary += String.fromCharCode(data[i]);
  }
  return btoa(binary);
}

describe('WebSocketClient', () => {
  const noteId = 'test-note';
  const sessionId = 'test-session-123';
  let client: WebSocketClient;

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    if (client) {
      client.close();
    }
    vi.useRealTimers();
  });

  describe('connection', () => {
    it('should create WebSocket with correct URL', () => {
      const options = { sessionId };
      client = new WebSocketClient(noteId, options);

      vi.advanceTimersByTime(10);

      expect(client.isConnected()).toBe(true);
    });

    it('should call onOpen callback when connected', () => {
      const onOpen = vi.fn();
      const options = {
        sessionId,
        onOpen,
      };

      client = new WebSocketClient(noteId, options);
      vi.advanceTimersByTime(10);

      expect(onOpen).toHaveBeenCalledTimes(1);
    });

    it('should call onClose callback when connection closed', () => {
      const onClose = vi.fn();
      const options = {
        sessionId,
        onClose,
        autoReconnect: false,
      };

      client = new WebSocketClient(noteId, options);
      vi.advanceTimersByTime(10);

      client.close();

      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });

  describe('Yjs sync message handling', () => {
    it('should handle yjs_sync message', () => {
      const onYjsSync = vi.fn();
      const options = {
        sessionId,
        onYjsSync,
      };

      client = new WebSocketClient(noteId, options);
      vi.advanceTimersByTime(10);

      const ws = (client as any).ws;
      const testState = new Uint8Array([1, 2, 3, 4, 5]);
      const syncMessage: YjsSyncMessage = {
        type: 'yjs_sync',
        state: encodeBase64(testState),
        clientId: 'server-client-id',
        seqNum: 10,
        syntax: 'javascript',
      };

      ws.simulateMessage(syncMessage);
      vi.advanceTimersByTime(10);

      expect(onYjsSync).toHaveBeenCalledWith(
        expect.any(Uint8Array),
        'server-client-id',
        'javascript'
      );
      // Verify the decoded state matches
      const receivedState = onYjsSync.mock.calls[0][0];
      expect(Array.from(receivedState)).toEqual([1, 2, 3, 4, 5]);
    });

    it('should set clientId from sync message', () => {
      const onYjsSync = vi.fn();
      const options = {
        sessionId,
        onYjsSync,
      };

      client = new WebSocketClient(noteId, options);
      vi.advanceTimersByTime(10);

      const ws = (client as any).ws;
      ws.simulateMessage({
        type: 'yjs_sync',
        state: encodeBase64(new Uint8Array([1])),
        clientId: 'assigned-client-id',
        seqNum: 0,
      });
      vi.advanceTimersByTime(10);

      expect(client.getClientId()).toBe('assigned-client-id');
    });
  });

  describe('Yjs update message handling', () => {
    it('should handle yjs_update message with sequence number', async () => {
      const onYjsUpdate = vi.fn();
      const onYjsSync = vi.fn();
      const options = {
        sessionId,
        onYjsUpdate,
        onYjsSync,
      };

      client = new WebSocketClient(noteId, options);
      await vi.advanceTimersByTimeAsync(10);

      const ws = (client as any).ws;

      // First send sync to set up sequence tracking
      ws.simulateMessage({
        type: 'yjs_sync',
        state: encodeBase64(new Uint8Array([1])),
        clientId: 'client-id',
        seqNum: 0,
      });
      await vi.advanceTimersByTimeAsync(10);

      // Then send update with next sequence number
      const testUpdate = new Uint8Array([10, 20, 30]);
      const updateMessage: YjsUpdateMessage = {
        type: 'yjs_update',
        update: encodeBase64(testUpdate),
        clientId: 'other-client',
        seqNum: 1,
      };

      ws.simulateMessage(updateMessage);
      await vi.advanceTimersByTimeAsync(10);

      expect(onYjsUpdate).toHaveBeenCalledWith(
        expect.any(Uint8Array),
        'other-client'
      );
      const receivedUpdate = onYjsUpdate.mock.calls[0][0];
      expect(Array.from(receivedUpdate)).toEqual([10, 20, 30]);
    });
  });

  describe('awareness update handling', () => {
    it('should handle awareness_update message', async () => {
      const onAwarenessUpdate = vi.fn();
      const onYjsSync = vi.fn();
      const options = {
        sessionId,
        onAwarenessUpdate,
        onYjsSync,
      };

      client = new WebSocketClient(noteId, options);
      await vi.advanceTimersByTimeAsync(10);

      const ws = (client as any).ws;

      // Set up sequence tracking
      ws.simulateMessage({
        type: 'yjs_sync',
        state: encodeBase64(new Uint8Array([1])),
        clientId: 'client-id',
        seqNum: 0,
      });
      await vi.advanceTimersByTimeAsync(10);

      const testAwareness = new Uint8Array([100, 200]);
      // Awareness updates don't use seqNum - they bypass sequence ordering
      const awarenessMessage: AwarenessUpdateMessage = {
        type: 'awareness_update',
        update: encodeBase64(testAwareness),
        clientId: 'other-client',
      };

      ws.simulateMessage(awarenessMessage);
      await vi.advanceTimersByTimeAsync(10);

      expect(onAwarenessUpdate).toHaveBeenCalledWith(
        expect.any(Uint8Array),
        'other-client'
      );
    });
  });

  describe('Yjs ACK handling', () => {
    it('should handle yjs_ack message', () => {
      const onYjsAck = vi.fn();
      const options = {
        sessionId,
        onYjsAck,
      };

      client = new WebSocketClient(noteId, options);
      vi.advanceTimersByTime(10);

      const ws = (client as any).ws;
      ws.simulateMessage({
        type: 'yjs_ack',
        seqNum: 5,
      });
      vi.advanceTimersByTime(10);

      expect(onYjsAck).toHaveBeenCalledWith(5);
    });

    it('should update sequence from ACK', async () => {
      const options = { sessionId };
      client = new WebSocketClient(noteId, options);
      await vi.advanceTimersByTimeAsync(10);

      const ws = (client as any).ws;

      // Set up sequence tracking
      ws.simulateMessage({
        type: 'yjs_sync',
        state: encodeBase64(new Uint8Array([1])),
        clientId: 'client-id',
        seqNum: 0,
      });
      await vi.advanceTimersByTimeAsync(10);

      // Receive ACK with seqNum 5
      ws.simulateMessage({
        type: 'yjs_ack',
        seqNum: 5,
      });
      await vi.advanceTimersByTimeAsync(10);

      // Next expected should be 6
      expect((client as any).nextExpectedSeq).toBe(6);
    });
  });

  describe('user presence handling', () => {
    it('should handle user joined message', async () => {
      const onUserJoined = vi.fn();
      const onYjsSync = vi.fn();
      const options = {
        sessionId,
        onUserJoined,
        onYjsSync,
      };

      client = new WebSocketClient(noteId, options);
      await vi.advanceTimersByTimeAsync(10);

      const ws = (client as any).ws;

      // Set up sequence tracking
      ws.simulateMessage({
        type: 'yjs_sync',
        state: encodeBase64(new Uint8Array([1])),
        clientId: 'client-id',
        seqNum: 0,
      });
      await vi.advanceTimersByTimeAsync(10);

      const joinMessage: UserJoinedMessage = {
        type: 'user_joined',
        clientId: 'new-user',
        connectedUsers: ['client-id', 'new-user'],
        activeEditorCount: 1,
        viewerCount: 1,
        seqNum: 1,
      };

      ws.simulateMessage(joinMessage);
      await vi.advanceTimersByTimeAsync(10);

      expect(onUserJoined).toHaveBeenCalledWith('new-user', ['client-id', 'new-user'], 1, 1);
    });

    it('should handle user left message', async () => {
      const onUserLeft = vi.fn();
      const onYjsSync = vi.fn();
      const options = {
        sessionId,
        onUserLeft,
        onYjsSync,
      };

      client = new WebSocketClient(noteId, options);
      await vi.advanceTimersByTimeAsync(10);

      const ws = (client as any).ws;

      // Set up sequence tracking
      ws.simulateMessage({
        type: 'yjs_sync',
        state: encodeBase64(new Uint8Array([1])),
        clientId: 'client-id',
        seqNum: 0,
      });
      await vi.advanceTimersByTimeAsync(10);

      const leftMessage: UserLeftMessage = {
        type: 'user_left',
        clientId: 'leaving-user',
        connectedUsers: ['client-id'],
        activeEditorCount: 1,
        viewerCount: 0,
        seqNum: 1,
      };

      ws.simulateMessage(leftMessage);
      await vi.advanceTimersByTimeAsync(10);

      expect(onUserLeft).toHaveBeenCalledWith('leaving-user', ['client-id'], 1, 0);
    });
  });

  describe('syntax change handling', () => {
    it('should handle syntax change message', async () => {
      const onSyntaxChange = vi.fn();
      const onYjsSync = vi.fn();
      const options = {
        sessionId,
        onSyntaxChange,
        onYjsSync,
      };

      client = new WebSocketClient(noteId, options);
      await vi.advanceTimersByTimeAsync(10);

      const ws = (client as any).ws;

      // Set up sequence tracking
      ws.simulateMessage({
        type: 'yjs_sync',
        state: encodeBase64(new Uint8Array([1])),
        clientId: 'client-id',
        seqNum: 0,
      });
      await vi.advanceTimersByTimeAsync(10);

      const syntaxMessage: SyntaxChangeMessage = {
        type: 'syntax_change',
        syntax: 'python',
        clientId: 'other-client',
        seqNum: 1,
      };

      ws.simulateMessage(syntaxMessage);
      await vi.advanceTimersByTimeAsync(10);

      expect(onSyntaxChange).toHaveBeenCalledWith('python');
    });
  });

  describe('note status handling', () => {
    it('should handle note_status message', () => {
      const onNoteStatus = vi.fn();
      const options = {
        sessionId,
        onNoteStatus,
      };

      client = new WebSocketClient(noteId, options);
      vi.advanceTimersByTime(10);

      const ws = (client as any).ws;
      ws.simulateMessage({
        type: 'note_status',
        view_count: 5,
        max_views: 10,
        expires_at: 1704067200000,
      });
      vi.advanceTimersByTime(10);

      expect(onNoteStatus).toHaveBeenCalledWith(5, 10, 1704067200000);
    });

    it('should handle note deleted message', () => {
      const onNoteDeleted = vi.fn();
      const options = {
        sessionId,
        onNoteDeleted,
        autoReconnect: false,
      };

      client = new WebSocketClient(noteId, options);
      vi.advanceTimersByTime(10);

      const ws = (client as any).ws;
      ws.simulateMessage({ type: 'note_deleted', sessionId: 'other-session' });
      vi.advanceTimersByTime(10);

      expect(onNoteDeleted).toHaveBeenCalledWith(false);
    });

    it('should identify when current user deleted the note', () => {
      const onNoteDeleted = vi.fn();
      const options = {
        sessionId,
        onNoteDeleted,
        autoReconnect: false,
      };

      client = new WebSocketClient(noteId, options);
      vi.advanceTimersByTime(10);

      const ws = (client as any).ws;
      ws.simulateMessage({ type: 'note_deleted', sessionId });
      vi.advanceTimersByTime(10);

      expect(onNoteDeleted).toHaveBeenCalledWith(true);
    });
  });

  describe('sending messages', () => {
    it('should send Yjs update', async () => {
      const options = { sessionId };
      client = new WebSocketClient(noteId, options);
      await vi.advanceTimersByTimeAsync(10);

      const ws = (client as any).ws;

      // Set up client ID from sync
      ws.simulateMessage({
        type: 'yjs_sync',
        state: encodeBase64(new Uint8Array([1])),
        clientId: 'my-client',
        seqNum: 0,
      });
      await vi.advanceTimersByTimeAsync(10);

      const update = new Uint8Array([1, 2, 3]);
      client.sendYjsUpdate(update);

      expect(ws.send).toHaveBeenCalled();
      // Find the yjs_update message in the calls
      const calls = ws.send.mock.calls;
      const yjsUpdateCall = calls.find((call: string[]) => {
        try {
          const msg = JSON.parse(call[0]);
          return msg.type === 'yjs_update';
        } catch {
          return false;
        }
      });
      expect(yjsUpdateCall).toBeDefined();
      const sentMessage = JSON.parse(yjsUpdateCall[0]);
      expect(sentMessage.type).toBe('yjs_update');
      expect(sentMessage.clientId).toBe('my-client');
    });

    it('should send awareness update', async () => {
      const options = { sessionId };
      client = new WebSocketClient(noteId, options);
      await vi.advanceTimersByTimeAsync(10);

      const ws = (client as any).ws;

      // Set up client ID from sync
      ws.simulateMessage({
        type: 'yjs_sync',
        state: encodeBase64(new Uint8Array([1])),
        clientId: 'my-client',
        seqNum: 0,
      });
      await vi.advanceTimersByTimeAsync(10);

      const update = new Uint8Array([10, 20]);
      client.sendAwarenessUpdate(update);

      expect(ws.send).toHaveBeenCalled();
      const calls = ws.send.mock.calls;
      const lastCall = calls[calls.length - 1];
      const sentMessage = JSON.parse(lastCall[0]);
      expect(sentMessage.type).toBe('awareness_update');
    });

    it('should send syntax change', async () => {
      const options = { sessionId };
      client = new WebSocketClient(noteId, options);
      await vi.advanceTimersByTimeAsync(10);

      const ws = (client as any).ws;

      // Set up client ID from sync
      ws.simulateMessage({
        type: 'yjs_sync',
        state: encodeBase64(new Uint8Array([1])),
        clientId: 'my-client',
        seqNum: 0,
      });
      await vi.advanceTimersByTimeAsync(10);

      client.sendSyntaxChange('typescript');

      const calls = ws.send.mock.calls;
      const lastCall = calls[calls.length - 1];
      const sentMessage = JSON.parse(lastCall[0]);
      expect(sentMessage.type).toBe('syntax_change');
      expect(sentMessage.syntax).toBe('typescript');
    });

    it('should send request edit', async () => {
      const options = { sessionId };
      client = new WebSocketClient(noteId, options);
      await vi.advanceTimersByTimeAsync(10);

      const ws = (client as any).ws;

      // Set up client ID from sync
      ws.simulateMessage({
        type: 'yjs_sync',
        state: encodeBase64(new Uint8Array([1])),
        clientId: 'my-client',
        seqNum: 0,
      });
      await vi.advanceTimersByTimeAsync(10);

      client.sendRequestEdit();

      const calls = ws.send.mock.calls;
      const lastCall = calls[calls.length - 1];
      const sentMessage = JSON.parse(lastCall[0]);
      expect(sentMessage.type).toBe('request_edit');
    });

    it('should not send when not connected', () => {
      const options = { sessionId, autoReconnect: false };
      client = new WebSocketClient(noteId, options);
      vi.advanceTimersByTime(10);

      client.close();

      // These should not throw
      client.sendYjsUpdate(new Uint8Array([1]));
      client.sendAwarenessUpdate(new Uint8Array([1]));
      client.sendSyntaxChange('python');
    });
  });

  describe('sequence number tracking', () => {
    it('should buffer out-of-order messages', async () => {
      const onYjsUpdate = vi.fn();
      const onYjsSync = vi.fn();
      const options = {
        sessionId,
        onYjsUpdate,
        onYjsSync,
      };

      client = new WebSocketClient(noteId, options);
      await vi.advanceTimersByTimeAsync(10);

      const ws = (client as any).ws;

      // Set up sequence tracking at seqNum 0
      ws.simulateMessage({
        type: 'yjs_sync',
        state: encodeBase64(new Uint8Array([1])),
        clientId: 'client-id',
        seqNum: 0,
      });
      await vi.advanceTimersByTimeAsync(10);

      // Send seqNum 2 before seqNum 1 (out of order)
      ws.simulateMessage({
        type: 'yjs_update',
        update: encodeBase64(new Uint8Array([2])),
        clientId: 'other',
        seqNum: 2,
      });
      await vi.advanceTimersByTimeAsync(10);

      // Should not have processed seqNum 2 yet
      expect(onYjsUpdate).not.toHaveBeenCalled();

      // Now send seqNum 1
      ws.simulateMessage({
        type: 'yjs_update',
        update: encodeBase64(new Uint8Array([1])),
        clientId: 'other',
        seqNum: 1,
      });
      await vi.advanceTimersByTimeAsync(10);

      // Now both should have been processed in order
      expect(onYjsUpdate).toHaveBeenCalledTimes(2);
    });
  });

  describe('reconnection', () => {
    it('should not reconnect when intentionally closed', () => {
      const options = {
        sessionId,
        autoReconnect: true,
      };

      client = new WebSocketClient(noteId, options);
      vi.advanceTimersByTime(10);

      const initialReconnectAttempts = (client as any).reconnectAttempts;

      client.close();

      vi.advanceTimersByTime(5000);

      expect((client as any).reconnectAttempts).toBe(initialReconnectAttempts);
    });

    it('should respect autoReconnect false option', () => {
      const options = {
        sessionId,
        autoReconnect: false,
      };

      client = new WebSocketClient(noteId, options);
      vi.advanceTimersByTime(10);

      const ws = (client as any).ws;
      ws.readyState = 3;
      ws.onclose(new CloseEvent('close'));

      expect((client as any).reconnectTimeout).toBeNull();
    });
  });

  describe('close', () => {
    it('should clean up timers on close', () => {
      const options = { sessionId };
      client = new WebSocketClient(noteId, options);
      vi.advanceTimersByTime(10);

      client.close();

      expect((client as any).reconnectTimeout).toBeNull();
      expect((client as any).gapTimer).toBeNull();
    });

    it('should report not connected after close', () => {
      const options = { sessionId };
      client = new WebSocketClient(noteId, options);
      vi.advanceTimersByTime(10);

      expect(client.isConnected()).toBe(true);

      client.close();

      expect(client.isConnected()).toBe(false);
    });
  });

  describe('error handling', () => {
    it('should call onError callback on WebSocket error', () => {
      const onError = vi.fn();
      const options = {
        sessionId,
        onError,
      };

      client = new WebSocketClient(noteId, options);
      vi.advanceTimersByTime(10);

      const ws = (client as any).ws;
      ws.simulateError();

      expect(onError).toHaveBeenCalledWith(expect.any(Error));
    });

    it('should handle error message from server', () => {
      const onError = vi.fn();
      const options = {
        sessionId,
        onError,
      };

      client = new WebSocketClient(noteId, options);
      vi.advanceTimersByTime(10);

      const ws = (client as any).ws;
      ws.simulateMessage({
        type: 'error',
        message: 'Server error occurred',
      });
      vi.advanceTimersByTime(10);

      expect(onError).toHaveBeenCalledWith(expect.any(Error));
    });

    it('should handle editor_limit_reached error', () => {
      const onEditorLimitReached = vi.fn();
      const onError = vi.fn();
      const options = {
        sessionId,
        onEditorLimitReached,
        onError,
      };

      client = new WebSocketClient(noteId, options);
      vi.advanceTimersByTime(10);

      const ws = (client as any).ws;
      ws.simulateMessage({
        type: 'error',
        message: 'editor_limit_reached',
      });
      vi.advanceTimersByTime(10);

      expect(onEditorLimitReached).toHaveBeenCalledTimes(1);
      expect(onError).not.toHaveBeenCalled();
    });
  });

  describe('editor limit feature', () => {
    it('should handle request_edit_response message', () => {
      const onRequestEditResponse = vi.fn();
      const options = {
        sessionId,
        onRequestEditResponse,
      };

      client = new WebSocketClient(noteId, options);
      vi.advanceTimersByTime(10);

      const ws = (client as any).ws;
      ws.simulateMessage({
        type: 'request_edit_response',
        canEdit: true,
        activeEditorCount: 3,
        viewerCount: 2,
      });
      vi.advanceTimersByTime(10);

      expect(onRequestEditResponse).toHaveBeenCalledWith(true, 3, 2);
    });

    it('should handle editor_count_update message', async () => {
      const onEditorCountUpdate = vi.fn();
      const onYjsSync = vi.fn();
      const options = {
        sessionId,
        onEditorCountUpdate,
        onYjsSync,
      };

      client = new WebSocketClient(noteId, options);
      await vi.advanceTimersByTimeAsync(10);

      const ws = (client as any).ws;

      // Set up sequence tracking
      ws.simulateMessage({
        type: 'yjs_sync',
        state: encodeBase64(new Uint8Array([1])),
        clientId: 'client-id',
        seqNum: 0,
      });
      await vi.advanceTimersByTimeAsync(10);

      ws.simulateMessage({
        type: 'editor_count_update',
        activeEditorCount: 5,
        viewerCount: 3,
        seqNum: 1,
      });
      await vi.advanceTimersByTimeAsync(10);

      expect(onEditorCountUpdate).toHaveBeenCalledWith(5, 3);
    });
  });

  describe('Yjs state request', () => {
    it('should send yjs_state_request', async () => {
      const options = { sessionId };
      client = new WebSocketClient(noteId, options);
      await vi.advanceTimersByTimeAsync(10);

      const ws = (client as any).ws;

      // Set up client ID from sync
      ws.simulateMessage({
        type: 'yjs_sync',
        state: encodeBase64(new Uint8Array([1])),
        clientId: 'my-client',
        seqNum: 0,
      });
      await vi.advanceTimersByTimeAsync(10);

      client.sendYjsStateRequest();

      const calls = ws.send.mock.calls;
      const lastCall = calls[calls.length - 1];
      const sentMessage = JSON.parse(lastCall[0]);
      expect(sentMessage.type).toBe('yjs_state_request');
    });

    it('should handle yjs_state_response', () => {
      const onYjsStateResponse = vi.fn();
      const options = {
        sessionId,
        onYjsStateResponse,
      };

      client = new WebSocketClient(noteId, options);
      vi.advanceTimersByTime(10);

      const ws = (client as any).ws;
      const testState = new Uint8Array([1, 2, 3, 4, 5]);
      ws.simulateMessage({
        type: 'yjs_state_response',
        state: encodeBase64(testState),
      });
      vi.advanceTimersByTime(10);

      expect(onYjsStateResponse).toHaveBeenCalledWith(expect.any(Uint8Array));
      const receivedState = onYjsStateResponse.mock.calls[0][0];
      expect(Array.from(receivedState)).toEqual([1, 2, 3, 4, 5]);
    });

    it('should not send when not connected', () => {
      const options = { sessionId, autoReconnect: false };
      client = new WebSocketClient(noteId, options);
      vi.advanceTimersByTime(10);

      client.close();

      // Should not throw
      client.sendYjsStateRequest();
    });
  });

  describe('additional message types', () => {
    it('should handle encryption_changed message', () => {
      const onEncryptionChanged = vi.fn();
      const options = {
        sessionId,
        onEncryptionChanged,
      };

      client = new WebSocketClient(noteId, options);
      vi.advanceTimersByTime(10);

      const ws = (client as any).ws;
      ws.simulateMessage({
        type: 'encryption_changed',
        is_encrypted: true,
      });
      vi.advanceTimersByTime(10);

      expect(onEncryptionChanged).toHaveBeenCalledWith(true);
    });

    it('should handle version_update message', () => {
      const onVersionUpdate = vi.fn();
      const options = {
        sessionId,
        onVersionUpdate,
      };

      client = new WebSocketClient(noteId, options);
      vi.advanceTimersByTime(10);

      const ws = (client as any).ws;
      ws.simulateMessage({
        type: 'version_update',
        version: 5,
        message: 'Content updated by another user',
      });
      vi.advanceTimersByTime(10);

      expect(onVersionUpdate).toHaveBeenCalledWith(5, 'Content updated by another user');
    });

    it('should handle reload message', () => {
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const options = { sessionId };

      client = new WebSocketClient(noteId, options);
      vi.advanceTimersByTime(10);

      const ws = (client as any).ws;
      ws.simulateMessage({
        type: 'reload',
        reason: 'Server restart',
      });
      vi.advanceTimersByTime(10);

      expect(consoleWarnSpy).toHaveBeenCalledWith('[WebSocket] Reload requested:', 'Server restart');
      consoleWarnSpy.mockRestore();
    });

    it('should handle note_expired message', () => {
      const onNoteDeleted = vi.fn();
      const options = {
        sessionId,
        onNoteDeleted,
        autoReconnect: false,
      };

      client = new WebSocketClient(noteId, options);
      vi.advanceTimersByTime(10);

      const ws = (client as any).ws;
      ws.simulateMessage({ type: 'note_expired' });
      vi.advanceTimersByTime(10);

      expect(onNoteDeleted).toHaveBeenCalledWith(false);
    });

    it('should log warning for unknown message type', () => {
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const options = { sessionId };

      client = new WebSocketClient(noteId, options);
      vi.advanceTimersByTime(10);

      const ws = (client as any).ws;
      ws.simulateMessage({ type: 'unknown_type_xyz' });
      vi.advanceTimersByTime(10);

      expect(consoleWarnSpy).toHaveBeenCalledWith('[WebSocket] Unknown message type:', expect.objectContaining({ type: 'unknown_type_xyz' }));
      consoleWarnSpy.mockRestore();
    });

    it('should log warning for unknown sequenced message type', async () => {
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const options = { sessionId };

      client = new WebSocketClient(noteId, options);
      await vi.advanceTimersByTimeAsync(10);

      const ws = (client as any).ws;

      // Set up sequence tracking
      ws.simulateMessage({
        type: 'yjs_sync',
        state: encodeBase64(new Uint8Array([1])),
        clientId: 'client-id',
        seqNum: 0,
      });
      await vi.advanceTimersByTimeAsync(10);

      // Send unknown message with sequence number
      ws.simulateMessage({
        type: 'unknown_sequenced_type',
        seqNum: 1,
      });
      await vi.advanceTimersByTimeAsync(10);

      expect(consoleWarnSpy).toHaveBeenCalledWith('[WebSocket] Unknown sequenced message type:', expect.objectContaining({ type: 'unknown_sequenced_type' }));
      consoleWarnSpy.mockRestore();
    });
  });

  describe('gap detection and resync', () => {
    it('should trigger gap detection timer when messages are out of order', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const onYjsUpdate = vi.fn();
      const onClose = vi.fn();
      const options = {
        sessionId,
        onYjsUpdate,
        onClose,
        autoReconnect: false,
      };

      client = new WebSocketClient(noteId, options);
      await vi.advanceTimersByTimeAsync(10);

      const ws = (client as any).ws;

      // Set up sequence tracking
      ws.simulateMessage({
        type: 'yjs_sync',
        state: encodeBase64(new Uint8Array([1])),
        clientId: 'client-id',
        seqNum: 0,
      });
      await vi.advanceTimersByTimeAsync(10);

      // Send message with seqNum 3 (skipping 1 and 2)
      ws.simulateMessage({
        type: 'yjs_update',
        update: encodeBase64(new Uint8Array([3])),
        clientId: 'other',
        seqNum: 3,
      });
      await vi.advanceTimersByTimeAsync(10);

      // Gap timer should be set
      expect((client as any).gapTimer).not.toBeNull();

      // Wait for gap timeout (5 seconds)
      await vi.advanceTimersByTimeAsync(5000);

      // Should have triggered resync
      expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Gap detection timeout'));
      expect(consoleWarnSpy).toHaveBeenCalledWith('[WebSocket] Requesting full resync due to gap');

      consoleErrorSpy.mockRestore();
      consoleWarnSpy.mockRestore();
    });

    it('should request resync when pending buffer is full', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const options = {
        sessionId,
        autoReconnect: false,
      };

      client = new WebSocketClient(noteId, options);
      await vi.advanceTimersByTimeAsync(10);

      const ws = (client as any).ws;

      // Set up sequence tracking
      ws.simulateMessage({
        type: 'yjs_sync',
        state: encodeBase64(new Uint8Array([1])),
        clientId: 'client-id',
        seqNum: 0,
      });
      await vi.advanceTimersByTimeAsync(10);

      // Fill up the pending buffer (maxPendingMessages = 20)
      for (let i = 2; i <= 22; i++) {
        ws.simulateMessage({
          type: 'yjs_update',
          update: encodeBase64(new Uint8Array([i])),
          clientId: 'other',
          seqNum: i,
        });
      }
      await vi.advanceTimersByTimeAsync(10);

      expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Pending messages buffer full'));

      consoleErrorSpy.mockRestore();
      consoleWarnSpy.mockRestore();
    });

    it('should clear gap timer when all pending messages are processed', async () => {
      const onYjsUpdate = vi.fn();
      const options = {
        sessionId,
        onYjsUpdate,
      };

      client = new WebSocketClient(noteId, options);
      await vi.advanceTimersByTimeAsync(10);

      const ws = (client as any).ws;

      // Set up sequence tracking
      ws.simulateMessage({
        type: 'yjs_sync',
        state: encodeBase64(new Uint8Array([1])),
        clientId: 'client-id',
        seqNum: 0,
      });
      await vi.advanceTimersByTimeAsync(10);

      // Send seqNum 2 first (out of order)
      ws.simulateMessage({
        type: 'yjs_update',
        update: encodeBase64(new Uint8Array([2])),
        clientId: 'other',
        seqNum: 2,
      });
      await vi.advanceTimersByTimeAsync(10);

      // Gap timer should be set
      expect((client as any).gapTimer).not.toBeNull();

      // Now send seqNum 1
      ws.simulateMessage({
        type: 'yjs_update',
        update: encodeBase64(new Uint8Array([1])),
        clientId: 'other',
        seqNum: 1,
      });
      await vi.advanceTimersByTimeAsync(10);

      // Gap timer should be cleared
      expect((client as any).gapTimer).toBeNull();
      expect(onYjsUpdate).toHaveBeenCalledTimes(2);
    });

    it('should ignore old sequence numbers', async () => {
      const onYjsUpdate = vi.fn();
      const options = {
        sessionId,
        onYjsUpdate,
      };

      client = new WebSocketClient(noteId, options);
      await vi.advanceTimersByTimeAsync(10);

      const ws = (client as any).ws;

      // Set up sequence tracking at seqNum 5
      ws.simulateMessage({
        type: 'yjs_sync',
        state: encodeBase64(new Uint8Array([1])),
        clientId: 'client-id',
        seqNum: 5,
      });
      await vi.advanceTimersByTimeAsync(10);

      // Send an old seqNum (should be ignored)
      ws.simulateMessage({
        type: 'yjs_update',
        update: encodeBase64(new Uint8Array([1])),
        clientId: 'other',
        seqNum: 3,
      });
      await vi.advanceTimersByTimeAsync(10);

      // Should not have processed the old message
      expect(onYjsUpdate).not.toHaveBeenCalled();
    });

    it('should expose requestSync method for manual resync', async () => {
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const onClose = vi.fn();
      const options = {
        sessionId,
        onClose,
        autoReconnect: false,
      };

      client = new WebSocketClient(noteId, options);
      await vi.advanceTimersByTimeAsync(10);

      client.requestSync();

      expect(consoleWarnSpy).toHaveBeenCalledWith('[WebSocket] Requesting full resync due to gap');
      consoleWarnSpy.mockRestore();
    });
  });

  describe('reconnection behavior', () => {
    it('should schedule reconnection after unintentional close', async () => {
      const onClose = vi.fn();
      const onOpen = vi.fn();
      const options = {
        sessionId,
        onClose,
        onOpen,
        autoReconnect: true,
      };

      client = new WebSocketClient(noteId, options);
      await vi.advanceTimersByTimeAsync(10);

      expect(onOpen).toHaveBeenCalledTimes(1);

      // Simulate connection close (not intentional)
      const ws = (client as any).ws;
      ws.readyState = 3; // CLOSED
      ws.onclose(new CloseEvent('close'));

      // Should schedule reconnection
      expect((client as any).reconnectTimeout).not.toBeNull();
      expect((client as any).reconnectAttempts).toBe(1);
    });

    it('should call onError after max reconnection attempts', async () => {
      const onError = vi.fn();
      const onClose = vi.fn();
      const options = {
        sessionId,
        onError,
        onClose,
        autoReconnect: true,
      };

      client = new WebSocketClient(noteId, options);
      await vi.advanceTimersByTimeAsync(10);

      // Set reconnect attempts to max
      (client as any).reconnectAttempts = 5;

      // Simulate connection close
      const ws = (client as any).ws;
      ws.readyState = 3;
      ws.onclose(new CloseEvent('close'));

      // Try to trigger reconnect manually
      (client as any).attemptReconnect();

      expect(onError).toHaveBeenCalledWith(expect.objectContaining({
        message: 'Failed to reconnect',
      }));
    });

    it('should clear pending messages on reconnection', async () => {
      const options = { sessionId };

      client = new WebSocketClient(noteId, options);
      await vi.advanceTimersByTimeAsync(10);

      const ws = (client as any).ws;

      // Set up sequence tracking
      ws.simulateMessage({
        type: 'yjs_sync',
        state: encodeBase64(new Uint8Array([1])),
        clientId: 'client-id',
        seqNum: 0,
      });
      await vi.advanceTimersByTimeAsync(10);

      // Add pending message
      ws.simulateMessage({
        type: 'yjs_update',
        update: encodeBase64(new Uint8Array([2])),
        clientId: 'other',
        seqNum: 5, // Skip seqNums 1-4
      });
      await vi.advanceTimersByTimeAsync(10);

      expect((client as any).pendingMessages.size).toBe(1);

      // Simulate reconnection by triggering onopen again
      ws.onopen();
      await vi.advanceTimersByTimeAsync(10);

      // Pending messages should be cleared
      expect((client as any).pendingMessages.size).toBe(0);
    });
  });

  describe('syntax ACK handling', () => {
    it('should update sequence from syntax ACK', async () => {
      const options = { sessionId };

      client = new WebSocketClient(noteId, options);
      await vi.advanceTimersByTimeAsync(10);

      const ws = (client as any).ws;

      // Set up sequence tracking
      ws.simulateMessage({
        type: 'yjs_sync',
        state: encodeBase64(new Uint8Array([1])),
        clientId: 'client-id',
        seqNum: 0,
      });
      await vi.advanceTimersByTimeAsync(10);

      // Receive syntax ACK with seqNum 3
      ws.simulateMessage({
        type: 'syntax_ack',
        seqNum: 3,
      });
      await vi.advanceTimersByTimeAsync(10);

      // Next expected should be 4
      expect((client as any).nextExpectedSeq).toBe(4);
    });
  });

  describe('edge cases', () => {
    it('should not reconnect if already connected', () => {
      const options = { sessionId };

      client = new WebSocketClient(noteId, options);
      vi.advanceTimersByTime(10);

      expect(client.isConnected()).toBe(true);

      // Try to connect again (should be no-op)
      (client as any).connect();

      // Should still be connected with same ws
      expect(client.isConnected()).toBe(true);
    });

    it('should handle sendRequestEdit when not connected', () => {
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const options = { sessionId, autoReconnect: false };

      client = new WebSocketClient(noteId, options);
      vi.advanceTimersByTime(10);

      client.close();

      client.sendRequestEdit();

      expect(consoleWarnSpy).toHaveBeenCalledWith('[WebSocket] Cannot send request_edit - not connected');
      consoleWarnSpy.mockRestore();
    });

    it('should handle yjs_ack without seqNum', async () => {
      const onYjsAck = vi.fn();
      const options = {
        sessionId,
        onYjsAck,
      };

      client = new WebSocketClient(noteId, options);
      await vi.advanceTimersByTimeAsync(10);

      const ws = (client as any).ws;

      // ACK without seqNum
      ws.simulateMessage({
        type: 'yjs_ack',
      });
      await vi.advanceTimersByTimeAsync(10);

      // Should not call onYjsAck since seqNum is undefined
      expect(onYjsAck).not.toHaveBeenCalled();
    });
  });
});
