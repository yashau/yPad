<script lang="ts">
  interface LineInfo {
    lineNumber: number;
    visualLineCount: number;
  }

  interface Props {
    lineInfo: LineInfo[];
    lineNumbersRef?: HTMLDivElement | null;
  }

  let { lineInfo, lineNumbersRef = $bindable() }: Props = $props();
</script>

<div
  bind:this={lineNumbersRef}
  class="flex-shrink-0 bg-muted text-muted-foreground p-4 pr-2 pb-8 font-mono text-base md:text-sm select-none overflow-hidden border-r border-border min-w-[3.5rem] text-right"
>
  {#each lineInfo as info}
    <div class="leading-6" style="height: {info.visualLineCount * 1.5}rem;">{info.lineNumber}</div>
  {/each}
</div>
