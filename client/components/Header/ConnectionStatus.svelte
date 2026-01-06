<script lang="ts">
  import Lock from '@lucide/svelte/icons/lock';

  interface Props {
    noteId: string;
    connectionStatus: 'connected' | 'disconnected' | 'connecting';
    isEncrypted: boolean;
    isRealtimeEnabled: boolean;
    clientId: string;
    activeEditorCount: number;
    viewerCount: number;
    isCurrentUserEditor: boolean;
  }

  let { noteId, connectionStatus, isEncrypted, isRealtimeEnabled, clientId, activeEditorCount, viewerCount, isCurrentUserEditor }: Props = $props();

  // Calculate the number of OTHER editors (excluding current user if they're an editor)
  const otherEditorCount = $derived(isCurrentUserEditor ? activeEditorCount - 1 : activeEditorCount);
</script>

{#if noteId && connectionStatus === 'connected'}
  {#if isEncrypted}
    <div class="inline-flex items-center gap-2" title="Connected - Real-time collaboration disabled for encrypted notes. Changes are saved automatically.">
      <Lock class="w-3.5 h-3.5 text-blue-500" />
    </div>
  {:else}
    <div class="inline-flex items-center gap-2">
      <div class="w-2 h-2 rounded-full bg-green-500 animate-pulse" title="Real-time sync active - Your changes are synced instantly"></div>
      <span class="inline-block text-xs text-muted-foreground leading-none">
        {clientId.substring(0, 4)}{#if otherEditorCount + viewerCount > 0} +{otherEditorCount}{#if viewerCount > 0}<span class="text-muted-foreground/50">/{viewerCount}</span>{/if}{/if}
      </span>
    </div>
  {/if}
{/if}

