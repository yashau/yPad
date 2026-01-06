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
    isRealtimeEnabled: boolean;
    isEncrypted: boolean;
    saveStatus: string;
    isSyncing: boolean;
    isNoteDeleted: boolean;
    isFinalView: boolean;
  }

  let {
    noteId,
    connectionStatus,
    isRealtimeEnabled,
    isEncrypted,
    saveStatus,
    isSyncing,
    isNoteDeleted,
    isFinalView
  }: Props = $props();

  let isSlowSync = $state(false);
  let showSpinner = $state(false);
  let spinnerStartTime: number | null = null;
  let isConnectionLost = $state(false);
  let showCheckBriefly = $state(false);

  // Timers
  let slowSyncTimer: number | null = null;
  let connectionLostTimer: number | null = null;
  let checkTimer: number | null = null;
  let minDisplayTimer: number | null = null;

  // Track if we had slow sync (to show check briefly after completion)
  let hadSlowSync = false;

  function clearAllTimers() {
    if (slowSyncTimer !== null) {
      clearTimeout(slowSyncTimer);
      slowSyncTimer = null;
    }
    if (connectionLostTimer !== null) {
      clearTimeout(connectionLostTimer);
      connectionLostTimer = null;
    }
    if (checkTimer !== null) {
      clearTimeout(checkTimer);
      checkTimer = null;
    }
    if (minDisplayTimer !== null) {
      clearTimeout(minDisplayTimer);
      minDisplayTimer = null;
    }
  }

  $effect(() => {
    const isPending = saveStatus === 'Saving...' || isSyncing;
    const isWebSocketConnected = isRealtimeEnabled && connectionStatus === 'connected';

    // Cleanup function
    return () => {
      clearAllTimers();
    };
  });

  // Effect for handling pending state changes
  $effect(() => {
    const isPending = saveStatus === 'Saving...' || isSyncing;
    // Encrypted notes don't use real-time sync even if WebSocket is connected
    const isWebSocketConnected = isRealtimeEnabled && connectionStatus === 'connected' && !isEncrypted;

    if (isPending) {
      // Starting a pending operation
      if (isWebSocketConnected) {
        // For WebSocket: start timer for slow sync (2 seconds)
        if (slowSyncTimer === null && !isSlowSync && !isConnectionLost) {
          slowSyncTimer = setTimeout(() => {
            isSlowSync = true;
            hadSlowSync = true;
            showSpinner = true;
            spinnerStartTime = Date.now();
            slowSyncTimer = null;
          }, 2000) as unknown as number;
        }

        // Start timer for connection lost (5 seconds)
        if (connectionLostTimer === null && !isConnectionLost) {
          connectionLostTimer = setTimeout(() => {
            isConnectionLost = true;
            showSpinner = false;
            connectionLostTimer = null;
          }, 5000) as unknown as number;
        }
      } else {
        // For non-WebSocket: show spinner immediately
        if (!showSpinner) {
          showSpinner = true;
          spinnerStartTime = Date.now();
        }

        // Start timer for slow sync warning (2 seconds)
        if (slowSyncTimer === null && !isSlowSync) {
          slowSyncTimer = setTimeout(() => {
            isSlowSync = true;
            slowSyncTimer = null;
          }, 2000) as unknown as number;
        }

        // Start timer for connection lost (5 seconds)
        if (connectionLostTimer === null && !isConnectionLost) {
          connectionLostTimer = setTimeout(() => {
            isConnectionLost = true;
            showSpinner = false;
            connectionLostTimer = null;
          }, 5000) as unknown as number;
        }
      }
    } else {
      // Pending operation completed
      // Clear pending-related timers
      if (slowSyncTimer !== null) {
        clearTimeout(slowSyncTimer);
        slowSyncTimer = null;
      }
      if (connectionLostTimer !== null) {
        clearTimeout(connectionLostTimer);
        connectionLostTimer = null;
      }

      if (isWebSocketConnected) {
        // For WebSocket: if we had slow sync, show check briefly then hide
        if (hadSlowSync || isSlowSync) {
          hadSlowSync = false;
          isSlowSync = false;
          showSpinner = false;
          showCheckBriefly = true;

          if (checkTimer !== null) {
            clearTimeout(checkTimer);
          }
          checkTimer = setTimeout(() => {
            showCheckBriefly = false;
            checkTimer = null;
          }, 1500) as unknown as number;
        } else {
          // Normal completion (no slow sync) - just hide spinner
          showSpinner = false;
        }

        // Clear connection lost state if we successfully completed
        if (connectionStatus === 'connected') {
          isConnectionLost = false;
        }
      } else {
        // For non-WebSocket: ensure spinner shows for at least 1 second
        isSlowSync = false;

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
    }
  });

  // Effect for handling connection status changes
  $effect(() => {
    // When connection is restored, clear connection lost state
    if (connectionStatus === 'connected' && isConnectionLost) {
      const isPending = saveStatus === 'Saving...' || isSyncing;
      if (!isPending) {
        isConnectionLost = false;
      }
    }
  });
</script>

{#if isNoteDeleted || isFinalView}
  <span class="inline-flex items-center leading-none" title="This note has been deleted">
    <Trash2 class="w-4 h-4 text-muted-foreground" />
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
{:else if showCheckBriefly}
  <span class="inline-flex items-center leading-none" title="All changes saved">
    <Check class="w-4 h-4 text-muted-foreground" />
  </span>
{:else if noteId && (!isRealtimeEnabled || isEncrypted) && (saveStatus === 'Saved' || saveStatus === 'Real-time sync active' || !saveStatus)}
  <span class="inline-flex items-center leading-none" title="All changes saved">
    <Check class="w-4 h-4 text-muted-foreground" />
  </span>
{/if}
