<script lang="ts">
  interface Props {
    lineCount: number;
    lineNumbersRef?: HTMLDivElement | null;
  }

  let { lineCount, lineNumbersRef = $bindable() }: Props = $props();
</script>

<div
  bind:this={lineNumbersRef}
  class="flex-shrink-0 bg-muted text-muted-foreground p-4 pr-2 font-mono text-sm select-none overflow-hidden border-r border-border min-w-[3.5rem] text-right"
>
  {#each Array(lineCount) as _, i}
    <div class="leading-6">{i + 1}</div>
  {/each}
</div>
