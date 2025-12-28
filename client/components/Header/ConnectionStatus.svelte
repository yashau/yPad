<script lang="ts">
  import Copy from '@lucide/svelte/icons/copy';

  interface Props {
    noteId: string;
    connectionStatus: 'connected' | 'disconnected' | 'connecting';
    isEncrypted: boolean;
    isRealtimeEnabled: boolean;
    clientId: string;
    connectedUsers: Set<string>;
  }

  let { noteId, connectionStatus, isEncrypted, isRealtimeEnabled, clientId, connectedUsers }: Props = $props();

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

{#if noteId && connectionStatus === 'connected'}
  {#if isEncrypted}
    <div class="inline-flex items-center gap-2">
      <div class="w-2 h-2 rounded-full bg-blue-500 animate-pulse" title="Connected - Real-time collaboration disabled for encrypted notes. Changes are saved automatically."></div>
    </div>
  {:else}
    <div class="inline-flex items-center gap-2">
      <div class="w-2 h-2 rounded-full bg-green-500 animate-pulse" title="Real-time sync active - Your changes are synced instantly"></div>
      <span class="inline-block text-xs text-muted-foreground leading-none">
        {clientId.substring(0, 4)}{#if connectedUsers.size > 1} +{connectedUsers.size - 1}{/if}
      </span>
    </div>
  {/if}
{/if}

{#if noteId}
  {@const { domain, noteId: displayNoteId } = getDisplayUrl()}
  <div class="relative inline-flex items-center leading-none">
    <button
      onclick={copyFullUrl}
      class="inline-flex items-center gap-1 text-xs hover:bg-accent px-2.5 py-2 rounded-md transition-colors cursor-pointer group leading-none"
      title="Click to copy full URL"
    >
      <span class="text-foreground/50">{domain}/</span><span class="font-bold text-foreground">{displayNoteId}</span>
      <Copy class="w-3 h-3 text-muted-foreground group-hover:text-foreground transition-colors" />
    </button>
    {#if showCopiedTooltip}
      <div class="absolute top-full mt-1 left-1/2 -translate-x-1/2 bg-foreground text-background text-xs px-2 py-1 rounded whitespace-nowrap z-50">
        Copied!
      </div>
    {/if}
  </div>
{/if}
