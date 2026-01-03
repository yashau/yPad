<script lang="ts">
  import { Button } from '../../lib/components/ui/button/index.js';
  import * as Dialog from '../../lib/components/ui/dialog/index.js';

  interface Props {
    open: boolean;
    onSubmit: () => void;
    onCancel: () => void;
  }

  let { open = $bindable(), onSubmit, onCancel }: Props = $props();
</script>

<Dialog.Root bind:open>
  <Dialog.Portal>
    <Dialog.Overlay />
    <Dialog.Content class="sm:top-[50%] sm:translate-y-[-50%] top-[20%] translate-y-0">
      <Dialog.Header>
        <Dialog.Title>Remove Password Protection</Dialog.Title>
        <Dialog.Description>This will remove encryption and make the note accessible to anyone with the link. Real-time collaboration will be enabled.</Dialog.Description>
      </Dialog.Header>
      <Dialog.Footer>
        <Button variant="outline" onclick={onCancel}>
          Cancel
        </Button>
        <Button onclick={onSubmit} variant="destructive">Remove Protection</Button>
      </Dialog.Footer>
    </Dialog.Content>
  </Dialog.Portal>
</Dialog.Root>
