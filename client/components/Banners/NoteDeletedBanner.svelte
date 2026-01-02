<script lang="ts">
  import * as Alert from '../../lib/components/ui/alert/index.js';

  interface Props {
    show: boolean;
    deletedByCurrentUser: boolean;
  }

  let { show, deletedByCurrentUser }: Props = $props();
</script>

{#if show}
  <div class="px-4 py-3 border-b">
    <div class="max-w-7xl mx-auto">
      <Alert.Root variant="default" class="border-red-500 bg-red-500/10">
        <Alert.Description class="text-red-700 dark:text-red-200">
          {#if deletedByCurrentUser}
            This note has been deleted. You can continue viewing the content but cannot save changes.
          {:else}
            This note has been deleted by another user. You can continue viewing the content but cannot save changes.
          {/if}
        </Alert.Description>
      </Alert.Root>
    </div>
  </div>
{/if}
