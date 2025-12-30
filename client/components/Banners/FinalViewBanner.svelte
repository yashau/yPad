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
      <Alert.Root variant="destructive" class="bg-destructive dark:bg-destructive/60 [&_[data-slot=alert-description]]:!text-destructive-foreground">
        <Alert.Description>
          This note has reached its view limit and has been permanently deleted from the server.
          Copy the content now if you need it - you won't be able to access it after leaving this page.
        </Alert.Description>
      </Alert.Root>
    </div>
  </div>
{/if}
