<script lang="ts">
  import { Button } from '../../lib/components/ui/button/index.js';
  import * as Alert from '../../lib/components/ui/alert/index.js';

  interface Props {
    show: boolean;
    isEncrypted: boolean;
    onReload: () => void;
    onDismiss: () => void;
  }

  let { show, isEncrypted, onReload, onDismiss }: Props = $props();
</script>

{#if show && isEncrypted}
  <div class="px-4 py-3 border-b">
    <div class="max-w-7xl mx-auto">
      <Alert.Root variant="default" class="border-yellow-300 dark:border-yellow-700 bg-yellow-50 dark:bg-yellow-900/20">
        <Alert.Description class="text-yellow-800 dark:text-yellow-200 flex items-center justify-between gap-4">
          <span>This note was updated by another user. Reload to see the latest changes.</span>
          <div class="flex gap-2 flex-shrink-0">
            <Button
              size="sm"
              onclick={onReload}
              class="bg-yellow-600 hover:bg-yellow-700 text-white"
            >
              Reload
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onclick={onDismiss}
              class="text-yellow-800 dark:text-yellow-200 hover:bg-yellow-200 dark:hover:bg-yellow-800"
            >
              Dismiss
            </Button>
          </div>
        </Alert.Description>
      </Alert.Root>
    </div>
  </div>
{/if}
