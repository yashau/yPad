<script lang="ts">
  import { Input } from '../../lib/components/ui/input/index.js';
  import Lock from '@lucide/svelte/icons/lock';
  import LockOpen from '@lucide/svelte/icons/lock-open';

  interface Props {
    value: string;
    hasPassword: boolean;
    disabled: boolean;
    onSetPassword: () => void;
    onRemovePassword: () => void;
    onValueChange: (value: string) => void;
  }

  let { value = $bindable(), hasPassword, disabled, onSetPassword, onRemovePassword, onValueChange }: Props = $props();

  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === 'Enter' && !hasPassword && value.trim()) {
      onSetPassword();
    }
  }

  function handleClick() {
    if (hasPassword) {
      onRemovePassword();
    } else {
      onSetPassword();
    }
  }
</script>

<div class="flex items-center gap-2">
  <div class="relative flex-1">
    <Input
      id="password"
      type="password"
      bind:value
      placeholder={hasPassword ? "Protected" : "Enter password"}
      disabled={disabled || hasPassword}
      class="pr-10"
      title={hasPassword ? "This note is already password protected" : "Enter a password to encrypt and protect this note"}
      onkeydown={handleKeyDown}
      oninput={(e) => onValueChange((e.target as HTMLInputElement).value)}
    />
    <button
      onclick={handleClick}
      disabled={disabled || (!hasPassword && !value.trim())}
      class="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-md transition-all hover:bg-accent disabled:opacity-50 disabled:cursor-not-allowed {hasPassword ? 'text-blue-600 dark:text-blue-400' : 'text-muted-foreground hover:text-foreground'}"
      title={hasPassword ? "Click to remove password protection" : "Click to set password protection"}
      type="button"
    >
      {#if hasPassword}
        <Lock class="h-4 w-4" />
      {:else}
        <LockOpen class="h-4 w-4" />
      {/if}
    </button>
  </div>
</div>
