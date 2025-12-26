<script lang="ts">
  import { Button } from '../../lib/components/ui/button/index.js';
  import ThemeToggle from '../../lib/components/ui/ThemeToggle.svelte';
  import ConnectionStatus from './ConnectionStatus.svelte';
  import ProtectedBadge from './ProtectedBadge.svelte';
  import InfoDialog from '../Dialogs/InfoDialog.svelte';

  interface Props {
    noteId: string;
    connectionStatus: 'connected' | 'disconnected' | 'connecting';
    isRealtimeEnabled: boolean;
    isEncrypted: boolean;
    hasPassword: boolean;
    clientId: string;
    connectedUsers: Set<string>;
    saveStatus: string;
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
    viewMode,
    onNewNote,
    onDeleteNote,
    onToggleOptions,
    onCustomUrl,
    children
  }: Props = $props();

  let showInfoDialog = $state(false);
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
        <ConnectionStatus
          {noteId}
          {connectionStatus}
          {isEncrypted}
          {isRealtimeEnabled}
          {clientId}
          {connectedUsers}
        />
      </div>
      {#if saveStatus && !isRealtimeEnabled}
        <span class="text-sm text-muted-foreground hidden md:inline">{saveStatus}</span>
      {/if}
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
