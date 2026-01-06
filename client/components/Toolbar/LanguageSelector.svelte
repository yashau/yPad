<script lang="ts">
  import { tick } from 'svelte';
  import * as Command from '../../lib/components/ui/command/index.js';
  import * as Popover from '../../lib/components/ui/popover/index.js';
  import Check from '@lucide/svelte/icons/check';
  import ChevronsUpDown from '@lucide/svelte/icons/chevrons-up-down';
  import type { LanguageOption } from '../../../config/languages';
  import { DEFAULT_LANGUAGE } from '../../../config/constants';

  interface Props {
    selected: string;
    disabled: boolean;
    onChange: (value: string) => void;
  }

  let { selected, disabled, onChange }: Props = $props();

  let comboboxOpen = $state(false);
  let comboboxTriggerRef = $state<HTMLButtonElement | null>(null);
  let languages = $state<readonly LanguageOption[]>([]);
  let isLoading = $state(false);

  // Find label from loaded languages, with fallback for default before lazy load
  const syntaxHighlightLabel = $derived(
    languages.find((opt) => opt.value === selected)?.label ??
    (selected === DEFAULT_LANGUAGE.value ? DEFAULT_LANGUAGE.label : selected) ??
    "Select language"
  );

  // Lazy load languages when popover opens
  async function loadLanguages() {
    if (languages.length > 0) return;
    isLoading = true;
    const { LANGUAGE_OPTIONS } = await import('../../../config/languages');
    languages = LANGUAGE_OPTIONS;
    isLoading = false;
  }

  function handleOpenChange(open: boolean) {
    comboboxOpen = open;
    if (open) {
      loadLanguages();
    }
  }

  function closeAndFocusTrigger() {
    comboboxOpen = false;
    tick().then(() => comboboxTriggerRef?.focus());
  }
</script>

<Popover.Root bind:open={comboboxOpen} onOpenChange={handleOpenChange}>
  <Popover.Trigger
    bind:ref={comboboxTriggerRef}
    class="flex h-9 w-full items-center justify-between bg-transparent hover:bg-accent rounded-md border border-input px-3 py-2 text-sm shadow-xs transition-colors outline-none disabled:cursor-not-allowed disabled:opacity-50"
    {disabled}
    title="Choose a programming language for syntax highlighting"
  >
    {syntaxHighlightLabel}
    <ChevronsUpDown class="ml-2 h-4 w-4 shrink-0 opacity-50" />
  </Popover.Trigger>
  <Popover.Content class="!w-(--bits-popover-anchor-width) p-0" align="start">
    <Command.Root shouldFilter={true}>
      <Command.Input placeholder="Search language..." />
      <Command.List>
        {#if isLoading}
          <Command.Empty>Loading languages...</Command.Empty>
        {:else}
          <Command.Empty>No language found.</Command.Empty>
          <Command.Group>
            {#each languages as lang}
              <Command.Item
                value={lang.label}
                keywords={[lang.value, lang.label]}
                onSelect={() => {
                  onChange(lang.value);
                  closeAndFocusTrigger();
                }}
              >
                <Check class={selected === lang.value ? "mr-2 h-4 w-4 opacity-100" : "mr-2 h-4 w-4 opacity-0"} />
                {lang.label}
              </Command.Item>
            {/each}
          </Command.Group>
        {/if}
      </Command.List>
    </Command.Root>
  </Popover.Content>
</Popover.Root>
