<script lang="ts">
  interface Props {
    noteId: string;
    connectionStatus: 'connected' | 'disconnected' | 'connecting';
    isEncrypted: boolean;
    isRealtimeEnabled: boolean;
    clientId: string;
    connectedUsers: Set<string>;
  }

  let { noteId, connectionStatus, isEncrypted, isRealtimeEnabled, clientId, connectedUsers }: Props = $props();
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

