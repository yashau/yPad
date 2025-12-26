<script lang="ts">
  import { Button } from '../../lib/components/ui/button/index.js';
  import { Input } from '../../lib/components/ui/input/index.js';
  import * as Dialog from '../../lib/components/ui/dialog/index.js';
  import * as Alert from '../../lib/components/ui/alert/index.js';

  interface Props {
    open: boolean;
    passwordInput: string;
    passwordError: string;
    onSubmit: () => void;
    onCancel: () => void;
    onPasswordChange: (value: string) => void;
  }

  let { open = $bindable(), passwordInput = $bindable(), passwordError, onSubmit, onCancel, onPasswordChange }: Props = $props();

  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === 'Enter') {
      onSubmit();
    }
  }
</script>

<Dialog.Root bind:open>
  <Dialog.Portal>
    <Dialog.Overlay />
    <Dialog.Content>
      <Dialog.Header>
        <Dialog.Title>Password Required</Dialog.Title>
        <Dialog.Description>This note is password protected.</Dialog.Description>
      </Dialog.Header>
      {#if passwordError}
        <Alert.Root variant="destructive" class="mb-4 border-destructive/50 bg-destructive/10 dark:border-destructive">
          <Alert.Description>{passwordError}</Alert.Description>
        </Alert.Root>
      {/if}
      <Input
        type="password"
        bind:value={passwordInput}
        placeholder="Enter password"
        class="mb-4"
        onkeydown={handleKeyDown}
        oninput={(e) => onPasswordChange((e.target as HTMLInputElement).value)}
      />
      <Dialog.Footer>
        <Button variant="outline" onclick={onCancel}>
          Cancel
        </Button>
        <Button onclick={onSubmit}>Submit</Button>
      </Dialog.Footer>
    </Dialog.Content>
  </Dialog.Portal>
</Dialog.Root>
