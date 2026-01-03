<script lang="ts">
  import { Button } from '../../lib/components/ui/button/index.js';
  import * as Alert from '../../lib/components/ui/alert/index.js';
  import { onDestroy } from 'svelte';

  interface Props {
    show: boolean;
    onDismiss: () => void;
  }

  let { show, onDismiss }: Props = $props();

  let countdown = $state(5);
  let intervalId: ReturnType<typeof setInterval> | null = null;

  $effect(() => {
    if (show) {
      countdown = 5;
      intervalId = setInterval(() => {
        countdown--;
        if (countdown <= 0) {
          if (intervalId) clearInterval(intervalId);
          onDismiss();
        }
      }, 1000);
    } else {
      if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
      }
    }
  });

  onDestroy(() => {
    if (intervalId) clearInterval(intervalId);
  });
</script>

{#if show}
  <div class="px-4 py-3 border-b">
    <div class="max-w-7xl mx-auto">
      <Alert.Root variant="default" class="border-blue-500 bg-blue-500/10">
        <Alert.Description class="flex items-center justify-between gap-4 text-blue-700 dark:text-blue-300">
          <span>Password protection enabled! Your note is now encrypted. Real-time collaboration is disabled to preserve E2E encryption.</span>
          <Button
            size="sm"
            variant="ghost"
            onclick={onDismiss}
            class="flex-shrink-0 text-blue-700 dark:text-blue-300 hover:bg-blue-600 hover:text-white dark:hover:bg-blue-600 dark:hover:text-white"
          >
            Dismiss ({countdown})
          </Button>
        </Alert.Description>
      </Alert.Root>
    </div>
  </div>
{/if}
