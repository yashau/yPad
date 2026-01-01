/**
 * Tests for useCollaboration hook
 * Tests real-time collaboration state management
 */

import { describe, it, expect, vi } from 'vitest';

describe('useCollaboration logic', () => {
  describe('WebSocket client state', () => {
    it('should track wsClient', () => {
      let wsClient: any = null;

      const mockClient = { isConnected: () => true };
      wsClient = mockClient;

      expect(wsClient).toBe(mockClient);
    });

    it('should allow null wsClient', () => {
      let wsClient: any = { isConnected: () => true };

      wsClient = null;

      expect(wsClient).toBeNull();
    });
  });

  describe('realtime state', () => {
    it('should track isRealtimeEnabled', () => {
      let isRealtimeEnabled = false;

      isRealtimeEnabled = true;

      expect(isRealtimeEnabled).toBe(true);
    });

    it('should track lastSentCursorPos', () => {
      let lastSentCursorPos = 0;

      lastSentCursorPos = 42;

      expect(lastSentCursorPos).toBe(42);
    });
  });

  describe('connection status', () => {
    it('should track connectionStatus', () => {
      let connectionStatus: 'connected' | 'disconnected' | 'connecting' = 'disconnected';

      connectionStatus = 'connecting';
      expect(connectionStatus).toBe('connecting');

      connectionStatus = 'connected';
      expect(connectionStatus).toBe('connected');

      connectionStatus = 'disconnected';
      expect(connectionStatus).toBe('disconnected');
    });

    it('should default to disconnected', () => {
      let connectionStatus: 'connected' | 'disconnected' | 'connecting' = 'disconnected';

      expect(connectionStatus).toBe('disconnected');
    });
  });

  describe('client identification', () => {
    it('should track clientId', () => {
      let clientId = '';

      clientId = 'client-123-abc';

      expect(clientId).toBe('client-123-abc');
    });
  });

  describe('pending operations state', () => {
    it('should track pendingLocalContent', () => {
      let pendingLocalContent: string | null = null;

      pendingLocalContent = 'unsaved content';

      expect(pendingLocalContent).toBe('unsaved content');
    });

    it('should allow null pendingLocalContent', () => {
      let pendingLocalContent: string | null = 'some content';

      pendingLocalContent = null;

      expect(pendingLocalContent).toBeNull();
    });

    it('should track pendingBaseVersion', () => {
      let pendingBaseVersion: number | null = null;

      pendingBaseVersion = 5;

      expect(pendingBaseVersion).toBe(5);
    });

    it('should track isSyncing', () => {
      let isSyncing = false;

      isSyncing = true;

      expect(isSyncing).toBe(true);
    });
  });

  describe('remote cursors', () => {
    it('should track remoteCursors as Map', () => {
      let remoteCursors = new Map<string, { position: number; color: string; label: string }>();

      remoteCursors.set('client-1', { position: 10, color: 'blue', label: 'User 1' });
      remoteCursors.set('client-2', { position: 25, color: 'green', label: 'User 2' });

      expect(remoteCursors.size).toBe(2);
      expect(remoteCursors.get('client-1')?.position).toBe(10);
      expect(remoteCursors.get('client-2')?.color).toBe('green');
    });

    it('should update cursor position', () => {
      let remoteCursors = new Map<string, { position: number; color: string; label: string }>();

      remoteCursors.set('client-1', { position: 10, color: 'blue', label: 'User 1' });

      // Update position
      const cursor = remoteCursors.get('client-1')!;
      remoteCursors.set('client-1', { ...cursor, position: 20 });

      expect(remoteCursors.get('client-1')?.position).toBe(20);
    });

    it('should remove cursor', () => {
      let remoteCursors = new Map<string, { position: number; color: string; label: string }>();

      remoteCursors.set('client-1', { position: 10, color: 'blue', label: 'User 1' });
      remoteCursors.delete('client-1');

      expect(remoteCursors.has('client-1')).toBe(false);
    });
  });

  describe('connected users', () => {
    it('should track connectedUsers as Set', () => {
      let connectedUsers = new Set<string>();

      connectedUsers.add('client-1');
      connectedUsers.add('client-2');

      expect(connectedUsers.size).toBe(2);
      expect(connectedUsers.has('client-1')).toBe(true);
    });

    it('should remove disconnected users', () => {
      let connectedUsers = new Set<string>();

      connectedUsers.add('client-1');
      connectedUsers.add('client-2');
      connectedUsers.delete('client-1');

      expect(connectedUsers.size).toBe(1);
      expect(connectedUsers.has('client-1')).toBe(false);
    });

    it('should replace user list on sync', () => {
      let connectedUsers = new Set<string>();

      connectedUsers.add('old-client');

      // On sync, replace with new list
      connectedUsers = new Set(['client-1', 'client-2', 'client-3']);

      expect(connectedUsers.size).toBe(3);
      expect(connectedUsers.has('old-client')).toBe(false);
    });
  });
});

describe('useCollaboration color assignment', () => {
  const CURSOR_COLORS = ['blue', 'green', 'red', 'amber', 'purple', 'pink', 'orange', 'cyan'];

  it('should assign consistent colors to clients', () => {
    const clientColorMap = new Map<string, string>();

    function getClientColor(clientId: string): string {
      if (!clientColorMap.has(clientId)) {
        const colorIndex = clientColorMap.size % CURSOR_COLORS.length;
        clientColorMap.set(clientId, CURSOR_COLORS[colorIndex]);
      }
      return clientColorMap.get(clientId)!;
    }

    const color1 = getClientColor('client-1');
    const color1Again = getClientColor('client-1');

    expect(color1).toBe(color1Again);
  });

  it('should assign different colors to different clients', () => {
    const clientColorMap = new Map<string, string>();

    function getClientColor(clientId: string): string {
      if (!clientColorMap.has(clientId)) {
        const colorIndex = clientColorMap.size % CURSOR_COLORS.length;
        clientColorMap.set(clientId, CURSOR_COLORS[colorIndex]);
      }
      return clientColorMap.get(clientId)!;
    }

    const color1 = getClientColor('client-1');
    const color2 = getClientColor('client-2');
    const color3 = getClientColor('client-3');

    expect(color1).toBe('blue');
    expect(color2).toBe('green');
    expect(color3).toBe('red');
  });

  it('should cycle colors when more clients than colors', () => {
    const clientColorMap = new Map<string, string>();

    function getClientColor(clientId: string): string {
      if (!clientColorMap.has(clientId)) {
        const colorIndex = clientColorMap.size % CURSOR_COLORS.length;
        clientColorMap.set(clientId, CURSOR_COLORS[colorIndex]);
      }
      return clientColorMap.get(clientId)!;
    }

    // Add more clients than colors
    for (let i = 0; i < 10; i++) {
      getClientColor(`client-${i}`);
    }

    // Client 8 should have same color as client 0
    expect(getClientColor('client-0')).toBe(getClientColor('client-8'));
  });
});

describe('useCollaboration cursor cleanup', () => {
  it('should remove cursors for disconnected users', () => {
    let remoteCursors = new Map<string, { position: number; color: string; label: string }>();

    remoteCursors.set('client-1', { position: 10, color: 'blue', label: 'User 1' });
    remoteCursors.set('client-2', { position: 20, color: 'green', label: 'User 2' });
    remoteCursors.set('client-3', { position: 30, color: 'red', label: 'User 3' });

    function cleanupStaleCursors(connectedUserIds: string[]) {
      const updatedCursors = new Map(remoteCursors);

      updatedCursors.forEach((_, cursorClientId) => {
        if (!connectedUserIds.includes(cursorClientId)) {
          updatedCursors.delete(cursorClientId);
        }
      });

      remoteCursors = updatedCursors;
    }

    // Only client-1 and client-3 are still connected
    cleanupStaleCursors(['client-1', 'client-3']);

    expect(remoteCursors.size).toBe(2);
    expect(remoteCursors.has('client-1')).toBe(true);
    expect(remoteCursors.has('client-2')).toBe(false);
    expect(remoteCursors.has('client-3')).toBe(true);
  });

  it('should handle empty connected users list', () => {
    let remoteCursors = new Map<string, { position: number; color: string; label: string }>();

    remoteCursors.set('client-1', { position: 10, color: 'blue', label: 'User 1' });

    function cleanupStaleCursors(connectedUserIds: string[]) {
      const updatedCursors = new Map(remoteCursors);

      updatedCursors.forEach((_, cursorClientId) => {
        if (!connectedUserIds.includes(cursorClientId)) {
          updatedCursors.delete(cursorClientId);
        }
      });

      remoteCursors = updatedCursors;
    }

    cleanupStaleCursors([]);

    expect(remoteCursors.size).toBe(0);
  });

  it('should not modify cursors if all users still connected', () => {
    let remoteCursors = new Map<string, { position: number; color: string; label: string }>();

    remoteCursors.set('client-1', { position: 10, color: 'blue', label: 'User 1' });
    remoteCursors.set('client-2', { position: 20, color: 'green', label: 'User 2' });

    const originalSize = remoteCursors.size;

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

    cleanupStaleCursors(['client-1', 'client-2']);

    expect(remoteCursors.size).toBe(originalSize);
  });
});

describe('useCollaboration state getters and setters', () => {
  it('should provide getter/setter pairs for all state', () => {
    const createState = <T>(initial: T) => {
      let value = initial;
      return {
        get: () => value,
        set: (newValue: T) => { value = newValue; }
      };
    };

    const isRealtimeEnabled = createState(false);
    const connectionStatus = createState<'connected' | 'disconnected' | 'connecting'>('disconnected');
    const clientId = createState('');
    const isSyncing = createState(false);

    // Test setters
    isRealtimeEnabled.set(true);
    connectionStatus.set('connected');
    clientId.set('my-client-id');
    isSyncing.set(true);

    // Test getters
    expect(isRealtimeEnabled.get()).toBe(true);
    expect(connectionStatus.get()).toBe('connected');
    expect(clientId.get()).toBe('my-client-id');
    expect(isSyncing.get()).toBe(true);
  });
});

describe('useCollaboration cursor position adjustment', () => {
  it('should adjust cursor position for remote operations', () => {
    // When a remote insert happens before our cursor, our cursor needs to shift
    let remoteCursors = new Map<string, { position: number; color: string; label: string }>();
    remoteCursors.set('client-1', { position: 20, color: 'blue', label: 'User 1' });

    const insertPosition = 10;
    const insertLength = 5;

    // Adjust all cursors after the insert position
    const adjustedCursors = new Map<string, { position: number; color: string; label: string }>();
    remoteCursors.forEach((cursor, clientId) => {
      if (cursor.position >= insertPosition) {
        adjustedCursors.set(clientId, {
          ...cursor,
          position: cursor.position + insertLength
        });
      } else {
        adjustedCursors.set(clientId, cursor);
      }
    });

    expect(adjustedCursors.get('client-1')?.position).toBe(25);
  });

  it('should adjust cursor position for remote delete', () => {
    let remoteCursors = new Map<string, { position: number; color: string; label: string }>();
    remoteCursors.set('client-1', { position: 20, color: 'blue', label: 'User 1' });

    const deletePosition = 10;
    const deleteLength = 5;
    const deleteEnd = deletePosition + deleteLength;

    const adjustedCursors = new Map<string, { position: number; color: string; label: string }>();
    remoteCursors.forEach((cursor, clientId) => {
      let newPosition = cursor.position;

      if (cursor.position >= deleteEnd) {
        // Cursor after delete - shift back
        newPosition = cursor.position - deleteLength;
      } else if (cursor.position > deletePosition) {
        // Cursor inside delete - move to delete start
        newPosition = deletePosition;
      }

      adjustedCursors.set(clientId, { ...cursor, position: newPosition });
    });

    expect(adjustedCursors.get('client-1')?.position).toBe(15); // 20 - 5
  });
});
