<script lang="ts">
  import { Button } from '../../lib/components/ui/button/index.js';
  import * as Dialog from '../../lib/components/ui/dialog/index.js';

  interface Props {
    open: boolean;
    onReload: () => void;
    onKeepEditing: () => void;
  }

  let { open = $bindable(), onReload, onKeepEditing }: Props = $props();
</script>

<Dialog.Root bind:open>
  <Dialog.Portal>
    <Dialog.Overlay />
    <Dialog.Content>
      <Dialog.Header>
        <Dialog.Title>Edit Conflict Detected</Dialog.Title>
        <Dialog.Description>
          Someone else has edited this paste while you were working on it. Your unsaved changes cannot be saved automatically.
        </Dialog.Description>
      </Dialog.Header>
      <p class="text-sm text-muted-foreground mb-4">
        To see the latest version, you'll need to reload the page. Your current unsaved changes will be lost.
      </p>
      <Dialog.Footer class="mt-4">
        <Button variant="outline" onclick={onKeepEditing}>
          Keep Editing
        </Button>
        <Button onclick={onReload}>
          Reload Page
        </Button>
      </Dialog.Footer>
    </Dialog.Content>
  </Dialog.Portal>
</Dialog.Root>
