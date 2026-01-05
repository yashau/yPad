/**
 * @fileoverview Real-time collaboration state management.
 *
 * Manages WebSocket connection state, remote cursor positions,
 * connected users, and pending operations for OT conflict resolution.
 */

import type { WebSocketClient } from '../realtime/WebSocketClient';
import type { Operation } from '../../../src/ot/types';

/** Remote user's cursor position and display info. */
export interface RemoteCursorData {
  position: number;
  color: string;
  label: string;
}

/** Unacknowledged operation awaiting server confirmation. */
export interface PendingOperation {
  operation: Operation;
  /** Server version when this operation was created */
  baseVersion: number;
}

/**
 * Groups related pending state for OT conflict resolution.
 * These fields track local changes that haven't been acknowledged by the server.
 */
export interface PendingState {
  /** Local content snapshot while operations are pending */
  content: string | null;
  /** Server version when pending operations started */
  baseVersion: number | null;
  /** Unacknowledged operations awaiting server confirmation */
  operations: PendingOperation[];
}

export function useCollaboration() {
  let wsClient = $state<WebSocketClient | null>(null);
  let isRealtimeEnabled = $state(false);
  let lastSentCursorPos = $state(0);
  let connectionStatus = $state<'connected' | 'disconnected' | 'connecting'>('disconnected');
  let clientId = $state('');
  let pending = $state<PendingState>({
    content: null,
    baseVersion: null,
    operations: [],
  });
  // Remote operations received between beforeinput and input events.
  // When user is typing and a remote op arrives, we apply it to editor.content but the DOM
  // hasn't been updated yet. New local operations need to be transformed against these.
  let recentRemoteOps = $state<Operation[]>([]);
  let isSyncing = $state(false);
  let remoteCursors = $state<Map<string, RemoteCursorData>>(new Map());
  let connectedUsers = $state<Set<string>>(new Set());

  const CURSOR_COLORS = ['blue', 'green', 'red', 'amber', 'purple', 'pink', 'orange', 'cyan'];
  const clientColorMap = new Map<string, string>();

  function getClientColor(clientId: string): string {
    if (!clientColorMap.has(clientId)) {
      const colorIndex = clientColorMap.size % CURSOR_COLORS.length;
      clientColorMap.set(clientId, CURSOR_COLORS[colorIndex]);
    }
    return clientColorMap.get(clientId)!;
  }

  function cleanupStaleCursors(connectedUserIds: string[]) {
    const updatedCursors = new Map(remoteCursors);
    let hasChanges = false;

    updatedCursors.forEach((_, cursorClientId) => {
      if (!connectedUserIds.includes(cursorClientId)) {
        updatedCursors.delete(cursorClientId);
        hasChanges = true;
      }
    });

    if (hasChanges) {
      remoteCursors = updatedCursors;
    }
  }

  return {
    get wsClient() { return wsClient; },
    set wsClient(value: WebSocketClient | null) { wsClient = value; },

    get isRealtimeEnabled() { return isRealtimeEnabled; },
    set isRealtimeEnabled(value: boolean) { isRealtimeEnabled = value; },

    get lastSentCursorPos() { return lastSentCursorPos; },
    set lastSentCursorPos(value: number) { lastSentCursorPos = value; },

    get connectionStatus() { return connectionStatus; },
    set connectionStatus(value: 'connected' | 'disconnected' | 'connecting') { connectionStatus = value; },

    get clientId() { return clientId; },
    set clientId(value: string) { clientId = value; },

    get pending() { return pending; },
    set pending(value: PendingState) { pending = value; },

    get recentRemoteOps() { return recentRemoteOps; },
    set recentRemoteOps(value: Operation[]) { recentRemoteOps = value; },

    get isSyncing() { return isSyncing; },
    set isSyncing(value: boolean) { isSyncing = value; },

    get remoteCursors() { return remoteCursors; },
    set remoteCursors(value: Map<string, RemoteCursorData>) { remoteCursors = value; },

    get connectedUsers() { return connectedUsers; },
    set connectedUsers(value: Set<string>) { connectedUsers = value; },

    getClientColor,
    cleanupStaleCursors
  };
}
