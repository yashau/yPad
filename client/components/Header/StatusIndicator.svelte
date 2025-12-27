<script lang="ts">
  import Loader2 from '@lucide/svelte/icons/loader-2';
  import Check from '@lucide/svelte/icons/check';
  import AlertCircle from '@lucide/svelte/icons/alert-circle';
  import AlertTriangle from '@lucide/svelte/icons/alert-triangle';

  interface Props {
    noteId: string;
    connectionStatus: 'connected' | 'disconnected' | 'connecting';
    saveStatus: string;
    isSyncing: boolean;
    hasPendingOperations: boolean;
  }

  let {
    noteId,
    connectionStatus,
    saveStatus,
    isSyncing,
    hasPendingOperations
  }: Props = $props();

  let isSlowSync = $state(false);
  let slowSyncTimer: number | null = null;
  let showSpinner = $state(false);
  let spinnerStartTime: number | null = null;
  let minDisplayTimer: number | null = null;

  $effect(() => {
    const isPending = saveStatus === 'Saving...' || isSyncing || hasPendingOperations;

    if (isPending) {
      // Show spinner immediately if not already showing
      if (!showSpinner) {
        showSpinner = true;
        spinnerStartTime = Date.now();
      }

      // Start slow sync timer if not already running
      if (slowSyncTimer === null) {
        slowSyncTimer = setTimeout(() => {
          isSlowSync = true;
        }, 2000) as unknown as number;
      }
    } else {
      // Operations are done, but ensure spinner shows for at least 1 second
      if (showSpinner && spinnerStartTime !== null) {
        const elapsed = Date.now() - spinnerStartTime;
        const remaining = Math.max(0, 1000 - elapsed);

        if (minDisplayTimer !== null) {
          clearTimeout(minDisplayTimer);
        }

        minDisplayTimer = setTimeout(() => {
          showSpinner = false;
          spinnerStartTime = null;
          minDisplayTimer = null;
        }, remaining) as unknown as number;
      }

      // Clear slow sync timer and warning
      if (slowSyncTimer !== null) {
        clearTimeout(slowSyncTimer);
        slowSyncTimer = null;
      }
      isSlowSync = false;
    }

    return () => {
      if (slowSyncTimer !== null) {
        clearTimeout(slowSyncTimer);
      }
      if (minDisplayTimer !== null) {
        clearTimeout(minDisplayTimer);
      }
    };
  });
</script>

{#if showSpinner}
  <span class="relative inline-flex items-center translate-y-0.5" title={isSlowSync ? 'Taking longer than usual - please don\'t leave the page' : hasPendingOperations ? 'Syncing changes...' : isSyncing ? 'Syncing changes...' : 'Saving...'}>
    <Loader2 class="w-4 h-4 animate-spin text-muted-foreground" />
    {#if isSlowSync}
      <span class="absolute -top-0.5 -right-0.5 flex h-2 w-2">
        <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-yellow-400 opacity-75"></span>
        <span class="relative inline-flex rounded-full h-2 w-2 bg-yellow-500"></span>
      </span>
    {/if}
  </span>
{:else if saveStatus === 'Failed to save'}
  <span class="inline-flex items-center translate-y-0.5" title="Failed to save">
    <AlertCircle class="w-4 h-4 text-muted-foreground" />
  </span>
{:else if saveStatus === 'Save failed: password required'}
  <span class="inline-flex items-center translate-y-0.5" title="Save failed: password required">
    <AlertCircle class="w-4 h-4 text-muted-foreground" />
  </span>
{:else if saveStatus === 'Encryption failed'}
  <span class="inline-flex items-center translate-y-0.5" title="Encryption failed">
    <AlertCircle class="w-4 h-4 text-muted-foreground" />
  </span>
{:else if saveStatus === 'Conflict!'}
  <span class="inline-flex items-center translate-y-0.5" title="Conflict detected! Please resolve.">
    <AlertTriangle class="w-4 h-4 text-muted-foreground" />
  </span>
{:else if saveStatus === 'Disconnected'}
  <span class="inline-flex items-center translate-y-0.5" title="Disconnected from real-time sync">
    <AlertCircle class="w-4 h-4 text-muted-foreground" />
  </span>
{:else if connectionStatus === 'connecting'}
  <span class="inline-flex items-center translate-y-0.5" title="Connecting to real-time sync...">
    <Loader2 class="w-4 h-4 animate-spin text-muted-foreground" />
  </span>
{:else if noteId && (saveStatus === 'Saved' || saveStatus === 'Real-time sync active' || !saveStatus)}
  <span class="inline-flex items-center translate-y-0.5" title="All changes saved">
    <Check class="w-4 h-4 text-muted-foreground" />
  </span>
{/if}
