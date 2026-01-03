<script lang="ts">
  import { Button } from '../../lib/components/ui/button/index.js';
  import * as Alert from '../../lib/components/ui/alert/index.js';

  interface Props {
    show: boolean;
    isEncrypted: boolean;
    onReload: () => void;
  }

  let { show, isEncrypted, onReload }: Props = $props();
</script>

{#if show && isEncrypted}
  <div class="px-4 py-3 border-b">
    <div class="max-w-7xl mx-auto">
      <Alert.Root variant="default" class="border-yellow-500 bg-yellow-500/10">
        <Alert.Description class="flex items-center justify-between gap-4 text-yellow-700 dark:text-yellow-300">
          <span>This note was updated by another user. Reload to see the latest changes.</span>
          <Button
            size="sm"
            onclick={onReload}
            class="flex-shrink-0"
          >
            Reload
          </Button>
        </Alert.Description>
      </Alert.Root>
    </div>
  </div>
{/if}
