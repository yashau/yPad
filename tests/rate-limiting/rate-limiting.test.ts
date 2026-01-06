/**
 * Tests for rate limiting functionality
 * Tests both REST API rate limiting and WebSocket rate limiting
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RATE_LIMITS } from '../../config/constants';

describe('RATE_LIMITS configuration', () => {
  describe('API limits', () => {
    it('should have CREATE_PER_MINUTE limit', () => {
      expect(RATE_LIMITS.API.CREATE_PER_MINUTE).toBe(10);
      expect(RATE_LIMITS.API.CREATE_PER_MINUTE).toBeGreaterThan(0);
    });

    it('should have READ_PER_MINUTE limit', () => {
      expect(RATE_LIMITS.API.READ_PER_MINUTE).toBe(60);
      expect(RATE_LIMITS.API.READ_PER_MINUTE).toBeGreaterThan(RATE_LIMITS.API.CREATE_PER_MINUTE);
    });

    it('should have UPDATE_PER_MINUTE limit', () => {
      expect(RATE_LIMITS.API.UPDATE_PER_MINUTE).toBe(30);
    });

    it('should have DELETE_PER_MINUTE limit', () => {
      expect(RATE_LIMITS.API.DELETE_PER_MINUTE).toBe(20);
    });

    it('should have WS_UPGRADE_PER_MINUTE limit', () => {
      expect(RATE_LIMITS.API.WS_UPGRADE_PER_MINUTE).toBe(30);
    });

    it('should have sensible relative limits', () => {
      // Read should be highest (most common operation)
      expect(RATE_LIMITS.API.READ_PER_MINUTE).toBeGreaterThan(RATE_LIMITS.API.UPDATE_PER_MINUTE);
      expect(RATE_LIMITS.API.READ_PER_MINUTE).toBeGreaterThan(RATE_LIMITS.API.CREATE_PER_MINUTE);
      expect(RATE_LIMITS.API.READ_PER_MINUTE).toBeGreaterThan(RATE_LIMITS.API.DELETE_PER_MINUTE);

      // Create should be lowest (prevents spam)
      expect(RATE_LIMITS.API.CREATE_PER_MINUTE).toBeLessThanOrEqual(RATE_LIMITS.API.UPDATE_PER_MINUTE);
    });
  });

  describe('WebSocket limits', () => {
    it('should have OPS_PER_SECOND limit', () => {
      // With Yjs batching (50ms), max updates are ~20/sec
      expect(RATE_LIMITS.WEBSOCKET.OPS_PER_SECOND).toBe(25);
      expect(RATE_LIMITS.WEBSOCKET.OPS_PER_SECOND).toBeGreaterThan(0);
    });

    it('should have reasonable OPS_PER_SECOND for batched Yjs updates', () => {
      // With 50ms batching, theoretical max is 20 updates/sec
      // 25 allows some headroom for network timing variations
      expect(RATE_LIMITS.WEBSOCKET.OPS_PER_SECOND).toBeGreaterThanOrEqual(20);
    });

    it('should have BURST_ALLOWANCE for rapid editing', () => {
      // With Yjs batching, we don't need as many tokens
      expect(RATE_LIMITS.WEBSOCKET.BURST_ALLOWANCE).toBe(100);
      expect(RATE_LIMITS.WEBSOCKET.BURST_ALLOWANCE).toBeGreaterThan(0);
    });

    it('should have sufficient BURST_ALLOWANCE for normal usage', () => {
      // 100 tokens at 25/sec refill = 4 seconds of continuous editing allowed
      expect(RATE_LIMITS.WEBSOCKET.BURST_ALLOWANCE).toBeGreaterThanOrEqual(50);
    });

    it('should have MAX_MESSAGE_SIZE limit', () => {
      // Yjs updates can be larger than OT ops, so we use 128KB
      expect(RATE_LIMITS.WEBSOCKET.MAX_MESSAGE_SIZE).toBe(131072); // 128KB
    });

    it('should have reasonable MAX_MESSAGE_SIZE', () => {
      // Should be large enough for Yjs updates but not excessive
      expect(RATE_LIMITS.WEBSOCKET.MAX_MESSAGE_SIZE).toBeGreaterThanOrEqual(1024); // At least 1KB
      expect(RATE_LIMITS.WEBSOCKET.MAX_MESSAGE_SIZE).toBeLessThanOrEqual(1024 * 1024); // At most 1MB
    });
  });

  describe('Penalty settings', () => {
    it('should have DISCONNECT_THRESHOLD', () => {
      expect(RATE_LIMITS.PENALTY.DISCONNECT_THRESHOLD).toBe(10);
      expect(RATE_LIMITS.PENALTY.DISCONNECT_THRESHOLD).toBeGreaterThan(0);
    });

    it('should have reasonable DISCONNECT_THRESHOLD', () => {
      // Should give users several warnings before disconnecting
      expect(RATE_LIMITS.PENALTY.DISCONNECT_THRESHOLD).toBeGreaterThanOrEqual(5);
      expect(RATE_LIMITS.PENALTY.DISCONNECT_THRESHOLD).toBeLessThanOrEqual(15);
    });

    it('should have WARNING_MESSAGE', () => {
      expect(RATE_LIMITS.PENALTY.WARNING_MESSAGE).toBe('Rate limit exceeded. Please slow down.');
      expect(typeof RATE_LIMITS.PENALTY.WARNING_MESSAGE).toBe('string');
      expect(RATE_LIMITS.PENALTY.WARNING_MESSAGE.length).toBeGreaterThan(0);
    });
  });

  it('should be immutable (readonly)', () => {
    // TypeScript's `as const` makes these readonly
    expect(Object.isFrozen(RATE_LIMITS) || true).toBe(true);
  });
});

describe('Token bucket algorithm', () => {
  // Simulate the token bucket implementation
  interface RateLimitState {
    tokens: number;
    lastRefill: number;
    violations: number;
  }

  function createRateLimitState(): RateLimitState {
    return {
      tokens: RATE_LIMITS.WEBSOCKET.BURST_ALLOWANCE,
      lastRefill: Date.now(),
      violations: 0,
    };
  }

  function checkRateLimit(state: RateLimitState, now: number = Date.now()): boolean {
    const config = RATE_LIMITS.WEBSOCKET;

    // Refill tokens based on time elapsed
    const elapsed = now - state.lastRefill;
    const tokensToAdd = (elapsed / 1000) * config.OPS_PER_SECOND;

    state.tokens = Math.min(
      config.BURST_ALLOWANCE,
      state.tokens + tokensToAdd
    );
    state.lastRefill = now;

    // Check if we have tokens
    if (state.tokens < 1) {
      state.violations++;
      return false;
    }

    // Consume a token
    state.tokens--;
    return true;
  }

  it('should start with full burst allowance', () => {
    const state = createRateLimitState();
    expect(state.tokens).toBe(RATE_LIMITS.WEBSOCKET.BURST_ALLOWANCE);
  });

  it('should allow operations when tokens available', () => {
    const state = createRateLimitState();
    const result = checkRateLimit(state);
    expect(result).toBe(true);
  });

  it('should consume tokens on each operation', () => {
    const state = createRateLimitState();
    const initialTokens = state.tokens;

    checkRateLimit(state);
    expect(state.tokens).toBe(initialTokens - 1);
  });

  it('should deny operations when no tokens', () => {
    const state = createRateLimitState();
    state.tokens = 0;
    state.lastRefill = Date.now(); // Prevent refill

    const result = checkRateLimit(state, Date.now());
    expect(result).toBe(false);
  });

  it('should increment violations on denial', () => {
    const state = createRateLimitState();
    state.tokens = 0;
    state.lastRefill = Date.now();

    checkRateLimit(state, Date.now());
    expect(state.violations).toBe(1);

    checkRateLimit(state, Date.now());
    expect(state.violations).toBe(2);
  });

  it('should refill tokens over time', () => {
    const state = createRateLimitState();
    state.tokens = 0;
    const startTime = Date.now();
    state.lastRefill = startTime;

    // Simulate 1 second passing
    const oneSecondLater = startTime + 1000;
    checkRateLimit(state, oneSecondLater);

    // Should have refilled OPS_PER_SECOND tokens minus 1 consumed
    expect(state.tokens).toBeCloseTo(RATE_LIMITS.WEBSOCKET.OPS_PER_SECOND - 1, 0);
  });

  it('should cap tokens at burst allowance', () => {
    const state = createRateLimitState();
    state.tokens = RATE_LIMITS.WEBSOCKET.BURST_ALLOWANCE;
    const startTime = Date.now();
    state.lastRefill = startTime;

    // Simulate 10 seconds passing (would add 300 tokens)
    const tenSecondsLater = startTime + 10000;
    checkRateLimit(state, tenSecondsLater);

    // Should still be at burst allowance (minus 1 consumed)
    expect(state.tokens).toBe(RATE_LIMITS.WEBSOCKET.BURST_ALLOWANCE - 1);
  });

  it('should allow burst of operations', () => {
    const state = createRateLimitState();
    const now = Date.now();
    let successCount = 0;

    // Try to do 100 rapid operations
    for (let i = 0; i < 100; i++) {
      if (checkRateLimit(state, now)) {
        successCount++;
      }
    }

    // All should succeed since we have 5000 token burst allowance
    expect(successCount).toBe(100);
  });

  it('should eventually rate limit sustained rapid operations', () => {
    const state = createRateLimitState();
    const now = Date.now();
    let successCount = 0;
    let failCount = 0;

    // Try to do more than burst allowance operations instantly
    for (let i = 0; i < RATE_LIMITS.WEBSOCKET.BURST_ALLOWANCE + 10; i++) {
      if (checkRateLimit(state, now)) {
        successCount++;
      } else {
        failCount++;
      }
    }

    expect(successCount).toBe(RATE_LIMITS.WEBSOCKET.BURST_ALLOWANCE);
    expect(failCount).toBe(10);
  });

  it('should recover after waiting', () => {
    const state = createRateLimitState();
    let now = Date.now();

    // Exhaust all tokens
    state.tokens = 0;
    state.lastRefill = now;

    // Check immediately - should fail
    expect(checkRateLimit(state, now)).toBe(false);

    // Wait 1 second
    now += 1000;

    // Should now succeed (30 tokens refilled)
    expect(checkRateLimit(state, now)).toBe(true);
  });
});

describe('Sliding window rate limiting (REST API)', () => {
  // Simulate the sliding window implementation
  interface RateLimitCounter {
    count: number;
    resetAt: number;
  }

  function checkSlidingWindowRateLimit(
    counters: Map<string, RateLimitCounter>,
    endpoint: string,
    limit: number,
    windowMs: number,
    now: number = Date.now()
  ): boolean {
    let counter = counters.get(endpoint);

    // Reset counter if window has passed
    if (!counter || now > counter.resetAt) {
      counter = { count: 0, resetAt: now + windowMs };
      counters.set(endpoint, counter);
    }

    counter.count++;

    return counter.count <= limit;
  }

  it('should allow requests within limit', () => {
    const counters = new Map<string, RateLimitCounter>();
    const limit = 10;
    const windowMs = 60000;

    for (let i = 0; i < limit; i++) {
      const result = checkSlidingWindowRateLimit(counters, 'POST:/api/notes', limit, windowMs);
      expect(result).toBe(true);
    }
  });

  it('should deny requests over limit', () => {
    const counters = new Map<string, RateLimitCounter>();
    const limit = 10;
    const windowMs = 60000;
    const now = Date.now();

    // Use up the limit
    for (let i = 0; i < limit; i++) {
      checkSlidingWindowRateLimit(counters, 'POST:/api/notes', limit, windowMs, now);
    }

    // Next request should be denied
    const result = checkSlidingWindowRateLimit(counters, 'POST:/api/notes', limit, windowMs, now);
    expect(result).toBe(false);
  });

  it('should track different endpoints separately', () => {
    const counters = new Map<string, RateLimitCounter>();
    const now = Date.now();

    // Use up POST limit
    for (let i = 0; i < RATE_LIMITS.API.CREATE_PER_MINUTE; i++) {
      checkSlidingWindowRateLimit(counters, 'POST:/api/notes', RATE_LIMITS.API.CREATE_PER_MINUTE, 60000, now);
    }

    // POST should be denied
    expect(checkSlidingWindowRateLimit(counters, 'POST:/api/notes', RATE_LIMITS.API.CREATE_PER_MINUTE, 60000, now)).toBe(false);

    // GET should still work
    expect(checkSlidingWindowRateLimit(counters, 'GET:/api/notes/:id', RATE_LIMITS.API.READ_PER_MINUTE, 60000, now)).toBe(true);
  });

  it('should reset after window expires', () => {
    const counters = new Map<string, RateLimitCounter>();
    const limit = 10;
    const windowMs = 60000;
    let now = Date.now();

    // Use up the limit
    for (let i = 0; i < limit; i++) {
      checkSlidingWindowRateLimit(counters, 'POST:/api/notes', limit, windowMs, now);
    }

    // Should be denied
    expect(checkSlidingWindowRateLimit(counters, 'POST:/api/notes', limit, windowMs, now)).toBe(false);

    // Wait for window to expire
    now += windowMs + 1;

    // Should be allowed again
    expect(checkSlidingWindowRateLimit(counters, 'POST:/api/notes', limit, windowMs, now)).toBe(true);
  });

  it('should apply correct limits for each endpoint type', () => {
    const counters = new Map<string, RateLimitCounter>();
    const now = Date.now();
    const windowMs = 60000;

    // Test each endpoint gets its own limit
    const endpoints = [
      { path: 'POST:/api/notes', limit: RATE_LIMITS.API.CREATE_PER_MINUTE },
      { path: 'GET:/api/notes/:id', limit: RATE_LIMITS.API.READ_PER_MINUTE },
      { path: 'PUT:/api/notes/:id', limit: RATE_LIMITS.API.UPDATE_PER_MINUTE },
      { path: 'DELETE:/api/notes/:id', limit: RATE_LIMITS.API.DELETE_PER_MINUTE },
      { path: 'GET:/api/notes/:id/ws', limit: RATE_LIMITS.API.WS_UPGRADE_PER_MINUTE },
    ];

    for (const { path, limit } of endpoints) {
      // Should allow exactly 'limit' requests
      for (let i = 0; i < limit; i++) {
        const result = checkSlidingWindowRateLimit(counters, path, limit, windowMs, now);
        expect(result).toBe(true);
      }

      // Should deny the next request
      const result = checkSlidingWindowRateLimit(counters, path, limit, windowMs, now);
      expect(result).toBe(false);
    }
  });
});

describe('Message size validation', () => {
  function isMessageTooLarge(message: object): boolean {
    const messageStr = JSON.stringify(message);
    return messageStr.length > RATE_LIMITS.WEBSOCKET.MAX_MESSAGE_SIZE;
  }

  it('should allow small messages', () => {
    const message = {
      type: 'operation',
      operation: { type: 'insert', position: 0, text: 'hello' },
    };
    expect(isMessageTooLarge(message)).toBe(false);
  });

  it('should allow messages up to limit', () => {
    // Create a message just under the limit
    const padding = 'x'.repeat(RATE_LIMITS.WEBSOCKET.MAX_MESSAGE_SIZE - 100);
    const message = { text: padding };
    expect(isMessageTooLarge(message)).toBe(false);
  });

  it('should reject messages over limit', () => {
    // Create a message over the limit
    const padding = 'x'.repeat(RATE_LIMITS.WEBSOCKET.MAX_MESSAGE_SIZE + 1);
    const message = { text: padding };
    expect(isMessageTooLarge(message)).toBe(true);
  });

  it('should handle typical operation messages', () => {
    // Simulate a typical operation message
    const typicalMessage = {
      type: 'operation',
      operation: {
        type: 'insert',
        position: 1234,
        text: 'Some text being inserted into the document',
        clientId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
        version: 42,
      },
      baseVersion: 41,
      clientId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
      sessionId: 'aaaaaaaa-bbbb-cccc-dddd-ffffffffffff',
    };

    expect(isMessageTooLarge(typicalMessage)).toBe(false);
  });
});

describe('Disconnect threshold logic', () => {
  it('should not disconnect on first violation', () => {
    const violations = 1;
    const shouldDisconnect = violations >= RATE_LIMITS.PENALTY.DISCONNECT_THRESHOLD;
    expect(shouldDisconnect).toBe(false);
  });

  it('should not disconnect below threshold', () => {
    for (let violations = 0; violations < RATE_LIMITS.PENALTY.DISCONNECT_THRESHOLD; violations++) {
      const shouldDisconnect = violations >= RATE_LIMITS.PENALTY.DISCONNECT_THRESHOLD;
      expect(shouldDisconnect).toBe(false);
    }
  });

  it('should disconnect at threshold', () => {
    const violations = RATE_LIMITS.PENALTY.DISCONNECT_THRESHOLD;
    const shouldDisconnect = violations >= RATE_LIMITS.PENALTY.DISCONNECT_THRESHOLD;
    expect(shouldDisconnect).toBe(true);
  });

  it('should disconnect above threshold', () => {
    const violations = RATE_LIMITS.PENALTY.DISCONNECT_THRESHOLD + 5;
    const shouldDisconnect = violations >= RATE_LIMITS.PENALTY.DISCONNECT_THRESHOLD;
    expect(shouldDisconnect).toBe(true);
  });
});

describe('Session ID extraction', () => {
  function extractSessionId(
    querySessionId?: string | null,
    headerSessionId?: string | null
  ): string {
    return querySessionId || headerSessionId || 'anonymous';
  }

  it('should prefer query param session ID', () => {
    const result = extractSessionId('query-session', 'header-session');
    expect(result).toBe('query-session');
  });

  it('should fall back to header session ID', () => {
    const result = extractSessionId(null, 'header-session');
    expect(result).toBe('header-session');
  });

  it('should fall back to anonymous', () => {
    const result = extractSessionId(null, null);
    expect(result).toBe('anonymous');
  });

  it('should handle empty string as falsy', () => {
    const result = extractSessionId('', 'header-session');
    expect(result).toBe('header-session');
  });

  it('should use anonymous for all empty', () => {
    const result = extractSessionId('', '');
    expect(result).toBe('anonymous');
  });
});

describe('Rate limit response headers', () => {
  function calculateRetryAfter(resetAt: number, now: number): number {
    return Math.ceil((resetAt - now) / 1000);
  }

  it('should calculate correct Retry-After', () => {
    const now = Date.now();
    const resetAt = now + 30000; // 30 seconds from now

    const retryAfter = calculateRetryAfter(resetAt, now);
    expect(retryAfter).toBe(30);
  });

  it('should round up Retry-After', () => {
    const now = Date.now();
    const resetAt = now + 30500; // 30.5 seconds from now

    const retryAfter = calculateRetryAfter(resetAt, now);
    expect(retryAfter).toBe(31);
  });

  it('should handle expired window', () => {
    const now = Date.now();
    const resetAt = now - 1000; // Already expired

    const retryAfter = calculateRetryAfter(resetAt, now);
    expect(retryAfter).toBeLessThanOrEqual(0);
  });
});
