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

/** Language options for syntax highlighting. */
export const LANGUAGE_OPTIONS = [
  { value: 'plaintext', label: 'Plain Text' },
  { value: '1c', label: '1C' },
  { value: 'abnf', label: 'ABNF' },
  { value: 'accesslog', label: 'Access Log' },
  { value: 'actionscript', label: 'ActionScript' },
  { value: 'ada', label: 'Ada' },
  { value: 'angelscript', label: 'AngelScript' },
  { value: 'apache', label: 'Apache Config' },
  { value: 'applescript', label: 'AppleScript' },
  { value: 'arcade', label: 'Arcade' },
  { value: 'arduino', label: 'Arduino' },
  { value: 'armasm', label: 'ARM Assembly' },
  { value: 'asciidoc', label: 'AsciiDoc' },
  { value: 'aspectj', label: 'AspectJ' },
  { value: 'autohotkey', label: 'AutoHotkey' },
  { value: 'autoit', label: 'AutoIt' },
  { value: 'avrasm', label: 'AVR Assembly' },
  { value: 'awk', label: 'AWK' },
  { value: 'axapta', label: 'Axapta' },
  { value: 'bash', label: 'Bash' },
  { value: 'basic', label: 'BASIC' },
  { value: 'bnf', label: 'BNF' },
  { value: 'brainfuck', label: 'Brainfuck' },
  { value: 'c', label: 'C' },
  { value: 'cal', label: 'C/AL' },
  { value: 'capnproto', label: "Cap'n Proto" },
  { value: 'ceylon', label: 'Ceylon' },
  { value: 'clean', label: 'Clean' },
  { value: 'clojure', label: 'Clojure' },
  { value: 'clojure-repl', label: 'Clojure REPL' },
  { value: 'cmake', label: 'CMake' },
  { value: 'coffeescript', label: 'CoffeeScript' },
  { value: 'coq', label: 'Coq' },
  { value: 'cos', label: 'Caché ObjectScript' },
  { value: 'cpp', label: 'C++' },
  { value: 'crmsh', label: 'crmsh' },
  { value: 'crystal', label: 'Crystal' },
  { value: 'csharp', label: 'C#' },
  { value: 'csp', label: 'CSP' },
  { value: 'css', label: 'CSS' },
  { value: 'd', label: 'D' },
  { value: 'dart', label: 'Dart' },
  { value: 'delphi', label: 'Delphi' },
  { value: 'diff', label: 'Diff' },
  { value: 'django', label: 'Django' },
  { value: 'dns', label: 'DNS Zone' },
  { value: 'dockerfile', label: 'Dockerfile' },
  { value: 'dos', label: 'DOS' },
  { value: 'dsconfig', label: 'dsconfig' },
  { value: 'dts', label: 'Device Tree' },
  { value: 'dust', label: 'Dust' },
  { value: 'ebnf', label: 'EBNF' },
  { value: 'elixir', label: 'Elixir' },
  { value: 'elm', label: 'Elm' },
  { value: 'erb', label: 'ERB' },
  { value: 'erlang', label: 'Erlang' },
  { value: 'erlang-repl', label: 'Erlang REPL' },
  { value: 'excel', label: 'Excel' },
  { value: 'fix', label: 'FIX' },
  { value: 'flix', label: 'Flix' },
  { value: 'fortran', label: 'Fortran' },
  { value: 'fsharp', label: 'F#' },
  { value: 'gams', label: 'GAMS' },
  { value: 'gauss', label: 'GAUSS' },
  { value: 'gcode', label: 'G-code' },
  { value: 'gherkin', label: 'Gherkin' },
  { value: 'glsl', label: 'GLSL' },
  { value: 'gml', label: 'GML' },
  { value: 'go', label: 'Go' },
  { value: 'golo', label: 'Golo' },
  { value: 'gradle', label: 'Gradle' },
  { value: 'graphql', label: 'GraphQL' },
  { value: 'groovy', label: 'Groovy' },
  { value: 'haml', label: 'Haml' },
  { value: 'handlebars', label: 'Handlebars' },
  { value: 'haskell', label: 'Haskell' },
  { value: 'haxe', label: 'Haxe' },
  { value: 'hsp', label: 'HSP' },
  { value: 'http', label: 'HTTP' },
  { value: 'hy', label: 'Hy' },
  { value: 'inform7', label: 'Inform 7' },
  { value: 'ini', label: 'INI' },
  { value: 'irpf90', label: 'IRPF90' },
  { value: 'isbl', label: 'ISBL' },
  { value: 'java', label: 'Java' },
  { value: 'javascript', label: 'JavaScript' },
  { value: 'jboss-cli', label: 'JBoss CLI' },
  { value: 'json', label: 'JSON' },
  { value: 'julia', label: 'Julia' },
  { value: 'julia-repl', label: 'Julia REPL' },
  { value: 'kotlin', label: 'Kotlin' },
  { value: 'lasso', label: 'Lasso' },
  { value: 'latex', label: 'LaTeX' },
  { value: 'ldif', label: 'LDIF' },
  { value: 'leaf', label: 'Leaf' },
  { value: 'less', label: 'Less' },
  { value: 'lisp', label: 'Lisp' },
  { value: 'livecodeserver', label: 'LiveCode Server' },
  { value: 'livescript', label: 'LiveScript' },
  { value: 'llvm', label: 'LLVM IR' },
  { value: 'lsl', label: 'LSL' },
  { value: 'lua', label: 'Lua' },
  { value: 'makefile', label: 'Makefile' },
  { value: 'markdown', label: 'Markdown' },
  { value: 'mathematica', label: 'Mathematica' },
  { value: 'matlab', label: 'MATLAB' },
  { value: 'maxima', label: 'Maxima' },
  { value: 'mel', label: 'MEL' },
  { value: 'mercury', label: 'Mercury' },
  { value: 'mipsasm', label: 'MIPS Assembly' },
  { value: 'mizar', label: 'Mizar' },
  { value: 'mojolicious', label: 'Mojolicious' },
  { value: 'monkey', label: 'Monkey' },
  { value: 'moonscript', label: 'MoonScript' },
  { value: 'n1ql', label: 'N1QL' },
  { value: 'nestedtext', label: 'NestedText' },
  { value: 'nginx', label: 'Nginx' },
  { value: 'nim', label: 'Nim' },
  { value: 'nix', label: 'Nix' },
  { value: 'node-repl', label: 'Node.js REPL' },
  { value: 'nsis', label: 'NSIS' },
  { value: 'objectivec', label: 'Objective-C' },
  { value: 'ocaml', label: 'OCaml' },
  { value: 'openscad', label: 'OpenSCAD' },
  { value: 'oxygene', label: 'Oxygene' },
  { value: 'parser3', label: 'Parser3' },
  { value: 'perl', label: 'Perl' },
  { value: 'pf', label: 'PF' },
  { value: 'pgsql', label: 'PostgreSQL' },
  { value: 'php', label: 'PHP' },
  { value: 'php-template', label: 'PHP Template' },
  { value: 'pony', label: 'Pony' },
  { value: 'powershell', label: 'PowerShell' },
  { value: 'processing', label: 'Processing' },
  { value: 'profile', label: 'Python Profiler' },
  { value: 'prolog', label: 'Prolog' },
  { value: 'properties', label: 'Properties' },
  { value: 'protobuf', label: 'Protocol Buffers' },
  { value: 'puppet', label: 'Puppet' },
  { value: 'purebasic', label: 'PureBasic' },
  { value: 'python', label: 'Python' },
  { value: 'python-repl', label: 'Python REPL' },
  { value: 'q', label: 'Q' },
  { value: 'qml', label: 'QML' },
  { value: 'r', label: 'R' },
  { value: 'reasonml', label: 'ReasonML' },
  { value: 'rib', label: 'RenderMan RIB' },
  { value: 'roboconf', label: 'Roboconf' },
  { value: 'routeros', label: 'RouterOS' },
  { value: 'rsl', label: 'RSL' },
  { value: 'ruby', label: 'Ruby' },
  { value: 'ruleslanguage', label: 'Oracle Rules Language' },
  { value: 'rust', label: 'Rust' },
  { value: 'sas', label: 'SAS' },
  { value: 'scala', label: 'Scala' },
  { value: 'scheme', label: 'Scheme' },
  { value: 'scilab', label: 'Scilab' },
  { value: 'scss', label: 'SCSS' },
  { value: 'shell', label: 'Shell' },
  { value: 'smali', label: 'Smali' },
  { value: 'smalltalk', label: 'Smalltalk' },
  { value: 'sml', label: 'SML' },
  { value: 'sqf', label: 'SQF' },
  { value: 'sql', label: 'SQL' },
  { value: 'stan', label: 'Stan' },
  { value: 'stata', label: 'Stata' },
  { value: 'step21', label: 'STEP Part 21' },
  { value: 'stylus', label: 'Stylus' },
  { value: 'subunit', label: 'SubUnit' },
  { value: 'swift', label: 'Swift' },
  { value: 'taggerscript', label: 'Tagger Script' },
  { value: 'tap', label: 'TAP' },
  { value: 'tcl', label: 'Tcl' },
  { value: 'thrift', label: 'Thrift' },
  { value: 'tp', label: 'TP' },
  { value: 'twig', label: 'Twig' },
  { value: 'typescript', label: 'TypeScript' },
  { value: 'vala', label: 'Vala' },
  { value: 'vbnet', label: 'VB.NET' },
  { value: 'vbscript', label: 'VBScript' },
  { value: 'vbscript-html', label: 'VBScript (HTML)' },
  { value: 'verilog', label: 'Verilog' },
  { value: 'vhdl', label: 'VHDL' },
  { value: 'vim', label: 'Vim Script' },
  { value: 'wasm', label: 'WebAssembly' },
  { value: 'wren', label: 'Wren' },
  { value: 'x86asm', label: 'x86 Assembly' },
  { value: 'xl', label: 'XL' },
  { value: 'xml', label: 'XML' },
  { value: 'xquery', label: 'XQuery' },
  { value: 'yaml', label: 'YAML' },
  { value: 'zephir', label: 'Zephir' }
] as const;

/** Allowed syntax modes (derived from LANGUAGE_OPTIONS). */
export const ALLOWED_SYNTAX_MODES = LANGUAGE_OPTIONS.map(lang => lang.value);

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

  /** WebSocket operation limits (per connection) */
  WEBSOCKET: {
    /** Max operations per second (typing speed ceiling) */
    OPS_PER_SECOND: 30,
    /** Burst allowance for paste operations (supports ~5KB paste) */
    BURST_ALLOWANCE: 5000,
    /** Max message size in bytes */
    MAX_MESSAGE_SIZE: 65536, // 64KB
  },

  /** Penalty settings */
  PENALTY: {
    /** Disconnect after N violations */
    DISCONNECT_THRESHOLD: 5,
    /** Warning message to send on rate limit */
    WARNING_MESSAGE: 'Rate limit exceeded. Please slow down.',
  },
} as const;
