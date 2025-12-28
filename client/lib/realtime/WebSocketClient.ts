/**
 * WebSocket client for real-time collaboration
 *
 * ARCHITECTURE OVERVIEW:
 * This client implements a dual-tracking system for collaborative editing:
 *
 * 1. VERSION TRACKING (Operation Transform - OT):
 *    - Used for ALL notes (encrypted and unencrypted)
 *    - Tracked at database level and in App.svelte as `currentVersion`
 *    - Ensures operations are applied in correct logical order for OT transforms
 *    - Required for conflict detection when real-time collaboration is disabled
 *    - Critical for E2E encrypted notes where WebSocket collaboration is turned off
 *
 * 2. GLOBAL SEQUENCE TRACKING (WebSocket Message Ordering):
 *    - Only used when WebSockets are active (unencrypted notes with real-time collab)
 *    - Tracked client-side as `nextExpectedSeq`
 *    - Server assigns monotonically increasing `seqNum` to ALL broadcast messages
 *    - Ensures correct ordering of operations, cursor updates, and presence events
 *    - Solves race conditions when 3+ users collaborate simultaneously
 *    - Messages received out-of-order are buffered until gaps are filled
 *
 * WHY BOTH EXIST:
 * - Version: Persistent, survives disconnections, enables conflict detection
 * - Sequence: Transient, WebSocket session only, ensures real-time message ordering
 * - E2E encrypted notes use version-only (no WebSocket collaboration to preserve E2E)
 * - Unencrypted notes use both (version for persistence, sequence for real-time ordering)
 */

import type { Operation, WSMessage, SyncMessage, OperationMessage, AckMessage, CursorUpdateMessage, CursorAckMessage, UserJoinedMessage, UserLeftMessage, SyntaxChangeMessage, SyntaxAckMessage } from '../../../src/ot/types';

export interface WebSocketClientOptions {
  password?: string;
  sessionId: string;
  onOpen?: () => void;
  onOperation?: (operation: Operation) => void;
  onClose?: () => void;
  onError?: (error: Error) => void;
  onSync?: (content: string, version: number, operations: Operation[], clientId: string, syntax?: string) => void;
  onAck?: (version: number) => void;
  onNoteDeleted?: (deletedByCurrentUser: boolean) => void;
  onEncryptionChanged?: (is_encrypted: boolean, has_password: boolean) => void;
  onVersionUpdate?: (version: number, message: string) => void;
  onCursorUpdate?: (clientId: string, position: number) => void;
  onUserJoined?: (clientId: string, connectedUsers: string[]) => void;
  onUserLeft?: (clientId: string, connectedUsers: string[]) => void;
  onSyntaxChange?: (syntax: string) => void;
  autoReconnect?: boolean;
}

interface QueuedInboundMessage {
  message: WSMessage;
}

interface QueuedOutboundOperation {
  operation: Operation;
  baseVersion: number;
}

export class WebSocketClient {
  private ws: WebSocket | null = null;
  private noteId: string;
  private options: WebSocketClientOptions;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectTimeout: number | null = null;
  private isIntentionallyClosed = false;

  // Inbound message queue for sequential processing
  private inboundQueue: QueuedInboundMessage[] = [];
  private isProcessingInbound = false;

  // Outbound operation queue for sequential sending
  private outboundQueue: QueuedOutboundOperation[] = [];
  private isProcessingOutbound = false;
  private waitingForAck = false;

  // Global sequence ordering for ALL broadcast messages (operations, cursors, presence)
  private nextExpectedSeq: number = 1;
  private pendingMessages: Map<number, WSMessage> = new Map();
  private maxPendingMessages = 20; // Max buffered out-of-order messages
  private gapTimer: number | null = null;
  private gapTimeout = 5000; // 5 seconds

  constructor(noteId: string, options: WebSocketClientOptions) {
    this.noteId = noteId;
    this.options = options;
    this.connect();
  }

  private connect(): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      return;
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    let url = `${protocol}//${host}/api/notes/${this.noteId}/ws?session_id=${this.options.sessionId}`;

    if (this.options.password) {
      url += `&password=${encodeURIComponent(this.options.password)}`;
    }

    try {
      this.ws = new WebSocket(url);

      this.ws.onopen = () => {
        this.reconnectAttempts = 0;
        // Clear pending messages - they're stale now, sync will provide current state
        this.pendingMessages.clear();
        if (this.options.onOpen) {
          this.options.onOpen();
        }
      };

      this.ws.onmessage = (event) => {
        try {
          const message: WSMessage = JSON.parse(event.data);
          this.enqueueInboundMessage(message);
        } catch (error) {
          console.error('[WebSocket] Error parsing message:', error);
        }
      };

      this.ws.onclose = (event) => {
        this.ws = null;

        if (!this.isIntentionallyClosed && this.options.autoReconnect !== false) {
          this.attemptReconnect();
        }

        if (this.options.onClose) {
          this.options.onClose();
        }
      };

      this.ws.onerror = (event) => {
        console.error('[WebSocket] Error:', event);
        if (this.options.onError) {
          this.options.onError(new Error('WebSocket error'));
        }
      };
    } catch (error) {
      console.error('[WebSocket] Connection error:', error);
      if (this.options.onError) {
        this.options.onError(error as Error);
      }
      this.attemptReconnect();
    }
  }

  /**
   * Enqueue an inbound message for sequential processing
   */
  private enqueueInboundMessage(message: WSMessage): void {
    this.inboundQueue.push({ message });

    // Start processing if not already processing
    if (!this.isProcessingInbound) {
      this.processInboundQueue();
    }
  }

  /**
   * Process inbound messages sequentially
   */
  private async processInboundQueue(): Promise<void> {
    // Prevent concurrent processing
    if (this.isProcessingInbound) {
      return;
    }

    this.isProcessingInbound = true;

    try {
      while (this.inboundQueue.length > 0) {
        const queuedMessage = this.inboundQueue.shift();

        if (!queuedMessage) {
          console.error('[WebSocket] Queue empty when message was expected');
          break;
        }

        try {
          await this.handleMessage(queuedMessage.message);
        } catch (error) {
          console.error('[WebSocket] Error processing queued message:', error);
          // Continue processing other messages even if one fails
        }
      }
    } finally {
      this.isProcessingInbound = false;
    }
  }

  private async handleMessage(message: WSMessage): Promise<void> {
    // Process sync immediately - it sets up sequence tracking, so it can't be sequenced
    if (message.type === 'sync') {
      await this.handleSync(message as SyncMessage);
      return;
    }

    // Process ACK immediately - even though it has seqNum, it's not a broadcast message
    if (message.type === 'ack') {
      await this.handleAck(message as AckMessage);
      return;
    }

    // Process cursor ACK immediately - it tells us what sequence number was used
    if (message.type === 'cursor_ack') {
      await this.handleCursorAck(message as CursorAckMessage);
      return;
    }

    // Process syntax ACK immediately - it tells us what sequence number was used
    if (message.type === 'syntax_ack') {
      await this.handleSyntaxAck(message as SyntaxAckMessage);
      return;
    }

    // Check if this message has a global sequence number (operations, cursor updates, user presence)
    const seqNum = (message as any).seqNum;

    if (seqNum !== undefined) {
      // This message has a sequence number - enforce ordering
      return this.handleSequencedMessage(message, seqNum);
    }

    // Messages without sequence numbers (error, etc.) process immediately
    switch (message.type) {

      case 'error':
        console.error('[WebSocket] Server error:', message.message);
        if (this.options.onError) {
          this.options.onError(new Error(message.message));
        }
        break;

      case 'reload':
        console.warn('[WebSocket] Reload requested:', message.reason);
        // Could trigger a page reload or show a message to the user
        break;

      case 'note_expired':
      case 'note_deleted':
        console.warn('[WebSocket] Note no longer available');
        if (this.options.onNoteDeleted) {
          // Check if the current user deleted the note by comparing session IDs
          const deletedByCurrentUser = message.type === 'note_deleted' &&
                                        message.sessionId === this.options.sessionId;
          this.options.onNoteDeleted(deletedByCurrentUser);
        }
        this.close();
        break;

      case 'encryption_changed':
        console.log('[WebSocket] Encryption status changed:', message);
        if (this.options.onEncryptionChanged) {
          this.options.onEncryptionChanged(message.is_encrypted, message.has_password);
        }
        break;

      case 'version_update':
        console.log('[WebSocket] Version update:', message);
        if (this.options.onVersionUpdate) {
          this.options.onVersionUpdate(message.version, message.message);
        }
        break;

      default:
        console.warn('[WebSocket] Unknown message type:', message);
    }
  }

  /**
   * Handle messages with global sequence numbers (operations, cursor updates, presence)
   * Ensures these messages are processed in the exact order the server sent them
   */
  private async handleSequencedMessage(message: WSMessage, seqNum: number): Promise<void> {
    // Check if this is the next expected sequence
    if (seqNum === this.nextExpectedSeq) {
      // Process this message immediately
      await this.processSequencedMessage(message);
      this.nextExpectedSeq++;

      // Check if we have pending messages that can now be processed
      await this.applyPendingMessages();

      // Clear gap detection timer if no more pending messages
      if (this.pendingMessages.size === 0 && this.gapTimer !== null) {
        clearTimeout(this.gapTimer);
        this.gapTimer = null;
      }
    } else if (seqNum > this.nextExpectedSeq) {
      // Future message - buffer it
      // Check buffer size limit
      if (this.pendingMessages.size >= this.maxPendingMessages) {
        console.error(`[WebSocket] Pending messages buffer full (${this.maxPendingMessages}), requesting resync`);
        this.requestResync();
        return;
      }

      this.pendingMessages.set(seqNum, message);

      // Start gap detection timer if not already running
      if (this.gapTimer === null) {
        this.startGapTimer();
      }
    }
    // Ignore old messages (seqNum < nextExpectedSeq) - already processed
  }

  /**
   * Process a sequenced message (operation, cursor update, presence, or syntax change)
   */
  private async processSequencedMessage(message: WSMessage): Promise<void> {
    switch (message.type) {
      case 'operation':
        await this.handleOperation(message as OperationMessage);
        break;

      case 'cursor_update':
        await this.handleCursorUpdate(message as CursorUpdateMessage);
        break;

      case 'user_joined':
        await this.handleUserJoined(message as UserJoinedMessage);
        break;

      case 'user_left':
        await this.handleUserLeft(message as UserLeftMessage);
        break;

      case 'syntax_change':
        await this.handleSyntaxChange(message as SyntaxChangeMessage);
        break;

      default:
        console.warn('[WebSocket] Unknown sequenced message type:', message);
    }
  }

  /**
   * Apply any pending messages that are now in sequence
   */
  private async applyPendingMessages(): Promise<void> {
    while (this.pendingMessages.has(this.nextExpectedSeq)) {
      const message = this.pendingMessages.get(this.nextExpectedSeq);
      this.pendingMessages.delete(this.nextExpectedSeq);

      if (message) {
        await this.processSequencedMessage(message);
      }

      this.nextExpectedSeq++;
    }
  }

  /**
   * Update sequence tracking when receiving an ACK for our own message.
   *
   * When a client sends an operation or cursor update, the server broadcasts it
   * to all OTHER clients (excluding the sender to avoid processing own changes twice).
   * The sender receives an ACK with the sequence number used for that broadcast.
   *
   * Since the sender is excluded from the broadcast, they need to advance their
   * sequence counter to account for the broadcast they skipped.
   */
  private updateSequenceFromAck(seqNum: number | undefined): void {
    if (seqNum !== undefined && seqNum >= this.nextExpectedSeq) {
      this.nextExpectedSeq = seqNum + 1;
    }
  }

  /**
   * Start gap detection timer
   * Defensive: clears any existing timer first to prevent memory leaks
   */
  private startGapTimer(): void {
    // Clear any existing timer first
    if (this.gapTimer !== null) {
      clearTimeout(this.gapTimer);
    }

    this.gapTimer = setTimeout(() => {
      if (this.pendingMessages.size > 0) {
        const pendingSeqs = Array.from(this.pendingMessages.keys()).sort((a, b) => a - b);
        console.error(
          `[WebSocket] Gap detection timeout! Expected seq ${this.nextExpectedSeq}, ` +
          `have pending: [${pendingSeqs.join(', ')}]`
        );
        this.requestResync();
      }
    }, this.gapTimeout) as unknown as number;
  }

  private async handleSync(message: SyncMessage): Promise<void> {
    // Initialize global sequence tracking from sync message
    // Next expected message will be current + 1
    this.nextExpectedSeq = message.seqNum + 1;
    this.pendingMessages.clear();

    // Clear gap detection timer
    if (this.gapTimer !== null) {
      clearTimeout(this.gapTimer);
      this.gapTimer = null;
    }

    if (this.options.onSync) {
      this.options.onSync(message.content, message.version, message.operations, message.clientId, message.syntax);
    }
  }

  private async handleOperation(message: OperationMessage): Promise<void> {
    // Apply operation immediately - sequencing is handled by global seqNum
    // Version tracking for OT transforms happens in App.svelte
    if (this.options.onOperation) {
      this.options.onOperation(message.operation);
    }
  }

  /**
   * Request a full resync from the server
   */
  private requestResync(): void {
    console.warn('[WebSocket] Requesting full resync due to gap');

    // Clear gap detection timer
    if (this.gapTimer !== null) {
      clearTimeout(this.gapTimer);
      this.gapTimer = null;
    }

    // Clear pending messages
    this.pendingMessages.clear();

    // Close and reconnect to trigger sync
    if (this.ws) {
      this.ws.close();
    }
  }

  private async handleAck(message: AckMessage): Promise<void> {
    if (this.options.onAck) {
      this.options.onAck(message.version);
    }

    // Update sequence tracking based on the broadcast we didn't receive
    this.updateSequenceFromAck(message.seqNum);

    // ACK received, we can send the next operation
    this.waitingForAck = false;

    // Continue processing outbound queue
    if (this.outboundQueue.length > 0 && !this.isProcessingOutbound) {
      this.processOutboundQueue();
    }
  }

  private async handleCursorAck(message: CursorAckMessage): Promise<void> {
    // Update sequence tracking based on the cursor broadcast we didn't receive
    this.updateSequenceFromAck(message.seqNum);
  }

  private async handleCursorUpdate(message: CursorUpdateMessage): Promise<void> {
    if (this.options.onCursorUpdate) {
      this.options.onCursorUpdate(message.clientId, message.position);
    }
  }

  private async handleUserJoined(message: UserJoinedMessage): Promise<void> {
    if (this.options.onUserJoined) {
      this.options.onUserJoined(message.clientId, message.connectedUsers);
    }
  }

  private async handleUserLeft(message: UserLeftMessage): Promise<void> {
    if (this.options.onUserLeft) {
      this.options.onUserLeft(message.clientId, message.connectedUsers);
    }
  }

  private async handleSyntaxChange(message: SyntaxChangeMessage): Promise<void> {
    if (this.options.onSyntaxChange) {
      this.options.onSyntaxChange(message.syntax);
    }
  }

  private async handleSyntaxAck(message: SyntaxAckMessage): Promise<void> {
    // Update sequence tracking based on the syntax broadcast we didn't receive
    this.updateSequenceFromAck(message.seqNum);
  }

  /**
   * Process outbound operations sequentially
   * Only sends next operation after receiving ACK for previous one
   */
  private processOutboundQueue(): void {
    // Prevent concurrent processing
    if (this.isProcessingOutbound || this.waitingForAck) {
      return;
    }

    // Check if we have operations to send
    if (this.outboundQueue.length === 0) {
      return;
    }

    // Check connection
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.warn('[WebSocket] Cannot process outbound queue - not connected');
      return;
    }

    this.isProcessingOutbound = true;

    try {
      const queuedOp = this.outboundQueue.shift();

      if (!queuedOp) {
        console.error('[WebSocket] Outbound queue empty when operation was expected');
        this.isProcessingOutbound = false;
        return;
      }

      const message: OperationMessage = {
        type: 'operation',
        operation: queuedOp.operation,
        baseVersion: queuedOp.baseVersion,
        clientId: queuedOp.operation.clientId,
        sessionId: this.options.sessionId,
      };

      this.ws.send(JSON.stringify(message));

      // Mark that we're waiting for ACK before sending next operation
      this.waitingForAck = true;
    } catch (error) {
      console.error('[WebSocket] Error processing outbound operation:', error);
      // Reset state so we can try again
      this.waitingForAck = false;
    } finally {
      this.isProcessingOutbound = false;
    }
  }

  sendOperation(operation: Operation, baseVersion: number): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      // Don't queue operations if not connected - they'll be stale
      console.warn('[WebSocket] Cannot send operation - not connected');
      return;
    }

    // Enqueue operation for sequential sending
    this.outboundQueue.push({
      operation,
      baseVersion,
    });

    // Start processing if not already processing
    if (!this.isProcessingOutbound && !this.waitingForAck) {
      this.processOutboundQueue();
    }
  }

  sendCursorUpdate(position: number, clientId: string): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return;
    }

    const message: CursorUpdateMessage = {
      type: 'cursor_update',
      clientId,
      position,
      sessionId: this.options.sessionId,
    };

    this.ws.send(JSON.stringify(message));
  }

  sendSyntaxChange(syntax: string, clientId: string): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return;
    }

    const message: SyntaxChangeMessage = {
      type: 'syntax_change',
      clientId,
      syntax,
    };

    this.ws.send(JSON.stringify(message));
  }


  private attemptReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('[WebSocket] Max reconnection attempts reached');
      if (this.options.onError) {
        this.options.onError(new Error('Failed to reconnect'));
      }
      return;
    }

    this.reconnectAttempts++;
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts - 1), 16000);

    this.reconnectTimeout = setTimeout(() => {
      this.connect();
    }, delay) as unknown as number;
  }

  close(): void {
    this.isIntentionallyClosed = true;

    if (this.reconnectTimeout !== null) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    // Clear gap detection timer
    if (this.gapTimer !== null) {
      clearTimeout(this.gapTimer);
      this.gapTimer = null;
    }

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }
}
