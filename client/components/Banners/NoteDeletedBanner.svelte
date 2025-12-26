<script lang="ts">
  import * as Alert from '../../lib/components/ui/alert/index.js';

  interface Props {
    show: boolean;
  }

  let { show }: Props = $props();
</script>

{#if show}
  <div class="px-4 py-3 border-b">
    <div class="max-w-7xl mx-auto">
      <Alert.Root variant="destructive" class="border-red-300 dark:border-red-700">
        <Alert.Description class="text-red-800 dark:text-red-200">
          This note has been deleted by another user. You can continue viewing the content but cannot save changes.
        </Alert.Description>
      </Alert.Root>
    </div>
  </div>
{/if}
