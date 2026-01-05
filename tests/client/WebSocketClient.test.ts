/**
 * Tests for WebSocketClient
 * Tests the WebSocket client for real-time collaboration
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { WebSocketClient } from '../../client/lib/realtime/WebSocketClient';
import type { SyncMessage, OperationMessage, AckMessage, CursorUpdateMessage, UserJoinedMessage, UserLeftMessage, SyntaxChangeMessage } from '../../src/ot/types';

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
  });
});
