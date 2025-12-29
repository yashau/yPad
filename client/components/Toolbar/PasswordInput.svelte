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
    inputClass?: string;
  }

  let { value = $bindable(), hasPassword, disabled, onSetPassword, onRemovePassword, onValueChange, inputClass }: Props = $props();

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

<div class="inline-flex items-stretch bg-transparent dark:bg-input/30 rounded-md h-9 border border-input shadow-xs">
  <div class="inline-flex items-center text-sm flex-1">
    <Input
      id="password"
      type="password"
      bind:value
      placeholder={hasPassword ? "Protected" : "Enter password"}
      disabled={disabled || hasPassword}
      title={hasPassword ? "This note is already password protected" : "Enter a password to encrypt and protect this note"}
      onkeydown={handleKeyDown}
      oninput={(e) => onValueChange((e.target as HTMLInputElement).value)}
      class={inputClass}
    />
  </div>
  <Button
    onclick={handleClick}
    disabled={disabled || (!hasPassword && !value.trim())}
    variant="outline"
    size="icon-sm"
    class="rounded-r-md rounded-l-none h-full group"
    title={hasPassword ? "Remove password protection" : "Set password protection"}
  >
    {#if hasPassword}
      <LockOpen class="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors" />
    {:else}
      <Lock class="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors" />
    {/if}
  </Button>
</div>
