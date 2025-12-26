/**
 * Real-time collaboration state management hook
 * Handles WebSocket connection, remote cursors, and connected users
 */

import type { WebSocketClient } from '../realtime/WebSocketClient';

export interface RemoteCursorData {
  position: number;
  color: string;
  label: string;
}

export function useCollaboration() {
  let wsClient = $state<WebSocketClient | null>(null);
  let isRealtimeEnabled = $state(false);
  let lastSentCursorPos = $state(0);
  let connectionStatus = $state<'connected' | 'disconnected' | 'connecting'>('disconnected');
  let clientId = $state('');
  let pendingLocalContent = $state<string | null>(null);
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

    get pendingLocalContent() { return pendingLocalContent; },
    set pendingLocalContent(value: string | null) { pendingLocalContent = value; },

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
