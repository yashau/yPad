/**
 * Application Configuration Constants
 *
 * Centralized configuration for timing, limits, and security settings
 * across the yPad application.
 */

/**
 * Timing constants for delays, throttles, and debounces (in milliseconds)
 */
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

/**
 * Validation limits and constraints
 */
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
} as const;

/**
 * Allowed syntax highlighting modes
 * This list should match the languageOptions in App.svelte
 */
export const ALLOWED_SYNTAX_MODES = [
  'plaintext', '1c', 'abnf', 'accesslog', 'actionscript', 'ada', 'angelscript', 'apache',
  'applescript', 'arcade', 'arduino', 'armasm', 'asciidoc', 'aspectj', 'autohotkey', 'autoit',
  'avrasm', 'awk', 'axapta', 'bash', 'basic', 'bnf', 'brainfuck', 'c', 'cal', 'capnproto',
  'ceylon', 'clean', 'clojure', 'clojure-repl', 'cmake', 'coffeescript', 'coq', 'cos', 'cpp',
  'crmsh', 'crystal', 'csharp', 'csp', 'css', 'd', 'dart', 'delphi', 'diff', 'django', 'dns',
  'dockerfile', 'dos', 'dsconfig', 'dts', 'dust', 'ebnf', 'elixir', 'elm', 'erb', 'erlang',
  'erlang-repl', 'excel', 'fix', 'flix', 'fortran', 'fsharp', 'gams', 'gauss', 'gcode', 'gherkin',
  'glsl', 'gml', 'go', 'golo', 'gradle', 'graphql', 'groovy', 'haml', 'handlebars', 'haskell',
  'haxe', 'hsp', 'htmlbars', 'http', 'hy', 'inform7', 'ini', 'irpf90', 'isbl', 'java', 'javascript',
  'jboss-cli', 'json', 'julia', 'julia-repl', 'kotlin', 'lasso', 'latex', 'ldif', 'leaf', 'less',
  'lisp', 'livecodeserver', 'livescript', 'llvm', 'lsl', 'lua', 'makefile', 'markdown', 'mathematica',
  'matlab', 'maxima', 'mel', 'mercury', 'mipsasm', 'mizar', 'mojolicious', 'monkey', 'moonscript',
  'n1ql', 'nginx', 'nim', 'nix', 'node-repl', 'nsis', 'objectivec', 'ocaml', 'openscad', 'oxygene',
  'parser3', 'perl', 'pf', 'pgsql', 'php', 'php-template', 'plaintext', 'pony', 'powershell',
  'processing', 'profile', 'prolog', 'properties', 'protobuf', 'puppet', 'purebasic', 'python',
  'python-repl', 'q', 'qml', 'r', 'reasonml', 'rib', 'roboconf', 'routeros', 'rsl', 'ruby',
  'ruleslanguage', 'rust', 'sas', 'scala', 'scheme', 'scilab', 'scss', 'shell', 'smali', 'smalltalk',
  'sml', 'sqf', 'sql', 'stan', 'stata', 'step21', 'stylus', 'subunit', 'swift', 'taggerscript',
  'tap', 'tcl', 'thrift', 'tp', 'twig', 'typescript', 'vala', 'vbnet', 'vbscript', 'vbscript-html',
  'verilog', 'vhdl', 'vim', 'x86asm', 'xl', 'xml', 'xquery', 'yaml', 'zephir'
] as const;

/**
 * Custom ID validation pattern
 * Allows only letters, numbers, hyphens, and underscores
 */
export const CUSTOM_ID_PATTERN = /^[a-zA-Z0-9_-]+$/;

/**
 * Security headers configuration
 */
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
