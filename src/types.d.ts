/**
 * @fileoverview Global type declarations for Cloudflare Workers environment.
 */

/// <reference types="@cloudflare/workers-types" />

export {};

declare global {
  /** Cloudflare Workers environment bindings. */
  interface Env {
    /** D1 SQLite database for note storage */
    DB: D1Database;
    /** Static asset serving */
    ASSETS: Fetcher;
    /** Durable Object namespace for WebSocket sessions */
    NOTE_SESSIONS: DurableObjectNamespace;
    /** Durable Object namespace for rate limiting */
    RATE_LIMITER: DurableObjectNamespace;
    /** Disable rate limiting for local development/testing */
    DISABLE_RATE_LIMITS?: string;
  }
}

/** Type declarations for fast-diff library. */
declare module 'fast-diff' {
  const INSERT = 1;
  const DELETE = -1;
  const EQUAL = 0;

  function diff(text1: string, text2: string): Array<[number, string]>;

  namespace diff {
    export { INSERT, DELETE, EQUAL };
  }

  export default diff;
}
