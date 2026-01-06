/**
 * @fileoverview Real-time collaboration state management with Yjs CRDT.
 *
 * Manages WebSocket connection state, remote cursor positions via Yjs Awareness,
 * connected users, and Yjs document synchronization.
 */

import type { WebSocketClient } from '../realtime/WebSocketClient';
import type { YjsManager, RemoteCursorState } from '../yjs/YjsManager';

/** Remote user's cursor position and display info. */
export interface RemoteCursorData {
  position: number;
  selectionEnd?: number;
  color: string;
  label: string;
}

export function useCollaboration() {
  let wsClient = $state<WebSocketClient | null>(null);
  let yjsManager = $state<YjsManager | null>(null);
  let isRealtimeEnabled = $state(false);
  let connectionStatus = $state<'connected' | 'disconnected' | 'connecting'>('disconnected');
  let clientId = $state('');
  let isSyncing = $state(false);
  let remoteCursors = $state<Map<string, RemoteCursorData>>(new Map());
  let connectedUsers = $state<Set<string>>(new Set());

  // 10 pastel cursor colors - cycles through if more than 10 editors
  const CURSOR_COLORS = [
    'blue',
    'green',
    'rose',
    'amber',
    'purple',
    'pink',
    'orange',
    'cyan',
    'teal',
    'indigo'
  ];

  // Mapping from WebSocket client IDs to Yjs awareness client IDs
  // This is needed because user_joined/user_left use WebSocket IDs,
  // but remoteCursors uses Yjs awareness IDs
  const wsToAwarenessMap = new Map<string, number>();

  /**
   * Generate a deterministic color for a client based on their ID.
   * Uses a simple hash to ensure the same ID always gets the same color
   * across all clients.
   */
  function getClientColor(id: string): string {
    // Simple hash function to convert string to number
    let hash = 0;
    for (let i = 0; i < id.length; i++) {
      const char = id.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    // Use absolute value and modulo to get color index
    const colorIndex = Math.abs(hash) % CURSOR_COLORS.length;
    return CURSOR_COLORS[colorIndex];
  }

  /**
   * Register a mapping from WebSocket client ID to Yjs awareness client ID.
   * Called when we receive an awareness update from a client.
   */
  function registerAwarenessClientId(wsClientId: string, awarenessClientId: number) {
    wsToAwarenessMap.set(wsClientId, awarenessClientId);
  }

  /**
   * Clean up cursors for clients that have disconnected.
   * Uses the wsToAwarenessMap to translate WebSocket IDs to awareness IDs.
   */
  function cleanupStaleCursors(connectedWsClientIds: string[]) {
    // First, clean up the mapping for disconnected clients
    const disconnectedWsIds: string[] = [];
    wsToAwarenessMap.forEach((_awarenessId, wsId) => {
      if (!connectedWsClientIds.includes(wsId)) {
        disconnectedWsIds.push(wsId);
      }
    });

    // Get the awareness IDs that need to be removed
    const awarenessIdsToRemove: number[] = [];
    for (const wsId of disconnectedWsIds) {
      const awarenessId = wsToAwarenessMap.get(wsId);
      if (awarenessId !== undefined) {
        awarenessIdsToRemove.push(awarenessId);
        wsToAwarenessMap.delete(wsId);
      }
    }

    // Remove the cursors for disconnected awareness clients
    if (awarenessIdsToRemove.length > 0) {
      const updatedCursors = new Map(remoteCursors);
      let hasChanges = false;

      for (const awarenessId of awarenessIdsToRemove) {
        const awarenessIdStr = String(awarenessId);
        if (updatedCursors.has(awarenessIdStr)) {
          updatedCursors.delete(awarenessIdStr);
          hasChanges = true;
        }

        // Also remove from Yjs awareness if we have a manager
        if (yjsManager) {
          yjsManager.removeAwarenessClient(awarenessId);
        }
      }

      if (hasChanges) {
        remoteCursors = updatedCursors;
      }
    }
  }

  /**
   * Update remote cursors from Yjs Awareness state.
   */
  function updateRemoteCursorsFromAwareness(cursors: Map<number, RemoteCursorState>) {
    const updatedCursors = new Map<string, RemoteCursorData>();

    cursors.forEach((cursorState, awarenessClientId) => {
      const cursorData = {
        position: cursorState.position,
        selectionEnd: cursorState.selectionEnd,
        color: cursorState.color,
        label: cursorState.name
      };
      updatedCursors.set(String(awarenessClientId), cursorData);
    });

    remoteCursors = updatedCursors;
  }

  return {
    get wsClient() { return wsClient; },
    set wsClient(value: WebSocketClient | null) { wsClient = value; },

    get yjsManager() { return yjsManager; },
    set yjsManager(value: YjsManager | null) { yjsManager = value; },

    get isRealtimeEnabled() { return isRealtimeEnabled; },
    set isRealtimeEnabled(value: boolean) { isRealtimeEnabled = value; },

    get connectionStatus() { return connectionStatus; },
    set connectionStatus(value: 'connected' | 'disconnected' | 'connecting') { connectionStatus = value; },

    get clientId() { return clientId; },
    set clientId(value: string) { clientId = value; },

    get isSyncing() { return isSyncing; },
    set isSyncing(value: boolean) { isSyncing = value; },

    get remoteCursors() { return remoteCursors; },
    set remoteCursors(value: Map<string, RemoteCursorData>) { remoteCursors = value; },

    get connectedUsers() { return connectedUsers; },
    set connectedUsers(value: Set<string>) { connectedUsers = value; },

    getClientColor,
    cleanupStaleCursors,
    updateRemoteCursorsFromAwareness,
    registerAwarenessClientId
  };
}
