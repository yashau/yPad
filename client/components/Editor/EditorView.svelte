<script lang="ts">
  import { Textarea } from '../../lib/components/ui/textarea/index.js';
  import RemoteCursor from '../../lib/components/RemoteCursor.svelte';
  import LineNumbers from './LineNumbers.svelte';
  import type { RemoteCursorData } from '../../lib/hooks/useCollaboration.svelte';

  interface Props {
    content: string;
    syntaxHighlight: string;
    highlightedHtml: string;
    editorRef?: HTMLDivElement | null;
    textareaScrollRef?: HTMLTextAreaElement | null;
    lineNumbersRef?: HTMLDivElement | null;
    isLoading: boolean;
    viewMode: boolean;
    remoteCursors: Map<string, RemoteCursorData>;
    isRealtimeEnabled: boolean;
    isEncrypted: boolean;
    isUpdating: boolean;
    onInput: (getContent: () => string, event?: InputEvent) => void;
  }

  let {
    content = $bindable(),
    syntaxHighlight,
    highlightedHtml,
    editorRef = $bindable(),
    textareaScrollRef = $bindable(),
    lineNumbersRef = $bindable(),
    isLoading,
    viewMode,
    remoteCursors,
    isRealtimeEnabled,
    isEncrypted,
    isUpdating,
    onInput
  }: Props = $props();

  // Container width for calculating line wrapping
  let containerWidth = $state(0);
  let measureDiv: HTMLDivElement | null = $state(null);
  let lineInfo = $state<Array<{lineNumber: number, visualLineCount: number}>>([{lineNumber: 1, visualLineCount: 1}]);

  // Measure container width on resize
  $effect(() => {
    if (!textareaScrollRef) return;

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        containerWidth = entry.contentRect.width;
      }
    });

    resizeObserver.observe(textareaScrollRef);
    return () => resizeObserver.disconnect();
  });

  // Calculate visual line count for each logical line
  function calculateVisualLineCount(text: string): number {
    if (!measureDiv || containerWidth <= 0) return 1;
    if (text === '') return 1;

    // Set the text in the measure div
    measureDiv.textContent = text;

    // Get the height of the rendered text
    const height = measureDiv.offsetHeight;
    const lineHeight = 24; // 1.5rem = 24px (leading-6)

    return Math.max(1, Math.round(height / lineHeight));
  }

  // Recalculate line info when content, containerWidth, or measureDiv changes
  $effect(() => {
    // Access dependencies
    const currentContent = content;
    const currentWidth = containerWidth;
    const currentMeasureDiv = measureDiv;
    const currentSyntax = syntaxHighlight;

    const lines = currentContent.split('\n');

    // For syntax highlighted mode (no wrapping), each line is 1 visual line
    if (currentSyntax !== 'plaintext') {
      lineInfo = lines.map((_, i) => ({
        lineNumber: i + 1,
        visualLineCount: 1
      }));
      return;
    }

    // For plaintext with wrapping, calculate visual lines
    if (!currentMeasureDiv || currentWidth <= 0) {
      lineInfo = lines.map((_, i) => ({
        lineNumber: i + 1,
        visualLineCount: 1
      }));
      return;
    }

    lineInfo = lines.map((line, i) => ({
      lineNumber: i + 1,
      visualLineCount: calculateVisualLineCount(line)
    }));
  });

  // Sync textarea value when content changes from parent (e.g., server updates)
  $effect(() => {
    if (textareaScrollRef && textareaScrollRef.value !== content) {
      // Save cursor position BEFORE changing value - browser may reset it when value changes
      const cursorStart = textareaScrollRef.selectionStart;
      const cursorEnd = textareaScrollRef.selectionEnd;
      const scrollTop = textareaScrollRef.scrollTop;

      textareaScrollRef.value = content;

      // Only restore cursor if NOT in the middle of applying a remote operation.
      // When isUpdating is true, the WebSocket handler will restore cursor
      // using Yjs relative positions for correct tracking.
      if (!isUpdating) {
        // Clamp cursor position to valid range
        const newCursorStart = Math.min(cursorStart, content.length);
        const newCursorEnd = Math.min(cursorEnd, content.length);
        textareaScrollRef.selectionStart = newCursorStart;
        textareaScrollRef.selectionEnd = newCursorEnd;
      }
      textareaScrollRef.scrollTop = scrollTop;
    }
  });

  function handleInput(event: Event) {
    if (syntaxHighlight === 'plaintext' && textareaScrollRef) {
      onInput(() => textareaScrollRef!.value, event as InputEvent);
    }
  }

  function handleContentEditableInput(event: Event) {
    if (editorRef) {
      onInput(() => editorRef!.textContent || '', event as InputEvent);
    }
  }

  // Set up scroll listener on the scrolling element (textarea or contenteditable)
  $effect(() => {
    const scrollElement = syntaxHighlight === 'plaintext' ? textareaScrollRef : editorRef;
    if (!scrollElement) return;

    function handleScroll(e: Event) {
      // Sync immediately without RAF to eliminate visual lag
      if (lineNumbersRef) {
        lineNumbersRef.scrollTop = (e.target as HTMLElement).scrollTop;
      }
    }

    scrollElement.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      scrollElement.removeEventListener('scroll', handleScroll);
    };
  });
</script>

<main class="flex-1 overflow-hidden flex">
  <LineNumbers {lineInfo} bind:lineNumbersRef />

  <div class="flex-1 overflow-auto relative">
    <!-- Hidden div for measuring text wrapping -->
    <div
      bind:this={measureDiv}
      class="font-mono text-base md:text-sm leading-6 whitespace-pre-wrap break-words overflow-hidden"
      style="width: {containerWidth}px; position: absolute; visibility: hidden; top: 0; left: 0; padding: 0;"
      aria-hidden="true"
    ></div>
    {#if syntaxHighlight === 'plaintext'}
      <Textarea
        bind:ref={textareaScrollRef}
        value={content}
        class="w-full h-full p-4 pl-3 pb-8 resize-none border-0 rounded-none font-mono text-base md:text-sm leading-6 shadow-none focus-visible:ring-0"
        placeholder="Start typing..."
        disabled={isLoading}
        readonly={viewMode}
        spellcheck={false}
        oninput={handleInput}
      />
    {:else}
      <div
        bind:this={editorRef}
        contenteditable={!isLoading && !viewMode}
        oninput={handleContentEditableInput}
        class="w-full h-full p-4 pl-3 pb-8 font-mono text-base md:text-sm leading-6 outline-none whitespace-pre overflow-auto bg-transparent"
        spellcheck={false}
      >{@html highlightedHtml}</div>
    {/if}

    <!-- Remote cursors -->
    {#if isRealtimeEnabled && !isEncrypted}
      {#each Array.from(remoteCursors.entries()) as [remoteClientId, cursorData] (remoteClientId)}
        <RemoteCursor
          position={cursorData.position}
          editorRef={(syntaxHighlight === 'plaintext' ? textareaScrollRef : editorRef) || null}
          color={cursorData.color}
          label={cursorData.label}
        />
      {/each}
    {/if}
  </div>
</main>
