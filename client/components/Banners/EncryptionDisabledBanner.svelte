<script lang="ts">
  import { Button } from '../../lib/components/ui/button/index.js';
  import * as Alert from '../../lib/components/ui/alert/index.js';
  import { onDestroy } from 'svelte';

  interface Props {
    show: boolean;
    byOtherUser: boolean;
    onDismiss: () => void;
  }

  let { show, byOtherUser, onDismiss }: Props = $props();

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
      <Alert.Root variant="default" class="border-green-500 bg-green-500/10">
        <Alert.Description class="flex items-center justify-between gap-4 text-green-700 dark:text-green-300">
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
            class="flex-shrink-0 text-green-700 dark:text-green-300 hover:bg-green-600 hover:text-white dark:hover:bg-green-600 dark:hover:text-white"
          >
            Dismiss ({countdown})
          </Button>
        </Alert.Description>
      </Alert.Root>
    </div>
  </div>
{/if}
