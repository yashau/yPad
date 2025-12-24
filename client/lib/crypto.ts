// Client-side encryption utilities for password-protected notes

/**
 * Derives an encryption key from a password using PBKDF2
 */
async function deriveKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const passwordKey = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveKey']
  );

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt,
      iterations: 100000,
      hash: 'SHA-256'
    },
    passwordKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * Encrypts content with a password
 * Returns base64-encoded encrypted data with salt and IV prepended
 */
export async function encryptContent(content: string, password: string): Promise<string> {
  const encoder = new TextEncoder();

  // Generate random salt and IV
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));

  // Derive encryption key from password
  const key = await deriveKey(password, salt);

  // Encrypt content
  const encryptedData = await crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv
    },
    key,
    encoder.encode(content)
  );

  // Combine salt + IV + encrypted data
  const combined = new Uint8Array(salt.length + iv.length + encryptedData.byteLength);
  combined.set(salt, 0);
  combined.set(iv, salt.length);
  combined.set(new Uint8Array(encryptedData), salt.length + iv.length);

  // Convert to base64
  return btoa(String.fromCharCode(...combined));
}

/**
 * Decrypts content with a password
 * Expects base64-encoded encrypted data with salt and IV prepended
 */
export async function decryptContent(encryptedBase64: string, password: string): Promise<string> {
  const decoder = new TextDecoder();

  // Decode from base64
  const combined = Uint8Array.from(atob(encryptedBase64), c => c.charCodeAt(0));

  // Extract salt, IV, and encrypted data
  const salt = combined.slice(0, 16);
  const iv = combined.slice(16, 28);
  const encryptedData = combined.slice(28);

  // Derive decryption key from password
  const key = await deriveKey(password, salt);

  // Decrypt content
  try {
    const decryptedData = await crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv
      },
      key,
      encryptedData
    );

    return decoder.decode(decryptedData);
  } catch (error) {
    throw new Error('Failed to decrypt: invalid password or corrupted data');
  }
}

/**
 * Hashes a password using SHA-256 for server-side verification
 */
export async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}
