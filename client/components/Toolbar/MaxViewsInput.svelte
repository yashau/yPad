<script lang="ts">
  import { Input } from '../../lib/components/ui/input/index.js';
  import { Button } from '../../lib/components/ui/button/index.js';
  import Check from '@lucide/svelte/icons/check';

  interface Props {
    value: number | null;
    disabled: boolean;
    onSubmit: () => void;
    onValueChange: (value: number | null) => void;
    inputClass?: string;
  }

  let { value = $bindable(), disabled, onSubmit, onValueChange, inputClass }: Props = $props();

  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === 'Enter') {
      onSubmit();
    }
  }

  function handleClick() {
    onSubmit();
  }
</script>

<div class="flex items-stretch bg-transparent dark:bg-input/30 rounded-md h-9 border border-input shadow-xs w-full">
  <div class="inline-flex items-center text-sm flex-1">
    <Input
      id="max-views"
      type="number"
      bind:value
      placeholder="Unlimited"
      disabled={disabled}
      title="Set maximum number of times this note can be viewed before being deleted"
      onkeydown={handleKeyDown}
      oninput={(e) => {
        const val = (e.target as HTMLInputElement).value;
        onValueChange(val ? parseInt(val) : null);
      }}
      class={inputClass}
    />
  </div>
  <Button
    onclick={handleClick}
    disabled={disabled}
    variant="outline"
    class="rounded-r-md rounded-l-none h-full group size-8"
    title="Submit max views"
  >
    <Check class="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors" />
  </Button>
</div>
