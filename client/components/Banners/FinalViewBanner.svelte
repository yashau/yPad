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
      <Alert.Root variant="default" class="border-red-500 bg-red-500/10">
        <Alert.Description class="text-red-700 dark:text-red-200">
          This note has reached its view limit and has been permanently deleted from the server.
          Copy the content now if you need it - you won't be able to access it after leaving this page.
        </Alert.Description>
      </Alert.Root>
    </div>
  </div>
{/if}
