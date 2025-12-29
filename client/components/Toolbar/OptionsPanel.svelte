<script lang="ts">
  import { Input } from '../../lib/components/ui/input/index.js';
  import * as Select from '../../lib/components/ui/select/index.js';
  import LanguageSelector from './LanguageSelector.svelte';
  import PasswordInput from './PasswordInput.svelte';
  import MaxViewsInput from './MaxViewsInput.svelte';
  import { EXPIRATION_OPTIONS } from '../../../config/constants';

  interface Props {
    syntaxHighlight: string;
    passwordToSet: string;
    hasPassword: boolean;
    maxViews: number | null;
    expiresIn: string;
    viewMode: boolean;
    onSyntaxChange: (value: string) => void;
    onSetPassword: () => void;
    onRemovePassword: () => void;
    onPasswordChange: (value: string) => void;
    onMaxViewsChange: (value: number | null) => void;
    onExpirationChange: (value: string) => void;
  }

  let {
    syntaxHighlight,
    passwordToSet = $bindable(),
    hasPassword,
    maxViews = $bindable(),
    expiresIn = $bindable(),
    viewMode,
    onSyntaxChange,
    onSetPassword,
    onRemovePassword,
    onPasswordChange,
    onMaxViewsChange,
    onExpirationChange
  }: Props = $props();

  const expiresInLabel = $derived(
    EXPIRATION_OPTIONS.find((opt) => opt.value === expiresIn)?.label ?? "Select expiration"
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
      <label for="max-views" class="block text-sm font-medium mb-2">Max Views</label>
      <MaxViewsInput
        bind:value={maxViews}
        disabled={viewMode}
        onSubmit={() => {}}
        onValueChange={onMaxViewsChange}
        inputClass="!bg-transparent border-0 shadow-none focus-visible:ring-0 px-3 w-full h-full"
      />
    </div>
    <div>
      <label for="expires-in" class="block text-sm font-medium mb-2">Expires In</label>
      <Select.Root bind:value={expiresIn} disabled={viewMode} type="single" onOpenChange={() => onExpirationChange(expiresIn)}>
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
    </div>
  </div>
</div>
