/**
 * Durable Object for coordinating real-time WebSocket connections per note
 *
 * ARCHITECTURE OVERVIEW:
 * This server implements a dual-tracking system for collaborative editing:
 *
 * 1. OPERATION VERSION TRACKING (Operational Transform - OT):
 *    - Stored as `operationVersion` in Durable Object state and database
 *    - Incremented with each operation, persisted to database
 *    - Used for OT conflict resolution and ensuring correct transform order
 *    - Required for ALL notes (encrypted and unencrypted)
 *    - Enables conflict detection when users save without real-time connection
 *
 * 2. GLOBAL SEQUENCE NUMBER TRACKING (WebSocket Message Ordering):
 *    - Stored as `globalSeqNum` in Durable Object (NOT persisted to database)
 *    - Incremented for each broadcast (operations, cursor updates, presence events)
 *    - Ensures clients receive ALL messages in exact broadcast order
 *    - Only relevant during active WebSocket sessions
 *    - Resets when Durable Object hibernates/restarts (clients resync on reconnect)
 *
 * WHY BOTH EXIST:
 * - operationVersion: Persistent state for OT transforms and conflict detection
 * - globalSeqNum: Transient session state for real-time message ordering
 * - E2E encrypted notes use version-only (WebSocket disabled to preserve encryption)
 * - Unencrypted notes use both (version for DB, sequence for WebSocket ordering)
 *
 * MESSAGE FLOW:
 * 1. Client sends operation → enqueued for sequential processing
 * 2. Server transforms operation against history using operationVersion
 * 3. Server broadcasts to other clients with next globalSeqNum
 * 4. Server sends ACK to sender with the globalSeqNum used
 * 5. Sender updates their sequence counter to stay in sync
 */

import { transform } from '../ot/transform';
import { applyOperation } from '../ot/apply';
import { simpleChecksum } from '../ot/checksum';
import { RATE_LIMITS } from '../../config/constants';
import type {
  Operation,
  WSMessage,
  ClientSession,
  OperationMessage,
  SyncMessage,
  AckMessage,
  CursorUpdateMessage,
  CursorAckMessage,
  UserJoinedMessage,
  UserLeftMessage,
  SyntaxChangeMessage,
  SyntaxAckMessage,
  NoteStatusMessage,
} from '../ot/types';

// Message queue item for sequential processing
interface QueuedMessage {
  ws: WebSocket;
  message: WSMessage;
}

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
  private isEncrypted: boolean = false;
  private currentSyntax: string = 'plaintext';

  // Message queue for sequential processing
  private messageQueue: QueuedMessage[] = [];
  private isProcessingQueue: boolean = false;

  // Global sequence number for ensuring client-side ordering of ALL events
  private globalSeqNum: number = 0;

  // Status broadcast timer (for view count and expiration updates)
  private statusBroadcastTimer: number | null = null;
  private readonly STATUS_BROADCAST_INTERVAL = 10000; // 10 seconds

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
      try {
        const body = await request.json().catch(() => ({})) as { session_id?: string };
        this.resetState(body.session_id);
      } catch {
        this.resetState();
      }
      return new Response('State reset', { status: 200 });
    }

    // Handle force refresh request (for testing/debugging)
    if (request.method === 'POST' && url.pathname === '/refresh') {
      this.isInitialized = false;
      await this.initializeFromDatabase();
      return new Response('Refreshed from database', { status: 200 });
    }

    // Handle encryption change notification
    if (request.method === 'POST' && url.pathname === '/notify-encryption-change') {
      try {
        const body = await request.json() as { is_encrypted: boolean; exclude_session_id?: string };

        // Force re-initialization from database to get updated content
        // This is critical when encryption is removed - the DO has encrypted content in memory
        // but the database now has plain text
        this.isInitialized = false;
        await this.initializeFromDatabase();

        this.broadcastEncryptionChange(body.is_encrypted, body.exclude_session_id);
        return new Response('OK', { status: 200 });
      } catch (error) {
        console.error('Error handling encryption change notification:', error);
        return new Response('Error', { status: 500 });
      }
    }

    // Handle version update notification (for encrypted notes)
    if (request.method === 'POST' && url.pathname === '/notify-version-update') {
      try {
        const body = await request.json() as { version: number; content?: string; syntax_highlight?: string; exclude_session_id?: string };

        // Update cached content if provided (for encrypted notes updated via HTTP PUT)
        if (body.content !== undefined) {
          this.currentContent = body.content;
        }
        if (body.syntax_highlight !== undefined) {
          this.currentSyntax = body.syntax_highlight;
        }
        this.operationVersion = body.version;

        this.broadcastVersionUpdate(body.version, body.exclude_session_id);
        return new Response('OK', { status: 200 });
      } catch (error) {
        console.error('Error handling version update notification:', error);
        return new Response('Error', { status: 500 });
      }
    }

    // Handle GET /fetch request - return cached note data
    if (request.method === 'GET' && url.pathname === '/fetch') {
      try {
        // Get note ID from query parameter
        const noteIdParam = url.searchParams.get('noteId');
        if (!noteIdParam) {
          return new Response('Note ID required', { status: 400 });
        }

        // Set note ID if not already set
        if (!this.noteId) {
          this.noteId = noteIdParam;
        }

        // Initialize from database if not already loaded
        if (!this.isInitialized) {
          await this.initializeFromDatabase();
        }

        // Return cached note data
        return Response.json({
          content: this.currentContent,
          version: this.operationVersion,
          syntax_highlight: this.currentSyntax,
          is_encrypted: this.isEncrypted,
        });
      } catch (error) {
        console.error('Error fetching note from DO cache:', error);
        return new Response('Error fetching note', { status: 500 });
      }
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

    // Create client session with rate limiting state
    const session: ClientSession = {
      clientId,
      sessionId,
      lastAckOperation: this.operationVersion,
      isAuthenticated,
      ws,
      rateLimit: {
        tokens: RATE_LIMITS.WEBSOCKET.BURST_ALLOWANCE,
        lastRefill: Date.now(),
        violations: 0,
      },
    };

    // Send initial sync message BEFORE adding to sessions
    // This ensures the new client gets sync first, with the current globalSeqNum
    const syncMessage: SyncMessage = {
      type: 'sync',
      content: this.currentContent,
      version: this.operationVersion,
      operations: this.operationHistory.slice(-50), // Last 50 operations
      clientId, // Send the server-assigned clientId to the client
      seqNum: this.globalSeqNum, // Current global sequence before any broadcasts
      syntax: this.currentSyntax, // Current syntax highlighting mode
    };

    ws.send(JSON.stringify(syncMessage));

    // NOW add the session to the map
    this.sessions.set(ws, session);

    // Start status broadcast timer when first client connects
    if (this.sessions.size === 1) {
      this.startStatusBroadcast();
    }

    // Broadcast user joined to all clients (this increments globalSeqNum to seqNum + 1)
    // The new client will receive this as their first sequenced message (seqNum + 1)
    this.broadcastUserJoined(clientId);

    // Set up message handler - enqueue messages for sequential processing
    ws.addEventListener('message', async (event) => {
      try {
        const message: WSMessage = JSON.parse(event.data as string);
        this.enqueueMessage(ws, message);
      } catch (error) {
        console.error(`[DO ${this.noteId}] Error parsing message:`, error);
        this.sendError(ws, 'Invalid message format');
      }
    });

    // Set up close handler
    ws.addEventListener('close', () => {
      const closingClientId = session.clientId;
      this.sessions.delete(ws);

      // Broadcast user left to remaining clients
      this.broadcastUserLeft(closingClientId);

      // Schedule hibernation if no clients connected
      if (this.sessions.size === 0) {
        this.schedulePersistence(true);
        this.stopStatusBroadcast();
      }
    });

    // Set up error handler
    ws.addEventListener('error', () => {
      this.sessions.delete(ws);
    });
  }

  /**
   * Enqueue a message for sequential processing
   */
  enqueueMessage(ws: WebSocket, message: WSMessage): void {
    // Check message size
    const messageStr = JSON.stringify(message);
    if (messageStr.length > RATE_LIMITS.WEBSOCKET.MAX_MESSAGE_SIZE) {
      this.sendError(ws, 'Message too large');
      return;
    }

    this.messageQueue.push({
      ws,
      message,
    });

    // Start processing if not already processing
    if (!this.isProcessingQueue) {
      this.processQueue();
    }
  }

  /**
   * Check rate limit for a client session using token bucket algorithm
   * Returns true if request is allowed, false if rate limited
   */
  private checkRateLimit(session: ClientSession): boolean {
    const now = Date.now();
    const config = RATE_LIMITS.WEBSOCKET;

    // Refill tokens based on time elapsed
    const elapsed = now - session.rateLimit.lastRefill;
    const tokensToAdd = (elapsed / 1000) * config.OPS_PER_SECOND;

    session.rateLimit.tokens = Math.min(
      config.BURST_ALLOWANCE,
      session.rateLimit.tokens + tokensToAdd
    );
    session.rateLimit.lastRefill = now;

    // Check if we have tokens
    if (session.rateLimit.tokens < 1) {
      session.rateLimit.violations++;
      return false; // Rate limited
    }

    // Consume a token
    session.rateLimit.tokens--;
    return true;
  }

  /**
   * Process queued messages sequentially
   */
  async processQueue(): Promise<void> {
    // Prevent concurrent processing
    if (this.isProcessingQueue) {
      return;
    }

    this.isProcessingQueue = true;

    try {
      while (this.messageQueue.length > 0) {
        const queuedMessage = this.messageQueue.shift();

        if (!queuedMessage) {
          console.error(`[DO ${this.noteId}] Queue empty when message was expected`);
          break;
        }

        try {
          await this.handleMessage(queuedMessage.ws, queuedMessage.message);
        } catch (error) {
          console.error(`[DO ${this.noteId}] Error processing queued message:`, error);
          // Continue processing other messages even if one fails
        }
      }
    } finally {
      this.isProcessingQueue = false;
    }
  }

  async handleMessage(ws: WebSocket, message: WSMessage): Promise<void> {
    const session = this.sessions.get(ws);
    if (!session) {
      return;
    }

    if (message.type === 'operation') {
      await this.handleOperation(ws, message as OperationMessage);
    } else if (message.type === 'cursor_update') {
      await this.handleCursorUpdate(ws, message as CursorUpdateMessage);
    } else if (message.type === 'syntax_change') {
      await this.handleSyntaxChange(ws, message as SyntaxChangeMessage);
    }
  }

  async handleOperation(ws: WebSocket, message: OperationMessage): Promise<void> {
    const session = this.sessions.get(ws);
    if (!session || !session.isAuthenticated) {
      this.sendError(ws, 'Unauthorized');
      return;
    }

    // Check rate limit
    if (!this.checkRateLimit(session)) {
      if (session.rateLimit.violations >= RATE_LIMITS.PENALTY.DISCONNECT_THRESHOLD) {
        ws.close(1008, 'Rate limit exceeded');
        this.sessions.delete(ws);
        return;
      }
      this.sendError(ws, RATE_LIMITS.PENALTY.WARNING_MESSAGE);
      return;
    }

    let operation = message.operation;
    const baseVersion = message.baseVersion;

    // Transform operation against operations from OTHER clients since baseVersion
    // CRITICAL: Do NOT transform against the same client's own operations!
    // When a client types fast, their operations arrive with stale baseVersions
    // but they are already sequential from the client's perspective.
    // We only need to transform against concurrent operations from other clients.
    const operationsToTransform = this.operationHistory.filter(
      (op) => op.version > baseVersion && op.clientId !== operation.clientId
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

    // Calculate checksum of server content after applying operation
    const contentChecksum = simpleChecksum(this.currentContent);

    // Broadcast to all other clients and get the sequence number
    const broadcastSeqNum = this.broadcastOperation(operation, session.clientId, contentChecksum);

    // Send acknowledgment to sender with the sequence number of the broadcast
    // This allows the sender to stay in sync with the global sequence
    const ackMessage: AckMessage = {
      type: 'ack',
      version: this.operationVersion,
      seqNum: broadcastSeqNum,
      contentChecksum, // Include checksum so client can verify state
    };
    ws.send(JSON.stringify(ackMessage));

    // Schedule persistence (debounced)
    this.schedulePersistence(false);
  }

  async handleCursorUpdate(ws: WebSocket, message: CursorUpdateMessage): Promise<void> {
    const session = this.sessions.get(ws);
    if (!session || !session.isAuthenticated) {
      return;
    }

    // Broadcast cursor position to all other clients and get the sequence number
    const broadcastSeqNum = this.broadcastCursorUpdate(session.clientId, message.position);

    // Send acknowledgment to sender with the sequence number of the broadcast
    // This allows the sender to stay in sync with the global sequence
    const ackMessage: CursorAckMessage = {
      type: 'cursor_ack',
      seqNum: broadcastSeqNum,
    };
    ws.send(JSON.stringify(ackMessage));
  }

  async handleSyntaxChange(ws: WebSocket, message: SyntaxChangeMessage): Promise<void> {
    const session = this.sessions.get(ws);
    if (!session || !session.isAuthenticated) {
      return;
    }

    // Update the current syntax in memory
    this.currentSyntax = message.syntax;

    // Broadcast syntax change to all other clients and get the sequence number
    const broadcastSeqNum = this.broadcastSyntaxChange(session.clientId, message.syntax);

    // Send acknowledgment to sender with the sequence number of the broadcast
    const ackMessage: SyntaxAckMessage = {
      type: 'syntax_ack',
      seqNum: broadcastSeqNum,
    };
    ws.send(JSON.stringify(ackMessage));

    // Persist syntax change to database
    this.persistSyntaxToDB(message.syntax);
  }

  /**
   * Get the next global sequence number for a broadcast message.
   * All sequenced broadcasts (operations, cursors, presence) must use this
   * to ensure proper ordering across all clients.
   */
  private getNextSeqNum(): number {
    return ++this.globalSeqNum;
  }

  broadcastCursorUpdate(clientId: string, position: number): number {
    const seqNum = this.getNextSeqNum();

    const message: CursorUpdateMessage = {
      type: 'cursor_update',
      clientId,
      position,
      seqNum,
    };

    const messageStr = JSON.stringify(message);

    for (const [ws, session] of this.sessions) {
      // Don't send back to sender
      if (session.clientId !== clientId) {
        try {
          ws.send(messageStr);
        } catch (error) {
          console.error(`[DO ${this.noteId}] Error broadcasting cursor update to client ${session.clientId}:`, error);
        }
      }
    }

    // Return the sequence number so the sender can stay in sync
    return seqNum;
  }

  broadcastSyntaxChange(clientId: string, syntax: string): number {
    const seqNum = this.getNextSeqNum();

    const message: SyntaxChangeMessage = {
      type: 'syntax_change',
      clientId,
      syntax,
      seqNum,
    };

    const messageStr = JSON.stringify(message);

    for (const [ws, session] of this.sessions) {
      // Don't send back to sender
      if (session.clientId !== clientId) {
        try {
          ws.send(messageStr);
        } catch (error) {
          console.error(`[DO ${this.noteId}] Error broadcasting syntax change to client ${session.clientId}:`, error);
        }
      }
    }

    // Return the sequence number so the sender can stay in sync
    return seqNum;
  }

  async persistSyntaxToDB(syntax: string): Promise<void> {
    try {
      await this.env.DB.prepare(
        `UPDATE notes SET syntax_highlight = ?, updated_at = ? WHERE id = ?`
      ).bind(syntax, Date.now(), this.noteId).run();
    } catch (error) {
      console.error(`[DO ${this.noteId}] Error persisting syntax to database:`, error);
    }
  }

  broadcastOperation(operation: Operation, senderClientId: string, contentChecksum: number): number {
    const seqNum = this.getNextSeqNum();

    const message: OperationMessage = {
      type: 'operation',
      operation,
      baseVersion: operation.version - 1,
      clientId: operation.clientId,
      sessionId: '', // Not needed for broadcast
      seqNum, // Global sequence number for ordering all events
      contentChecksum, // Server content checksum for client verification
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

    // Return the sequence number so the sender can stay in sync
    return seqNum;
  }

  schedulePersistence(immediate: boolean): void {
    const shouldPersist =
      immediate ||
      this.operationsSincePersist >= 100 || // Batch up to 100 operations
      (this.persistenceTimer === null && this.operationsSincePersist > 0);

    if (!shouldPersist) {
      return;
    }

    // Clear existing timer
    if (this.persistenceTimer !== null) {
      clearTimeout(this.persistenceTimer);
    }

    // immediate=true when last client disconnects (ensures data is saved when user leaves)
    // Otherwise, debounce for 2 seconds to batch rapid operations
    const delay = immediate ? 0 : 2000;

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
        'SELECT content, version, is_encrypted, syntax_highlight FROM notes WHERE id = ?'
      ).bind(this.noteId).first();

      if (note) {
        this.currentContent = note.content || '';
        this.operationVersion = note.version || 1;
        this.isEncrypted = !!note.is_encrypted;
        this.currentSyntax = note.syntax_highlight || 'plaintext';
      } else {
        this.currentContent = '';
        this.operationVersion = 1;
        this.isEncrypted = false;
        this.currentSyntax = 'plaintext';
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

    // Capture current state for persistence
    const contentToSave = this.currentContent;
    const versionToSave = this.operationVersion;
    const sessionIdToSave = this.lastOperationSessionId;
    const countToSave = this.operationsSincePersist;

    // Reset counter immediately - we're committing to persist this state
    this.operationsSincePersist = 0;
    this.persistenceTimer = null;

    // Persist asynchronously without blocking
    // Fire and forget - DO memory is source of truth for real-time collaboration
    this.env.DB.prepare(
      `UPDATE notes
       SET content = ?, version = ?, updated_at = ?, last_session_id = ?
       WHERE id = ?`
    ).bind(
      contentToSave,
      versionToSave,
      Date.now(),
      sessionIdToSave,
      this.noteId
    ).run().catch((error: any) => {
      console.error(`[DO ${this.noteId}] persistToDB ERROR:`, error);
      // On error, increment counter to retry on next persistence
      this.operationsSincePersist += countToSave;
    });
  }

  sendError(ws: WebSocket, message: string): void {
    ws.send(
      JSON.stringify({
        type: 'error',
        message,
      })
    );
  }

  broadcastEncryptionChange(is_encrypted: boolean, excludeSessionId?: string): void {
    // Update internal encryption state
    this.isEncrypted = is_encrypted;

    const message = {
      type: 'encryption_changed' as const,
      is_encrypted,
    };

    // Broadcast to all clients except the one who made the change
    for (const [ws, session] of this.sessions) {
      if (excludeSessionId && session.sessionId === excludeSessionId) {
        continue;
      }

      try {
        ws.send(JSON.stringify(message));
      } catch (error) {
        console.error(`[DO ${this.noteId}] Error broadcasting encryption change to session ${session.sessionId}:`, error);
      }
    }
  }

  broadcastVersionUpdate(version: number, excludeSessionId?: string): void {
    const message = {
      type: 'version_update' as const,
      version,
      message: 'Note was updated by another user'
    };

    // Broadcast to all clients except the one who made the change
    for (const [ws, session] of this.sessions) {
      if (excludeSessionId && session.sessionId === excludeSessionId) {
        continue;
      }

      try {
        ws.send(JSON.stringify(message));
      } catch (error) {
        console.error(`[DO ${this.noteId}] Error broadcasting version update to session ${session.sessionId}:`, error);
      }
    }
  }

  broadcastUserJoined(joinedClientId: string): void {
    const seqNum = this.getNextSeqNum();
    const connectedUsers = Array.from(this.sessions.values()).map(s => s.clientId);

    const message: UserJoinedMessage = {
      type: 'user_joined',
      clientId: joinedClientId,
      connectedUsers,
      seqNum,
    };

    const messageStr = JSON.stringify(message);

    // Broadcast to all clients (including the one who just joined)
    for (const [ws] of this.sessions) {
      try {
        ws.send(messageStr);
      } catch (error) {
        console.error(`[DO ${this.noteId}] Error broadcasting user joined:`, error);
      }
    }
  }

  broadcastUserLeft(leftClientId: string): void {
    const seqNum = this.getNextSeqNum();
    const connectedUsers = Array.from(this.sessions.values()).map(s => s.clientId);

    const message: UserLeftMessage = {
      type: 'user_left',
      clientId: leftClientId,
      connectedUsers,
      seqNum,
    };

    const messageStr = JSON.stringify(message);

    // Broadcast to remaining clients
    for (const [ws] of this.sessions) {
      try {
        ws.send(messageStr);
      } catch (error) {
        console.error(`[DO ${this.noteId}] Error broadcasting user left:`, error);
      }
    }
  }

  resetState(deletedBySessionId?: string): void {
    // Close all WebSocket connections
    for (const [ws, session] of this.sessions) {
      try {
        ws.send(JSON.stringify({
          type: 'note_deleted',
          sessionId: deletedBySessionId,
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

    // Clear status broadcast timer
    this.stopStatusBroadcast();
  }

  /**
   * Start periodic status broadcasts when clients are connected
   */
  private startStatusBroadcast(): void {
    if (this.statusBroadcastTimer !== null) {
      return; // Already running
    }

    this.statusBroadcastTimer = setInterval(() => {
      this.broadcastNoteStatus();
    }, this.STATUS_BROADCAST_INTERVAL) as unknown as number;
  }

  /**
   * Stop periodic status broadcasts
   */
  private stopStatusBroadcast(): void {
    if (this.statusBroadcastTimer !== null) {
      clearInterval(this.statusBroadcastTimer);
      this.statusBroadcastTimer = null;
    }
  }

  /**
   * Fetch current note status from database and broadcast to all clients
   */
  private async broadcastNoteStatus(): Promise<void> {
    if (this.sessions.size === 0) {
      this.stopStatusBroadcast();
      return;
    }

    try {
      const note = await this.env.DB.prepare(
        'SELECT view_count, max_views, expires_at FROM notes WHERE id = ?'
      ).bind(this.noteId).first();

      if (!note) {
        return;
      }

      const message: NoteStatusMessage = {
        type: 'note_status',
        view_count: Number(note.view_count) || 0,
        max_views: note.max_views !== null ? Number(note.max_views) : null,
        expires_at: note.expires_at !== null ? Number(note.expires_at) : null,
      };

      const messageStr = JSON.stringify(message);

      for (const [ws] of this.sessions) {
        try {
          ws.send(messageStr);
        } catch (error) {
          console.error(`[DO ${this.noteId}] Error broadcasting note status:`, error);
        }
      }
    } catch (error) {
      console.error(`[DO ${this.noteId}] Error fetching note status:`, error);
    }
  }
}
