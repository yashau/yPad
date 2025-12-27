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
      <Alert.Root variant="destructive" class="bg-destructive dark:bg-destructive/60 [&_[data-slot=alert-description]]:!text-destructive-foreground">
        <Alert.Description>
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
