/**
 * @fileoverview Lazy-loaded syntax highlighter utility.
 *
 * Provides on-demand loading of highlight.js to reduce initial bundle size.
 * The library is only loaded when syntax highlighting is actually needed
 * (user selects a language or loads a note with a language set).
 */

import type { HLJSApi } from 'highlight.js';

/** Cached highlight.js instance */
let hljsInstance: HLJSApi | null = null;

/** Promise for loading in progress (prevents duplicate loads) */
let loadingPromise: Promise<HLJSApi> | null = null;

/**
 * Lazily loads highlight.js and returns the instance.
 * Subsequent calls return the cached instance.
 */
export async function getHighlighter(): Promise<HLJSApi> {
  // Return cached instance if available
  if (hljsInstance) {
    return hljsInstance;
  }

  // Return existing loading promise if in progress
  if (loadingPromise) {
    return loadingPromise;
  }

  // Start loading
  loadingPromise = import('highlight.js').then((module) => {
    hljsInstance = module.default;
    loadingPromise = null;
    return hljsInstance;
  });

  return loadingPromise;
}

/**
 * Highlights code with the specified language.
 * Returns the original content if highlight.js isn't loaded yet or highlighting fails.
 *
 * @param content - The code to highlight
 * @param language - The language identifier
 * @returns The highlighted HTML or original content
 */
export function highlightSync(content: string, language: string): string {
  if (!hljsInstance || language === 'plaintext' || !content) {
    return content;
  }

  try {
    return hljsInstance.highlight(content, { language }).value;
  } catch {
    return content;
  }
}

/**
 * Checks if highlight.js is currently loaded.
 */
export function isHighlighterLoaded(): boolean {
  return hljsInstance !== null;
}

/**
 * Preloads highlight.js without blocking.
 * Useful for preloading when user opens the language selector.
 */
export function preloadHighlighter(): void {
  if (!hljsInstance && !loadingPromise) {
    getHighlighter().catch(() => {
      // Silently ignore preload failures
    });
  }
}
