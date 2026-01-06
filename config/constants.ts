/**
 * @fileoverview Application configuration constants.
 *
 * Centralized configuration for timing, limits, and security settings.
 */

/** Timing constants (milliseconds). */
export const TIMINGS = {
  /** Wait time after initial load before enabling auto-save */
  INITIAL_LOAD_DELAY: 1000,

  /** Delay before attempting WebSocket reconnection */
  RECONNECT_DELAY: 2000,

  /** Throttle interval for cursor position updates */
  CURSOR_THROTTLE: 50,

  /** Batching delay for operation aggregation */
  OPERATION_BATCH: 50,

  /** Auto-save debounce interval */
  SAVE_DEBOUNCE: 1000,

  /** Durable Object database write debounce interval */
  PERSISTENCE_DEBOUNCE: 5000,

  /** WebSocket gap detection timeout */
  GAP_DETECTION_TIMEOUT: 5000,
} as const;

/** Validation limits and constraints. */
export const LIMITS = {
  /** Maximum content size in bytes (1MB) */
  MAX_CONTENT_SIZE: 1024 * 1024,

  /** Maximum custom note ID length */
  MAX_ID_LENGTH: 100,

  /** Maximum number of views allowed */
  MAX_VIEWS: 1000000,

  /** Minimum number of views */
  MIN_VIEWS: 1,

  /** Maximum expiration time in milliseconds (1 year) */
  MAX_EXPIRATION: 365 * 24 * 60 * 60 * 1000,

  /** Minimum expiration time in milliseconds (1 minute) */
  MIN_EXPIRATION: 60000,

  /** PBKDF2 iterations for password hashing */
  PBKDF2_ITERATIONS: 100000,

  /** Number of operations before forcing persistence */
  PERSISTENCE_OPERATION_THRESHOLD: 50,

  /** Number of days before an inactive note is deleted (default: 90 days) */
  INACTIVE_NOTE_EXPIRY_DAYS: 90,
} as const;

/** Expiration time options for notes. */
export const EXPIRATION_OPTIONS = [
  { value: 'null', label: 'Never' },
  { value: String(60 * 60 * 1000), label: '1 hour' },
  { value: String(24 * 60 * 60 * 1000), label: '1 day' },
  { value: String(7 * 24 * 60 * 60 * 1000), label: '1 week' },
  { value: String(30 * 24 * 60 * 60 * 1000), label: '1 month' }
] as const;

/** Custom ID validation pattern (letters, numbers, hyphens, underscores). */
export const CUSTOM_ID_PATTERN = /^[a-zA-Z0-9_-]+$/;

/** Contact information. */
export const CONTACT = {
  /** Email address for abuse reports */
  ABUSE_EMAIL: 'abuse@example.com',
} as const;

/** Security headers configuration. */
export const SECURITY_HEADERS = {
  CONTENT_SECURITY_POLICY:
    "default-src 'self'; " +
    "script-src 'self' 'unsafe-inline' 'unsafe-eval'; " +
    "style-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com; " +
    "img-src 'self' data: https:; " +
    "font-src 'self' data:; " +
    "connect-src 'self' wss: ws:;",

  X_CONTENT_TYPE_OPTIONS: 'nosniff',
  X_FRAME_OPTIONS: 'DENY',
  REFERRER_POLICY: 'strict-origin-when-cross-origin',
} as const;

/** Editor limit configuration for scaling. */
export const EDITOR_LIMITS = {
  /** Maximum concurrent active editors per note */
  MAX_ACTIVE_EDITORS: 10,
  /** Time in ms before an idle editor is considered inactive */
  ACTIVE_TIMEOUT_MS: 60_000,
} as const;

/** Default language for syntax highlighting (non-lazy loaded for immediate display). */
export const DEFAULT_LANGUAGE = { value: 'plaintext', label: 'Plain Text' } as const;

/** Rate limiting configuration. */
export const RATE_LIMITS = {
  /** REST API limits (per session) */
  API: {
    /** Max note creations per minute */
    CREATE_PER_MINUTE: 10,
    /** Max note reads per minute */
    READ_PER_MINUTE: 60,
    /** Max note updates per minute */
    UPDATE_PER_MINUTE: 30,
    /** Max note deletions per minute */
    DELETE_PER_MINUTE: 20,
    /** Max WebSocket upgrade requests per minute */
    WS_UPGRADE_PER_MINUTE: 30,
  },

  /**
   * WebSocket Yjs update limits (per connection).
   * With client-side batching (50ms), updates are sent ~20 times/second max.
   * These limits allow for normal typing with burst capacity for pastes.
   */
  WEBSOCKET: {
    /** Max Yjs updates per second (with 50ms batching, max is ~20/sec) */
    OPS_PER_SECOND: 25,
    /** Burst allowance for paste operations and rapid editing */
    BURST_ALLOWANCE: 100,
    /** Max message size in bytes (Yjs updates can be larger than OT ops) */
    MAX_MESSAGE_SIZE: 131072, // 128KB
  },

  /** Penalty settings */
  PENALTY: {
    /** Disconnect after N violations */
    DISCONNECT_THRESHOLD: 10,
    /** Warning message to send on rate limit */
    WARNING_MESSAGE: 'Rate limit exceeded. Please slow down.',
  },
} as const;
