<script lang="ts">
  import Copy from '@lucide/svelte/icons/copy';

  interface Props {
    noteId: string;
  }

  let { noteId }: Props = $props();

  let showCopiedTooltip = $state(false);

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
</script>

{#if noteId}
  {@const { domain, noteId: displayNoteId } = getDisplayUrl()}
  <div class="relative inline-flex items-center leading-none">
    <button
      onclick={copyFullUrl}
      class="inline-flex items-center gap-1 text-xs hover:bg-accent px-2.5 py-2 rounded-md transition-colors cursor-pointer group leading-none"
      title="Click to copy full URL"
    >
<span class="text-foreground/50">{domain}/<span class="font-bold text-foreground">{displayNoteId}</span></span>
      <Copy class="w-3 h-3 text-muted-foreground group-hover:text-foreground transition-colors" />
    </button>
    {#if showCopiedTooltip}
      <div class="absolute top-full mt-1 left-1/2 -translate-x-1/2 bg-foreground text-background text-xs px-2 py-1 rounded whitespace-nowrap z-50">
        Copied!
      </div>
    {/if}
  </div>
{/if}
