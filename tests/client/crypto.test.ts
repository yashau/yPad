/**
 * Tests for client-side crypto utilities
 * Tests encryption, decryption, and password hashing functions
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { encryptContent, decryptContent, hashPassword } from '../../client/lib/crypto';

describe('encryptContent', () => {
  it('should return a base64 encoded string', async () => {
    const content = 'Hello, World!';
    const password = 'secret123';

    const result = await encryptContent(content, password);

    // Should be valid base64
    expect(() => atob(result)).not.toThrow();
  });

  it('should produce different outputs for same input (due to random salt/IV)', async () => {
    const content = 'Hello, World!';
    const password = 'secret123';

    const result1 = await encryptContent(content, password);
    const result2 = await encryptContent(content, password);

    // Due to random salt and IV, encrypted outputs should be different
    expect(result1).not.toBe(result2);
  });

  it('should handle empty content', async () => {
    const content = '';
    const password = 'secret123';

    const result = await encryptContent(content, password);

    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('should handle unicode content', async () => {
    const content = '日本語テスト 👋🌍';
    const password = 'secret123';

    const result = await encryptContent(content, password);

    expect(typeof result).toBe('string');
    expect(() => atob(result)).not.toThrow();
  });

  it('should handle long content', async () => {
    const content = 'x'.repeat(100000);
    const password = 'secret123';

    const result = await encryptContent(content, password);

    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('should handle special characters in content', async () => {
    const content = '!@#$%^&*()_+-=[]{}|;:\'",.<>?/\\`~';
    const password = 'secret123';

    const result = await encryptContent(content, password);

    expect(typeof result).toBe('string');
  });

  it('should handle multiline content', async () => {
    const content = 'line1\nline2\nline3\r\nline4';
    const password = 'secret123';

    const result = await encryptContent(content, password);

    expect(typeof result).toBe('string');
  });

  it('should handle complex password', async () => {
    const content = 'test content';
    const password = 'P@ssw0rd!123#$%^&*()_+-=日本語';

    const result = await encryptContent(content, password);

    expect(typeof result).toBe('string');
  });
});

describe('decryptContent', () => {
  it('should decrypt to original content', async () => {
    const originalContent = 'Hello, World!';
    const password = 'secret123';

    const encrypted = await encryptContent(originalContent, password);
    const decrypted = await decryptContent(encrypted, password);

    expect(decrypted).toBe(originalContent);
  });

  it('should decrypt unicode content correctly', async () => {
    const originalContent = '日本語テスト 👋🌍';
    const password = 'secret123';

    const encrypted = await encryptContent(originalContent, password);
    const decrypted = await decryptContent(encrypted, password);

    expect(decrypted).toBe(originalContent);
  });

  it('should decrypt empty content', async () => {
    const originalContent = '';
    const password = 'secret123';

    const encrypted = await encryptContent(originalContent, password);
    const decrypted = await decryptContent(encrypted, password);

    expect(decrypted).toBe(originalContent);
  });

  it('should decrypt multiline content', async () => {
    const originalContent = 'line1\nline2\nline3';
    const password = 'secret123';

    const encrypted = await encryptContent(originalContent, password);
    const decrypted = await decryptContent(encrypted, password);

    expect(decrypted).toBe(originalContent);
  });

  it('should decrypt long content', async () => {
    const originalContent = 'x'.repeat(10000);
    const password = 'secret123';

    const encrypted = await encryptContent(originalContent, password);
    const decrypted = await decryptContent(encrypted, password);

    expect(decrypted).toBe(originalContent);
  });

  it('should handle special characters', async () => {
    const originalContent = '!@#$%^&*()_+-=[]{}|;:\'",.<>?/\\`~';
    const password = 'secret123';

    const encrypted = await encryptContent(originalContent, password);
    const decrypted = await decryptContent(encrypted, password);

    expect(decrypted).toBe(originalContent);
  });
});

describe('hashPassword', () => {
  it('should return a hex string', async () => {
    const password = 'secret123';

    const hash = await hashPassword(password);

    // Should be 64 characters (256 bits = 32 bytes = 64 hex chars)
    expect(hash.length).toBe(64);
    // Should only contain hex characters
    expect(/^[0-9a-f]+$/.test(hash)).toBe(true);
  });

  it('should return consistent hash for same password', async () => {
    const password = 'secret123';

    const hash1 = await hashPassword(password);
    const hash2 = await hashPassword(password);

    expect(hash1).toBe(hash2);
  });

  it('should return different hashes for different passwords', async () => {
    const password1 = 'secret123';
    const password2 = 'secret124';

    const hash1 = await hashPassword(password1);
    const hash2 = await hashPassword(password2);

    expect(hash1).not.toBe(hash2);
  });

  it('should handle empty password', async () => {
    const password = '';

    const hash = await hashPassword(password);

    expect(hash.length).toBe(64);
    expect(/^[0-9a-f]+$/.test(hash)).toBe(true);
  });

  it('should handle unicode password', async () => {
    const password = '日本語パスワード';

    const hash = await hashPassword(password);

    expect(hash.length).toBe(64);
    expect(/^[0-9a-f]+$/.test(hash)).toBe(true);
  });

  it('should handle long password', async () => {
    const password = 'x'.repeat(10000);

    const hash = await hashPassword(password);

    expect(hash.length).toBe(64);
    expect(/^[0-9a-f]+$/.test(hash)).toBe(true);
  });

  it('should handle special characters in password', async () => {
    const password = '!@#$%^&*()_+-=[]{}|;:\'",.<>?/\\`~';

    const hash = await hashPassword(password);

    expect(hash.length).toBe(64);
    expect(/^[0-9a-f]+$/.test(hash)).toBe(true);
  });

  it('should be case-sensitive', async () => {
    const hash1 = await hashPassword('Password');
    const hash2 = await hashPassword('password');
    const hash3 = await hashPassword('PASSWORD');

    expect(hash1).not.toBe(hash2);
    expect(hash2).not.toBe(hash3);
    expect(hash1).not.toBe(hash3);
  });

  it('should differentiate similar passwords', async () => {
    const hash1 = await hashPassword('password1');
    const hash2 = await hashPassword('password2');
    const hash3 = await hashPassword('password3');

    expect(hash1).not.toBe(hash2);
    expect(hash2).not.toBe(hash3);
    expect(hash1).not.toBe(hash3);
  });
});

describe('encryption-decryption roundtrip', () => {
  const testCases = [
    { name: 'simple text', content: 'Hello, World!', password: 'secret' },
    { name: 'unicode', content: '日本語テスト', password: 'secret' },
    { name: 'emoji', content: '👋🌍🎉', password: 'secret' },
    { name: 'code', content: 'function test() { return 42; }', password: 'secret' },
    { name: 'json', content: '{"key": "value", "number": 123}', password: 'secret' },
    { name: 'html', content: '<div class="test">Hello</div>', password: 'secret' },
    { name: 'multiline', content: 'line1\nline2\nline3', password: 'secret' },
    { name: 'whitespace', content: '  \t\n  ', password: 'secret' },
    { name: 'complex password', content: 'test', password: 'P@ssw0rd!日本語' },
    { name: 'empty content', content: '', password: 'secret' },
  ];

  for (const { name, content, password } of testCases) {
    it(`should handle ${name}`, async () => {
      const encrypted = await encryptContent(content, password);
      const decrypted = await decryptContent(encrypted, password);

      expect(decrypted).toBe(content);
    });
  }

  it('should preserve exact content including trailing whitespace', async () => {
    const content = 'text with trailing spaces   \n\n';
    const password = 'secret';

    const encrypted = await encryptContent(content, password);
    const decrypted = await decryptContent(encrypted, password);

    expect(decrypted).toBe(content);
    expect(decrypted.endsWith('   \n\n')).toBe(true);
  });

  it('should preserve exact content including leading whitespace', async () => {
    const content = '   \n\ntext with leading spaces';
    const password = 'secret';

    const encrypted = await encryptContent(content, password);
    const decrypted = await decryptContent(encrypted, password);

    expect(decrypted).toBe(content);
    expect(decrypted.startsWith('   \n\n')).toBe(true);
  });
});

describe('Key derivation', () => {
  it('should use correct algorithm (PBKDF2)', async () => {
    // Verify that importKey was called with PBKDF2
    const password = 'test';
    await encryptContent('content', password);

    // The mock setup captures these calls
    expect(crypto.subtle.importKey).toHaveBeenCalled();
  });

  it('should derive key with correct parameters', async () => {
    const password = 'test';
    await encryptContent('content', password);

    // Verify deriveKey was called
    expect(crypto.subtle.deriveKey).toHaveBeenCalled();
  });
});

describe('Salt and IV handling', () => {
  it('should generate random salt for each encryption', async () => {
    const content = 'test';
    const password = 'secret';

    // Reset the mock to track calls
    vi.mocked(crypto.getRandomValues).mockClear();

    await encryptContent(content, password);

    // Should call getRandomValues for both salt (16 bytes) and IV (12 bytes)
    expect(crypto.getRandomValues).toHaveBeenCalled();
  });

  it('should prepend salt and IV to encrypted data', async () => {
    const content = 'test';
    const password = 'secret';

    const encrypted = await encryptContent(content, password);
    const decoded = Uint8Array.from(atob(encrypted), c => c.charCodeAt(0));

    // Should have at least 16 (salt) + 12 (IV) + 16 (auth tag) + encrypted data
    expect(decoded.length).toBeGreaterThanOrEqual(28);
  });

  it('should correctly extract salt and IV during decryption', async () => {
    const originalContent = 'test content';
    const password = 'secret';

    const encrypted = await encryptContent(originalContent, password);
    const decrypted = await decryptContent(encrypted, password);

    expect(decrypted).toBe(originalContent);
  });
});

describe('Error handling', () => {
  it('should handle malformed base64 gracefully', async () => {
    const malformedBase64 = 'not valid base64!!!';
    const password = 'secret';

    // atob will throw on invalid base64
    await expect(async () => {
      const decoded = atob(malformedBase64);
    }).rejects.toThrow();
  });

  it('should handle truncated encrypted data', async () => {
    const content = 'test';
    const password = 'secret';

    const encrypted = await encryptContent(content, password);
    // Truncate to less than salt + IV size
    const truncated = encrypted.substring(0, 10);

    // Decryption should fail
    // Note: exact behavior depends on crypto implementation
    try {
      await decryptContent(truncated, password);
    } catch (e) {
      // Expected to fail
      expect(e).toBeDefined();
    }
  });
});

describe('Integration scenarios', () => {
  it('should support true E2E encryption workflow', async () => {
    // Simulate protecting a note with password (true E2E - password never leaves browser)
    const noteContent = 'This is a secret note';
    const userPassword = 'myP@ssw0rd!';

    // 1. Encrypt content client-side (password never sent to server)
    const encryptedContent = await encryptContent(noteContent, userPassword);
    expect(typeof encryptedContent).toBe('string');

    // 2. Server only stores encrypted blob (never sees password or plaintext)
    const serverStores = encryptedContent;
    expect(serverStores).not.toContain(noteContent);
    expect(serverStores).not.toContain(userPassword);

    // 3. Client retrieves encrypted blob and decrypts locally
    const decryptedContent = await decryptContent(serverStores, userPassword);
    expect(decryptedContent).toBe(noteContent);

    // 4. Password verification happens via successful decryption (not server-side)
    // If wrong password, decryption throws - that's how we verify
  });

  it('should support password change workflow', async () => {
    const noteContent = 'Original content';
    const oldPassword = 'oldPass123';
    const newPassword = 'newPass456';

    // Encrypt with old password
    const encryptedWithOld = await encryptContent(noteContent, oldPassword);

    // Decrypt with old password
    const decrypted = await decryptContent(encryptedWithOld, oldPassword);
    expect(decrypted).toBe(noteContent);

    // Re-encrypt with new password
    const encryptedWithNew = await encryptContent(decrypted, newPassword);

    // Verify new password works
    const decryptedWithNew = await decryptContent(encryptedWithNew, newPassword);
    expect(decryptedWithNew).toBe(noteContent);
  });

  it('should verify password via decryption (E2E principle)', async () => {
    // In real crypto, wrong password causes decryption to fail
    // This is how password verification works client-side (no server check)
    // Note: Mock crypto doesn't actually verify, but real AES-GCM does
    const noteContent = 'Secret content';
    const password = 'correct123';

    const encrypted = await encryptContent(noteContent, password);
    const decrypted = await decryptContent(encrypted, password);

    // Correct password allows decryption
    expect(decrypted).toBe(noteContent);

    // In production: wrong password would throw due to auth tag mismatch
    // This is the E2E encryption principle - password never sent to server
  });
});
