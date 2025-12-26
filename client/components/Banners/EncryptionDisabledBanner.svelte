<script lang="ts">
  import { Button } from '../../lib/components/ui/button/index.js';
  import * as Alert from '../../lib/components/ui/alert/index.js';

  interface Props {
    show: boolean;
    byOtherUser: boolean;
    onDismiss: () => void;
  }

  let { show, byOtherUser, onDismiss }: Props = $props();
</script>

{#if show}
  <div class="px-4 py-3 border-b">
    <div class="max-w-7xl mx-auto">
      <Alert.Root variant="default" class="border-green-300 dark:border-green-700 bg-green-50 dark:bg-green-900/20">
        <Alert.Description class="text-green-800 dark:text-green-200 flex items-center justify-between gap-4">
          <span>
            {#if byOtherUser}
              Password protection was removed by another user. Real-time collaboration is now enabled.
            {:else}
              Password protection removed! Real-time collaboration is now enabled.
            {/if}
          </span>
          <Button
            size="sm"
            variant="ghost"
            onclick={onDismiss}
            class="text-green-800 dark:text-green-200 hover:bg-green-200 dark:hover:bg-green-800 flex-shrink-0"
          >
            Dismiss
          </Button>
        </Alert.Description>
      </Alert.Root>
    </div>
  </div>
{/if}
