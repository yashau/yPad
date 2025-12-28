<script lang="ts">
  import { Input } from '../../lib/components/ui/input/index.js';
  import { Button } from '../../lib/components/ui/button/index.js';
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
  <div class="flex-1">
    <Input
      id="password"
      type="password"
      bind:value
      placeholder={hasPassword ? "Protected" : "Enter password"}
      disabled={disabled || hasPassword}
      title={hasPassword ? "This note is already password protected" : "Enter a password to encrypt and protect this note"}
      onkeydown={handleKeyDown}
      oninput={(e) => onValueChange((e.target as HTMLInputElement).value)}
    />
  </div>
  <Button
    onclick={handleClick}
    disabled={disabled || (!hasPassword && !value.trim())}
    variant="outline"
    class="min-w-[100px] {hasPassword ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-200 border-blue-300 dark:border-blue-700 hover:bg-blue-200 dark:hover:bg-blue-900/50' : ''}"
    title={hasPassword ? "Click to remove password protection" : "Click to set password protection"}
  >
    {#if hasPassword}
      <Lock />
      <span>Unprotect</span>
    {:else}
      <LockOpen />
      <span>Protect</span>
    {/if}
  </Button>
</div>
