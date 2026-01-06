/**
 * @fileoverview WebSocket client for real-time collaborative editing with Yjs CRDT.
 *
 * Implements Yjs-based synchronization:
 * - Initial sync receives full Yjs state from server
 * - Incremental updates are small binary diffs
 * - Awareness protocol handles cursor/presence sync
 * - Sequence numbers ensure message ordering
 */

import type {
  WSMessage,
  YjsSyncMessage,
  YjsUpdateMessage,
  YjsAckMessage,
  AwarenessUpdateMessage,
  UserJoinedMessage,
  UserLeftMessage,
  SyntaxChangeMessage,
  SyntaxAckMessage,
  NoteStatusMessage,
  RequestEditResponseMessage,
  EditorCountUpdateMessage,
  YjsStateResponseMessage,
} from '../../../src/types/messages';

/**
 * Configuration options for the WebSocket client.
 */
export interface WebSocketClientOptions {
  /** Password for encrypted notes (client-side only, never sent to server) */
  password?: string;
  /** Unique session identifier for this connection */
  sessionId: string;
  /** Called when WebSocket connection is established */
  onOpen?: () => void;
  /** Called when initial Yjs sync message is received from server */
  onYjsSync?: (state: Uint8Array, clientId: string, syntax?: string) => void;
  /** Called when a remote Yjs update is received */
  onYjsUpdate?: (update: Uint8Array, clientId: string) => void;
  /** Called when a remote awareness update is received */
  onAwarenessUpdate?: (update: Uint8Array, clientId: string) => void;
  /** Called when server acknowledges a sent Yjs update */
  onYjsAck?: (seqNum: number) => void;
  /** Called when WebSocket connection is closed */
  onClose?: () => void;
  /** Called on WebSocket or server errors */
  onError?: (error: Error) => void;
  /** Called when note is deleted (param indicates if deleted by current user) */
  onNoteDeleted?: (deletedByCurrentUser: boolean) => void;
  /** Called when note encryption status changes */
  onEncryptionChanged?: (is_encrypted: boolean) => void;
  /** Called when note version is updated by another user (encrypted notes) */
  onVersionUpdate?: (version: number, message: string) => void;
  /** Called when a user joins the session */
  onUserJoined?: (clientId: string, connectedUsers: string[], activeEditorCount: number, viewerCount: number) => void;
  /** Called when a user leaves the session */
  onUserLeft?: (clientId: string, connectedUsers: string[], activeEditorCount: number, viewerCount: number) => void;
  /** Called when syntax highlighting mode changes */
  onSyntaxChange?: (syntax: string) => void;
  /** Called when note status (view count, expiration) is received */
  onNoteStatus?: (viewCount: number, maxViews: number | null, expiresAt: number | null) => void;
  /** Called when server responds to an edit permission request */
  onRequestEditResponse?: (canEdit: boolean, activeEditorCount: number, viewerCount: number) => void;
  /** Called when editor limit is reached and update is rejected */
  onEditorLimitReached?: () => void;
  /** Called when editor/viewer counts change (e.g., viewer becomes editor) */
  onEditorCountUpdate?: (activeEditorCount: number, viewerCount: number) => void;
  /** Called when full Yjs state is received (for recovery) */
  onYjsStateResponse?: (state: Uint8Array) => void;
  /** Whether to automatically reconnect on connection loss (default: true) */
  autoReconnect?: boolean;
}

interface QueuedInboundMessage {
  message: WSMessage;
}

/**
 * Encode Uint8Array to base64 string for JSON transport
 */
function encodeBase64(data: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < data.length; i++) {
    binary += String.fromCharCode(data[i]);
  }
  return btoa(binary);
}

/**
 * Decode base64 string to Uint8Array
 */
function decodeBase64(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export class WebSocketClient {
  private ws: WebSocket | null = null;
  private noteId: string;
  private options: WebSocketClientOptions;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectTimeout: number | null = null;
  private isIntentionallyClosed = false;

  // Client ID assigned by server during sync
  private clientId: string = '';

  // Inbound message queue for sequential processing
  private inboundQueue: QueuedInboundMessage[] = [];
  private isProcessingInbound = false;

  // Global sequence ordering for broadcast messages
  private nextExpectedSeq: number = 1;
  private pendingMessages: Map<number, WSMessage> = new Map();
  private maxPendingMessages = 20;
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
    const url = `${protocol}//${host}/api/notes/${this.noteId}/ws?session_id=${this.options.sessionId}`;

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

      this.ws.onclose = () => {
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
        }
      }
    } finally {
      this.isProcessingInbound = false;
    }
  }

  private async handleMessage(message: WSMessage): Promise<void> {
    // Process Yjs sync immediately - it sets up sequence tracking
    if (message.type === 'yjs_sync') {
      await this.handleYjsSync(message as YjsSyncMessage);
      return;
    }

    // Process ACK immediately - not a broadcast message
    if (message.type === 'yjs_ack') {
      await this.handleYjsAck(message as YjsAckMessage);
      return;
    }

    // Process syntax ACK immediately
    if (message.type === 'syntax_ack') {
      await this.handleSyntaxAck(message as SyntaxAckMessage);
      return;
    }

    // Process Yjs state response immediately (recovery)
    if (message.type === 'yjs_state_response') {
      await this.handleYjsStateResponse(message as YjsStateResponseMessage);
      return;
    }

    // Check if this message has a global sequence number
    const seqNum = (message as { seqNum?: number }).seqNum;

    if (seqNum !== undefined) {
      // This message has a sequence number - enforce ordering
      return this.handleSequencedMessage(message, seqNum);
    }

    // Messages without sequence numbers process immediately
    switch (message.type) {
      case 'error':
        console.error('[WebSocket] Server error:', message.message);
        // Handle editor limit reached error specially
        if (message.message === 'editor_limit_reached') {
          if (this.options.onEditorLimitReached) {
            this.options.onEditorLimitReached();
          }
        } else if (this.options.onError) {
          this.options.onError(new Error(message.message));
        }
        break;

      case 'reload':
        console.warn('[WebSocket] Reload requested:', message.reason);
        break;

      case 'note_expired':
      case 'note_deleted':
        console.warn('[WebSocket] Note no longer available');
        if (this.options.onNoteDeleted) {
          const deletedByCurrentUser = message.type === 'note_deleted' &&
                                        message.sessionId === this.options.sessionId;
          this.options.onNoteDeleted(deletedByCurrentUser);
        }
        this.close();
        break;

      case 'encryption_changed':
        console.log('[WebSocket] Encryption status changed:', message);
        if (this.options.onEncryptionChanged) {
          this.options.onEncryptionChanged(message.is_encrypted);
        }
        break;

      case 'version_update':
        console.log('[WebSocket] Version update:', message);
        if (this.options.onVersionUpdate) {
          this.options.onVersionUpdate(message.version, message.message);
        }
        break;

      case 'note_status':
        if (this.options.onNoteStatus) {
          const statusMsg = message as NoteStatusMessage;
          this.options.onNoteStatus(statusMsg.view_count, statusMsg.max_views, statusMsg.expires_at);
        }
        break;

      case 'request_edit_response':
        await this.handleRequestEditResponse(message as RequestEditResponseMessage);
        break;

      case 'awareness_update':
        // Awareness updates don't use sequence numbers (cursor positions are ephemeral)
        await this.handleAwarenessUpdate(message as AwarenessUpdateMessage);
        break;

      default:
        console.warn('[WebSocket] Unknown message type:', message);
    }
  }

  /**
   * Handle messages with global sequence numbers
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
   * Process a sequenced message (Yjs update, presence, or syntax change)
   * Note: awareness_update is NOT sequenced - it's processed immediately
   */
  private async processSequencedMessage(message: WSMessage): Promise<void> {
    switch (message.type) {
      case 'yjs_update':
        await this.handleYjsUpdate(message as YjsUpdateMessage);
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

      case 'editor_count_update':
        await this.handleEditorCountUpdate(message as EditorCountUpdateMessage);
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
   */
  private updateSequenceFromAck(seqNum: number | undefined): void {
    if (seqNum !== undefined && seqNum >= this.nextExpectedSeq) {
      this.nextExpectedSeq = seqNum + 1;
    }
  }

  /**
   * Start gap detection timer
   */
  private startGapTimer(): void {
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

  private async handleYjsSync(message: YjsSyncMessage): Promise<void> {
    // Initialize global sequence tracking from sync message
    this.nextExpectedSeq = message.seqNum + 1;
    this.pendingMessages.clear();
    this.clientId = message.clientId;

    // Clear gap detection timer
    if (this.gapTimer !== null) {
      clearTimeout(this.gapTimer);
      this.gapTimer = null;
    }

    if (this.options.onYjsSync) {
      const state = decodeBase64(message.state);
      this.options.onYjsSync(state, message.clientId, message.syntax);
    }
  }

  private async handleYjsUpdate(message: YjsUpdateMessage): Promise<void> {
    if (this.options.onYjsUpdate) {
      const update = decodeBase64(message.update);
      this.options.onYjsUpdate(update, message.clientId);
    }
  }

  private async handleAwarenessUpdate(message: AwarenessUpdateMessage): Promise<void> {
    if (this.options.onAwarenessUpdate) {
      const update = decodeBase64(message.update);
      this.options.onAwarenessUpdate(update, message.clientId);
    }
  }

  private async handleYjsAck(message: YjsAckMessage): Promise<void> {
    // Update sequence tracking based on the broadcast we didn't receive
    this.updateSequenceFromAck(message.seqNum);

    if (this.options.onYjsAck && message.seqNum !== undefined) {
      this.options.onYjsAck(message.seqNum);
    }
  }

  private async handleYjsStateResponse(message: YjsStateResponseMessage): Promise<void> {
    if (this.options.onYjsStateResponse) {
      const state = decodeBase64(message.state);
      this.options.onYjsStateResponse(state);
    }
  }

  private async handleUserJoined(message: UserJoinedMessage): Promise<void> {
    if (this.options.onUserJoined) {
      this.options.onUserJoined(message.clientId, message.connectedUsers, message.activeEditorCount, message.viewerCount);
    }
  }

  private async handleUserLeft(message: UserLeftMessage): Promise<void> {
    if (this.options.onUserLeft) {
      this.options.onUserLeft(message.clientId, message.connectedUsers, message.activeEditorCount, message.viewerCount);
    }
  }

  private async handleSyntaxChange(message: SyntaxChangeMessage): Promise<void> {
    if (this.options.onSyntaxChange) {
      this.options.onSyntaxChange(message.syntax);
    }
  }

  private async handleEditorCountUpdate(message: EditorCountUpdateMessage): Promise<void> {
    if (this.options.onEditorCountUpdate) {
      this.options.onEditorCountUpdate(message.activeEditorCount, message.viewerCount);
    }
  }

  private async handleSyntaxAck(message: SyntaxAckMessage): Promise<void> {
    // Update sequence tracking based on the syntax broadcast we didn't receive
    this.updateSequenceFromAck(message.seqNum);
  }

  private async handleRequestEditResponse(message: RequestEditResponseMessage): Promise<void> {
    if (this.options.onRequestEditResponse) {
      this.options.onRequestEditResponse(message.canEdit, message.activeEditorCount, message.viewerCount);
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

  /**
   * Request permission to edit the note.
   * Server will respond with whether editing is allowed based on active editor limit.
   */
  sendRequestEdit(): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.warn('[WebSocket] Cannot send request_edit - not connected');
      return;
    }

    const message = {
      type: 'request_edit',
      clientId: this.clientId,
      sessionId: this.options.sessionId,
    };

    this.ws.send(JSON.stringify(message));
  }

  /**
   * Send a Yjs update to the server
   */
  sendYjsUpdate(update: Uint8Array): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.warn('[WebSocket] Cannot send Yjs update - not connected');
      return;
    }

    const message: YjsUpdateMessage = {
      type: 'yjs_update',
      update: encodeBase64(update),
      clientId: this.clientId,
      sessionId: this.options.sessionId,
    };

    this.ws.send(JSON.stringify(message));
  }

  /**
   * Send an awareness update to the server (cursor/presence)
   */
  sendAwarenessUpdate(update: Uint8Array): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return;
    }

    const message: AwarenessUpdateMessage = {
      type: 'awareness_update',
      update: encodeBase64(update),
      clientId: this.clientId,
    };

    this.ws.send(JSON.stringify(message));
  }

  /**
   * Send a syntax change to the server
   */
  sendSyntaxChange(syntax: string): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return;
    }

    const message: SyntaxChangeMessage = {
      type: 'syntax_change',
      clientId: this.clientId,
      syntax,
    };

    this.ws.send(JSON.stringify(message));
  }

  /**
   * Request full Yjs state from server (for recovery)
   */
  sendYjsStateRequest(): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return;
    }

    const message = {
      type: 'yjs_state_request',
      clientId: this.clientId,
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

  /**
   * Get the client ID assigned by the server
   */
  getClientId(): string {
    return this.clientId;
  }

  /**
   * Request a full resync with the server.
   * This closes and reconnects to get fresh server state.
   */
  requestSync(): void {
    this.requestResync();
  }
}
