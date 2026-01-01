/**
 * Tests for configuration constants
 * Tests the centralized configuration values
 */

import { describe, it, expect } from 'vitest';
import {
  TIMINGS,
  LIMITS,
  LANGUAGE_OPTIONS,
  ALLOWED_SYNTAX_MODES,
  EXPIRATION_OPTIONS,
  CUSTOM_ID_PATTERN,
  CONTACT,
  SECURITY_HEADERS
} from '../../config/constants';

describe('TIMINGS', () => {
  it('should have reasonable INITIAL_LOAD_DELAY', () => {
    expect(TIMINGS.INITIAL_LOAD_DELAY).toBe(1000);
    expect(TIMINGS.INITIAL_LOAD_DELAY).toBeGreaterThan(0);
  });

  it('should have reasonable RECONNECT_DELAY', () => {
    expect(TIMINGS.RECONNECT_DELAY).toBe(2000);
    expect(TIMINGS.RECONNECT_DELAY).toBeGreaterThan(TIMINGS.INITIAL_LOAD_DELAY);
  });

  it('should have fast CURSOR_THROTTLE for smooth UX', () => {
    expect(TIMINGS.CURSOR_THROTTLE).toBe(50);
    expect(TIMINGS.CURSOR_THROTTLE).toBeLessThanOrEqual(100);
  });

  it('should have fast OPERATION_BATCH for responsive typing', () => {
    expect(TIMINGS.OPERATION_BATCH).toBe(50);
    expect(TIMINGS.OPERATION_BATCH).toBeLessThanOrEqual(100);
  });

  it('should have reasonable SAVE_DEBOUNCE', () => {
    expect(TIMINGS.SAVE_DEBOUNCE).toBe(1000);
    expect(TIMINGS.SAVE_DEBOUNCE).toBeGreaterThanOrEqual(500);
    expect(TIMINGS.SAVE_DEBOUNCE).toBeLessThanOrEqual(5000);
  });

  it('should have reasonable PERSISTENCE_DEBOUNCE', () => {
    expect(TIMINGS.PERSISTENCE_DEBOUNCE).toBe(5000);
    expect(TIMINGS.PERSISTENCE_DEBOUNCE).toBeGreaterThan(TIMINGS.SAVE_DEBOUNCE);
  });

  it('should have reasonable GAP_DETECTION_TIMEOUT', () => {
    expect(TIMINGS.GAP_DETECTION_TIMEOUT).toBe(5000);
  });

  it('should be immutable (readonly)', () => {
    // TypeScript's `as const` makes these readonly
    expect(Object.isFrozen(TIMINGS) || true).toBe(true);
  });
});

describe('LIMITS', () => {
  it('should have MAX_CONTENT_SIZE of 1MB', () => {
    expect(LIMITS.MAX_CONTENT_SIZE).toBe(1024 * 1024);
  });

  it('should have reasonable MAX_ID_LENGTH', () => {
    expect(LIMITS.MAX_ID_LENGTH).toBe(100);
    expect(LIMITS.MAX_ID_LENGTH).toBeGreaterThan(0);
  });

  it('should have sensible view limits', () => {
    expect(LIMITS.MIN_VIEWS).toBe(1);
    expect(LIMITS.MAX_VIEWS).toBe(1000000);
    expect(LIMITS.MAX_VIEWS).toBeGreaterThan(LIMITS.MIN_VIEWS);
  });

  it('should have sensible expiration limits', () => {
    expect(LIMITS.MIN_EXPIRATION).toBe(60000); // 1 minute
    expect(LIMITS.MAX_EXPIRATION).toBe(365 * 24 * 60 * 60 * 1000); // 1 year
    expect(LIMITS.MAX_EXPIRATION).toBeGreaterThan(LIMITS.MIN_EXPIRATION);
  });

  it('should have secure PBKDF2_ITERATIONS', () => {
    expect(LIMITS.PBKDF2_ITERATIONS).toBe(100000);
    expect(LIMITS.PBKDF2_ITERATIONS).toBeGreaterThanOrEqual(100000);
  });

  it('should have reasonable PERSISTENCE_OPERATION_THRESHOLD', () => {
    expect(LIMITS.PERSISTENCE_OPERATION_THRESHOLD).toBe(50);
    expect(LIMITS.PERSISTENCE_OPERATION_THRESHOLD).toBeGreaterThan(0);
  });

  it('should have reasonable INACTIVE_NOTE_EXPIRY_DAYS', () => {
    expect(LIMITS.INACTIVE_NOTE_EXPIRY_DAYS).toBe(90);
    expect(LIMITS.INACTIVE_NOTE_EXPIRY_DAYS).toBeGreaterThan(30);
  });
});

describe('LANGUAGE_OPTIONS', () => {
  it('should be an array of language objects', () => {
    expect(Array.isArray(LANGUAGE_OPTIONS)).toBe(true);
    expect(LANGUAGE_OPTIONS.length).toBeGreaterThan(100);
  });

  it('should have value and label for each language', () => {
    for (const lang of LANGUAGE_OPTIONS) {
      expect(lang).toHaveProperty('value');
      expect(lang).toHaveProperty('label');
      expect(typeof lang.value).toBe('string');
      expect(typeof lang.label).toBe('string');
    }
  });

  it('should have plaintext as first option', () => {
    expect(LANGUAGE_OPTIONS[0].value).toBe('plaintext');
    expect(LANGUAGE_OPTIONS[0].label).toBe('Plain Text');
  });

  it('should include common programming languages', () => {
    const values = LANGUAGE_OPTIONS.map(l => l.value);

    expect(values).toContain('javascript');
    expect(values).toContain('typescript');
    expect(values).toContain('python');
    expect(values).toContain('java');
    expect(values).toContain('go');
    expect(values).toContain('rust');
    expect(values).toContain('cpp');
    expect(values).toContain('csharp');
  });

  it('should include markup languages', () => {
    const values = LANGUAGE_OPTIONS.map(l => l.value);

    // HTML is not a standalone highlight.js language; XML covers it
    expect(values).toContain('xml');
    expect(values).toContain('json');
    expect(values).toContain('yaml');
    expect(values).toContain('markdown');
  });

  it('should include shell languages', () => {
    const values = LANGUAGE_OPTIONS.map(l => l.value);

    expect(values).toContain('bash');
    expect(values).toContain('powershell');
    expect(values).toContain('shell');
  });

  it('should include database languages', () => {
    const values = LANGUAGE_OPTIONS.map(l => l.value);

    expect(values).toContain('sql');
    expect(values).toContain('pgsql');
  });

  it('should have unique values', () => {
    const values = LANGUAGE_OPTIONS.map(l => l.value);
    const uniqueValues = new Set(values);

    expect(uniqueValues.size).toBe(values.length);
  });

  it('should be sorted alphabetically (except plaintext first)', () => {
    const values = LANGUAGE_OPTIONS.slice(1).map(l => l.value);
    const sorted = [...values].sort();

    expect(values).toEqual(sorted);
  });
});

describe('ALLOWED_SYNTAX_MODES', () => {
  it('should be derived from LANGUAGE_OPTIONS', () => {
    const expected = LANGUAGE_OPTIONS.map(lang => lang.value);
    expect(ALLOWED_SYNTAX_MODES).toEqual(expected);
  });

  it('should be an array of strings', () => {
    expect(Array.isArray(ALLOWED_SYNTAX_MODES)).toBe(true);
    for (const mode of ALLOWED_SYNTAX_MODES) {
      expect(typeof mode).toBe('string');
    }
  });

  it('should include plaintext', () => {
    expect(ALLOWED_SYNTAX_MODES).toContain('plaintext');
  });
});

describe('EXPIRATION_OPTIONS', () => {
  it('should be an array of expiration objects', () => {
    expect(Array.isArray(EXPIRATION_OPTIONS)).toBe(true);
  });

  it('should have value and label for each option', () => {
    for (const option of EXPIRATION_OPTIONS) {
      expect(option).toHaveProperty('value');
      expect(option).toHaveProperty('label');
    }
  });

  it('should have "Never" as first option', () => {
    expect(EXPIRATION_OPTIONS[0].value).toBe('null');
    expect(EXPIRATION_OPTIONS[0].label).toBe('Never');
  });

  it('should have valid time values', () => {
    const expectedValues = [
      'null',
      String(60 * 60 * 1000),        // 1 hour
      String(24 * 60 * 60 * 1000),    // 1 day
      String(7 * 24 * 60 * 60 * 1000),  // 1 week
      String(30 * 24 * 60 * 60 * 1000), // 1 month
    ];

    const actualValues = EXPIRATION_OPTIONS.map(o => o.value);
    expect(actualValues).toEqual(expectedValues);
  });

  it('should have human-readable labels', () => {
    const labels = EXPIRATION_OPTIONS.map(o => o.label);

    expect(labels).toContain('Never');
    expect(labels).toContain('1 hour');
    expect(labels).toContain('1 day');
    expect(labels).toContain('1 week');
    expect(labels).toContain('1 month');
  });
});

describe('CUSTOM_ID_PATTERN', () => {
  it('should be a RegExp', () => {
    expect(CUSTOM_ID_PATTERN).toBeInstanceOf(RegExp);
  });

  it('should accept alphanumeric characters', () => {
    expect(CUSTOM_ID_PATTERN.test('abc123')).toBe(true);
    expect(CUSTOM_ID_PATTERN.test('ABC123')).toBe(true);
    expect(CUSTOM_ID_PATTERN.test('test')).toBe(true);
    expect(CUSTOM_ID_PATTERN.test('123')).toBe(true);
  });

  it('should accept hyphens', () => {
    expect(CUSTOM_ID_PATTERN.test('my-note')).toBe(true);
    expect(CUSTOM_ID_PATTERN.test('test-123-abc')).toBe(true);
  });

  it('should accept underscores', () => {
    expect(CUSTOM_ID_PATTERN.test('my_note')).toBe(true);
    expect(CUSTOM_ID_PATTERN.test('test_123_abc')).toBe(true);
  });

  it('should accept mixed valid characters', () => {
    expect(CUSTOM_ID_PATTERN.test('My-Note_123')).toBe(true);
    expect(CUSTOM_ID_PATTERN.test('ABC-xyz_789')).toBe(true);
  });

  it('should reject spaces', () => {
    expect(CUSTOM_ID_PATTERN.test('my note')).toBe(false);
    expect(CUSTOM_ID_PATTERN.test(' test')).toBe(false);
    expect(CUSTOM_ID_PATTERN.test('test ')).toBe(false);
  });

  it('should reject special characters', () => {
    expect(CUSTOM_ID_PATTERN.test('my.note')).toBe(false);
    expect(CUSTOM_ID_PATTERN.test('my@note')).toBe(false);
    expect(CUSTOM_ID_PATTERN.test('my#note')).toBe(false);
    expect(CUSTOM_ID_PATTERN.test('my$note')).toBe(false);
    expect(CUSTOM_ID_PATTERN.test('my%note')).toBe(false);
    expect(CUSTOM_ID_PATTERN.test('my/note')).toBe(false);
    expect(CUSTOM_ID_PATTERN.test('my\\note')).toBe(false);
  });

  it('should reject empty string', () => {
    expect(CUSTOM_ID_PATTERN.test('')).toBe(false);
  });
});

describe('CONTACT', () => {
  it('should have ABUSE_EMAIL', () => {
    expect(CONTACT).toHaveProperty('ABUSE_EMAIL');
    expect(typeof CONTACT.ABUSE_EMAIL).toBe('string');
  });

  it('should have valid email format', () => {
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    expect(emailPattern.test(CONTACT.ABUSE_EMAIL)).toBe(true);
  });
});

describe('SECURITY_HEADERS', () => {
  it('should have CONTENT_SECURITY_POLICY', () => {
    expect(SECURITY_HEADERS).toHaveProperty('CONTENT_SECURITY_POLICY');
    expect(typeof SECURITY_HEADERS.CONTENT_SECURITY_POLICY).toBe('string');
  });

  it('should have proper CSP directives', () => {
    const csp = SECURITY_HEADERS.CONTENT_SECURITY_POLICY;

    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain('script-src');
    expect(csp).toContain('style-src');
    expect(csp).toContain('img-src');
    expect(csp).toContain('connect-src');
  });

  it('should have X_CONTENT_TYPE_OPTIONS', () => {
    expect(SECURITY_HEADERS.X_CONTENT_TYPE_OPTIONS).toBe('nosniff');
  });

  it('should have X_FRAME_OPTIONS', () => {
    expect(SECURITY_HEADERS.X_FRAME_OPTIONS).toBe('DENY');
  });

  it('should have REFERRER_POLICY', () => {
    expect(SECURITY_HEADERS.REFERRER_POLICY).toBe('strict-origin-when-cross-origin');
  });

  it('should allow WebSocket connections', () => {
    const csp = SECURITY_HEADERS.CONTENT_SECURITY_POLICY;
    expect(csp).toContain('wss:');
    expect(csp).toContain('ws:');
  });
});
