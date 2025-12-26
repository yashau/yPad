<script lang="ts">
  import { Button } from '../../lib/components/ui/button/index.js';
  import { Input } from '../../lib/components/ui/input/index.js';
  import * as Dialog from '../../lib/components/ui/dialog/index.js';

  interface Props {
    open: boolean;
    customUrl: string;
    customUrlAvailable: boolean;
    onSubmit: () => void;
    onCancel: () => void;
    onUrlChange: (value: string) => void;
  }

  let { open = $bindable(), customUrl = $bindable(), customUrlAvailable, onSubmit, onCancel, onUrlChange }: Props = $props();
</script>

<Dialog.Root bind:open>
  <Dialog.Portal>
    <Dialog.Overlay />
    <Dialog.Content>
      <Dialog.Header>
        <Dialog.Title>Set Custom URL</Dialog.Title>
        <Dialog.Description>Choose a custom URL for your note.</Dialog.Description>
      </Dialog.Header>
      <Input
        bind:value={customUrl}
        placeholder="my-custom-url"
        class="mb-2"
        oninput={(e) => onUrlChange((e.target as HTMLInputElement).value)}
      />
      {#if customUrl && !customUrlAvailable}
        <p class="text-sm text-destructive mb-4">This URL is already taken</p>
      {:else if customUrl && customUrlAvailable}
        <p class="text-sm text-green-600 mb-4">This URL is available</p>
      {/if}
      <Dialog.Footer class="mt-4">
        <Button variant="outline" onclick={onCancel}>
          Cancel
        </Button>
        <Button onclick={onSubmit} disabled={!customUrlAvailable || !customUrl}>
          Set URL
        </Button>
      </Dialog.Footer>
    </Dialog.Content>
  </Dialog.Portal>
</Dialog.Root>
