<script lang="ts">
  import { Button } from '../../lib/components/ui/button/index.js';
  import ThemeToggle from '../../lib/components/ui/ThemeToggle.svelte';
  import ConnectionStatus from './ConnectionStatus.svelte';
  import ProtectedBadge from './ProtectedBadge.svelte';
  import InfoDialog from '../Dialogs/InfoDialog.svelte';
  import Loader2 from '@lucide/svelte/icons/loader-2';
  import Check from '@lucide/svelte/icons/check';
  import AlertCircle from '@lucide/svelte/icons/alert-circle';
  import AlertTriangle from '@lucide/svelte/icons/alert-triangle';

  interface Props {
    noteId: string;
    connectionStatus: 'connected' | 'disconnected' | 'connecting';
    isRealtimeEnabled: boolean;
    isEncrypted: boolean;
    hasPassword: boolean;
    clientId: string;
    connectedUsers: Set<string>;
    saveStatus: string;
    isSyncing: boolean;
    hasPendingOperations: boolean;
    viewMode: boolean;
    onNewNote: () => void;
    onDeleteNote: () => void;
    onToggleOptions: () => void;
    onCustomUrl: () => void;
    children?: any;
  }

  let {
    noteId,
    connectionStatus,
    isRealtimeEnabled,
    isEncrypted,
    hasPassword,
    clientId,
    connectedUsers,
    saveStatus,
    isSyncing,
    hasPendingOperations,
    viewMode,
    onNewNote,
    onDeleteNote,
    onToggleOptions,
    onCustomUrl,
    children
  }: Props = $props();

  let showInfoDialog = $state(false);
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

<header class="border-b border-border bg-card p-4">
  <div class="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center md:justify-between gap-2">
    <div class="flex items-center justify-between md:justify-start md:gap-4">
      <div class="flex items-center gap-2">
        <button
          class="text-2xl font-bold cursor-pointer hover:text-primary transition-colors p-0 border-0 bg-transparent"
          onclick={() => showInfoDialog = true}
          type="button"
          aria-label="About yPad"
        >
          yPad
        </button>
{#if showSpinner}
          <span class="relative inline-block" title={isSlowSync ? 'Taking longer than usual - please don\'t leave the page' : hasPendingOperations ? 'Syncing changes...' : isSyncing ? 'Syncing changes...' : 'Saving...'}>
            <Loader2 class="w-4 h-4 animate-spin text-muted-foreground" />
            {#if isSlowSync}
              <span class="absolute -top-0.5 -right-0.5 flex h-2 w-2">
                <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-yellow-400 opacity-75"></span>
                <span class="relative inline-flex rounded-full h-2 w-2 bg-yellow-500"></span>
              </span>
            {/if}
          </span>
        {:else if saveStatus === 'Failed to save'}
          <span title="Failed to save">
            <AlertCircle class="w-4 h-4 text-muted-foreground" />
          </span>
        {:else if saveStatus === 'Save failed: password required'}
          <span title="Save failed: password required">
            <AlertCircle class="w-4 h-4 text-muted-foreground" />
          </span>
        {:else if saveStatus === 'Encryption failed'}
          <span title="Encryption failed">
            <AlertCircle class="w-4 h-4 text-muted-foreground" />
          </span>
        {:else if saveStatus === 'Conflict!'}
          <span title="Conflict detected! Please resolve.">
            <AlertTriangle class="w-4 h-4 text-muted-foreground" />
          </span>
        {:else if saveStatus === 'Disconnected'}
          <span title="Disconnected from real-time sync">
            <AlertCircle class="w-4 h-4 text-muted-foreground" />
          </span>
        {:else if connectionStatus === 'connecting'}
          <span title="Connecting to real-time sync...">
            <Loader2 class="w-4 h-4 animate-spin text-muted-foreground" />
          </span>
        {:else if noteId && (saveStatus === 'Saved' || saveStatus === 'Real-time sync active' || !saveStatus)}
          <span title="All changes saved">
            <Check class="w-4 h-4 text-muted-foreground" />
          </span>
        {/if}
        <ConnectionStatus
          {noteId}
          {connectionStatus}
          {isEncrypted}
          {isRealtimeEnabled}
          {clientId}
          {connectedUsers}
        />
      </div>
      <div class="md:hidden">
        <ThemeToggle />
      </div>
    </div>
    <div class="flex items-center gap-2 flex-wrap">
      <ProtectedBadge {hasPassword} />
      {#if noteId}
        <Button variant="outline" onclick={onNewNote} class="text-xs md:text-sm px-2 md:px-4 py-1 md:py-2" title="Create a new note">New</Button>
        <Button variant="destructive" onclick={onDeleteNote} class="text-xs md:text-sm px-2 md:px-4 py-1 md:py-2" title="Delete this note permanently">Delete</Button>
      {/if}
      <Button variant="outline" onclick={onToggleOptions} class="text-xs md:text-sm px-2 md:px-4 py-1 md:py-2" title="Configure note options (syntax highlighting, expiration, password protection)">
        Options
      </Button>
      {#if !viewMode}
        <Button onclick={onCustomUrl} class="text-xs md:text-sm px-2 md:px-4 py-1 md:py-2" title="Set a custom URL for this note">
          Custom URL
        </Button>
      {/if}
      <div class="hidden md:block">
        <ThemeToggle />
      </div>
    </div>
  </div>

  {@render children?.()}
</header>

<InfoDialog bind:open={showInfoDialog} />
