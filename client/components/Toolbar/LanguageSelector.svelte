<script lang="ts">
  import { tick } from 'svelte';
  import * as Command from '../../lib/components/ui/command/index.js';
  import * as Popover from '../../lib/components/ui/popover/index.js';
  import Check from '@lucide/svelte/icons/check';
  import ChevronsUpDown from '@lucide/svelte/icons/chevrons-up-down';
  import { LANGUAGE_OPTIONS } from '../../../config/constants';

  interface Props {
    selected: string;
    disabled: boolean;
    onChange: (value: string) => void;
  }

  let { selected, disabled, onChange }: Props = $props();

  let comboboxOpen = $state(false);
  let comboboxTriggerRef = $state<HTMLButtonElement | null>(null);

  const syntaxHighlightLabel = $derived(
    LANGUAGE_OPTIONS.find((opt) => opt.value === selected)?.label ?? "Select language"
  );

  function closeAndFocusTrigger() {
    comboboxOpen = false;
    tick().then(() => comboboxTriggerRef?.focus());
  }
</script>

<Popover.Root bind:open={comboboxOpen}>
  <Popover.Trigger
    bind:ref={comboboxTriggerRef}
    class="flex h-9 w-full items-center justify-between bg-transparent dark:bg-input/30 dark:hover:bg-input/50 rounded-md border border-input px-3 py-2 text-sm shadow-xs transition-[color,box-shadow] outline-none disabled:cursor-not-allowed disabled:opacity-50"
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
        <Command.Empty>No language found.</Command.Empty>
        <Command.Group>
          {#each LANGUAGE_OPTIONS as lang}
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
      </Command.List>
    </Command.Root>
  </Popover.Content>
</Popover.Root>
