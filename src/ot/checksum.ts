/**
 * @fileoverview Simple checksum for content verification in OT.
 *
 * Used to detect state divergence between client and server.
 * Not cryptographically secure - optimized for speed.
 */

/**
 * Computes a simple hash of a string for content verification.
 *
 * Uses djb2-style hashing: fast, deterministic, reasonable distribution.
 * Collisions are acceptable since this is only for detecting divergence,
 * not for security purposes.
 *
 * @param str - The string to hash
 * @returns A 32-bit integer hash
 */
export function simpleChecksum(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return hash;
}
