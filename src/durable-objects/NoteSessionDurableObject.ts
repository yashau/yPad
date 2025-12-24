// Durable Object for coordinating real-time WebSocket connections per note

import { transform } from '../ot/transform';
import { applyOperation } from '../ot/apply';
import type {
  Operation,
  WSMessage,
  ClientSession,
  OperationMessage,
  SyncMessage,
  AckMessage,
} from '../ot/types';

export class NoteSessionDurableObject implements DurableObject {
  private state: DurableObjectState;
  private env: any;
  private sessions: Map<WebSocket, ClientSession>;
  private noteId: string;
  private currentContent: string;
  private operationVersion: number;
  private operationHistory: Operation[];
  private persistenceTimer: number | null;
  private operationsSincePersist: number;
  private doSessionId: string;
  private isInitialized: boolean;
  private lastOperationSessionId: string | null = null;

  constructor(state: DurableObjectState, env: any) {
    this.state = state;
    this.env = env;
    this.sessions = new Map();
    this.noteId = '';
    this.currentContent = '';
    this.operationVersion = 0;
    this.operationHistory = [];
    this.persistenceTimer = null;
    this.operationsSincePersist = 0;
    this.doSessionId = crypto.randomUUID(); // Unique ID for this DO instance
    this.isInitialized = false;
    this.lastOperationSessionId = null;
  }

  async fetch(request: Request): Promise<Response> {
    // Extract note ID from the URL or Durable Object name
    const url = new URL(request.url);
    const pathSegments = url.pathname.split('/');

    // Handle reset request (when note is deleted)
    if (request.method === 'DELETE' && url.pathname === '/reset') {
      this.resetState();
      return new Response('State reset', { status: 200 });
    }

    this.noteId = pathSegments[pathSegments.length - 2]; // /api/notes/:id/ws

    // WebSocket upgrade
    if (request.headers.get('Upgrade') === 'websocket') {
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);

      // Accept the WebSocket connection
      await this.handleWebSocket(server, request);

      return new Response(null, {
        status: 101,
        webSocket: client,
      });
    }

    return new Response('Expected WebSocket', { status: 400 });
  }

  async handleWebSocket(ws: WebSocket, request: Request): Promise<void> {
    // Initialize content from database if needed
    if (!this.isInitialized) {
      await this.initializeFromDatabase();
    }

    // Extract client info from query params
    const url = new URL(request.url);
    const clientId = crypto.randomUUID();
    const sessionId = url.searchParams.get('session_id') || crypto.randomUUID();
    const isAuthenticated = true; // Password already validated by worker

    // Accept the WebSocket
    ws.accept();

    // Create client session
    const session: ClientSession = {
      clientId,
      sessionId,
      lastAckOperation: this.operationVersion,
      isAuthenticated,
      ws,
    };

    this.sessions.set(ws, session);

    // Send initial sync message
    const syncMessage: SyncMessage = {
      type: 'sync',
      content: this.currentContent,
      version: this.operationVersion,
      operations: this.operationHistory.slice(-50), // Last 50 operations
    };

    ws.send(JSON.stringify(syncMessage));

    // Set up message handler
    ws.addEventListener('message', async (event) => {
      try {
        const message: WSMessage = JSON.parse(event.data as string);
        await this.handleMessage(ws, message);
      } catch (error) {
        console.error(`[DO ${this.noteId}] Error handling message:`, error);
        this.sendError(ws, 'Invalid message format');
      }
    });

    // Set up close handler
    ws.addEventListener('close', () => {
      this.sessions.delete(ws);

      // Schedule hibernation if no clients connected
      if (this.sessions.size === 0) {
        this.schedulePersistence(true);
      }
    });

    // Set up error handler
    ws.addEventListener('error', (event) => {
      console.error(`[DO ${this.noteId}] WebSocket error:`, event);
      this.sessions.delete(ws);
    });
  }

  async handleMessage(ws: WebSocket, message: WSMessage): Promise<void> {
    const session = this.sessions.get(ws);
    if (!session) {
      return;
    }

    if (message.type === 'operation') {
      await this.handleOperation(ws, message as OperationMessage);
    }
    // Add more message type handlers as needed
  }

  async handleOperation(ws: WebSocket, message: OperationMessage): Promise<void> {
    const session = this.sessions.get(ws);
    if (!session || !session.isAuthenticated) {
      this.sendError(ws, 'Unauthorized');
      return;
    }

    let operation = message.operation;
    const baseVersion = message.baseVersion;

    // Transform operation against all operations since baseVersion
    const operationsToTransform = this.operationHistory.filter(
      (op) => op.version > baseVersion
    );

    for (const historicalOp of operationsToTransform) {
      [operation] = transform(operation, historicalOp);
    }

    // Increment version and update operation
    this.operationVersion++;
    operation.version = this.operationVersion;

    // Apply operation to current content
    this.currentContent = applyOperation(this.currentContent, operation);

    // Add to history
    this.operationHistory.push(operation);

    // Compact history if needed (keep last 100 operations)
    if (this.operationHistory.length > 100) {
      this.operationHistory = this.operationHistory.slice(-100);
    }

    // Track operations since last persist and session ID
    this.operationsSincePersist++;
    this.lastOperationSessionId = session.sessionId;

    // Broadcast to all other clients
    this.broadcastOperation(operation, session.clientId);

    // Send acknowledgment to sender
    const ackMessage: AckMessage = {
      type: 'ack',
      version: this.operationVersion,
    };
    ws.send(JSON.stringify(ackMessage));

    // Schedule persistence (debounced)
    this.schedulePersistence(false);
  }

  broadcastOperation(operation: Operation, senderClientId: string): void {
    const message: OperationMessage = {
      type: 'operation',
      operation,
      baseVersion: operation.version - 1,
      clientId: operation.clientId,
      sessionId: '', // Not needed for broadcast
    };

    const messageStr = JSON.stringify(message);

    for (const [ws, session] of this.sessions) {
      // Don't send back to sender
      if (session.clientId !== senderClientId) {
        try {
          ws.send(messageStr);
        } catch (error) {
          console.error(`[DO ${this.noteId}] Error broadcasting to client ${session.clientId}:`, error);
        }
      }
    }
  }

  schedulePersistence(immediate: boolean): void {
    const shouldPersist =
      immediate ||
      this.operationsSincePersist >= 50 ||
      (this.persistenceTimer === null && this.operationsSincePersist > 0);

    if (!shouldPersist) {
      return;
    }

    // Clear existing timer
    if (this.persistenceTimer !== null) {
      clearTimeout(this.persistenceTimer);
    }

    const delay = immediate ? 0 : 5000; // 5 seconds for normal debounce

    this.persistenceTimer = setTimeout(() => {
      this.persistToDB().catch((error) => {
        console.error(`[DO ${this.noteId}] Persistence error:`, error);
      });
    }, delay) as unknown as number;
  }

  async initializeFromDatabase(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    try {
      const note = await this.env.DB.prepare(
        'SELECT content, version FROM notes WHERE id = ?'
      ).bind(this.noteId).first();

      if (note) {
        this.currentContent = note.content || '';
        this.operationVersion = note.version || 1;
      } else {
        this.currentContent = '';
        this.operationVersion = 1;
      }

      this.isInitialized = true;
    } catch (error) {
      console.error(`[DO ${this.noteId}] Failed to initialize from database:`, error);
      // Start with empty content if database fails
      this.currentContent = '';
      this.operationVersion = 1;
      this.isInitialized = true;
    }
  }

  async persistToDB(): Promise<void> {
    if (this.operationsSincePersist === 0) {
      return;
    }

    try {
      // Update the note in the database with the current content and session ID
      await this.env.DB.prepare(
        `UPDATE notes
         SET content = ?, version = ?, updated_at = ?, last_session_id = ?
         WHERE id = ?`
      ).bind(
        this.currentContent,
        this.operationVersion,
        Date.now(),
        this.lastOperationSessionId,
        this.noteId
      ).run();

      this.operationsSincePersist = 0;
      this.persistenceTimer = null;
    } catch (error) {
      console.error(`[DO ${this.noteId}] Persistence error:`, error);
      // Retry on next scheduled persistence
    }
  }

  sendError(ws: WebSocket, message: string): void {
    ws.send(
      JSON.stringify({
        type: 'error',
        message,
      })
    );
  }

  broadcast(message: WSMessage, excludeClientId?: string): void {
    const messageStr = JSON.stringify(message);

    for (const [ws, session] of this.sessions) {
      if (excludeClientId && session.clientId === excludeClientId) {
        continue;
      }

      try {
        ws.send(messageStr);
      } catch (error) {
        console.error(`[DO ${this.noteId}] Error broadcasting to client ${session.clientId}:`, error);
      }
    }
  }

  resetState(): void {
    // Close all WebSocket connections
    for (const [ws] of this.sessions) {
      try {
        ws.send(JSON.stringify({
          type: 'note_deleted',
          message: 'Note has been deleted'
        }));
        ws.close(1000, 'Note deleted');
      } catch (error) {
        console.error(`[DO ${this.noteId}] Error closing WebSocket:`, error);
      }
    }

    // Clear all state
    this.sessions.clear();
    this.currentContent = '';
    this.operationVersion = 0;
    this.operationHistory = [];
    this.operationsSincePersist = 0;
    this.isInitialized = false;
    this.lastOperationSessionId = null;

    // Clear any pending persistence timer
    if (this.persistenceTimer !== null) {
      clearTimeout(this.persistenceTimer);
      this.persistenceTimer = null;
    }
  }
}
