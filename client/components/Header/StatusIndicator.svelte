<script lang="ts">
  import Loader2 from '@lucide/svelte/icons/loader-2';
  import Check from '@lucide/svelte/icons/check';
  import AlertCircle from '@lucide/svelte/icons/alert-circle';
  import AlertTriangle from '@lucide/svelte/icons/alert-triangle';
  import WifiOff from '@lucide/svelte/icons/wifi-off';
  import Trash2 from '@lucide/svelte/icons/trash-2';

  interface Props {
    noteId: string;
    connectionStatus: 'connected' | 'disconnected' | 'connecting';
    saveStatus: string;
    isSyncing: boolean;
    isNoteDeleted: boolean;
  }

  let {
    noteId,
    connectionStatus,
    saveStatus,
    isSyncing,
    isNoteDeleted
  }: Props = $props();

  let isSlowSync = $state(false);
  let slowSyncTimer: number | null = null;
  let showSpinner = $state(false);
  let spinnerStartTime: number | null = null;
  let minDisplayTimer: number | null = null;
  let isConnectionLost = $state(false);
  let connectionLostTimer: number | null = null;
  let pendingStartTime: number | null = null;

  $effect(() => {
    const isPending = saveStatus === 'Saving...' || isSyncing;

    // If reconnected successfully, clear all states
    if (connectionStatus === 'connected' && !isPending) {
      isConnectionLost = false;
      isSlowSync = false;
      pendingStartTime = null;

      if (slowSyncTimer !== null) {
        clearTimeout(slowSyncTimer);
        slowSyncTimer = null;
      }
      if (connectionLostTimer !== null) {
        clearTimeout(connectionLostTimer);
        connectionLostTimer = null;
      }
    }

    // Once connection is lost, keep showing error until truly reconnected
    if (isConnectionLost) {
      showSpinner = false;
      return;
    }

    if (isPending) {
      // Track when pending operations started (persist across disconnection)
      if (pendingStartTime === null) {
        pendingStartTime = Date.now();
      }

      // Show spinner immediately if not already showing
      if (!showSpinner) {
        showSpinner = true;
        spinnerStartTime = Date.now();
      }

      // Calculate elapsed time since pending started
      const elapsed = Date.now() - pendingStartTime;

      // Show slow sync warning after 2 seconds
      if (elapsed >= 2000 && !isSlowSync) {
        isSlowSync = true;
      }

      // Show connection lost error after 5 seconds
      if (elapsed >= 5000 && !isConnectionLost) {
        isConnectionLost = true;
        showSpinner = false;
      }
    } else {
      // Only clear pending start time if connected (not during brief disconnection gaps)
      if (connectionStatus === 'connected') {
        pendingStartTime = null;
      }

      // Clear timers
      if (slowSyncTimer !== null) {
        clearTimeout(slowSyncTimer);
        slowSyncTimer = null;
      }
      if (connectionLostTimer !== null) {
        clearTimeout(connectionLostTimer);
        connectionLostTimer = null;
      }

      isSlowSync = false;

      // Operations are done, ensure spinner shows for at least 1 second
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
    }

    return () => {
      if (slowSyncTimer !== null) {
        clearTimeout(slowSyncTimer);
      }
      if (minDisplayTimer !== null) {
        clearTimeout(minDisplayTimer);
      }
      if (connectionLostTimer !== null) {
        clearTimeout(connectionLostTimer);
      }
    };
  });
</script>

{#if isNoteDeleted}
  <span class="inline-flex items-center gap-1.5 leading-none" title="This note has been deleted">
    <Trash2 class="w-4 h-4 text-muted-foreground" />
    <span class="text-xs text-muted-foreground">Deleted</span>
  </span>
{:else if isConnectionLost}
  <span class="inline-flex items-center leading-none" title="Connection lost - check your internet connection">
    <WifiOff class="w-4 h-4 text-muted-foreground" />
  </span>
{:else if showSpinner}
  <span class="relative inline-flex items-center leading-none" title={isSlowSync ? 'Taking longer than usual - please don\'t leave the page' : isSyncing ? 'Syncing changes...' : 'Saving...'}>
    <Loader2 class="w-4 h-4 animate-spin text-muted-foreground" />
  </span>
{:else if saveStatus === 'Failed to save'}
  <span class="inline-flex items-center leading-none" title="Failed to save">
    <AlertCircle class="w-4 h-4 text-muted-foreground" />
  </span>
{:else if saveStatus === 'Save failed: password required'}
  <span class="inline-flex items-center leading-none" title="Save failed: password required">
    <AlertCircle class="w-4 h-4 text-muted-foreground" />
  </span>
{:else if saveStatus === 'Encryption failed'}
  <span class="inline-flex items-center leading-none" title="Encryption failed">
    <AlertCircle class="w-4 h-4 text-muted-foreground" />
  </span>
{:else if saveStatus === 'Conflict!'}
  <span class="inline-flex items-center leading-none" title="Conflict detected! Please resolve.">
    <AlertTriangle class="w-4 h-4 text-muted-foreground" />
  </span>
{:else if saveStatus === 'Disconnected'}
  <span class="inline-flex items-center leading-none" title="Disconnected from real-time sync">
    <AlertCircle class="w-4 h-4 text-muted-foreground" />
  </span>
{:else if connectionStatus === 'connecting'}
  <span class="inline-flex items-center leading-none" title="Connecting to real-time sync...">
    <Loader2 class="w-4 h-4 animate-spin text-muted-foreground" />
  </span>
{:else if noteId && (saveStatus === 'Saved' || saveStatus === 'Real-time sync active' || !saveStatus)}
  <span class="inline-flex items-center leading-none" title="All changes saved">
    <Check class="w-4 h-4 text-muted-foreground" />
  </span>
{/if}
