/**
 * Tests for WebSocketClient
 * Tests the WebSocket client for real-time collaboration
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { WebSocketClient } from '../../client/lib/realtime/WebSocketClient';
import type { SyncMessage, OperationMessage, AckMessage, CursorUpdateMessage, UserJoinedMessage, UserLeftMessage, SyntaxChangeMessage, ReplayResponseMessage } from '../../src/ot/types';

// Get the mock WebSocket class from our setup
const MockWebSocket = (globalThis as any).WebSocket;

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

      // Wait for connection
      vi.advanceTimersByTime(10);

      expect(client.isConnected()).toBe(true);
    });

    it('should connect without password in URL (true E2E encryption)', () => {
      // Passwords are never sent to the server - encryption/decryption is client-side only
      const options = {
        sessionId,
      };
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

  describe('message handling', () => {
    it('should handle sync message', () => {
      const onSync = vi.fn();
      const options = {
        sessionId,
        onSync,
      };

      client = new WebSocketClient(noteId, options);
      vi.advanceTimersByTime(10);

      // Get the WebSocket instance and simulate message
      const ws = (client as any).ws;
      const syncMessage: SyncMessage = {
        type: 'sync',
        content: 'Hello, World!',
        version: 5,
        operations: [],
        clientId: 'server-client-id',
        seqNum: 10,
        syntax: 'javascript',
      };

      ws.simulateMessage(syncMessage);
      vi.advanceTimersByTime(10);

      expect(onSync).toHaveBeenCalledWith(
        'Hello, World!',
        5,
        [],
        'server-client-id',
        'javascript'
      );
    });

    it('should handle operation message with sequence number', async () => {
      const onOperation = vi.fn();
      const onSync = vi.fn();
      const options = {
        sessionId,
        onOperation,
        onSync,
      };

      client = new WebSocketClient(noteId, options);
      await vi.advanceTimersByTimeAsync(10);

      const ws = (client as any).ws;

      // First send sync to set up sequence tracking
      ws.simulateMessage({
        type: 'sync',
        content: '',
        version: 1,
        operations: [],
        clientId: 'client-id',
        seqNum: 0,
      });
      await vi.advanceTimersByTimeAsync(10);

      // Then send operation with next sequence number
      const opMessage: OperationMessage = {
        type: 'operation',
        operation: {
          type: 'insert',
          position: 0,
          text: 'hello',
          clientId: 'other-client',
          version: 1,
        },
        baseVersion: 1,
        clientId: 'other-client',
        sessionId: 'other-session',
        seqNum: 1,
        contentChecksum: 12345,
      };

      ws.simulateMessage(opMessage);
      await vi.advanceTimersByTimeAsync(10);

      expect(onOperation).toHaveBeenCalledWith(
        opMessage.operation,
        opMessage.contentChecksum
      );
    });

    it('should handle ack message', () => {
      const onAck = vi.fn();
      const options = {
        sessionId,
        onAck,
      };

      client = new WebSocketClient(noteId, options);
      vi.advanceTimersByTime(10);

      const ws = (client as any).ws;
      const ackMessage: AckMessage = {
        type: 'ack',
        version: 2,
        seqNum: 5,
        contentChecksum: 67890,
      };

      ws.simulateMessage(ackMessage);
      vi.advanceTimersByTime(10);

      expect(onAck).toHaveBeenCalledWith(2, 67890, undefined);
    });

    it('should handle cursor update message', async () => {
      const onCursorUpdate = vi.fn();
      const onSync = vi.fn();
      const options = {
        sessionId,
        onCursorUpdate,
        onSync,
      };

      client = new WebSocketClient(noteId, options);
      await vi.advanceTimersByTimeAsync(10);

      const ws = (client as any).ws;

      // Set up sequence tracking
      ws.simulateMessage({
        type: 'sync',
        content: '',
        version: 1,
        operations: [],
        clientId: 'client-id',
        seqNum: 0,
      });
      await vi.advanceTimersByTimeAsync(10);

      const cursorMessage: CursorUpdateMessage = {
        type: 'cursor_update',
        clientId: 'other-client',
        position: 42,
        sessionId: 'other-session',
        seqNum: 1,
      };

      ws.simulateMessage(cursorMessage);
      await vi.advanceTimersByTimeAsync(10);

      expect(onCursorUpdate).toHaveBeenCalledWith('other-client', 42);
    });

    it('should handle user joined message', async () => {
      const onUserJoined = vi.fn();
      const onSync = vi.fn();
      const options = {
        sessionId,
        onUserJoined,
        onSync,
      };

      client = new WebSocketClient(noteId, options);
      await vi.advanceTimersByTimeAsync(10);

      const ws = (client as any).ws;

      // Set up sequence tracking
      ws.simulateMessage({
        type: 'sync',
        content: '',
        version: 1,
        operations: [],
        clientId: 'client-id',
        seqNum: 0,
      });
      await vi.advanceTimersByTimeAsync(10);

      const joinMessage: UserJoinedMessage = {
        type: 'user_joined',
        clientId: 'new-user',
        connectedUsers: ['client-id', 'new-user'],
        seqNum: 1,
      };

      ws.simulateMessage(joinMessage);
      await vi.advanceTimersByTimeAsync(10);

      expect(onUserJoined).toHaveBeenCalledWith('new-user', ['client-id', 'new-user']);
    });

    it('should handle user left message', async () => {
      const onUserLeft = vi.fn();
      const onSync = vi.fn();
      const options = {
        sessionId,
        onUserLeft,
        onSync,
      };

      client = new WebSocketClient(noteId, options);
      await vi.advanceTimersByTimeAsync(10);

      const ws = (client as any).ws;

      // Set up sequence tracking
      ws.simulateMessage({
        type: 'sync',
        content: '',
        version: 1,
        operations: [],
        clientId: 'client-id',
        seqNum: 0,
      });
      await vi.advanceTimersByTimeAsync(10);

      const leftMessage: UserLeftMessage = {
        type: 'user_left',
        clientId: 'leaving-user',
        connectedUsers: ['client-id'],
        seqNum: 1,
      };

      ws.simulateMessage(leftMessage);
      await vi.advanceTimersByTimeAsync(10);

      expect(onUserLeft).toHaveBeenCalledWith('leaving-user', ['client-id']);
    });

    it('should handle syntax change message', async () => {
      const onSyntaxChange = vi.fn();
      const onSync = vi.fn();
      const options = {
        sessionId,
        onSyntaxChange,
        onSync,
      };

      client = new WebSocketClient(noteId, options);
      await vi.advanceTimersByTimeAsync(10);

      const ws = (client as any).ws;

      // Set up sequence tracking
      ws.simulateMessage({
        type: 'sync',
        content: '',
        version: 1,
        operations: [],
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

      expect(onNoteDeleted).toHaveBeenCalledWith(false); // Not deleted by current user
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

      expect(onNoteDeleted).toHaveBeenCalledWith(true); // Deleted by current user
    });

    it('should handle encryption changed message', () => {
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

      // With true E2E encryption, only is_encrypted is sent (no has_password)
      expect(onEncryptionChanged).toHaveBeenCalledWith(true);
    });

    it('should handle version update message', () => {
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
        version: 10,
        message: 'Content updated',
      });
      vi.advanceTimersByTime(10);

      expect(onVersionUpdate).toHaveBeenCalledWith(10, 'Content updated');
    });

    it('should handle note status message', () => {
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
  });

  describe('sending messages', () => {
    it('should send operation message', () => {
      const options = { sessionId };
      client = new WebSocketClient(noteId, options);
      vi.advanceTimersByTime(10);

      const ws = (client as any).ws;
      const operation = {
        type: 'insert' as const,
        position: 0,
        text: 'hello',
        clientId: 'my-client',
        version: 1,
      };

      client.sendOperation(operation, 1);

      expect(ws.send).toHaveBeenCalled();
      const sentMessage = JSON.parse(ws.send.mock.calls[0][0]);
      expect(sentMessage.type).toBe('operation');
      expect(sentMessage.operation).toEqual(operation);
    });

    it('should send cursor update', () => {
      const options = { sessionId };
      client = new WebSocketClient(noteId, options);
      vi.advanceTimersByTime(10);

      const ws = (client as any).ws;
      client.sendCursorUpdate(42, 'my-client');

      expect(ws.send).toHaveBeenCalled();
      const sentMessage = JSON.parse(ws.send.mock.calls[0][0]);
      expect(sentMessage.type).toBe('cursor_update');
      expect(sentMessage.position).toBe(42);
      expect(sentMessage.clientId).toBe('my-client');
    });

    it('should send syntax change', () => {
      const options = { sessionId };
      client = new WebSocketClient(noteId, options);
      vi.advanceTimersByTime(10);

      const ws = (client as any).ws;
      client.sendSyntaxChange('typescript', 'my-client');

      expect(ws.send).toHaveBeenCalled();
      const sentMessage = JSON.parse(ws.send.mock.calls[0][0]);
      expect(sentMessage.type).toBe('syntax_change');
      expect(sentMessage.syntax).toBe('typescript');
    });

    it('should not send when not connected', () => {
      const options = { sessionId, autoReconnect: false };
      client = new WebSocketClient(noteId, options);
      vi.advanceTimersByTime(10);

      client.close();

      const operation = {
        type: 'insert' as const,
        position: 0,
        text: 'hello',
        clientId: 'my-client',
        version: 1,
      };

      // This should not throw, just log warning
      client.sendOperation(operation, 1);
      client.sendCursorUpdate(42, 'my-client');
      client.sendSyntaxChange('python', 'my-client');
    });
  });

  describe('sequence number tracking', () => {
    it('should buffer out-of-order messages', async () => {
      const onOperation = vi.fn();
      const onSync = vi.fn();
      const options = {
        sessionId,
        onOperation,
        onSync,
      };

      client = new WebSocketClient(noteId, options);
      await vi.advanceTimersByTimeAsync(10);

      const ws = (client as any).ws;

      // Set up sequence tracking at seqNum 0
      ws.simulateMessage({
        type: 'sync',
        content: '',
        version: 1,
        operations: [],
        clientId: 'client-id',
        seqNum: 0,
      });
      await vi.advanceTimersByTimeAsync(10);

      // Send seqNum 2 before seqNum 1 (out of order)
      ws.simulateMessage({
        type: 'operation',
        operation: { type: 'insert', position: 5, text: 'world', clientId: 'other', version: 1 },
        baseVersion: 1,
        clientId: 'other',
        sessionId: 'other-session',
        seqNum: 2,
      });
      await vi.advanceTimersByTimeAsync(10);

      // Should not have processed seqNum 2 yet
      expect(onOperation).not.toHaveBeenCalled();

      // Now send seqNum 1
      ws.simulateMessage({
        type: 'operation',
        operation: { type: 'insert', position: 0, text: 'hello', clientId: 'other', version: 1 },
        baseVersion: 1,
        clientId: 'other',
        sessionId: 'other-session',
        seqNum: 1,
      });
      await vi.advanceTimersByTimeAsync(10);

      // Now both should have been processed in order
      expect(onOperation).toHaveBeenCalledTimes(2);
      // First call should be seqNum 1
      expect(onOperation.mock.calls[0][0].text).toBe('hello');
      // Second call should be seqNum 2
      expect(onOperation.mock.calls[1][0].text).toBe('world');
    });

    it('should update sequence from ACK', async () => {
      const onAck = vi.fn();
      const options = {
        sessionId,
        onAck,
      };

      client = new WebSocketClient(noteId, options);
      await vi.advanceTimersByTimeAsync(10);

      const ws = (client as any).ws;

      // Set up sequence tracking
      ws.simulateMessage({
        type: 'sync',
        content: '',
        version: 1,
        operations: [],
        clientId: 'client-id',
        seqNum: 0,
      });
      await vi.advanceTimersByTimeAsync(10);

      // Receive ACK with seqNum 5
      ws.simulateMessage({
        type: 'ack',
        version: 2,
        seqNum: 5,
      });
      await vi.advanceTimersByTimeAsync(10);

      // Next expected should be 6
      expect((client as any).nextExpectedSeq).toBe(6);
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

      // Should not have attempted more reconnects
      expect((client as any).reconnectAttempts).toBe(initialReconnectAttempts);
    });

    it('should set reconnect timeout on unexpected close', () => {
      const options = {
        sessionId,
        autoReconnect: true,
      };

      client = new WebSocketClient(noteId, options);
      vi.advanceTimersByTime(10);

      const ws = (client as any).ws;

      // Simulate unexpected close by triggering onclose directly
      // (without going through close() which sets isIntentionallyClosed)
      ws.readyState = 3;
      ws.onclose(new CloseEvent('close'));

      // The client should have scheduled a reconnect
      expect((client as any).reconnectTimeout).not.toBeNull();
    });

    it('should respect autoReconnect false option', () => {
      const options = {
        sessionId,
        autoReconnect: false,
      };

      client = new WebSocketClient(noteId, options);
      vi.advanceTimersByTime(10);

      const ws = (client as any).ws;

      // Simulate unexpected close
      ws.readyState = 3;
      ws.onclose(new CloseEvent('close'));

      // Should not have scheduled a reconnect
      expect((client as any).reconnectTimeout).toBeNull();
    });
  });

  describe('operation pipelining', () => {
    it('should queue multiple operations', () => {
      const options = { sessionId };
      client = new WebSocketClient(noteId, options);
      vi.advanceTimersByTime(10);

      const ws = (client as any).ws;

      // Send multiple operations quickly
      for (let i = 0; i < 5; i++) {
        client.sendOperation({
          type: 'insert',
          position: i,
          text: String(i),
          clientId: 'my-client',
          version: 1,
        }, 1);
      }

      // Should have sent all operations (up to max in flight)
      expect(ws.send).toHaveBeenCalledTimes(5);
    });

    it('should track operations in flight', () => {
      const options = { sessionId };
      client = new WebSocketClient(noteId, options);
      vi.advanceTimersByTime(10);

      client.sendOperation({
        type: 'insert',
        position: 0,
        text: 'hello',
        clientId: 'my-client',
        version: 1,
      }, 1);

      expect((client as any).operationsInFlight).toBe(1);
    });

    it('should decrement in-flight counter on ACK', () => {
      const options = { sessionId };
      client = new WebSocketClient(noteId, options);
      vi.advanceTimersByTime(10);

      const ws = (client as any).ws;

      client.sendOperation({
        type: 'insert',
        position: 0,
        text: 'hello',
        clientId: 'my-client',
        version: 1,
      }, 1);

      expect((client as any).operationsInFlight).toBe(1);

      ws.simulateMessage({
        type: 'ack',
        version: 2,
      });
      vi.advanceTimersByTime(10);

      expect((client as any).operationsInFlight).toBe(0);
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

    it('should clear reconnect timeout on close', () => {
      const options = { sessionId, autoReconnect: true };
      client = new WebSocketClient(noteId, options);
      vi.advanceTimersByTime(10);

      const ws = (client as any).ws;

      // Trigger unexpected close to schedule reconnect
      ws.readyState = 3;
      ws.onclose(new CloseEvent('close'));

      // Reconnect should be scheduled
      expect((client as any).reconnectTimeout).not.toBeNull();

      // Now call close() which should clear the timeout
      client.close();

      expect((client as any).reconnectTimeout).toBeNull();
    });

    it('should clear gap timer on close', async () => {
      const options = { sessionId };
      client = new WebSocketClient(noteId, options);
      await vi.advanceTimersByTimeAsync(10);

      const ws = (client as any).ws;

      // Set up sequence tracking
      ws.simulateMessage({
        type: 'sync',
        content: '',
        version: 1,
        operations: [],
        clientId: 'client-id',
        seqNum: 0,
      });
      await vi.advanceTimersByTimeAsync(10);

      // Send out-of-order message to trigger gap timer
      ws.simulateMessage({
        type: 'operation',
        operation: { type: 'insert', position: 0, text: 'x', clientId: 'other', version: 1 },
        baseVersion: 1,
        clientId: 'other',
        sessionId: 'other-session',
        seqNum: 5, // Gap - expecting 1
      });
      await vi.advanceTimersByTimeAsync(10);

      // Gap timer should be set
      expect((client as any).gapTimer).not.toBeNull();

      // Close should clear it
      client.close();

      expect((client as any).gapTimer).toBeNull();
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
      expect(onError.mock.calls[0][0].message).toBe('WebSocket error');
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
      expect(onError.mock.calls[0][0].message).toBe('Server error occurred');
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

    it('should handle reload message', () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const options = { sessionId };

      client = new WebSocketClient(noteId, options);
      vi.advanceTimersByTime(10);

      const ws = (client as any).ws;
      ws.simulateMessage({
        type: 'reload',
        reason: 'Server restart',
      });
      vi.advanceTimersByTime(10);

      expect(consoleSpy).toHaveBeenCalledWith('[WebSocket] Reload requested:', 'Server restart');
      consoleSpy.mockRestore();
    });

    it('should handle unknown message type', () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const options = { sessionId };

      client = new WebSocketClient(noteId, options);
      vi.advanceTimersByTime(10);

      const ws = (client as any).ws;
      ws.simulateMessage({
        type: 'unknown_type',
        data: 'some data',
      });
      vi.advanceTimersByTime(10);

      expect(consoleSpy).toHaveBeenCalledWith('[WebSocket] Unknown message type:', expect.any(Object));
      consoleSpy.mockRestore();
    });
  });

  describe('replay request and response', () => {
    it('should send replay request', () => {
      const options = { sessionId };
      client = new WebSocketClient(noteId, options);
      vi.advanceTimersByTime(10);

      const ws = (client as any).ws;
      client.sendReplayRequest(5, 'my-client');

      expect(ws.send).toHaveBeenCalled();
      const sentMessage = JSON.parse(ws.send.mock.calls[0][0]);
      expect(sentMessage.type).toBe('replay_request');
      expect(sentMessage.fromVersion).toBe(5);
      expect(sentMessage.clientId).toBe('my-client');
      expect(sentMessage.sessionId).toBe(sessionId);
    });

    it('should not send replay request when not connected', () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const options = { sessionId, autoReconnect: false };
      client = new WebSocketClient(noteId, options);
      vi.advanceTimersByTime(10);

      client.close();

      client.sendReplayRequest(5, 'my-client');

      expect(consoleSpy).toHaveBeenCalledWith('[WebSocket] Cannot send replay request - not connected');
      consoleSpy.mockRestore();
    });

    it('should handle replay response', () => {
      const onReplayResponse = vi.fn();
      const options = {
        sessionId,
        onReplayResponse,
      };

      client = new WebSocketClient(noteId, options);
      vi.advanceTimersByTime(10);

      const ws = (client as any).ws;
      const replayResponse: ReplayResponseMessage = {
        type: 'replay_response',
        baseContent: 'Hello World',
        baseVersion: 5,
        operations: [
          { type: 'insert', position: 11, text: '!', clientId: 'other', version: 6 },
        ],
        currentVersion: 6,
        contentChecksum: 12345,
      };

      ws.simulateMessage(replayResponse);
      vi.advanceTimersByTime(10);

      expect(onReplayResponse).toHaveBeenCalledWith(
        'Hello World',
        5,
        [{ type: 'insert', position: 11, text: '!', clientId: 'other', version: 6 }],
        6,
        12345
      );
    });
  });

  describe('gap detection and resync', () => {
    it('should trigger resync after gap timeout', async () => {
      const options = { sessionId, autoReconnect: false };
      client = new WebSocketClient(noteId, options);
      await vi.advanceTimersByTimeAsync(10);

      const ws = (client as any).ws;
      const closeSpy = vi.spyOn(ws, 'close');

      // Set up sequence tracking
      ws.simulateMessage({
        type: 'sync',
        content: '',
        version: 1,
        operations: [],
        clientId: 'client-id',
        seqNum: 0,
      });
      await vi.advanceTimersByTimeAsync(10);

      // Send out-of-order message (seqNum 5 when expecting 1)
      ws.simulateMessage({
        type: 'operation',
        operation: { type: 'insert', position: 0, text: 'x', clientId: 'other', version: 1 },
        baseVersion: 1,
        clientId: 'other',
        sessionId: 'other-session',
        seqNum: 5,
      });
      await vi.advanceTimersByTimeAsync(10);

      // Gap timer should be set
      expect((client as any).gapTimer).not.toBeNull();

      // Fast forward past gap timeout (5 seconds)
      await vi.advanceTimersByTimeAsync(6000);

      // Should have closed WebSocket to trigger resync
      expect(closeSpy).toHaveBeenCalled();
    });

    it('should resync when pending buffer overflows', async () => {
      const options = { sessionId, autoReconnect: false };
      client = new WebSocketClient(noteId, options);
      await vi.advanceTimersByTimeAsync(10);

      const ws = (client as any).ws;
      const closeSpy = vi.spyOn(ws, 'close');

      // Set up sequence tracking
      ws.simulateMessage({
        type: 'sync',
        content: '',
        version: 1,
        operations: [],
        clientId: 'client-id',
        seqNum: 0,
      });
      await vi.advanceTimersByTimeAsync(10);

      // Send 21 out-of-order messages to overflow buffer (max is 20)
      for (let i = 2; i <= 22; i++) {
        ws.simulateMessage({
          type: 'operation',
          operation: { type: 'insert', position: 0, text: 'x', clientId: 'other', version: 1 },
          baseVersion: 1,
          clientId: 'other',
          sessionId: 'other-session',
          seqNum: i, // Skip seqNum 1
        });
        await vi.advanceTimersByTimeAsync(1);
      }

      // Should have closed WebSocket to trigger resync due to buffer overflow
      expect(closeSpy).toHaveBeenCalled();
    });

    it('should clear gap timer when sync clears pending messages', async () => {
      const options = { sessionId };
      client = new WebSocketClient(noteId, options);
      await vi.advanceTimersByTimeAsync(10);

      const ws = (client as any).ws;

      // Set up sequence tracking
      ws.simulateMessage({
        type: 'sync',
        content: '',
        version: 1,
        operations: [],
        clientId: 'client-id',
        seqNum: 0,
      });
      await vi.advanceTimersByTimeAsync(10);

      // Send out-of-order message to start gap timer
      ws.simulateMessage({
        type: 'operation',
        operation: { type: 'insert', position: 0, text: 'x', clientId: 'other', version: 1 },
        baseVersion: 1,
        clientId: 'other',
        sessionId: 'other-session',
        seqNum: 5,
      });
      await vi.advanceTimersByTimeAsync(10);

      expect((client as any).gapTimer).not.toBeNull();

      // Receive new sync which clears pending messages
      ws.simulateMessage({
        type: 'sync',
        content: 'new content',
        version: 10,
        operations: [],
        clientId: 'client-id',
        seqNum: 100,
      });
      await vi.advanceTimersByTimeAsync(10);

      // Gap timer should be cleared
      expect((client as any).gapTimer).toBeNull();
    });

    it('should call requestSync public method', () => {
      const options = { sessionId, autoReconnect: false };
      client = new WebSocketClient(noteId, options);
      vi.advanceTimersByTime(10);

      const ws = (client as any).ws;
      const closeSpy = vi.spyOn(ws, 'close');

      client.requestSync();

      expect(closeSpy).toHaveBeenCalled();
    });

    it('should ignore old sequence numbers', async () => {
      const onOperation = vi.fn();
      const options = {
        sessionId,
        onOperation,
      };

      client = new WebSocketClient(noteId, options);
      await vi.advanceTimersByTimeAsync(10);

      const ws = (client as any).ws;

      // Set up sequence tracking at seqNum 10
      ws.simulateMessage({
        type: 'sync',
        content: '',
        version: 1,
        operations: [],
        clientId: 'client-id',
        seqNum: 10,
      });
      await vi.advanceTimersByTimeAsync(10);

      // Send old sequence number (already processed)
      ws.simulateMessage({
        type: 'operation',
        operation: { type: 'insert', position: 0, text: 'old', clientId: 'other', version: 1 },
        baseVersion: 1,
        clientId: 'other',
        sessionId: 'other-session',
        seqNum: 5, // Old, should be ignored
      });
      await vi.advanceTimersByTimeAsync(10);

      // Should not have processed the old message
      expect(onOperation).not.toHaveBeenCalled();
    });
  });

  describe('reconnection edge cases', () => {
    it('should stop reconnecting after max attempts', async () => {
      const onError = vi.fn();
      const options = {
        sessionId,
        onError,
        autoReconnect: true,
      };

      client = new WebSocketClient(noteId, options);
      await vi.advanceTimersByTimeAsync(10);

      // Set reconnect attempts to exactly max (5) to trigger the error path
      (client as any).reconnectAttempts = 5;

      // Call attemptReconnect directly - this should trigger the "max attempts reached" error
      (client as any).attemptReconnect();

      // Should have called onError with failed to reconnect message
      expect(onError).toHaveBeenCalledWith(new Error('Failed to reconnect'));
    });

    it('should use exponential backoff for reconnection', async () => {
      const options = {
        sessionId,
        autoReconnect: true,
      };

      client = new WebSocketClient(noteId, options);
      await vi.advanceTimersByTimeAsync(10);

      const ws = (client as any).ws;
      ws.readyState = 3;
      ws.onclose(new CloseEvent('close'));

      // First attempt should be after 1 second
      expect((client as any).reconnectAttempts).toBe(1);
      expect((client as any).reconnectTimeout).not.toBeNull();

      // Advance 500ms - should not have reconnected yet
      await vi.advanceTimersByTimeAsync(500);
      expect((client as any).ws).toBeNull();

      // Advance another 600ms - should have reconnected
      await vi.advanceTimersByTimeAsync(600);
      expect((client as any).ws).not.toBeNull();
    });

    it('should reset reconnect attempts on successful connection', async () => {
      const onOpen = vi.fn();
      const options = {
        sessionId,
        onOpen,
        autoReconnect: true,
      };

      client = new WebSocketClient(noteId, options);
      await vi.advanceTimersByTimeAsync(10);

      // Verify initial connection reset attempts
      expect((client as any).reconnectAttempts).toBe(0);
      expect(onOpen).toHaveBeenCalledTimes(1);
    });

    it('should clear pending messages on reconnect', async () => {
      const options = { sessionId, autoReconnect: true };
      client = new WebSocketClient(noteId, options);
      await vi.advanceTimersByTimeAsync(10);

      const ws = (client as any).ws;

      // Set up sequence tracking
      ws.simulateMessage({
        type: 'sync',
        content: '',
        version: 1,
        operations: [],
        clientId: 'client-id',
        seqNum: 0,
      });
      await vi.advanceTimersByTimeAsync(10);

      // Add a pending message
      ws.simulateMessage({
        type: 'operation',
        operation: { type: 'insert', position: 0, text: 'x', clientId: 'other', version: 1 },
        baseVersion: 1,
        clientId: 'other',
        sessionId: 'other-session',
        seqNum: 5,
      });
      await vi.advanceTimersByTimeAsync(10);

      expect((client as any).pendingMessages.size).toBe(1);

      // Simulate close and reconnect
      ws.readyState = 3;
      ws.onclose(new CloseEvent('close'));
      await vi.advanceTimersByTimeAsync(2000);

      // Pending messages should be cleared on new connection's onopen
      expect((client as any).pendingMessages.size).toBe(0);
    });
  });

  describe('cursor and syntax ack', () => {
    it('should update sequence from cursor ACK', async () => {
      const options = { sessionId };
      client = new WebSocketClient(noteId, options);
      await vi.advanceTimersByTimeAsync(10);

      const ws = (client as any).ws;

      // Set up sequence tracking
      ws.simulateMessage({
        type: 'sync',
        content: '',
        version: 1,
        operations: [],
        clientId: 'client-id',
        seqNum: 0,
      });
      await vi.advanceTimersByTimeAsync(10);

      // Receive cursor ACK with seqNum
      ws.simulateMessage({
        type: 'cursor_ack',
        seqNum: 10,
      });
      await vi.advanceTimersByTimeAsync(10);

      // Next expected should be 11
      expect((client as any).nextExpectedSeq).toBe(11);
    });

    it('should update sequence from syntax ACK', async () => {
      const options = { sessionId };
      client = new WebSocketClient(noteId, options);
      await vi.advanceTimersByTimeAsync(10);

      const ws = (client as any).ws;

      // Set up sequence tracking
      ws.simulateMessage({
        type: 'sync',
        content: '',
        version: 1,
        operations: [],
        clientId: 'client-id',
        seqNum: 0,
      });
      await vi.advanceTimersByTimeAsync(10);

      // Receive syntax ACK with seqNum
      ws.simulateMessage({
        type: 'syntax_ack',
        seqNum: 15,
      });
      await vi.advanceTimersByTimeAsync(10);

      // Next expected should be 16
      expect((client as any).nextExpectedSeq).toBe(16);
    });
  });

  describe('outbound queue backpressure', () => {
    it('should apply backpressure when max operations in flight', () => {
      const options = { sessionId };
      client = new WebSocketClient(noteId, options);
      vi.advanceTimersByTime(10);

      const ws = (client as any).ws;

      // Send more operations than max in flight (20)
      for (let i = 0; i < 25; i++) {
        client.sendOperation({
          type: 'insert',
          position: i,
          text: String(i),
          clientId: 'my-client',
          version: 1,
        }, 1);
      }

      // Should have sent only 20 (max in flight)
      expect(ws.send).toHaveBeenCalledTimes(20);
      expect((client as any).operationsInFlight).toBe(20);
      expect((client as any).outboundQueue.length).toBe(5);
    });

    it('should process queued operations after ACK', () => {
      const options = { sessionId };
      client = new WebSocketClient(noteId, options);
      vi.advanceTimersByTime(10);

      const ws = (client as any).ws;

      // Send more operations than max in flight
      for (let i = 0; i < 22; i++) {
        client.sendOperation({
          type: 'insert',
          position: i,
          text: String(i),
          clientId: 'my-client',
          version: 1,
        }, 1);
      }

      expect(ws.send).toHaveBeenCalledTimes(20);
      expect((client as any).outboundQueue.length).toBe(2);

      // Receive ACK to free up a slot
      ws.simulateMessage({ type: 'ack', version: 1 });
      vi.advanceTimersByTime(10);

      // Should have sent one more operation
      expect(ws.send).toHaveBeenCalledTimes(21);
      expect((client as any).outboundQueue.length).toBe(1);
    });
  });

  describe('unknown sequenced message type', () => {
    it('should warn on unknown sequenced message type', async () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const options = { sessionId };
      client = new WebSocketClient(noteId, options);
      await vi.advanceTimersByTimeAsync(10);

      const ws = (client as any).ws;

      // Set up sequence tracking
      ws.simulateMessage({
        type: 'sync',
        content: '',
        version: 1,
        operations: [],
        clientId: 'client-id',
        seqNum: 0,
      });
      await vi.advanceTimersByTimeAsync(10);

      // Send unknown sequenced message
      ws.simulateMessage({
        type: 'unknown_sequenced',
        seqNum: 1,
      });
      await vi.advanceTimersByTimeAsync(10);

      expect(consoleSpy).toHaveBeenCalledWith('[WebSocket] Unknown sequenced message type:', expect.any(Object));
      consoleSpy.mockRestore();
    });
  });

  describe('connection guards', () => {
    it('should not create new connection if already connected', () => {
      const options = { sessionId };
      client = new WebSocketClient(noteId, options);
      vi.advanceTimersByTime(10);

      const firstWs = (client as any).ws;

      // Try to connect again by calling private connect method
      (client as any).connect();

      // Should still be using the same WebSocket
      expect((client as any).ws).toBe(firstWs);
    });
  });
});
