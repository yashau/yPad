<script lang="ts">
  import { onMount, onDestroy } from 'svelte';

  // Props
  let {
    position = 0,
    editorRef = null,
    color = 'blue',
    label = 'User'
  }: {
    position: number;
    editorRef: HTMLElement | null;
    color?: string;
    label?: string;
  } = $props();

  // State
  let cursorStyle = $state('');
  let visible = $state(true);

  // 10 pastel cursor colors - matches CURSOR_COLORS in useCollaboration
  const cursorBgClasses: Record<string, string> = {
    blue: 'bg-blue-400',
    green: 'bg-emerald-400',
    rose: 'bg-rose-400',
    amber: 'bg-amber-400',
    purple: 'bg-purple-400',
    pink: 'bg-pink-400',
    orange: 'bg-orange-400',
    cyan: 'bg-cyan-400',
    teal: 'bg-teal-400',
    indigo: 'bg-indigo-400',
  };

  const cursorTextClasses: Record<string, string> = {
    blue: 'text-blue-400',
    green: 'text-emerald-400',
    rose: 'text-rose-400',
    amber: 'text-amber-400',
    purple: 'text-purple-400',
    pink: 'text-pink-400',
    orange: 'text-orange-400',
    cyan: 'text-cyan-400',
    teal: 'text-teal-400',
    indigo: 'text-indigo-400',
  };

  const cursorBgClass = $derived(cursorBgClasses[color] || cursorBgClasses.blue);
  const cursorTextClass = $derived(cursorTextClasses[color] || cursorTextClasses.blue);

  // Calculate cursor position based on character offset
  function calculatePosition() {
    if (!editorRef) {
      visible = false;
      return;
    }

    try {
      // Check if it's a textarea element
      if (editorRef instanceof HTMLTextAreaElement) {
        // For textarea, we need to use a different approach
        // Create a mirror div to measure text position
        const textarea = editorRef;
        const computedStyle = window.getComputedStyle(textarea);
        const textareaRect = textarea.getBoundingClientRect();

        // Create temporary div to calculate position
        const mirror = document.createElement('div');
        mirror.style.position = 'absolute';
        mirror.style.top = `${textareaRect.top}px`;
        mirror.style.left = `${textareaRect.left}px`;
        mirror.style.visibility = 'hidden';
        mirror.style.whiteSpace = 'pre-wrap';
        mirror.style.wordWrap = 'break-word';
        mirror.style.font = computedStyle.font;
        mirror.style.padding = computedStyle.padding;
        mirror.style.border = computedStyle.border;
        mirror.style.width = computedStyle.width;
        mirror.style.lineHeight = computedStyle.lineHeight;
        mirror.style.boxSizing = 'border-box';

        const text = textarea.value.substring(0, position);
        mirror.textContent = text;

        // Add a span at cursor position
        const cursorSpan = document.createElement('span');
        cursorSpan.textContent = '|';
        mirror.appendChild(cursorSpan);

        document.body.appendChild(mirror);

        const spanRect = cursorSpan.getBoundingClientRect();

        // Calculate position relative to the textarea
        const top = spanRect.top - textareaRect.top + textarea.scrollTop;
        const left = spanRect.left - textareaRect.left + textarea.scrollLeft;

        document.body.removeChild(mirror);

        cursorStyle = `top: ${top}px; left: ${left}px;`;
        visible = true;
      } else {
        // ContentEditable mode
        const range = document.createRange();
        const walker = document.createTreeWalker(editorRef, NodeFilter.SHOW_TEXT);
        let charCount = 0;
        let targetNode: Node | null = null;
        let targetOffset = 0;

        // Find the text node and offset for the cursor position
        while ((targetNode = walker.nextNode())) {
          const nodeLength = targetNode.textContent?.length || 0;

          if (charCount + nodeLength >= position) {
            targetOffset = position - charCount;
            break;
          }
          charCount += nodeLength;
        }

        if (targetNode) {
          // Set range at cursor position
          range.setStart(targetNode, Math.min(targetOffset, targetNode.textContent?.length || 0));
          range.collapse(true);

          // Get bounding rect
          const rect = range.getBoundingClientRect();
          const editorRect = editorRef.getBoundingClientRect();

          // Calculate position relative to editor
          const top = rect.top - editorRect.top + editorRef.scrollTop;
          const left = rect.left - editorRect.left + editorRef.scrollLeft;

          cursorStyle = `top: ${top}px; left: ${left}px;`;
          visible = true;
        } else {
          // Position is beyond content, hide cursor
          visible = false;
        }
      }
    } catch (error) {
      console.error('Error calculating cursor position:', error);
      visible = false;
    }
  }

  // Recalculate position when position or editorRef changes
  $effect(() => {
    position;
    editorRef;
    calculatePosition();
  });

  // Recalculate on scroll or resize
  let resizeObserver: ResizeObserver | null = null;
  let scrollHandler: (() => void) | null = null;

  onMount(() => {
    if (editorRef) {
      scrollHandler = () => calculatePosition();
      editorRef.addEventListener('scroll', scrollHandler);

      resizeObserver = new ResizeObserver(() => calculatePosition());
      resizeObserver.observe(editorRef);
    }
  });

  onDestroy(() => {
    if (editorRef && scrollHandler) {
      editorRef.removeEventListener('scroll', scrollHandler);
    }
    if (resizeObserver) {
      resizeObserver.disconnect();
    }
  });
</script>

{#if visible && editorRef}
  <div
    class="absolute pointer-events-none z-50 transition-all duration-75"
    style={cursorStyle}
  >
    <!-- Cursor line -->
    <div class="relative h-4">
      <div class={`w-0.5 h-full ${cursorBgClass}`}></div>
      <!-- Label -->
      <div class={`absolute -top-5 left-0.5 text-xs font-medium whitespace-nowrap ${cursorTextClass}`}>
        {label}
      </div>
    </div>
  </div>
{/if}
