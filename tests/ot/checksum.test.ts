/**
 * Tests for checksum utility
 * Tests the simple hash function used for content verification
 */

import { describe, it, expect } from 'vitest';
import { simpleChecksum } from '../../src/ot/checksum';

describe('simpleChecksum', () => {
  describe('basic functionality', () => {
    it('should return 0 for empty string', () => {
      const result = simpleChecksum('');
      expect(result).toBe(0);
    });

    it('should return consistent hash for same input', () => {
      const input = 'hello world';
      const result1 = simpleChecksum(input);
      const result2 = simpleChecksum(input);

      expect(result1).toBe(result2);
    });

    it('should return different hashes for different inputs', () => {
      const result1 = simpleChecksum('hello');
      const result2 = simpleChecksum('world');

      expect(result1).not.toBe(result2);
    });

    it('should return a number', () => {
      const result = simpleChecksum('test');
      expect(typeof result).toBe('number');
    });

    it('should return a 32-bit integer', () => {
      const result = simpleChecksum('some long string that might overflow');
      expect(Number.isInteger(result)).toBe(true);
      expect(result).toBeGreaterThanOrEqual(-2147483648);
      expect(result).toBeLessThanOrEqual(2147483647);
    });
  });

  describe('collision resistance', () => {
    it('should have different hashes for similar strings', () => {
      const result1 = simpleChecksum('hello');
      const result2 = simpleChecksum('hallo');
      const result3 = simpleChecksum('helloo');

      expect(result1).not.toBe(result2);
      expect(result1).not.toBe(result3);
      expect(result2).not.toBe(result3);
    });

    it('should differentiate single character changes', () => {
      const result1 = simpleChecksum('abc');
      const result2 = simpleChecksum('abd');
      const result3 = simpleChecksum('aac');

      expect(result1).not.toBe(result2);
      expect(result1).not.toBe(result3);
    });

    it('should differentiate by case', () => {
      const result1 = simpleChecksum('Hello');
      const result2 = simpleChecksum('hello');
      const result3 = simpleChecksum('HELLO');

      expect(result1).not.toBe(result2);
      expect(result1).not.toBe(result3);
      expect(result2).not.toBe(result3);
    });

    it('should differentiate strings with different lengths', () => {
      const result1 = simpleChecksum('a');
      const result2 = simpleChecksum('aa');
      const result3 = simpleChecksum('aaa');

      expect(result1).not.toBe(result2);
      expect(result2).not.toBe(result3);
    });
  });

  describe('unicode support', () => {
    it('should handle unicode characters', () => {
      const result = simpleChecksum('日本語');
      expect(typeof result).toBe('number');
      expect(Number.isInteger(result)).toBe(true);
    });

    it('should differentiate unicode strings', () => {
      const result1 = simpleChecksum('日本語');
      const result2 = simpleChecksum('中国語');

      expect(result1).not.toBe(result2);
    });

    it('should handle emoji', () => {
      const result1 = simpleChecksum('👋🌍');
      const result2 = simpleChecksum('👋🌎');

      expect(typeof result1).toBe('number');
      expect(result1).not.toBe(result2);
    });

    it('should handle mixed ASCII and unicode', () => {
      const result = simpleChecksum('hello 世界 👋');
      expect(typeof result).toBe('number');
      expect(Number.isInteger(result)).toBe(true);
    });
  });

  describe('special characters', () => {
    it('should handle whitespace characters', () => {
      const result1 = simpleChecksum(' ');
      const result2 = simpleChecksum('\t');
      const result3 = simpleChecksum('\n');
      const result4 = simpleChecksum('\r\n');

      expect(result1).not.toBe(result2);
      expect(result2).not.toBe(result3);
      expect(result3).not.toBe(result4);
    });

    it('should differentiate whitespace positions', () => {
      const result1 = simpleChecksum('a b');
      const result2 = simpleChecksum('ab ');
      const result3 = simpleChecksum(' ab');

      expect(result1).not.toBe(result2);
      expect(result1).not.toBe(result3);
      expect(result2).not.toBe(result3);
    });

    it('should handle null character', () => {
      const result = simpleChecksum('\0');
      expect(typeof result).toBe('number');
    });

    it('should handle control characters', () => {
      const result = simpleChecksum('\x01\x02\x03');
      expect(typeof result).toBe('number');
    });
  });

  describe('determinism', () => {
    it('should be deterministic across multiple calls', () => {
      const input = 'deterministic test string';
      const results = Array(100).fill(null).map(() => simpleChecksum(input));

      expect(new Set(results).size).toBe(1); // All results should be the same
    });

    it('should produce same hash for equivalent strings', () => {
      const str1 = 'test';
      const str2 = 't' + 'e' + 's' + 't';
      const str3 = String.fromCharCode(116, 101, 115, 116);

      expect(simpleChecksum(str1)).toBe(simpleChecksum(str2));
      expect(simpleChecksum(str2)).toBe(simpleChecksum(str3));
    });
  });

  describe('performance characteristics', () => {
    it('should handle very long strings', () => {
      const longString = 'x'.repeat(100000);
      const result = simpleChecksum(longString);

      expect(typeof result).toBe('number');
      expect(Number.isInteger(result)).toBe(true);
    });

    it('should handle strings with repeating patterns', () => {
      const result1 = simpleChecksum('abcabcabcabc');
      const result2 = simpleChecksum('abcabcabcabcd');

      expect(result1).not.toBe(result2);
    });
  });

  describe('edge cases', () => {
    it('should handle single character', () => {
      const result = simpleChecksum('a');
      expect(typeof result).toBe('number');
    });

    it('should handle string with only spaces', () => {
      const result1 = simpleChecksum(' ');
      const result2 = simpleChecksum('  ');
      const result3 = simpleChecksum('   ');

      expect(result1).not.toBe(result2);
      expect(result2).not.toBe(result3);
    });

    it('should handle multiline strings', () => {
      const result = simpleChecksum('line1\nline2\nline3');
      expect(typeof result).toBe('number');
    });

    it('should handle strings with numbers', () => {
      const result1 = simpleChecksum('123');
      const result2 = simpleChecksum('124');

      expect(result1).not.toBe(result2);
    });

    it('should differentiate order of characters', () => {
      const result1 = simpleChecksum('abc');
      const result2 = simpleChecksum('cba');
      const result3 = simpleChecksum('bac');

      expect(result1).not.toBe(result2);
      expect(result1).not.toBe(result3);
      expect(result2).not.toBe(result3);
    });
  });

  describe('practical use cases', () => {
    it('should verify content integrity', () => {
      const originalContent = 'The quick brown fox jumps over the lazy dog';
      const originalChecksum = simpleChecksum(originalContent);

      // Same content should have same checksum
      expect(simpleChecksum(originalContent)).toBe(originalChecksum);

      // Modified content should have different checksum
      const modifiedContent = 'The quick brown fox jumps over the lazy cat';
      expect(simpleChecksum(modifiedContent)).not.toBe(originalChecksum);
    });

    it('should work for code content', () => {
      const code = `
function hello() {
  console.log('Hello, World!');
}
`;
      const result = simpleChecksum(code);
      expect(typeof result).toBe('number');

      // Slight modification should change checksum
      const modifiedCode = code.replace('Hello', 'Hi');
      expect(simpleChecksum(modifiedCode)).not.toBe(result);
    });

    it('should work for JSON content', () => {
      const json1 = JSON.stringify({ name: 'test', value: 123 });
      const json2 = JSON.stringify({ name: 'test', value: 124 });

      expect(simpleChecksum(json1)).not.toBe(simpleChecksum(json2));
    });
  });
});
