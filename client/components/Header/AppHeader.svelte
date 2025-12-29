<script lang="ts">
  import { Button } from '../../lib/components/ui/button/index.js';
  import ThemeToggle from '../../lib/components/ui/ThemeToggle.svelte';
  import ConnectionStatus from './ConnectionStatus.svelte';
  import StatusIndicator from './StatusIndicator.svelte';
    import UrlDisplay from './UrlDisplay.svelte';
  import InfoDialog from '../Dialogs/InfoDialog.svelte';

  interface Props {
    noteId: string;
    connectionStatus: 'connected' | 'disconnected' | 'connecting';
    isRealtimeEnabled: boolean;
    isEncrypted: boolean;
    clientId: string;
    connectedUsers: Set<string>;
    saveStatus: string;
    isSyncing: boolean;
    viewMode: boolean;
    isNoteDeleted: boolean;
    showOptions: boolean;
    content: string;
    syntaxHighlight: string;
    password?: string;
    maxViews?: number;
    expiresIn?: string;
    onNewNote: () => void;
    onDeleteNote: () => void;
    onToggleOptions: () => void;
    onCustomUrlSet?: (newNoteId: string) => void;
    children?: any;
  }

  let {
    noteId,
    connectionStatus,
    isRealtimeEnabled,
    isEncrypted,
    clientId,
    connectedUsers,
    saveStatus,
    isSyncing,
    viewMode,
    isNoteDeleted,
    showOptions,
    content,
    syntaxHighlight,
    password,
    maxViews,
    expiresIn,
    onNewNote,
    onDeleteNote,
    onToggleOptions,
    onCustomUrlSet,
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
        <StatusIndicator
          {noteId}
          {connectionStatus}
          {saveStatus}
          {isSyncing}
          {isNoteDeleted}
        />
        <ConnectionStatus
          {noteId}
          {connectionStatus}
          {isEncrypted}
          {isRealtimeEnabled}
          {clientId}
          {connectedUsers}
        />
        <UrlDisplay {noteId} {content} {syntaxHighlight} {password} {maxViews} {expiresIn} {viewMode} {onCustomUrlSet} />
      </div>
      <div class="md:hidden">
        <ThemeToggle />
      </div>
    </div>
    <div class="flex items-center gap-2 flex-wrap">
      {#if noteId}
        <Button variant="outline" onclick={onNewNote} class="text-xs md:text-sm px-2 md:px-4 py-1 md:py-2" title="Create a new note">New</Button>
        {#if !isNoteDeleted}
          <Button variant="destructive" onclick={onDeleteNote} class="text-xs md:text-sm px-2 md:px-4 py-1 md:py-2" title="Delete this note permanently">Delete</Button>
        {/if}
      {/if}
      {#if !viewMode}
        <Button variant={showOptions ? "secondary" : "outline"} onclick={onToggleOptions} class="text-xs md:text-sm px-2 md:px-4 py-1 md:py-2 {showOptions ? 'border border-transparent' : ''}" title="Configure note options (syntax highlighting, expiration, password protection)">
          Options
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
