<script lang="ts">
  import { onDestroy } from 'svelte';
  import * as Select from '../../lib/components/ui/select/index.js';
  import LanguageSelector from './LanguageSelector.svelte';
  import PasswordInput from './PasswordInput.svelte';
  import MaxViewsInput from './MaxViewsInput.svelte';
  import { EXPIRATION_OPTIONS } from '../../../config/constants';
  import X from '@lucide/svelte/icons/x';

  interface Props {
    syntaxHighlight: string;
    passwordToSet: string;
    hasPassword: boolean;
    maxViews: number | null;
    expiresIn: string;
    viewMode: boolean;
    // Server state - current values from backend
    serverMaxViews: number | null;
    serverViewCount: number;
    serverExpiresAt: number | null;
    onSyntaxChange: (value: string) => void;
    onSetPassword: () => void;
    onRemovePassword: () => void;
    onPasswordChange: (value: string) => void;
    onMaxViewsChange: (value: number | null) => void;
    onMaxViewsSubmit: () => void;
    onExpirationChange: (value: string) => void;
    onResetMaxViews: () => void;
    onResetExpiration: () => void;
  }

  let {
    syntaxHighlight,
    passwordToSet = $bindable(),
    hasPassword,
    maxViews = $bindable(),
    expiresIn = $bindable(),
    viewMode,
    serverMaxViews,
    serverViewCount,
    serverExpiresAt,
    onSyntaxChange,
    onSetPassword,
    onRemovePassword,
    onPasswordChange,
    onMaxViewsChange,
    onMaxViewsSubmit,
    onExpirationChange,
    onResetMaxViews,
    onResetExpiration
  }: Props = $props();

  const expiresInLabel = $derived(
    EXPIRATION_OPTIONS.find((opt) => opt.value === expiresIn)?.label ?? "Select expiration"
  );

  // Countdown timer state
  let countdownText = $state('');
  let countdownInterval: ReturnType<typeof setInterval> | null = null;

  function formatCountdown(expiresAt: number): string {
    const now = Date.now();
    const diff = expiresAt - now;

    if (diff <= 0) {
      return 'Expired';
    }

    // Use ceiling for total hours to avoid "29d 23h" showing when it's essentially 30d
    const totalHours = Math.ceil(diff / (1000 * 60 * 60));
    const days = Math.floor(totalHours / 24);
    const remainingHours = totalHours % 24;

    if (days > 0) {
      return remainingHours > 0 ? `${days}d ${remainingHours}h` : `${days}d`;
    } else if (totalHours > 0) {
      const totalMinutes = Math.ceil(diff / (1000 * 60));
      const remainingMinutes = totalMinutes % 60;
      return remainingMinutes > 0 ? `${totalHours}h ${remainingMinutes}m` : `${totalHours}h`;
    } else {
      const totalMinutes = Math.ceil(diff / (1000 * 60));
      if (totalMinutes > 0) {
        const totalSeconds = Math.ceil(diff / 1000);
        const remainingSeconds = totalSeconds % 60;
        return remainingSeconds > 0 ? `${totalMinutes}m ${remainingSeconds}s` : `${totalMinutes}m`;
      } else {
        return `${Math.ceil(diff / 1000)}s`;
      }
    }
  }

  // Update countdown when serverExpiresAt changes
  $effect(() => {
    if (countdownInterval) {
      clearInterval(countdownInterval);
      countdownInterval = null;
    }

    if (serverExpiresAt) {
      countdownText = formatCountdown(serverExpiresAt);

      countdownInterval = setInterval(() => {
        countdownText = formatCountdown(serverExpiresAt);
      }, 1000);
    } else {
      countdownText = '';
    }
  });

  onDestroy(() => {
    if (countdownInterval) {
      clearInterval(countdownInterval);
    }
  });

  // Derived state for views remaining
  const viewsRemaining = $derived(
    serverMaxViews !== null ? serverMaxViews - serverViewCount : null
  );
</script>

<div class="max-w-7xl mx-auto mt-4 p-4 border border-border rounded-lg bg-background">
  <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
    <div>
      <label for="syntax-highlight" class="block text-sm font-medium mb-2">Syntax Highlighting</label>
      <LanguageSelector
        selected={syntaxHighlight}
        disabled={viewMode}
        onChange={onSyntaxChange}
      />
    </div>
    <div>
      <label for="password" class="block text-sm font-medium mb-2">Password Protection</label>
      <PasswordInput
        bind:value={passwordToSet}
        {hasPassword}
        disabled={viewMode}
        {onSetPassword}
        {onRemovePassword}
        onValueChange={onPasswordChange}
        inputClass="!bg-transparent border-0 shadow-none focus-visible:ring-0 px-3 w-full h-full"
      />
    </div>
    <div>
      <div class="flex items-center justify-between mb-2">
        <label for="max-views" class="block text-sm font-medium">Max Views</label>
        {#if serverMaxViews !== null && !viewMode}
          <button
            type="button"
            onclick={onResetMaxViews}
            class="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
            title="Remove view limit"
          >
            <X class="w-3 h-3" />
            Reset
          </button>
        {/if}
      </div>
      {#if serverMaxViews !== null}
        <div class="flex items-center h-9 px-3 border border-input rounded-md bg-muted/30">
          <span class="text-sm text-muted-foreground">
            {viewsRemaining} view{viewsRemaining !== 1 ? 's' : ''} remaining
          </span>
        </div>
      {:else}
        <MaxViewsInput
          bind:value={maxViews}
          disabled={viewMode}
          onSubmit={onMaxViewsSubmit}
          onValueChange={onMaxViewsChange}
          inputClass="!bg-transparent border-0 shadow-none focus-visible:ring-0 px-3 w-full h-full"
        />
      {/if}
    </div>
    <div>
      <div class="flex items-center justify-between mb-2">
        <label for="expires-in" class="block text-sm font-medium">Expires In</label>
        {#if serverExpiresAt !== null && !viewMode}
          <button
            type="button"
            onclick={onResetExpiration}
            class="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
            title="Remove expiration"
          >
            <X class="w-3 h-3" />
            Reset
          </button>
        {/if}
      </div>
      {#if serverExpiresAt !== null}
        <div class="flex items-center h-9 px-3 border border-input rounded-md bg-muted/30">
          <span class="text-sm text-muted-foreground">
            Expires in {countdownText}
          </span>
        </div>
      {:else}
        <Select.Root bind:value={expiresIn} disabled={viewMode} type="single" onValueChange={(value) => onExpirationChange(value)}>
          <Select.Trigger class="w-full" title="Set when this note should automatically expire and be deleted">
            {expiresInLabel}
          </Select.Trigger>
          <Select.Content>
            {#each EXPIRATION_OPTIONS as option}
              <Select.Item value={option.value} label={option.label}>
                {option.label}
              </Select.Item>
            {/each}
          </Select.Content>
        </Select.Root>
      {/if}
    </div>
  </div>
</div>
