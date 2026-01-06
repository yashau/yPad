/**
 * @fileoverview Durable Object for real-time collaborative editing via WebSocket.
 *
 * Each note gets one NoteSessionDurableObject instance that coordinates all
 * connected clients. Uses Yjs CRDT for conflict-free collaborative editing:
 *
 * - yjsDoc: Y.Doc instance for the note content
 * - yjsText: Y.Text for the main text content
 * - globalSeqNum: Transient sequence for WebSocket message ordering
 *
 * Message flow:
 * 1. Client sends Yjs update → queued for sequential processing
 * 2. Server applies update to local Yjs doc
 * 3. Server broadcasts update to other clients with sequence number
 * 4. Server ACKs sender
 *
 * Message handlers are extracted to handlers/messageHandlers.ts for organization.
 */

import * as Y from 'yjs';
import { RATE_LIMITS } from '../../config/constants';
import type {
  WSMessage,
  ClientSession,
  YjsUpdateMessage,
  YjsSyncMessage,
  AwarenessUpdateMessage,
  SyntaxChangeMessage,
  YjsStateRequestMessage,
  RequestEditMessage,
} from '../types/messages';
import {
  handleYjsUpdate as handleYjsUpdateImpl,
  handleAwarenessUpdate as handleAwarenessUpdateImpl,
  handleYjsStateRequest as handleYjsStateRequestImpl,
  handleSyntaxChange as handleSyntaxChangeImpl,
  handleRequestEdit as handleRequestEditImpl,
  broadcastEncryptionChange as broadcastEncryptionChangeImpl,
  broadcastVersionUpdate as broadcastVersionUpdateImpl,
  broadcastUserJoined as broadcastUserJoinedImpl,
  broadcastUserLeft as broadcastUserLeftImpl,
  broadcastNoteStatus as broadcastNoteStatusImpl,
} from './handlers';
import type { NoteSessionContext } from './handlers';

/** Queued WebSocket message for sequential processing. */
interface QueuedMessage {
  ws: WebSocket;
  message: WSMessage;
}

/** Database row structure for note queries. */
interface NoteRecord {
  content: string;
  yjs_state: ArrayBuffer | null;
  version: number;
  is_encrypted: number;
  syntax_highlight: string;
}

/**
 * Encode Uint8Array to base64 string
 */
function encodeBase64(data: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < data.length; i++) {
    binary += String.fromCharCode(data[i]);
  }
  return btoa(binary);
}

export class NoteSessionDurableObject implements DurableObject {
  private env: Env;
  private sessions: Map<WebSocket, ClientSession>;
  private noteId: string;

  // Yjs document state
  private yjsDoc: Y.Doc;
  private yjsText: Y.Text;

  private persistenceTimer: number | null;
  private updatesSincePersist: number;
  private isInitialized: boolean;
  private lastEditSessionId: string | null = null;
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

  // Test-only: artificial latency for E2E testing
  private testLatencyMs: number = 0;

  constructor(_state: DurableObjectState, env: Env) {
    this.env = env;
    this.sessions = new Map();
    this.noteId = '';

    // Initialize Yjs document
    this.yjsDoc = new Y.Doc();
    this.yjsText = this.yjsDoc.getText('content');

    this.persistenceTimer = null;
    this.updatesSincePersist = 0;
    this.isInitialized = false;
    this.lastEditSessionId = null;
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

    // Handle test latency setting (for E2E testing only)
    if (request.method === 'POST' && url.pathname === '/test-latency') {
      try {
        const body = await request.json() as { latencyMs: number };
        this.testLatencyMs = body.latencyMs || 0;
        return new Response(JSON.stringify({ latencyMs: this.testLatencyMs }), { status: 200 });
      } catch {
        return new Response('Invalid request', { status: 400 });
      }
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
          this.yjsDoc.transact(() => {
            if (this.yjsText.length > 0) {
              this.yjsText.delete(0, this.yjsText.length);
            }
            this.yjsText.insert(0, body.content!);
          });
        }
        if (body.syntax_highlight !== undefined) {
          this.currentSyntax = body.syntax_highlight;
        }

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
          content: this.yjsText.toString(),
          version: 1, // Version not used with Yjs
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
      isAuthenticated,
      ws,
      rateLimit: {
        tokens: RATE_LIMITS.WEBSOCKET.BURST_ALLOWANCE,
        lastRefill: Date.now(),
        violations: 0,
      },
      lastEditAt: null, // Starts as viewer until first edit
    };

    // Send initial sync message with full Yjs state
    const yjsState = Y.encodeStateAsUpdate(this.yjsDoc);
    const syncMessage: YjsSyncMessage = {
      type: 'yjs_sync',
      state: encodeBase64(yjsState),
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

        // Apply test latency if configured (for E2E testing)
        if (this.testLatencyMs > 0) {
          await new Promise(resolve => setTimeout(resolve, this.testLatencyMs));
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

    const ctx = this.getContext();

    if (message.type === 'yjs_update') {
      await handleYjsUpdateImpl(ctx, ws, message as YjsUpdateMessage);
    } else if (message.type === 'awareness_update') {
      await handleAwarenessUpdateImpl(ctx, ws, message as AwarenessUpdateMessage);
    } else if (message.type === 'yjs_state_request') {
      await handleYjsStateRequestImpl(ctx, ws, message as YjsStateRequestMessage);
    } else if (message.type === 'syntax_change') {
      await handleSyntaxChangeImpl(ctx, ws, message as SyntaxChangeMessage);
    } else if (message.type === 'request_edit') {
      await handleRequestEditImpl(ctx, ws, message as RequestEditMessage);
    }

    // Sync state changes from handler back to the DO
    this.syncFromContext(ctx);
  }

  /**
   * Create a context object for message handlers.
   * This provides handlers access to the DO's mutable state and helper methods.
   */
  private getContext(): NoteSessionContext {
    return {
      noteId: this.noteId,
      currentContent: this.yjsText.toString(),
      yjsState: Y.encodeStateAsUpdate(this.yjsDoc),
      updatesSincePersist: this.updatesSincePersist,
      lastEditSessionId: this.lastEditSessionId,
      isEncrypted: this.isEncrypted,
      currentSyntax: this.currentSyntax,
      globalSeqNum: this.globalSeqNum,
      sessions: this.sessions,
      sendError: this.sendError.bind(this),
      schedulePersistence: this.schedulePersistence.bind(this),
      persistSyntaxToDB: this.persistSyntaxToDB.bind(this),
      applyYjsUpdate: this.applyYjsUpdate.bind(this),
      getYjsState: () => Y.encodeStateAsUpdate(this.yjsDoc),
      getContent: () => this.yjsText.toString(),
    };
  }

  /**
   * Apply a Yjs update to the document
   */
  private applyYjsUpdate(update: Uint8Array): void {
    Y.applyUpdate(this.yjsDoc, update);
  }

  /**
   * Sync state changes from handler context back to the DO.
   * Call this after handler execution to persist mutable state changes.
   */
  private syncFromContext(ctx: NoteSessionContext): void {
    this.updatesSincePersist = ctx.updatesSincePersist;
    this.lastEditSessionId = ctx.lastEditSessionId;
    this.isEncrypted = ctx.isEncrypted;
    this.currentSyntax = ctx.currentSyntax;
    this.globalSeqNum = ctx.globalSeqNum;
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

  schedulePersistence(immediate: boolean): void {
    const shouldPersist =
      immediate ||
      this.updatesSincePersist >= 100 || // Batch up to 100 updates
      (this.persistenceTimer === null && this.updatesSincePersist > 0);

    if (!shouldPersist) {
      return;
    }

    // Clear existing timer
    if (this.persistenceTimer !== null) {
      clearTimeout(this.persistenceTimer);
    }

    // immediate=true when last client disconnects (ensures data is saved when user leaves)
    // Otherwise, debounce for 2 seconds to batch rapid updates
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
        'SELECT content, yjs_state, version, is_encrypted, syntax_highlight FROM notes WHERE id = ?'
      ).bind(this.noteId).first<NoteRecord>();

      if (note) {
        // Create fresh Yjs doc
        this.yjsDoc = new Y.Doc();
        this.yjsText = this.yjsDoc.getText('content');

        if (note.yjs_state) {
          // Restore from Yjs state if available
          const yjsState = new Uint8Array(note.yjs_state);
          Y.applyUpdate(this.yjsDoc, yjsState);
        } else if (note.content) {
          // Migrate from plain content (legacy notes without Yjs state)
          this.yjsText.insert(0, note.content);
        }

        this.isEncrypted = !!note.is_encrypted;
        this.currentSyntax = note.syntax_highlight || 'plaintext';
      } else {
        // New note - start with empty Yjs doc
        this.yjsDoc = new Y.Doc();
        this.yjsText = this.yjsDoc.getText('content');
        this.isEncrypted = false;
        this.currentSyntax = 'plaintext';
      }

      this.isInitialized = true;
    } catch (error) {
      console.error(`[DO ${this.noteId}] Failed to initialize from database:`, error);
      // Start with empty content if database fails
      this.yjsDoc = new Y.Doc();
      this.yjsText = this.yjsDoc.getText('content');
      this.isInitialized = true;
    }
  }

  async persistToDB(): Promise<void> {
    if (this.updatesSincePersist === 0) {
      return;
    }

    // Capture current state for persistence
    const contentToSave = this.yjsText.toString();
    const yjsStateToSave = Y.encodeStateAsUpdate(this.yjsDoc);
    const sessionIdToSave = this.lastEditSessionId;
    const countToSave = this.updatesSincePersist;

    // Reset counter immediately - we're committing to persist this state
    this.updatesSincePersist = 0;
    this.persistenceTimer = null;

    // Persist asynchronously without blocking
    // Fire and forget - DO memory is source of truth for real-time collaboration
    this.env.DB.prepare(
      `UPDATE notes
       SET content = ?, yjs_state = ?, updated_at = ?, last_session_id = ?
       WHERE id = ?`
    ).bind(
      contentToSave,
      yjsStateToSave,
      Date.now(),
      sessionIdToSave,
      this.noteId
    ).run().catch((error: unknown) => {
      console.error(`[DO ${this.noteId}] persistToDB ERROR:`, error);
      // On error, increment counter to retry on next persistence
      this.updatesSincePersist += countToSave;
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

  private broadcastEncryptionChange(is_encrypted: boolean, excludeSessionId?: string): void {
    const ctx = this.getContext();
    broadcastEncryptionChangeImpl(ctx, is_encrypted, excludeSessionId);
    this.syncFromContext(ctx);
  }

  private broadcastVersionUpdate(version: number, excludeSessionId?: string): void {
    const ctx = this.getContext();
    broadcastVersionUpdateImpl(ctx, version, excludeSessionId);
    this.syncFromContext(ctx);
  }

  private broadcastUserJoined(joinedClientId: string): void {
    const ctx = this.getContext();
    broadcastUserJoinedImpl(ctx, joinedClientId);
    this.syncFromContext(ctx);
  }

  private broadcastUserLeft(leftClientId: string): void {
    const ctx = this.getContext();
    broadcastUserLeftImpl(ctx, leftClientId);
    this.syncFromContext(ctx);
  }

  resetState(deletedBySessionId?: string): void {
    // Close all WebSocket connections
    for (const [ws] of this.sessions) {
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
    this.yjsDoc = new Y.Doc();
    this.yjsText = this.yjsDoc.getText('content');
    this.updatesSincePersist = 0;
    this.isInitialized = false;
    this.lastEditSessionId = null;

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

      const ctx = this.getContext();
      broadcastNoteStatusImpl(
        ctx,
        Number(note.view_count) || 0,
        note.max_views !== null ? Number(note.max_views) : null,
        note.expires_at !== null ? Number(note.expires_at) : null
      );
      this.syncFromContext(ctx);
    } catch (error) {
      console.error(`[DO ${this.noteId}] Error fetching note status:`, error);
    }
  }
}
