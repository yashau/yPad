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
        if (inputElement) {
          inputElement.focus();
          inputElement.setSelectionRange(editValue.length, editValue.length);
          inputElement.scrollLeft = inputElement.scrollWidth;
        }
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
    const oldNoteId = noteId;

    // If the URL hasn't changed, just cancel the operation
    if (newCustomUrl === noteId) {
      isEditing = false;
      return;
    }

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

      // Update URL and notify parent first
      window.history.pushState({}, '', `/${data.id}`);
      onCustomUrlSet?.(data.id);

      isEditing = false;

      // Delete the old note after navigating to the new one
      try {
        await fetch(`/api/notes/${encodeURIComponent(oldNoteId)}`, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: password ? JSON.stringify({ password }) : undefined
        });
      } catch (deleteErr) {
        console.error('Failed to delete old note:', deleteErr);
      }
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

  function extractNoteIdFromInput(input: string): string | null {
    const trimmed = input.trim();
    if (!trimmed) return null;

    const currentHost = window.location.host;

    // Check if it looks like a URL (has protocol or starts with hostname)
    if (trimmed.includes('/')) {
      let urlToCheck: string;

      // Add protocol if missing to parse as URL
      if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
        urlToCheck = trimmed;
      } else if (trimmed.includes('.')) {
        // Looks like a domain (e.g., "yp.pe/xxxx")
        urlToCheck = `https://${trimmed}`;
      } else {
        // Just a path or note ID with slash, treat as note ID
        return trimmed.replace(/^\/+|\/+$/g, '');
      }

      try {
        const url = new URL(urlToCheck);
        // Check if hostname matches current site
        if (url.host !== currentHost) {
          return null; // Different host, reject
        }
        // Extract path and remove leading/trailing slashes
        const noteId = url.pathname.replace(/^\/+|\/+$/g, '');
        return noteId || null;
      } catch {
        // Invalid URL, treat as note ID
        return trimmed;
      }
    }

    // No slash, treat as plain note ID
    return trimmed;
  }

  async function handleNavigate(e?: Event) {
    e?.preventDefault();
    e?.stopPropagation();

    const noteIdToNavigate = extractNoteIdFromInput(editValue);

    if (!noteIdToNavigate) {
      if (editValue.trim()) {
        errorMessage = 'Invalid note ID';
        showErrorTooltip = true;
        setTimeout(() => {
          showErrorTooltip = false;
        }, 2000);
      }
      isEditing = false;
      return;
    }

    // Check if note exists on server
    try {
      const checkResponse = await fetch(`/api/check/${encodeURIComponent(noteIdToNavigate)}`);
      const checkData = await checkResponse.json() as { available: boolean };

      if (checkData.available) {
        // available = true means note doesn't exist
        errorMessage = 'Invalid note ID';
        showErrorTooltip = true;
        setTimeout(() => {
          showErrorTooltip = false;
        }, 2000);
        isEditing = false;
        return;
      }

      // Note exists, navigate to it
      window.location.href = `/${noteIdToNavigate}`;
    } catch (err) {
      console.error('Failed to check note:', err);
      errorMessage = 'Invalid note ID';
      showErrorTooltip = true;
      setTimeout(() => {
        showErrorTooltip = false;
      }, 2000);
    }
    isEditing = false;
  }

  function handleCustomUrlSubmit(e: Event) {
    e.preventDefault();
    handleCustomUrlChange();
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
      <form class="inline-flex items-stretch bg-muted/30 rounded-md" onsubmit={handleCustomUrlSubmit}>
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
            onblur={handleBlur}
            placeholder="custom-url"
            enterkeyhint="done"
            style="width: {Math.max(editValue.length || 10, displayNoteId.length + 2)}ch; max-width: 30ch;"
            class="font-bold text-foreground text-sm bg-transparent outline-none placeholder:text-muted-foreground max-sm:!w-[6ch]"
          />
        {:else}
          <span class="font-bold text-foreground max-w-[30ch] overflow-hidden text-ellipsis max-sm:!max-w-[6ch] max-sm:inline-block">{displayNoteId}</span>
          <Copy class="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors ml-1" />
        {/if}
      </div>
      {#if isEditing}
        <Button
          type="submit"
          variant="ghost"
          class="!rounded-l-none h-auto min-h-full w-9 border-l border-border bg-muted/50 hover:bg-muted"
          title="Save custom URL"
        >
          <Check class="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors" />
        </Button>
      {:else}
        <Button
          type="button"
          onclick={startEditing}
          variant="ghost"
          class="!rounded-l-none h-auto min-h-full w-9 border-l border-border bg-muted/50 hover:bg-muted"
          title="Edit custom URL"
        >
          <Pencil class="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors" />
        </Button>
      {/if}
    </form>
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
    <form class="inline-flex items-center bg-muted/30 rounded-md transition-colors {isEditing ? 'bg-accent' : 'hover:bg-accent group/container'}" onsubmit={handleNavigate}>
      <div class="inline-flex items-center text-sm px-3 py-2 w-[7.5rem] {isEditing ? '' : 'cursor-pointer'}"
           onclick={isEditing ? undefined : startEditing}
           role={isEditing ? undefined : 'button'}
           title={isEditing ? '' : 'Go to a note'}>
        {#if isEditing}
          <input
            bind:this={inputElement}
            bind:value={editValue}
            onblur={handleBlur}
            placeholder="note-id"
            enterkeyhint="go"
            class="w-full text-sm bg-transparent outline-none placeholder:text-muted-foreground"
          />
        {:else}
          <span class="text-foreground/50">Go to a note</span>
        {/if}
      </div>
      {#if isEditing}
        <Button
          type="submit"
          variant="ghost"
          class="!rounded-l-none h-auto min-h-full w-9 border-l border-border bg-muted/50 hover:bg-muted"
          title="Navigate"
        >
          <ArrowRight class="w-4 h-4" />
        </Button>
      {:else}
        <Button
          type="button"
          onclick={startEditing}
          variant="ghost"
          class="!rounded-l-none h-auto min-h-full w-9 border-l border-border bg-muted/50 hover:bg-muted"
          title="Go to a note"
        >
          <Navigation class="w-4 h-4" />
        </Button>
      {/if}
    </form>
    {#if showErrorTooltip}
      <div class="absolute top-full mt-1 left-1/2 -translate-x-1/2 bg-destructive text-destructive-foreground text-xs px-2 py-1 rounded whitespace-nowrap z-50">
        {errorMessage}
      </div>
    {/if}
    {/if}
  </div>
{/if}
