// WebSocket client for real-time collaboration

import type { Operation, WSMessage, SyncMessage, OperationMessage, AckMessage, CursorUpdateMessage, UserJoinedMessage, UserLeftMessage } from '../../../src/ot/types';

export interface WebSocketClientOptions {
  password?: string;
  sessionId: string;
  onOpen?: () => void;
  onOperation?: (operation: Operation) => void;
  onClose?: () => void;
  onError?: (error: Error) => void;
  onSync?: (content: string, version: number, operations: Operation[]) => void;
  onAck?: (version: number) => void;
  onNoteDeleted?: () => void;
  onEncryptionChanged?: (is_encrypted: boolean, has_password: boolean) => void;
  onVersionUpdate?: (version: number, message: string) => void;
  onCursorUpdate?: (clientId: string, position: number) => void;
  onUserJoined?: (clientId: string, connectedUsers: string[]) => void;
  onUserLeft?: (clientId: string, connectedUsers: string[]) => void;
  autoReconnect?: boolean;
}

export class WebSocketClient {
  private ws: WebSocket | null = null;
  private noteId: string;
  private options: WebSocketClientOptions;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectTimeout: number | null = null;
  private isIntentionallyClosed = false;
  private pendingOperations: Operation[] = [];

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
        // Clear pending operations - they're stale now, sync will provide current state
        this.pendingOperations = [];
        if (this.options.onOpen) {
          this.options.onOpen();
        }
      };

      this.ws.onmessage = (event) => {
        try {
          const message: WSMessage = JSON.parse(event.data);
          this.handleMessage(message);
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

  private handleMessage(message: WSMessage): void {
    switch (message.type) {
      case 'sync':
        this.handleSync(message as SyncMessage);
        break;

      case 'operation':
        this.handleOperation(message as OperationMessage);
        break;

      case 'ack':
        this.handleAck(message as AckMessage);
        break;

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
          this.options.onNoteDeleted();
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

      case 'cursor_update':
        this.handleCursorUpdate(message as CursorUpdateMessage);
        break;

      case 'user_joined':
        this.handleUserJoined(message as UserJoinedMessage);
        break;

      case 'user_left':
        this.handleUserLeft(message as UserLeftMessage);
        break;

      default:
        console.warn('[WebSocket] Unknown message type:', message);
    }
  }

  private handleSync(message: SyncMessage): void {
    if (this.options.onSync) {
      this.options.onSync(message.content, message.version, message.operations);
    }
  }

  private handleOperation(message: OperationMessage): void {
    if (this.options.onOperation) {
      this.options.onOperation(message.operation);
    }
  }

  private handleAck(message: AckMessage): void {
    if (this.options.onAck) {
      this.options.onAck(message.version);
    }
  }

  private handleCursorUpdate(message: CursorUpdateMessage): void {
    if (this.options.onCursorUpdate) {
      this.options.onCursorUpdate(message.clientId, message.position);
    }
  }

  private handleUserJoined(message: UserJoinedMessage): void {
    if (this.options.onUserJoined) {
      this.options.onUserJoined(message.clientId, message.connectedUsers);
    }
  }

  private handleUserLeft(message: UserLeftMessage): void {
    if (this.options.onUserLeft) {
      this.options.onUserLeft(message.clientId, message.connectedUsers);
    }
  }

  sendOperation(operation: Operation, baseVersion: number): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      // Don't queue operations if not connected - they'll be stale
      console.warn('[WebSocket] Cannot send operation - not connected');
      return;
    }

    const message: OperationMessage = {
      type: 'operation',
      operation,
      baseVersion,
      clientId: operation.clientId,
      sessionId: this.options.sessionId,
    };

    this.ws.send(JSON.stringify(message));
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

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }
}
