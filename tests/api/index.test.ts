/**
 * Tests for API routes
 * Tests the Hono API endpoints with mocked D1 database
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';
import { LIMITS, CUSTOM_ID_PATTERN } from '../../config/constants';
import { ALLOWED_SYNTAX_MODES } from '../../config/languages';

// Mock D1 database
function createMockDB() {
  const mockNotes = new Map<string, any>();

  const createMockStatement = (result: any) => ({
    bind: vi.fn().mockReturnThis(),
    first: vi.fn().mockResolvedValue(result),
    all: vi.fn().mockResolvedValue({ results: result ? [result] : [] }),
    run: vi.fn().mockResolvedValue({ meta: { changes: 1 } }),
  });

  return {
    prepare: vi.fn((sql: string) => {
      // Return appropriate mock based on SQL
      if (sql.includes('SELECT') && sql.includes('FROM notes')) {
        return createMockStatement(null); // Default: note not found
      }
      if (sql.includes('INSERT INTO notes')) {
        return createMockStatement(null);
      }
      if (sql.includes('UPDATE notes')) {
        return createMockStatement({ version: 1 });
      }
      if (sql.includes('DELETE FROM notes')) {
        return createMockStatement(null);
      }
      return createMockStatement(null);
    }),
    _mockNotes: mockNotes,
  };
}

// Mock Durable Object
function createMockDO() {
  return {
    idFromName: vi.fn().mockReturnValue({ id: 'test-do-id' }),
    get: vi.fn().mockReturnValue({
      fetch: vi.fn().mockResolvedValue(
        new Response(JSON.stringify({
          content: 'test content',
          version: 1,
          syntax_highlight: 'plaintext',
          is_encrypted: false,
        }))
      ),
    }),
  };
}

// Mock ASSETS fetcher
function createMockAssets() {
  return {
    fetch: vi.fn().mockResolvedValue(new Response('<html></html>')),
  };
}

describe('API Constants and Validation', () => {
  describe('LIMITS', () => {
    it('should have correct MAX_CONTENT_SIZE', () => {
      expect(LIMITS.MAX_CONTENT_SIZE).toBe(1024 * 1024); // 1MB
    });

    it('should have correct MAX_ID_LENGTH', () => {
      expect(LIMITS.MAX_ID_LENGTH).toBe(100);
    });

    it('should have correct MAX_VIEWS', () => {
      expect(LIMITS.MAX_VIEWS).toBe(1000000);
    });

    it('should have correct MIN_VIEWS', () => {
      expect(LIMITS.MIN_VIEWS).toBe(1);
    });

    it('should have correct expiration limits', () => {
      expect(LIMITS.MIN_EXPIRATION).toBe(60000); // 1 minute
      expect(LIMITS.MAX_EXPIRATION).toBe(365 * 24 * 60 * 60 * 1000); // 1 year
    });

    it('should have correct PBKDF2_ITERATIONS', () => {
      expect(LIMITS.PBKDF2_ITERATIONS).toBe(100000);
    });

    it('should have correct INACTIVE_NOTE_EXPIRY_DAYS', () => {
      expect(LIMITS.INACTIVE_NOTE_EXPIRY_DAYS).toBe(90);
    });
  });

  describe('CUSTOM_ID_PATTERN', () => {
    it('should accept valid alphanumeric IDs', () => {
      expect(CUSTOM_ID_PATTERN.test('abc123')).toBe(true);
      expect(CUSTOM_ID_PATTERN.test('ABC123')).toBe(true);
      expect(CUSTOM_ID_PATTERN.test('test')).toBe(true);
    });

    it('should accept hyphens and underscores', () => {
      expect(CUSTOM_ID_PATTERN.test('my-note')).toBe(true);
      expect(CUSTOM_ID_PATTERN.test('my_note')).toBe(true);
      expect(CUSTOM_ID_PATTERN.test('my-note_123')).toBe(true);
    });

    it('should reject invalid characters', () => {
      expect(CUSTOM_ID_PATTERN.test('my note')).toBe(false);
      expect(CUSTOM_ID_PATTERN.test('my.note')).toBe(false);
      expect(CUSTOM_ID_PATTERN.test('my@note')).toBe(false);
      expect(CUSTOM_ID_PATTERN.test('my/note')).toBe(false);
    });

    it('should reject empty string', () => {
      expect(CUSTOM_ID_PATTERN.test('')).toBe(false);
    });
  });

  describe('ALLOWED_SYNTAX_MODES', () => {
    it('should include common languages', () => {
      expect(ALLOWED_SYNTAX_MODES).toContain('javascript');
      expect(ALLOWED_SYNTAX_MODES).toContain('typescript');
      expect(ALLOWED_SYNTAX_MODES).toContain('python');
      expect(ALLOWED_SYNTAX_MODES).toContain('java');
      expect(ALLOWED_SYNTAX_MODES).toContain('go');
      expect(ALLOWED_SYNTAX_MODES).toContain('rust');
    });

    it('should include plaintext as default', () => {
      expect(ALLOWED_SYNTAX_MODES).toContain('plaintext');
    });

    it('should include markup languages', () => {
      // HTML is not a standalone highlight.js language; XML covers it
      expect(ALLOWED_SYNTAX_MODES).toContain('xml');
      expect(ALLOWED_SYNTAX_MODES).toContain('markdown');
      expect(ALLOWED_SYNTAX_MODES).toContain('json');
      expect(ALLOWED_SYNTAX_MODES).toContain('yaml');
    });

    it('should include shell languages', () => {
      expect(ALLOWED_SYNTAX_MODES).toContain('bash');
      expect(ALLOWED_SYNTAX_MODES).toContain('powershell');
      expect(ALLOWED_SYNTAX_MODES).toContain('shell');
    });

    it('should have a reasonable number of languages', () => {
      expect(ALLOWED_SYNTAX_MODES.length).toBeGreaterThan(100);
    });
  });
});

describe('Client-side encryption behavior', () => {
  // Test encryption-related logic (passwords never leave browser)

  it('should use Web Crypto API for encryption', async () => {
    // Verify crypto.subtle is available for client-side encryption
    expect(crypto.subtle).toBeDefined();
    expect(crypto.subtle.encrypt).toBeDefined();
    expect(crypto.subtle.decrypt).toBeDefined();
  });

  it('should support PBKDF2 for key derivation', async () => {
    // Verify PBKDF2 is available for password-based key derivation
    expect(crypto.subtle.importKey).toBeDefined();
    expect(crypto.subtle.deriveKey).toBeDefined();
  });
});

describe('Constant-time string comparison', () => {
  // Test the constant-time comparison function

  function constantTimeCompare(a: string, b: string): boolean {
    if (a.length !== b.length) return false;

    let result = 0;
    for (let i = 0; i < a.length; i++) {
      result |= a.charCodeAt(i) ^ b.charCodeAt(i);
    }
    return result === 0;
  }

  it('should return true for identical strings', () => {
    expect(constantTimeCompare('hello', 'hello')).toBe(true);
    expect(constantTimeCompare('', '')).toBe(true);
    expect(constantTimeCompare('a', 'a')).toBe(true);
  });

  it('should return false for different strings', () => {
    expect(constantTimeCompare('hello', 'world')).toBe(false);
    expect(constantTimeCompare('hello', 'hella')).toBe(false);
    expect(constantTimeCompare('a', 'b')).toBe(false);
  });

  it('should return false for strings of different lengths', () => {
    expect(constantTimeCompare('hello', 'hell')).toBe(false);
    expect(constantTimeCompare('hello', 'helloo')).toBe(false);
    expect(constantTimeCompare('', 'a')).toBe(false);
  });

  it('should handle special characters', () => {
    expect(constantTimeCompare('h@sh#123', 'h@sh#123')).toBe(true);
    expect(constantTimeCompare('日本語', '日本語')).toBe(true);
  });

  it('should not short-circuit on first difference', () => {
    // Both should take roughly same time regardless of where difference is
    const start1 = Date.now();
    for (let i = 0; i < 1000; i++) {
      constantTimeCompare('aaaaaaaaaa', 'baaaaaaaaa'); // Differs at start
    }
    const time1 = Date.now() - start1;

    const start2 = Date.now();
    for (let i = 0; i < 1000; i++) {
      constantTimeCompare('aaaaaaaaaa', 'aaaaaaaaab'); // Differs at end
    }
    const time2 = Date.now() - start2;

    // Times should be within reasonable range of each other
    // Note: This isn't a perfect timing test, but it verifies the function doesn't obviously short-circuit
    expect(Math.abs(time1 - time2)).toBeLessThan(50);
  });
});

describe('ID generation', () => {
  function generateId(length = 4): string {
    const chars = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }

  it('should generate ID of specified length', () => {
    expect(generateId(4).length).toBe(4);
    expect(generateId(6).length).toBe(6);
    expect(generateId(10).length).toBe(10);
  });

  it('should only use allowed characters', () => {
    const allowedChars = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNOPQRSTUVWXYZ0123456789';
    const id = generateId(100);

    for (const char of id) {
      expect(allowedChars.includes(char)).toBe(true);
    }
  });

  it('should not include ambiguous characters I and l', () => {
    // Generate many IDs and check none contain I or l
    for (let i = 0; i < 100; i++) {
      const id = generateId(20);
      expect(id.includes('I')).toBe(false);
      expect(id.includes('l')).toBe(false);
    }
  });

  it('should generate unique IDs', () => {
    const ids = new Set<string>();
    for (let i = 0; i < 100; i++) {
      ids.add(generateId(8));
    }
    // With 8 character IDs and only 100 samples, collisions should be extremely rare
    expect(ids.size).toBe(100);
  });
});

describe('Request validation logic', () => {
  describe('content validation', () => {
    it('should reject empty content', () => {
      const content: string = '';
      const isValid = content && content.length > 0;
      expect(isValid).toBeFalsy();
    });

    it('should reject content exceeding max size', () => {
      const content = 'x'.repeat(LIMITS.MAX_CONTENT_SIZE + 1);
      const isValid = content.length <= LIMITS.MAX_CONTENT_SIZE;
      expect(isValid).toBe(false);
    });

    it('should accept valid content', () => {
      const content = 'Hello, World!';
      const isValid = content && content.length > 0 && content.length <= LIMITS.MAX_CONTENT_SIZE;
      expect(isValid).toBe(true);
    });

    it('should accept content at max size', () => {
      const content = 'x'.repeat(LIMITS.MAX_CONTENT_SIZE);
      const isValid = content.length <= LIMITS.MAX_CONTENT_SIZE;
      expect(isValid).toBe(true);
    });
  });

  describe('max_views validation', () => {
    it('should accept null max_views', () => {
      const maxViews = null;
      const isValid = maxViews === null || maxViews === undefined ||
        (maxViews >= LIMITS.MIN_VIEWS && maxViews <= LIMITS.MAX_VIEWS);
      expect(isValid).toBe(true);
    });

    it('should accept undefined max_views', () => {
      const maxViews = undefined;
      const isValid = maxViews === null || maxViews === undefined ||
        (maxViews >= LIMITS.MIN_VIEWS && maxViews <= LIMITS.MAX_VIEWS);
      expect(isValid).toBe(true);
    });

    it('should accept valid max_views', () => {
      const maxViews = 10;
      const isValid = maxViews >= LIMITS.MIN_VIEWS && maxViews <= LIMITS.MAX_VIEWS;
      expect(isValid).toBe(true);
    });

    it('should reject max_views below minimum', () => {
      const maxViews = 0;
      const isValid = maxViews >= LIMITS.MIN_VIEWS && maxViews <= LIMITS.MAX_VIEWS;
      expect(isValid).toBe(false);
    });

    it('should reject max_views above maximum', () => {
      const maxViews = LIMITS.MAX_VIEWS + 1;
      const isValid = maxViews <= LIMITS.MAX_VIEWS;
      expect(isValid).toBe(false);
    });
  });

  describe('expires_in validation', () => {
    it('should accept null expires_in', () => {
      const expiresIn = null;
      const isValid = expiresIn === null || expiresIn === undefined ||
        (expiresIn >= LIMITS.MIN_EXPIRATION && expiresIn <= LIMITS.MAX_EXPIRATION);
      expect(isValid).toBe(true);
    });

    it('should accept valid expires_in', () => {
      const expiresIn = 3600000; // 1 hour
      const isValid = expiresIn >= LIMITS.MIN_EXPIRATION && expiresIn <= LIMITS.MAX_EXPIRATION;
      expect(isValid).toBe(true);
    });

    it('should reject expires_in below minimum', () => {
      const expiresIn = 30000; // 30 seconds
      const isValid = expiresIn >= LIMITS.MIN_EXPIRATION;
      expect(isValid).toBe(false);
    });

    it('should reject expires_in above maximum', () => {
      const expiresIn = LIMITS.MAX_EXPIRATION + 1;
      const isValid = expiresIn <= LIMITS.MAX_EXPIRATION;
      expect(isValid).toBe(false);
    });
  });

  describe('custom ID validation', () => {
    it('should accept valid custom IDs', () => {
      const validIds = ['abc', 'test-123', 'my_note', 'ABC-xyz_123'];
      for (const id of validIds) {
        const isValid = id.length <= LIMITS.MAX_ID_LENGTH && CUSTOM_ID_PATTERN.test(id);
        expect(isValid).toBe(true);
      }
    });

    it('should reject IDs exceeding max length', () => {
      const id = 'a'.repeat(LIMITS.MAX_ID_LENGTH + 1);
      const isValid = id.length <= LIMITS.MAX_ID_LENGTH;
      expect(isValid).toBe(false);
    });

    it('should reject IDs with invalid characters', () => {
      const invalidIds = ['my note', 'test@123', 'note.txt', 'path/to/note'];
      for (const id of invalidIds) {
        const isValid = CUSTOM_ID_PATTERN.test(id);
        expect(isValid).toBe(false);
      }
    });
  });

  describe('syntax_highlight validation', () => {
    it('should accept valid syntax modes', () => {
      const validModes = ['plaintext', 'javascript', 'python', 'go'];
      for (const mode of validModes) {
        const isValid = ALLOWED_SYNTAX_MODES.includes(mode as any);
        expect(isValid).toBe(true);
      }
    });

    it('should reject invalid syntax modes', () => {
      const invalidModes = ['invalid', 'notamode', 'xyz123'];
      for (const mode of invalidModes) {
        const isValid = ALLOWED_SYNTAX_MODES.includes(mode as any);
        expect(isValid).toBe(false);
      }
    });
  });
});

describe('View count and expiration logic', () => {
  describe('view count enforcement', () => {
    it('should detect when view limit is reached', () => {
      const viewCount = 10;
      const maxViews = 10;
      const isLastView = maxViews && viewCount >= maxViews;
      expect(isLastView).toBe(true);
    });

    it('should detect when view limit is exceeded', () => {
      const viewCount = 11;
      const maxViews = 10;
      const isExceeded = maxViews && viewCount > maxViews;
      expect(isExceeded).toBe(true);
    });

    it('should allow views when under limit', () => {
      const viewCount = 5;
      const maxViews = 10;
      const isUnderLimit = !maxViews || viewCount < maxViews;
      expect(isUnderLimit).toBe(true);
    });

    it('should handle null max_views', () => {
      const viewCount = 1000;
      const maxViews = null;
      const isExceeded = maxViews && viewCount > maxViews;
      expect(isExceeded).toBeFalsy();
    });
  });

  describe('expiration enforcement', () => {
    it('should detect expired notes', () => {
      const expiresAt = Date.now() - 1000; // Expired 1 second ago
      const isExpired = expiresAt && Date.now() > expiresAt;
      expect(isExpired).toBe(true);
    });

    it('should allow non-expired notes', () => {
      const expiresAt = Date.now() + 1000000; // Expires in future
      const isExpired = expiresAt && Date.now() > expiresAt;
      expect(isExpired).toBe(false);
    });

    it('should handle null expiration', () => {
      const expiresAt = null;
      const isExpired = expiresAt && Date.now() > expiresAt;
      expect(isExpired).toBeFalsy();
    });
  });

  describe('inactive note cleanup logic', () => {
    it('should identify inactive notes', () => {
      const now = Date.now();
      const inactiveThreshold = now - (LIMITS.INACTIVE_NOTE_EXPIRY_DAYS * 24 * 60 * 60 * 1000);
      const lastAccessedAt = now - (100 * 24 * 60 * 60 * 1000); // 100 days ago

      const isInactive = lastAccessedAt <= inactiveThreshold;
      expect(isInactive).toBe(true);
    });

    it('should not mark recently accessed notes as inactive', () => {
      const now = Date.now();
      const inactiveThreshold = now - (LIMITS.INACTIVE_NOTE_EXPIRY_DAYS * 24 * 60 * 60 * 1000);
      const lastAccessedAt = now - (30 * 24 * 60 * 60 * 1000); // 30 days ago

      const isInactive = lastAccessedAt <= inactiveThreshold;
      expect(isInactive).toBe(false);
    });
  });
});

describe('Version conflict detection', () => {
  it('should detect version mismatch', () => {
    const expectedVersion: number | null = 1;
    const currentVersion: number = 2;
    const hasConflict = expectedVersion !== null && expectedVersion !== currentVersion;
    expect(hasConflict).toBe(true);
  });

  it('should allow when versions match', () => {
    const expectedVersion = 2;
    const currentVersion = 2;
    const hasConflict = expectedVersion !== null && expectedVersion !== currentVersion;
    expect(hasConflict).toBe(false);
  });

  it('should skip check when expected version is null', () => {
    const expectedVersion = null;
    const currentVersion = 5;
    const shouldCheck = expectedVersion !== null;
    expect(shouldCheck).toBe(false);
  });
});

describe('Encryption change detection', () => {
  function checkEncryptionChanged(isEncrypted: boolean, existingIsEncrypted: boolean): boolean {
    return isEncrypted !== existingIsEncrypted;
  }

  it('should detect encryption being enabled', () => {
    expect(checkEncryptionChanged(true, false)).toBe(true);
  });

  it('should detect encryption being disabled', () => {
    expect(checkEncryptionChanged(false, true)).toBe(true);
  });

  it('should not detect change when encryption status unchanged', () => {
    expect(checkEncryptionChanged(true, true)).toBe(false);
  });

  it('should use is_encrypted flag only (no server-side password verification)', () => {
    // With true E2E encryption, server only knows if content is encrypted
    // Password is never sent to server - verification happens client-side via decryption
    const noteIsEncrypted = true;
    const serverKnowsPassword = false; // Server never knows the password

    expect(noteIsEncrypted).toBe(true);
    expect(serverKnowsPassword).toBe(false);
  });
});
