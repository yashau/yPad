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
    onInput: (getContent: () => string) => void;
    onScroll: (event: Event) => void;
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
    onInput,
    onScroll
  }: Props = $props();

  const lineNumbers = $derived.by(() => {
    const lines = content.split('\n');
    return lines.length;
  });

  function handleInput(event: Event) {
    if (syntaxHighlight === 'plaintext' && textareaScrollRef) {
      onInput(() => textareaScrollRef!.value);
    }
  }

  function handleContentEditableInput(event: Event) {
    if (editorRef) {
      onInput(() => editorRef!.textContent || '');
    }
  }
</script>

<main class="flex-1 overflow-hidden flex">
  <LineNumbers lineCount={lineNumbers} bind:lineNumbersRef />

  <div class="flex-1 overflow-auto relative">
    {#if syntaxHighlight === 'plaintext'}
      <Textarea
        bind:ref={textareaScrollRef}
        bind:value={content}
        class="w-full h-full p-4 pl-3 pb-8 resize-none border-0 rounded-none font-mono text-sm leading-6 shadow-none focus-visible:ring-0"
        placeholder="Start typing..."
        disabled={isLoading || viewMode}
        spellcheck={false}
        onscroll={onScroll}
        oninput={handleInput}
      />
    {:else}
      <div
        bind:this={editorRef}
        contenteditable={!isLoading && !viewMode}
        oninput={handleContentEditableInput}
        onscroll={onScroll}
        class="w-full h-full p-4 pl-3 pb-8 font-mono text-sm leading-6 outline-none whitespace-pre overflow-auto"
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

<style>
  :global(.hljs) {
    background: transparent !important;
  }
</style>
