<script lang="ts">
  import Lock from '@lucide/svelte/icons/lock';

  interface Props {
    hasPassword: boolean;
    viewMode: boolean;
  }

  let { hasPassword, viewMode }: Props = $props();
</script>

{#if hasPassword && !viewMode}
  <div class="flex items-center gap-1 px-2 py-1 md:px-3 md:py-1.5 bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-200 rounded-md text-xs md:text-sm border border-blue-300 dark:border-blue-700 leading-none" title="This note is password protected">
    <Lock class="h-3 w-3 md:h-3.5 md:w-3.5" />
    <span>Protected</span>
  </div>
{/if}
