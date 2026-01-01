/**
 * Vitest setup file
 * Global mocks and test utilities
 */

import { vi } from 'vitest';

// Mock crypto.subtle for tests
const mockCryptoSubtle = {
  digest: vi.fn(async (algorithm: string, data: ArrayBuffer) => {
    // Simple hash mock - returns predictable hash based on input
    const view = new Uint8Array(data);
    const hash = new Uint8Array(32);
    for (let i = 0; i < view.length; i++) {
      hash[i % 32] ^= view[i];
    }
    return hash.buffer;
  }),
  importKey: vi.fn(async () => ({ type: 'secret' })),
  deriveKey: vi.fn(async () => ({ type: 'derived' })),
  encrypt: vi.fn(async (_algorithm: any, _key: any, data: ArrayBuffer) => {
    // Mock encryption - just return the data with a prefix
    const encrypted = new Uint8Array(data.byteLength + 16);
    encrypted.set(new Uint8Array(data), 16);
    return encrypted.buffer;
  }),
  decrypt: vi.fn(async (_algorithm: any, _key: any, data: ArrayBuffer) => {
    // Mock decryption - remove the prefix
    const view = new Uint8Array(data);
    return view.slice(16).buffer;
  }),
};

// Mock crypto.getRandomValues
const mockGetRandomValues = vi.fn(<T extends ArrayBufferView>(array: T): T => {
  const view = array as unknown as Uint8Array;
  for (let i = 0; i < view.length; i++) {
    view[i] = Math.floor(Math.random() * 256);
  }
  return array;
});

// Mock crypto.randomUUID
const mockRandomUUID = vi.fn(() =>
  'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  })
);

// Apply crypto mock globally
Object.defineProperty(globalThis, 'crypto', {
  value: {
    subtle: mockCryptoSubtle,
    getRandomValues: mockGetRandomValues,
    randomUUID: mockRandomUUID,
  },
  writable: true,
});

// Mock sessionStorage
const sessionStorageData: Record<string, string> = {};
Object.defineProperty(globalThis, 'sessionStorage', {
  value: {
    getItem: vi.fn((key: string) => sessionStorageData[key] || null),
    setItem: vi.fn((key: string, value: string) => { sessionStorageData[key] = value; }),
    removeItem: vi.fn((key: string) => { delete sessionStorageData[key]; }),
    clear: vi.fn(() => { Object.keys(sessionStorageData).forEach(k => delete sessionStorageData[k]); }),
  },
  writable: true,
});

// Mock WebSocket
class MockWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;

  readyState = MockWebSocket.CONNECTING;
  url: string;
  onopen: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;

  constructor(url: string) {
    this.url = url;
    // Simulate connection opening
    setTimeout(() => {
      this.readyState = MockWebSocket.OPEN;
      if (this.onopen) {
        this.onopen(new Event('open'));
      }
    }, 0);
  }

  send = vi.fn();
  close = vi.fn(() => {
    this.readyState = MockWebSocket.CLOSED;
    if (this.onclose) {
      this.onclose(new CloseEvent('close'));
    }
  });

  // Helper to simulate receiving a message
  simulateMessage(data: any) {
    if (this.onmessage) {
      this.onmessage(new MessageEvent('message', { data: JSON.stringify(data) }));
    }
  }

  // Helper to simulate error
  simulateError() {
    if (this.onerror) {
      this.onerror(new Event('error'));
    }
  }
}

Object.defineProperty(globalThis, 'WebSocket', {
  value: MockWebSocket,
  writable: true,
});

// Mock window.location
Object.defineProperty(globalThis, 'location', {
  value: {
    protocol: 'https:',
    host: 'localhost:8787',
    pathname: '/',
    href: 'https://localhost:8787/',
  },
  writable: true,
});

// Mock TextEncoder/TextDecoder (should exist in jsdom but ensure they work)
if (typeof TextEncoder === 'undefined') {
  globalThis.TextEncoder = class TextEncoder {
    encode(str: string): Uint8Array {
      const arr = new Uint8Array(str.length);
      for (let i = 0; i < str.length; i++) {
        arr[i] = str.charCodeAt(i);
      }
      return arr;
    }
  } as any;
}

if (typeof TextDecoder === 'undefined') {
  globalThis.TextDecoder = class TextDecoder {
    decode(arr: Uint8Array): string {
      return String.fromCharCode(...arr);
    }
  } as any;
}

// Mock btoa/atob for base64
if (typeof btoa === 'undefined') {
  globalThis.btoa = (str: string) => Buffer.from(str, 'binary').toString('base64');
}

if (typeof atob === 'undefined') {
  globalThis.atob = (str: string) => Buffer.from(str, 'base64').toString('binary');
}

// Export mocks for use in tests
export { mockCryptoSubtle, mockGetRandomValues, mockRandomUUID, MockWebSocket };
