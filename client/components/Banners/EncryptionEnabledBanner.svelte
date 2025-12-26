<script lang="ts">
  import { Button } from '../../lib/components/ui/button/index.js';
  import * as Alert from '../../lib/components/ui/alert/index.js';

  interface Props {
    show: boolean;
    onDismiss: () => void;
  }

  let { show, onDismiss }: Props = $props();
</script>

{#if show}
  <div class="px-4 py-3 border-b">
    <div class="max-w-7xl mx-auto">
      <Alert.Root variant="default" class="border-blue-300 dark:border-blue-700 bg-blue-50 dark:bg-blue-900/20">
        <Alert.Description class="text-blue-800 dark:text-blue-200 flex items-center justify-between gap-4">
          <span>Password protection enabled! Your note is now encrypted. Real-time collaboration is disabled to preserve E2E encryption.</span>
          <Button
            size="sm"
            variant="ghost"
            onclick={onDismiss}
            class="text-blue-800 dark:text-blue-200 hover:bg-blue-200 dark:hover:bg-blue-800 flex-shrink-0"
          >
            Dismiss
          </Button>
        </Alert.Description>
      </Alert.Root>
    </div>
  </div>
{/if}
