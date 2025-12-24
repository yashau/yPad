<script lang="ts">
  import { onMount } from 'svelte';
  import { Button } from './lib/components/ui/button/index.js';
  import { Input } from './lib/components/ui/input/index.js';
  import * as Select from './lib/components/ui/select/index.js';
  import * as Command from './lib/components/ui/command/index.js';
  import * as Popover from './lib/components/ui/popover/index.js';
  import { Textarea } from './lib/components/ui/textarea/index.js';
  import * as Dialog from './lib/components/ui/dialog/index.js';
  import ThemeToggle from './lib/components/ui/ThemeToggle.svelte';
  import Check from '@lucide/svelte/icons/check';
  import ChevronsUpDown from '@lucide/svelte/icons/chevrons-up-down';
  import Lock from '@lucide/svelte/icons/lock';
  import LockOpen from '@lucide/svelte/icons/lock-open';
  import { tick } from 'svelte';
  import hljs from 'highlight.js';
  import { WebSocketClient } from './lib/realtime/WebSocketClient';
  import { generateOperations } from './lib/realtime/OperationGenerator';
  import { applyOperation } from '../src/ot/apply';
  import { transformCursorPosition } from '../src/ot/transform';
  import type { Operation } from '../src/ot/types';
  import { encryptContent, decryptContent } from './lib/crypto';

  // State with runes
  let content = $state('');
  let noteId = $state('');
  let syntaxHighlight = $state('plaintext');
  let password = $state('');
  let passwordToSet = $state(''); // Password input for setting protection
  let maxViews = $state<number | null>(null);
  let expiresIn = $state<string>('null');
  let isLoading = $state(false);
  let saveStatus = $state('');
  let showOptions = $state(false);
  let showPasswordDialog = $state(false);
  let showCustomUrlDialog = $state(false);
  let showConflictDialog = $state(false);
  let customUrl = $state('');
  let customUrlAvailable = $state(true);
  let passwordInput = $state('');
  let passwordRequired = $state(false);
  let viewMode = $state(false);
  let highlightedContent = $state('');
  let hasPassword = $state(false); // Track if note is password protected
  let isEncrypted = $state(false); // Track if note content is encrypted

  // Session and version tracking
  let sessionId = $state('');
  let currentVersion = $state(1);
  let isInitialLoad = $state(false);

  // WebSocket real-time collaboration
  let wsClient = $state<WebSocketClient | null>(null);
  let isRealtimeEnabled = $state(false);
  let connectionStatus = $state<'connected' | 'disconnected' | 'connecting'>('disconnected');
  let clientId = $state('');
  let lastLocalContent = $state('');

  // Track pending local changes during WebSocket connection/sync
  let pendingLocalContent = $state<string | null>(null);
  let isSyncing = $state(false);

  // Auto-save timeout
  let saveTimeout: ReturnType<typeof setTimeout> | null = null;

  // ContentEditable ref for syntax highlighting
  let editorRef = $state<HTMLDivElement | null>(null);
  let lineNumbersRef = $state<HTMLDivElement | null>(null);
  let textareaScrollRef = $state<HTMLTextAreaElement | null>(null);
  let isUpdating = false;

  // Combobox state
  let comboboxOpen = $state(false);
  let comboboxTriggerRef = $state<HTMLButtonElement | null>(null);

  // Helper function to extract text content from contenteditable element
  function getEditorTextContent(): string {
    if (!editorRef) return '';

    // Use textContent instead of innerText to preserve exact whitespace
    // textContent maintains all spaces and newlines exactly as they are
    return editorRef.textContent || '';
  }

  // Handle contenteditable input
  function handleInput(event: Event) {
    if (editorRef && !isUpdating) {
      const newContent = getEditorTextContent();

      // If we're syncing, save the content as pending instead of sending operations
      if (isSyncing) {
        pendingLocalContent = newContent;
        content = newContent;
        return;
      }

      // Send operation via WebSocket if connected
      if (wsClient && isRealtimeEnabled && !viewMode) {
        const oldContent = lastLocalContent;
        const operations = generateOperations(oldContent, newContent, clientId, currentVersion);
        operations.forEach(op => {
          wsClient!.sendOperation(op, currentVersion);
          // Optimistically increment version for next operation
          currentVersion++;
        });
      }

      content = newContent;
      lastLocalContent = newContent;
    }
  }

  // Handle textarea input (plaintext mode)
  function handleTextareaInput(event: Event) {
    if (textareaScrollRef && !isUpdating) {
      const newContent = textareaScrollRef.value;

      // If we're syncing, save the content as pending instead of sending operations
      if (isSyncing) {
        pendingLocalContent = newContent;
        content = newContent;
        return;
      }

      // Send operation via WebSocket if connected
      if (wsClient && isRealtimeEnabled && !viewMode) {
        const oldContent = lastLocalContent;
        // Generate operations - they don't have versions yet, server will assign them
        const operations = generateOperations(oldContent, newContent, clientId, currentVersion);
        operations.forEach(op => {
          wsClient!.sendOperation(op, currentVersion);
          // Optimistically increment version for next operation
          currentVersion++;
        });
      }

      content = newContent;
      lastLocalContent = newContent;
    }
  }

  // Sync line numbers scroll with editor
  function handleEditorScroll(event: Event) {
    const target = event.target as HTMLElement;
    if (lineNumbersRef) {
      lineNumbersRef.scrollTop = target.scrollTop;
    }
  }

  // Update highlighted content when syntaxHighlight changes or content changes
  $effect(() => {
    if (editorRef && syntaxHighlight !== 'plaintext' && !isUpdating) {
      isUpdating = true;

      // Save cursor position
      const selection = window.getSelection();
      let cursorPos = 0;
      const hadFocus = document.activeElement === editorRef;

      if (selection && selection.rangeCount > 0 && hadFocus) {
        cursorPos = getCurrentCursorPosition();
      }

      // Update HTML
      editorRef.innerHTML = highlightedHtml || '';

      // Restore cursor position
      if (hadFocus) {
        const textContentStr = getEditorTextContent();
        const newCursorPos = Math.min(cursorPos, textContentStr.length);

        const walker = document.createTreeWalker(editorRef, NodeFilter.SHOW_TEXT);
        let charCount = 0;
        let targetNode: Node | null = null;
        let targetOffset = 0;

        while (walker.nextNode()) {
          const node = walker.currentNode;
          const nodeLength = node.textContent?.length || 0;

          if (charCount + nodeLength >= newCursorPos) {
            targetNode = node;
            targetOffset = newCursorPos - charCount;
            break;
          }
          charCount += nodeLength;
        }

        if (targetNode && selection) {
          const newRange = document.createRange();
          newRange.setStart(targetNode, targetOffset);
          newRange.collapse(true);
          selection.removeAllRanges();
          selection.addRange(newRange);
        }
      }

      isUpdating = false;
    }
  });

  const languageOptions = [
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
  ];

  const expirationOptions = [
    { value: 'null', label: 'Never' },
    { value: String(60 * 60 * 1000), label: '1 hour' },
    { value: String(24 * 60 * 60 * 1000), label: '1 day' },
    { value: String(7 * 24 * 60 * 60 * 1000), label: '1 week' },
    { value: String(30 * 24 * 60 * 60 * 1000), label: '1 month' }
  ];

  // Derived state using $derived
  const highlightedHtml = $derived.by(() => {
    if (syntaxHighlight === 'plaintext' || !content) {
      return content;
    }
    try {
      return hljs.highlight(content, { language: syntaxHighlight }).value;
    } catch {
      return content;
    }
  });

  const lineNumbers = $derived.by(() => {
    const lines = content.split('\n');
    return lines.length;
  });

  const syntaxHighlightLabel = $derived(
    languageOptions.find((opt) => opt.value === syntaxHighlight)?.label ?? "Select language"
  );

  const expiresInLabel = $derived(
    expirationOptions.find((opt) => opt.value === expiresIn)?.label ?? "Select expiration"
  );

  function closeAndFocusTrigger() {
    comboboxOpen = false;
    tick().then(() => comboboxTriggerRef?.focus());
  }

  onMount(() => {
    // Initialize or retrieve session ID (persists across refreshes, not tab close)
    const existingSessionId = sessionStorage.getItem('paste-session-id');
    if (existingSessionId) {
      sessionId = existingSessionId;
    } else {
      sessionId = crypto.randomUUID();
      sessionStorage.setItem('paste-session-id', sessionId);
    }

    // Initialize client ID for real-time collaboration
    clientId = crypto.randomUUID();

    const path = window.location.pathname;
    if (path !== '/' && path.length > 1) {
      noteId = path.substring(1);
      loadNote();
    }
  });

  // Auto-save effect
  $effect(() => {
    // React to changes in content or syntaxHighlight
    content;
    syntaxHighlight;

    // Don't auto-save during initial load to prevent spurious PUT requests
    if (isInitialLoad) {
      return;
    }

    // Don't auto-save during sync to prevent version conflicts
    if (isSyncing) {
      return;
    }

    // Only HTTP auto-save if WebSocket not connected
    // When WebSocket is connected, the Durable Object handles persistence
    // Also trigger for new notes (when noteId is empty) to create them
    if (content && !viewMode && !isRealtimeEnabled) {
      if (saveTimeout) {
        clearTimeout(saveTimeout);
      }
      saveTimeout = setTimeout(() => {
        saveNote();
      }, 500);
    }
  });

  async function loadNote() {
    isLoading = true;
    isInitialLoad = true;
    try {
      const url = `/api/notes/${noteId}${passwordInput ? `?password=${encodeURIComponent(passwordInput)}` : ''}`;
      const response = await fetch(url);

      if (response.status === 401) {
        passwordRequired = true;
        showPasswordDialog = true;
        isLoading = false;
        isInitialLoad = false;
        return;
      }

      if (!response.ok) {
        const error = await response.json() as { error?: string };
        alert(error.error || 'Failed to load note');
        window.history.pushState({}, '', '/');
        noteId = '';
        isLoading = false;
        isInitialLoad = false;
        return;
      }

      const data = await response.json() as { content: string; syntax_highlight: string; version: number; has_password: boolean; is_encrypted: boolean };

      // Track password protection status
      hasPassword = data.has_password || false;
      isEncrypted = data.is_encrypted || false;

      // Store the password if this note is password-protected
      // (needed for future operations like removing protection)
      if (hasPassword && passwordInput) {
        password = passwordInput;
      }

      // Decrypt content if it's encrypted
      if (isEncrypted && passwordInput) {
        try {
          content = await decryptContent(data.content, passwordInput);
        } catch (error) {
          console.error('Failed to decrypt content:', error);
          alert('Failed to decrypt note. Invalid password or corrupted data.');
          window.history.pushState({}, '', '/');
          noteId = '';
          isLoading = false;
          isInitialLoad = false;
          return;
        }
      } else {
        content = data.content;
      }

      lastLocalContent = content;
      syntaxHighlight = data.syntax_highlight || 'plaintext';
      currentVersion = data.version || 1;
      viewMode = false;
      passwordRequired = false;
      showPasswordDialog = false;

      // Connect to WebSocket for real-time collaboration
      connectWebSocket();

      // Allow auto-save to work after a short delay (after WebSocket connects)
      setTimeout(() => {
        isInitialLoad = false;
      }, 1000);
    } catch (error) {
      console.error('Failed to load note:', error);
      alert('Failed to load note');
      isInitialLoad = false;
    } finally {
      isLoading = false;
    }
  }

  function connectWebSocket() {
    if (!noteId || wsClient) return;

    connectionStatus = 'connecting';
    // Mark that we're starting sync - this prevents losing content during connection
    isSyncing = true;
    // Capture current content as pending in case user is still typing
    if (content && content !== lastLocalContent) {
      pendingLocalContent = content;
    }

    try {
      wsClient = new WebSocketClient(noteId, {
        password: passwordInput,
        sessionId: sessionId,
        autoReconnect: false, // Handle reconnection manually
        onOpen: () => {
          isRealtimeEnabled = true;
          connectionStatus = 'connected';
          saveStatus = 'Real-time sync active';
        },
        onOperation: (operation) => {
          applyRemoteOperation(operation);
        },
        onClose: () => {
          isRealtimeEnabled = false;
          connectionStatus = 'disconnected';
          saveStatus = 'Disconnected';
          wsClient = null;

          // Attempt to reconnect after a brief delay (handles server reloads)
          // This will trigger onSync which will update our version to match server
          setTimeout(() => {
            if (noteId && !wsClient) {
              connectWebSocket();
            }
          }, 2000);
        },
        onError: (error) => {
          console.error('[App] WebSocket error:', error);
          connectionStatus = 'disconnected';
        },
        onSync: (syncContent, version, operations) => {
          // Update to the server's version
          currentVersion = version;

          // If we have pending local content (user typed during sync), preserve it
          if (pendingLocalContent !== null && pendingLocalContent !== syncContent) {
            // Generate operations from sync content to pending content
            const ops = generateOperations(syncContent, pendingLocalContent, clientId, currentVersion);

            // Send the operations to sync server with our local changes
            ops.forEach(op => {
              if (wsClient) {
                wsClient.sendOperation(op, currentVersion);
                currentVersion++;
              }
            });

            // Keep the local content that user typed
            isUpdating = true;
            content = pendingLocalContent;
            lastLocalContent = pendingLocalContent;
            isUpdating = false;

            pendingLocalContent = null;
          } else if (syncContent !== content) {
            // No pending changes, just sync with server
            isUpdating = true;
            content = syncContent;
            lastLocalContent = syncContent;
            isUpdating = false;
          }

          // Mark sync as complete
          isSyncing = false;
        },
        onAck: (version) => {
          // Update our version when server acknowledges our operation
          currentVersion = version;
        },
        onNoteDeleted: () => {
          // Note was deleted, close the connection and don't reconnect
          if (wsClient) {
            wsClient.close();
            wsClient = null;
          }
          isRealtimeEnabled = false;
          connectionStatus = 'disconnected';
        }
      });
    } catch (error) {
      console.error('[App] Failed to create WebSocket client:', error);
      connectionStatus = 'disconnected';
      // Clear syncing flag on error
      isSyncing = false;
      pendingLocalContent = null;
    }
  }

  function applyRemoteOperation(operation: Operation) {
    // Prevent input loop
    isUpdating = true;

    try {
      // Save current cursor position
      const selection = window.getSelection();
      let cursorPos = getCurrentCursorPosition();

      // Transform cursor based on operation
      cursorPos = transformCursorPosition(cursorPos, operation);

      // Apply operation to content
      content = applyOperation(content, operation);
      lastLocalContent = content;

      // Update version to match the remote operation
      if (operation.version > currentVersion) {
        currentVersion = operation.version;
      }

      // Restore transformed cursor position
      restoreCursorPosition(cursorPos);
    } finally {
      isUpdating = false;
    }
  }

  function getCurrentCursorPosition(): number {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) {
      return 0;
    }

    const range = selection.getRangeAt(0);
    const activeElement = document.activeElement;

    if (activeElement === editorRef && editorRef) {
      // ContentEditable mode - calculate position using textContent
      // Walk through text nodes and count characters up to the cursor
      const walker = document.createTreeWalker(editorRef, NodeFilter.SHOW_TEXT);
      let charCount = 0;
      let node: Node | null = null;

      while ((node = walker.nextNode())) {
        if (node === range.startContainer) {
          charCount += range.startOffset;
          break;
        }

        const nodeLength = node.textContent?.length || 0;
        charCount += nodeLength;
      }

      return charCount;
    } else if (activeElement === textareaScrollRef && textareaScrollRef) {
      // Textarea mode
      return textareaScrollRef.selectionStart;
    }

    return 0;
  }

  function restoreCursorPosition(cursorPos: number) {
    const selection = window.getSelection();
    const activeElement = document.activeElement;

    if (activeElement === editorRef && editorRef && selection) {
      // ContentEditable mode - use tree walker
      const textContentStr = getEditorTextContent();
      const newCursorPos = Math.min(cursorPos, textContentStr.length);

      const walker = document.createTreeWalker(editorRef, NodeFilter.SHOW_TEXT);
      let charCount = 0;
      let targetNode: Node | null = null;
      let targetOffset = 0;

      while (walker.nextNode()) {
        const node = walker.currentNode;
        const nodeLength = node.textContent?.length || 0;

        if (charCount + nodeLength >= newCursorPos) {
          targetNode = node;
          targetOffset = newCursorPos - charCount;
          break;
        }
        charCount += nodeLength;
      }

      if (targetNode) {
        const newRange = document.createRange();
        newRange.setStart(targetNode, targetOffset);
        newRange.collapse(true);
        selection.removeAllRanges();
        selection.addRange(newRange);
      }
    } else if (activeElement === textareaScrollRef && textareaScrollRef) {
      // Textarea mode - simple selection
      const newCursorPos = Math.min(cursorPos, textareaScrollRef.value.length);
      textareaScrollRef.setSelectionRange(newCursorPos, newCursorPos);
    }
  }

  async function saveNote() {
    if (!content.trim()) return;

    saveStatus = 'Saving...';
    try {
      // Encrypt content if password is set
      let contentToSave = content;
      let shouldEncrypt = false;

      if (password && password.trim()) {
        try {
          contentToSave = await encryptContent(content, password);
          shouldEncrypt = true;
        } catch (error) {
          console.error('Failed to encrypt content:', error);
          saveStatus = 'Encryption failed';
          return;
        }
      }

      const payload: any = {
        content: contentToSave,
        syntax_highlight: syntaxHighlight || 'plaintext',
        is_encrypted: shouldEncrypt
      };

      if (password) {
        payload.password = password;
      }

      if (maxViews) {
        payload.max_views = maxViews;
      }

      if (expiresIn && expiresIn !== 'null') {
        payload.expires_in = parseInt(expiresIn);
      }

      if (noteId) {
        // Update existing note with version tracking
        payload.session_id = sessionId;
        payload.expected_version = currentVersion;

        const response = await fetch(`/api/notes/${noteId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        if (response.status === 409) {
          // Conflict detected
          saveStatus = 'Conflict!';
          showConflictDialog = true;
          return;
        }

        if (response.status === 404) {
          // Note was deleted - silently ignore the save attempt
          saveStatus = '';
          return;
        }

        if (!response.ok) {
          throw new Error('Failed to update note');
        }

        const data = await response.json() as { version: number };
        currentVersion = data.version;
      } else {
        // Create new note
        const response = await fetch('/api/notes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        if (!response.ok) {
          throw new Error('Failed to create note');
        }

        const data = await response.json() as { id: string; version: number };
        noteId = data.id;
        currentVersion = data.version || 1;
        window.history.pushState({}, '', `/${noteId}`);

        // Small delay before connecting WebSocket to ensure database write completes
        // and Durable Object can initialize with the saved content
        setTimeout(() => {
          connectWebSocket();
        }, 100);
      }

      saveStatus = 'Saved';
      setTimeout(() => {
        saveStatus = '';
      }, 2000);
    } catch (error) {
      console.error('Failed to save note:', error);
      saveStatus = 'Failed to save';
    }
  }

  async function checkCustomUrl() {
    if (!customUrl.trim()) {
      customUrlAvailable = false;
      return;
    }

    try {
      const response = await fetch(`/api/check/${encodeURIComponent(customUrl)}`);
      const data = await response.json() as { available: boolean };
      customUrlAvailable = data.available;
    } catch (error) {
      console.error('Failed to check URL:', error);
      customUrlAvailable = false;
    }
  }

  async function setCustomUrl() {
    if (!customUrlAvailable || !customUrl.trim()) return;

    try {
      // Save the note with custom ID
      const payload: any = {
        id: customUrl,
        content,
        syntax_highlight: syntaxHighlight || 'plaintext'
      };

      if (password) {
        payload.password = password;
      }

      if (maxViews) {
        payload.max_views = maxViews;
      }

      if (expiresIn && expiresIn !== 'null') {
        payload.expires_in = parseInt(expiresIn);
      }

      const response = await fetch('/api/notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        throw new Error('Failed to set custom URL');
      }

      const data = await response.json() as { id: string };
      noteId = data.id;
      window.history.pushState({}, '', `/${noteId}`);
      showCustomUrlDialog = false;
      customUrl = '';

      // Connect to WebSocket for real-time collaboration on newly created note
      connectWebSocket();
    } catch (error) {
      console.error('Failed to set custom URL:', error);
      alert('Failed to set custom URL');
    }
  }

  function submitPassword() {
    loadNote();
  }

  async function setPasswordProtection() {
    if (!passwordToSet.trim()) {
      alert('Please enter a password');
      return;
    }

    password = passwordToSet;
    hasPassword = true;
    isEncrypted = true;

    // Trigger a save to apply password protection
    await saveNote();

    passwordToSet = '';
    alert('Password protection enabled! Your note is now encrypted.');
  }

  async function removePasswordProtection() {
    if (!confirm('Remove password protection? This will decrypt and save your note.')) {
      return;
    }

    // Store the current password to authorize the update
    const currentPassword = password;

    // Clear password protection flags
    password = '';
    passwordToSet = '';
    hasPassword = false;
    isEncrypted = false;

    // Trigger a save with the old password for authorization, but new flags to remove protection
    saveStatus = 'Saving...';
    try {
      const payload: any = {
        content: content, // Save unencrypted content
        syntax_highlight: syntaxHighlight || 'plaintext',
        is_encrypted: false,
        password: currentPassword, // Send current password for authorization
        session_id: sessionId,
        expected_version: currentVersion
      };

      if (maxViews) {
        payload.max_views = maxViews;
      }

      if (expiresIn && expiresIn !== 'null') {
        payload.expires_in = parseInt(expiresIn);
      }

      const response = await fetch(`/api/notes/${noteId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (response.status === 409) {
        saveStatus = 'Conflict!';
        showConflictDialog = true;
        return;
      }

      if (!response.ok) {
        throw new Error('Failed to remove password protection');
      }

      const data = await response.json() as { version: number };
      currentVersion = data.version;

      saveStatus = 'Saved';
      setTimeout(() => {
        saveStatus = '';
      }, 2000);
    } catch (error) {
      console.error('Failed to remove password protection:', error);
      saveStatus = 'Failed to save';
      // Restore password protection state on error
      password = currentPassword;
      hasPassword = true;
      isEncrypted = true;
    }
  }

  function newNote() {
    content = '';
    noteId = '';
    password = '';
    passwordToSet = '';
    maxViews = null;
    expiresIn = 'null';
    syntaxHighlight = 'plaintext';
    viewMode = false;
    passwordRequired = false;
    hasPassword = false;
    isEncrypted = false;
    window.history.pushState({}, '', '/');
  }

  function handleConflictReload() {
    showConflictDialog = false;
    location.reload();
  }

  async function deleteNote() {
    if (!noteId) return;

    if (!confirm('Are you sure you want to delete this note? This action cannot be undone.')) {
      return;
    }

    try {
      // Cancel any pending auto-save to prevent race condition
      if (saveTimeout) {
        clearTimeout(saveTimeout);
        saveTimeout = null;
      }

      // Close WebSocket connection before deleting
      if (wsClient) {
        wsClient.close();
        wsClient = null;
      }
      isRealtimeEnabled = false;
      connectionStatus = 'disconnected';

      const response = await fetch(`/api/notes/${noteId}`, {
        method: 'DELETE'
      });

      if (!response.ok) {
        throw new Error('Failed to delete note');
      }

      // Clear the note and redirect to home
      newNote();
    } catch (error) {
      console.error('Failed to delete note:', error);
      alert('Failed to delete note');
    }
  }
</script>

<div class="h-full flex flex-col">
  <!-- Header -->
  <header class="border-b border-border bg-card p-4">
    <div class="max-w-7xl mx-auto flex items-center justify-between">
      <div class="flex items-center gap-4">
        <h1 class="text-2xl font-bold">yPad</h1>
        {#if saveStatus}
          <span class="text-sm text-muted-foreground">{saveStatus}</span>
        {/if}
      </div>
      <div class="flex items-center gap-2">
        {#if hasPassword}
          <div class="flex items-center gap-1 px-3 py-1.5 bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-200 rounded-md text-sm border border-green-300 dark:border-green-700">
            <Lock class="h-3.5 w-3.5" />
            <span>Protected</span>
          </div>
        {/if}
        {#if noteId}
          <Button variant="outline" onclick={newNote}>New</Button>
          <Button variant="destructive" onclick={deleteNote}>Delete</Button>
        {/if}
        <Button variant="outline" onclick={() => showOptions = !showOptions}>
          Options
        </Button>
        {#if !viewMode}
          <Button onclick={() => showCustomUrlDialog = true}>
            Custom URL
          </Button>
        {/if}
        <ThemeToggle />
      </div>
    </div>

    {#if showOptions}
      <div class="max-w-7xl mx-auto mt-4 p-4 border border-border rounded-lg bg-background">
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <label for="syntax-highlight" class="block text-sm font-medium mb-2">Syntax Highlighting</label>
            <Popover.Root bind:open={comboboxOpen}>
              <Popover.Trigger
                bind:ref={comboboxTriggerRef}
                class="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                disabled={viewMode}
              >
                {syntaxHighlightLabel}
                <ChevronsUpDown class="ml-2 h-4 w-4 shrink-0 opacity-50" />
              </Popover.Trigger>
              <Popover.Content class="w-[--bits-popover-trigger-width] p-0">
                <Command.Root shouldFilter={true}>
                  <Command.Input placeholder="Search language..." />
                  <Command.List>
                    <Command.Empty>No language found.</Command.Empty>
                    <Command.Group>
                      {#each languageOptions as lang}
                        <Command.Item
                          value={lang.label}
                          keywords={[lang.value, lang.label]}
                          onSelect={() => {
                            syntaxHighlight = lang.value;
                            closeAndFocusTrigger();
                          }}
                        >
                          <Check class={syntaxHighlight === lang.value ? "mr-2 h-4 w-4 opacity-100" : "mr-2 h-4 w-4 opacity-0"} />
                          {lang.label}
                        </Command.Item>
                      {/each}
                    </Command.Group>
                  </Command.List>
                </Command.Root>
              </Popover.Content>
            </Popover.Root>
          </div>
          <div>
            <label for="password" class="block text-sm font-medium mb-2">Password Protection</label>
            <div class="flex items-center gap-2">
              <div class="relative flex-1">
                <Input
                  id="password"
                  type="password"
                  bind:value={passwordToSet}
                  placeholder={hasPassword ? "Protected" : "Enter password"}
                  disabled={viewMode || hasPassword}
                  class="pr-10"
                  onkeydown={(e) => {
                    if (e.key === 'Enter' && !hasPassword && passwordToSet.trim()) {
                      setPasswordProtection();
                    }
                  }}
                />
                <button
                  onclick={hasPassword ? removePasswordProtection : setPasswordProtection}
                  disabled={viewMode || (!hasPassword && !passwordToSet.trim())}
                  class="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-md transition-all hover:bg-accent disabled:opacity-50 disabled:cursor-not-allowed {hasPassword ? 'text-green-600 dark:text-green-400' : 'text-muted-foreground hover:text-foreground'}"
                  title={hasPassword ? "Click to remove password protection" : "Click to set password protection"}
                  type="button"
                >
                  {#if hasPassword}
                    <Lock class="h-4 w-4" />
                  {:else}
                    <LockOpen class="h-4 w-4" />
                  {/if}
                </button>
              </div>
            </div>
          </div>
          <div>
            <label for="max-views" class="block text-sm font-medium mb-2">Max Views</label>
            <Input
              id="max-views"
              type="number"
              bind:value={maxViews}
              placeholder="Unlimited"
              disabled={viewMode}
            />
          </div>
          <div>
            <label for="expires-in" class="block text-sm font-medium mb-2">Expires In</label>
            <Select.Root bind:value={expiresIn} disabled={viewMode} type="single">
              <Select.Trigger class="w-full">
                {expiresInLabel}
              </Select.Trigger>
              <Select.Content>
                {#each expirationOptions as option}
                  <Select.Item value={option.value} label={option.label}>
                    {option.label}
                  </Select.Item>
                {/each}
              </Select.Content>
            </Select.Root>
          </div>
        </div>
      </div>
    {/if}
  </header>

  <!-- Main content area -->
  <main class="flex-1 overflow-hidden flex">
    <div
      bind:this={lineNumbersRef}
      class="flex-shrink-0 bg-muted text-muted-foreground p-4 pr-2 font-mono text-sm select-none overflow-hidden border-r border-border min-w-[3.5rem] text-right"
    >
      {#each Array(lineNumbers) as _, i}
        <div class="leading-6">{i + 1}</div>
      {/each}
    </div>
    <div class="flex-1 overflow-auto">
      {#if syntaxHighlight === 'plaintext'}
        <Textarea
          bind:ref={textareaScrollRef}
          bind:value={content}
          class="w-full h-full p-4 pl-3 pb-8 resize-none border-0 rounded-none font-mono text-sm leading-6 shadow-none focus-visible:ring-0"
          placeholder="Start typing..."
          disabled={isLoading || viewMode}
          spellcheck={false}
          onscroll={handleEditorScroll}
          oninput={handleTextareaInput}
        />
      {:else}
        <div
          bind:this={editorRef}
          contenteditable={!isLoading && !viewMode}
          oninput={handleInput}
          onscroll={handleEditorScroll}
          class="w-full h-full p-4 pl-3 pb-8 font-mono text-sm leading-6 outline-none whitespace-pre overflow-auto"
          spellcheck={false}
        ></div>
      {/if}
    </div>
  </main>
</div>

<!-- Password Dialog -->
<Dialog.Root bind:open={showPasswordDialog}>
  <Dialog.Portal>
    <Dialog.Overlay />
    <Dialog.Content>
      <Dialog.Header>
        <Dialog.Title>Password Required</Dialog.Title>
        <Dialog.Description>This note is password protected.</Dialog.Description>
      </Dialog.Header>
      <Input
        type="password"
        bind:value={passwordInput}
        placeholder="Enter password"
        class="mb-4"
        onkeydown={(e) => {
          if (e.key === 'Enter') submitPassword();
        }}
      />
      <Dialog.Footer>
        <Button variant="outline" onclick={() => {
          showPasswordDialog = false;
          window.history.pushState({}, '', '/');
          noteId = '';
        }}>
          Cancel
        </Button>
        <Button onclick={submitPassword}>Submit</Button>
      </Dialog.Footer>
    </Dialog.Content>
  </Dialog.Portal>
</Dialog.Root>

<!-- Custom URL Dialog -->
<Dialog.Root bind:open={showCustomUrlDialog}>
  <Dialog.Portal>
    <Dialog.Overlay />
    <Dialog.Content>
      <Dialog.Header>
        <Dialog.Title>Set Custom URL</Dialog.Title>
        <Dialog.Description>Choose a custom URL for your note.</Dialog.Description>
      </Dialog.Header>
      <Input
        bind:value={customUrl}
        placeholder="my-custom-url"
        class="mb-2"
        oninput={checkCustomUrl}
      />
      {#if customUrl && !customUrlAvailable}
        <p class="text-sm text-destructive mb-4">This URL is already taken</p>
      {:else if customUrl && customUrlAvailable}
        <p class="text-sm text-green-600 mb-4">This URL is available</p>
      {/if}
      <Dialog.Footer class="mt-4">
        <Button variant="outline" onclick={() => {
          showCustomUrlDialog = false;
          customUrl = '';
        }}>
          Cancel
        </Button>
        <Button onclick={setCustomUrl} disabled={!customUrlAvailable || !customUrl}>
          Set URL
        </Button>
      </Dialog.Footer>
    </Dialog.Content>
  </Dialog.Portal>
</Dialog.Root>

<!-- Conflict Dialog -->
<Dialog.Root bind:open={showConflictDialog}>
  <Dialog.Portal>
    <Dialog.Overlay />
    <Dialog.Content>
      <Dialog.Header>
        <Dialog.Title>Edit Conflict Detected</Dialog.Title>
        <Dialog.Description>
          Someone else has edited this paste while you were working on it. Your unsaved changes cannot be saved automatically.
        </Dialog.Description>
      </Dialog.Header>
      <p class="text-sm text-muted-foreground mb-4">
        To see the latest version, you'll need to reload the page. Your current unsaved changes will be lost.
      </p>
      <Dialog.Footer class="mt-4">
        <Button variant="outline" onclick={() => showConflictDialog = false}>
          Keep Editing
        </Button>
        <Button onclick={handleConflictReload}>
          Reload Page
        </Button>
      </Dialog.Footer>
    </Dialog.Content>
  </Dialog.Portal>
</Dialog.Root>

<style>
  :global(.hljs) {
    background: transparent !important;
  }
</style>
