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

{#if noteId}
  {#if connectionStatus === 'connected' && isEncrypted}
    <div class="flex items-center gap-2">
      <div class="w-2 h-2 rounded-full bg-blue-500 animate-pulse" title="Connected - Real-time collaboration disabled for encrypted notes. Changes are saved automatically."></div>
    </div>
  {:else if connectionStatus === 'connected'}
    <div class="flex items-center gap-2">
      <div class="w-2 h-2 rounded-full bg-green-500 animate-pulse" title="Real-time sync active - Your changes are synced instantly"></div>
      <span class="text-xs text-muted-foreground">
        {clientId.substring(0, 4)}{#if connectedUsers.size > 1} +{connectedUsers.size - 1}{/if}
      </span>
    </div>
  {:else if connectionStatus === 'connecting'}
    <div class="w-2 h-2 rounded-full bg-yellow-500 animate-pulse" title="Connecting to real-time sync..."></div>
  {:else if connectionStatus === 'disconnected' && isRealtimeEnabled}
    <div class="w-2 h-2 rounded-full bg-red-500 animate-pulse" title="Disconnected from real-time sync - Attempting to reconnect..."></div>
  {/if}
{/if}
