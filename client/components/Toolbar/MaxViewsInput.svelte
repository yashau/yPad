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

  function handleSubmit(e: Event) {
    e.preventDefault();
    onSubmit();
  }
</script>

<form class="flex items-stretch bg-transparent rounded-md h-9 border border-input shadow-xs w-full dark:bg-input/30 dark:hover:bg-input/50 transition-[color,box-shadow]" onsubmit={handleSubmit}>
  <div class="inline-flex items-center text-sm flex-1">
    <Input
      id="max-views"
      type="number"
      bind:value
      placeholder="Unlimited"
      disabled={disabled}
      title="Set maximum number of times this note can be viewed before being deleted"
      enterkeyhint="done"
      oninput={(e) => {
        const val = (e.target as HTMLInputElement).value;
        onValueChange(val ? parseInt(val) : null);
      }}
      class={inputClass}
    />
  </div>
  <Button
    type="submit"
    disabled={disabled}
    variant="ghost"
    class="!rounded-l-none h-full w-9 border-l border-input bg-muted/50 hover:bg-muted dark:bg-input/50 dark:hover:bg-input"
    title="Submit max views"
  >
    <Check class="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors" />
  </Button>
</form>
