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

  // Calculate the width needed based on the max line number
  let maxLineNumber = $derived(lineInfo.length > 0 ? lineInfo[lineInfo.length - 1].lineNumber : 1);
  let digitCount = $derived(String(maxLineNumber).length);
</script>

<div
  bind:this={lineNumbersRef}
  class="flex-shrink-0 bg-muted text-muted-foreground/50 pt-4 pr-2 pb-8 font-mono text-xs leading-6 select-none overflow-hidden border-r border-border text-right"
  style="padding-left: 0.5rem; width: {digitCount * 0.6 + 1}rem;"
>
  {#each lineInfo as info}
    <div class="leading-6" style="height: {info.visualLineCount * 1.5}rem;">{info.lineNumber}</div>
  {/each}
</div>
