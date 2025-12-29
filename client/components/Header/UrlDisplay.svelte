<script lang="ts">
  import Copy from '@lucide/svelte/icons/copy';
  import Pencil from '@lucide/svelte/icons/pencil';
  import Navigation from '@lucide/svelte/icons/navigation';
  import ArrowRight from '@lucide/svelte/icons/arrow-right';
  import Check from '@lucide/svelte/icons/check';
  import { Button } from '../../lib/components/ui/button/index.js';

  interface Props {
    noteId: string;
    content: string;
    syntaxHighlight: string;
    password?: string;
    maxViews?: number;
    expiresIn?: string;
    viewMode: boolean;
    onCustomUrlSet?: (newNoteId: string) => void;
  }

  let { noteId, content, syntaxHighlight, password, maxViews, expiresIn, viewMode, onCustomUrlSet }: Props = $props();

  let showCopiedTooltip = $state(false);
  let showErrorTooltip = $state(false);
  let errorMessage = $state('');
  let isEditing = $state(false);
  let editValue = $state('');
  let inputElement = $state<HTMLInputElement>();

  function getDisplayUrl(): { domain: string; noteId: string } {
    const url = window.location.href;
    const urlObj = new URL(url);
    const domain = urlObj.host;
    return { domain, noteId };
  }

  async function copyFullUrl() {
    const fullUrl = window.location.href;
    try {
      await navigator.clipboard.writeText(fullUrl);
      showCopiedTooltip = true;
      setTimeout(() => {
        showCopiedTooltip = false;
      }, 2000);
    } catch (err) {
      console.error('Failed to copy URL:', err);
    }
  }

  function startEditing() {
    if (!isEditing) {
      editValue = noteId || '';
      isEditing = true;
      setTimeout(() => {
        inputElement?.focus();
      }, 0);
    }
  }

  async function handleCustomUrlChange(e?: Event) {
    e?.preventDefault();
    e?.stopPropagation();

    if (!editValue || !editValue.trim()) {
      isEditing = false;
      return;
    }

    const newCustomUrl = editValue.trim();

    // Check if URL is available
    try {
      const checkResponse = await fetch(`/api/check/${encodeURIComponent(newCustomUrl)}`);
      const checkData = await checkResponse.json() as { available: boolean };

      if (!checkData.available) {
        errorMessage = 'URL is already taken';
        showErrorTooltip = true;
        setTimeout(() => {
          showErrorTooltip = false;
        }, 2000);
        isEditing = false;
        return;
      }
    } catch (err) {
      console.error('Failed to check URL:', err);
      errorMessage = 'Failed to check URL availability';
      showErrorTooltip = true;
      setTimeout(() => {
        showErrorTooltip = false;
      }, 2000);
      isEditing = false;
      return;
    }

    // Create new note with custom URL
    try {
      const payload: any = {
        id: newCustomUrl,
        content: content,
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

      // Instead of full page reload, update URL and notify parent
      window.history.pushState({}, '', `/${data.id}`);
      onCustomUrlSet?.(data.id);

      isEditing = false;
    } catch (err) {
      console.error('Failed to set custom URL:', err);
      errorMessage = 'Failed to set custom URL';
      showErrorTooltip = true;
      setTimeout(() => {
        showErrorTooltip = false;
      }, 2000);
      isEditing = false;
    }
  }

  function handleNavigate(e?: Event) {
    e?.preventDefault();
    e?.stopPropagation();
    if (editValue && editValue.trim()) {
      window.location.href = `/${editValue}`;
    }
    isEditing = false;
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter') {
      if (noteId) {
        handleCustomUrlChange();
      } else {
        handleNavigate();
      }
    } else if (e.key === 'Escape') {
      isEditing = false;
    }
  }

  function handleBlur() {
    setTimeout(() => {
      isEditing = false;
    }, 150);
  }
</script>

{#if !viewMode}
  <div class="relative inline-flex items-center leading-none">
    {#if noteId}
      {@const { domain, noteId: displayNoteId } = getDisplayUrl()}
      <div class="inline-flex items-stretch bg-muted/30 rounded-md">
      <div
        class="inline-flex items-center text-sm hover:bg-accent px-3 py-2 rounded-l-md transition-colors {isEditing ? '' : 'cursor-pointer'} group"
        onclick={isEditing ? undefined : copyFullUrl}
        role={isEditing ? undefined : 'button'}
        title={isEditing ? '' : 'Click to copy full URL'}
      >
        <span class="text-foreground/50">{domain}/</span>
        {#if isEditing}
          <input
            bind:this={inputElement}
            bind:value={editValue}
            onkeydown={handleKeydown}
            onblur={handleBlur}
            placeholder="custom-url"
            style="width: {Math.max(editValue.length || 10, displayNoteId.length + 2)}ch; max-width: 30ch;"
            class="font-bold text-foreground text-sm bg-transparent outline-none placeholder:text-muted-foreground max-sm:!w-[6ch]"
          />
        {:else}
          <span class="font-bold text-foreground">{displayNoteId}</span>
          <Copy class="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors ml-1" />
        {/if}
      </div>
      <Button
        onclick={isEditing ? handleCustomUrlChange : startEditing}
        variant="ghost"
        class="!rounded-l-none h-auto min-h-full w-9 border-l border-border bg-muted/50 hover:bg-muted dark:bg-input/50 dark:hover:bg-input"
        title={isEditing ? "Save custom URL" : "Edit custom URL"}
      >
        {#if isEditing}
          <Check class="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors" />
        {:else}
          <Pencil class="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors" />
        {/if}
      </Button>
    </div>
    {#if showCopiedTooltip}
      <div class="absolute top-full mt-1 left-1/2 -translate-x-1/2 bg-foreground text-background text-xs px-2 py-1 rounded whitespace-nowrap z-50">
        Copied!
      </div>
    {/if}
    {#if showErrorTooltip}
      <div class="absolute top-full mt-1 left-1/2 -translate-x-1/2 bg-destructive text-destructive-foreground text-xs px-2 py-1 rounded whitespace-nowrap z-50">
        {errorMessage}
      </div>
    {/if}
  {:else}
    <div class="inline-flex items-center bg-muted/30 rounded-md transition-colors {isEditing ? 'bg-accent' : 'hover:bg-accent group/container'}">
      <div class="inline-flex items-center text-sm px-3 py-2 w-[7.5rem] {isEditing ? '' : 'cursor-pointer'}"
           onclick={isEditing ? undefined : startEditing}
           role={isEditing ? undefined : 'button'}
           title={isEditing ? '' : 'Go to a note'}>
        {#if isEditing}
          <input
            bind:this={inputElement}
            bind:value={editValue}
            onkeydown={handleKeydown}
            onblur={handleBlur}
            placeholder="note-id"
            class="w-full text-sm bg-transparent outline-none placeholder:text-muted-foreground"
          />
        {:else}
          <span class="text-foreground/50">Go to a note</span>
        {/if}
      </div>
      <Button
        onclick={isEditing ? handleNavigate : startEditing}
        variant="ghost"
        class="!rounded-l-none h-auto min-h-full w-9 border-l border-border bg-muted/50 hover:bg-muted dark:bg-input/50 dark:hover:bg-input"
        title={isEditing ? "Navigate" : "Go to a note"}
      >
        {#if isEditing}
          <ArrowRight class="w-4 h-4" />
        {:else}
          <Navigation class="w-4 h-4" />
        {/if}
      </Button>
    </div>
    {/if}
  </div>
{/if}
