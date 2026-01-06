/**
 * Shared E2E Test Utilities
 *
 * Common helpers for collaborative editing tests.
 */

import { Page, BrowserContext, devices } from '@playwright/test';

// Mobile device configuration (iPhone 12 Pro)
export const MOBILE_DEVICE = devices['iPhone 12 Pro'];

export interface ClientInfo {
  context: BrowserContext;
  page: Page;
  name: string;
  isMobile?: boolean;
}

/**
 * Generate content long enough to require scrolling on both desktop and mobile
 */
export function generateLongContent(lineCount: number = 100): string {
  const lines: string[] = [];
  for (let i = 1; i <= lineCount; i++) {
    if (i % 10 === 0) {
      lines.push(`=== Section ${i / 10} ===`);
    } else if (i % 5 === 0) {
      lines.push(`Line ${i}: This is a longer line with more content to make scrolling more realistic and test word wrapping.`);
    } else {
      lines.push(`Line ${i}: Content here`);
    }
  }
  return lines.join('\n');
}

/**
 * Helper to create a note and wait for WebSocket connection
 */
export async function createNote(page: Page, content: string): Promise<string> {
  await page.goto('/');
  await page.waitForLoadState('networkidle');

  const textarea = page.locator('textarea');
  await textarea.click();
  await textarea.fill(content);

  // Wait for auto-save and URL update
  await page.waitForFunction(() => window.location.pathname.length > 1, { timeout: 15000 });

  // Wait for WebSocket connection
  await page.waitForTimeout(500);

  return page.url();
}

/**
 * Helper to wait for WebSocket connection (green dot)
 */
export async function waitForConnection(page: Page): Promise<void> {
  await page.waitForSelector('header .bg-green-500', { timeout: 10000 });
  await page.waitForTimeout(500);
}

/**
 * Get the current cursor position in the active editor (textarea or contenteditable)
 */
export async function getCursorPosition(page: Page): Promise<number> {
  return page.evaluate(() => {
    const textarea = document.querySelector('textarea') as HTMLTextAreaElement;
    if (textarea) {
      return textarea.selectionStart ?? -1;
    }
    // For contenteditable (syntax highlight mode)
    const contentEditable = document.querySelector('[contenteditable="true"]') as HTMLDivElement;
    if (contentEditable) {
      const selection = window.getSelection();
      if (!selection || selection.rangeCount === 0) return -1;
      const range = selection.getRangeAt(0);
      const walker = document.createTreeWalker(contentEditable, NodeFilter.SHOW_TEXT);
      let charCount = 0;
      let node: Node | null = null;
      while ((node = walker.nextNode())) {
        if (node === range.startContainer) {
          return charCount + range.startOffset;
        }
        charCount += node.textContent?.length || 0;
      }
      return charCount;
    }
    return -1;
  });
}

/**
 * Get the current selection range in the active editor
 */
export async function getSelectionRange(page: Page): Promise<{ start: number; end: number }> {
  return page.evaluate(() => {
    const textarea = document.querySelector('textarea') as HTMLTextAreaElement;
    if (textarea) {
      return {
        start: textarea.selectionStart ?? -1,
        end: textarea.selectionEnd ?? -1
      };
    }
    // For contenteditable
    const contentEditable = document.querySelector('[contenteditable="true"]') as HTMLDivElement;
    if (contentEditable) {
      const selection = window.getSelection();
      if (!selection || selection.rangeCount === 0) return { start: -1, end: -1 };
      const range = selection.getRangeAt(0);
      const walker = document.createTreeWalker(contentEditable, NodeFilter.SHOW_TEXT);
      let charCount = 0;
      let startPos = -1;
      let endPos = -1;
      let node: Node | null = null;
      while ((node = walker.nextNode())) {
        if (node === range.startContainer) {
          startPos = charCount + range.startOffset;
        }
        if (node === range.endContainer) {
          endPos = charCount + range.endOffset;
          break;
        }
        charCount += node.textContent?.length || 0;
      }
      return { start: startPos, end: endPos };
    }
    return { start: -1, end: -1 };
  });
}

/**
 * Set cursor position in the active editor
 */
export async function setCursorPosition(page: Page, position: number): Promise<void> {
  await page.evaluate((pos) => {
    const textarea = document.querySelector('textarea') as HTMLTextAreaElement;
    if (textarea) {
      textarea.focus();
      textarea.setSelectionRange(pos, pos);
      return;
    }
    // For contenteditable
    const contentEditable = document.querySelector('[contenteditable="true"]') as HTMLDivElement;
    if (contentEditable) {
      contentEditable.focus();
      const selection = window.getSelection();
      if (!selection) return;
      const range = document.createRange();
      const walker = document.createTreeWalker(contentEditable, NodeFilter.SHOW_TEXT);
      let charCount = 0;
      let node: Node | null = null;
      while ((node = walker.nextNode())) {
        const nodeLength = node.textContent?.length || 0;
        if (charCount + nodeLength >= pos) {
          range.setStart(node, pos - charCount);
          range.setEnd(node, pos - charCount);
          selection.removeAllRanges();
          selection.addRange(range);
          return;
        }
        charCount += nodeLength;
      }
    }
  }, position);
}

/**
 * Set selection range in the active editor
 */
export async function setSelectionRange(page: Page, start: number, end: number): Promise<void> {
  await page.evaluate(({ start, end }) => {
    const textarea = document.querySelector('textarea') as HTMLTextAreaElement;
    if (textarea) {
      textarea.focus();
      textarea.setSelectionRange(start, end);
      return;
    }
    // For contenteditable
    const contentEditable = document.querySelector('[contenteditable="true"]') as HTMLDivElement;
    if (contentEditable) {
      contentEditable.focus();
      const selection = window.getSelection();
      if (!selection) return;
      const range = document.createRange();
      const walker = document.createTreeWalker(contentEditable, NodeFilter.SHOW_TEXT);
      let charCount = 0;
      let startSet = false;
      let node: Node | null = null;
      while ((node = walker.nextNode())) {
        const nodeLength = node.textContent?.length || 0;
        if (!startSet && charCount + nodeLength >= start) {
          range.setStart(node, start - charCount);
          startSet = true;
        }
        if (startSet && charCount + nodeLength >= end) {
          range.setEnd(node, end - charCount);
          selection.removeAllRanges();
          selection.addRange(range);
          return;
        }
        charCount += nodeLength;
      }
    }
  }, { start, end });
}

/**
 * Get editor content (works for both textarea and contenteditable)
 */
export async function getEditorContent(page: Page): Promise<string> {
  return page.evaluate(() => {
    const textarea = document.querySelector('textarea') as HTMLTextAreaElement;
    if (textarea) {
      return textarea.value;
    }
    const contentEditable = document.querySelector('[contenteditable="true"]') as HTMLDivElement;
    if (contentEditable) {
      return contentEditable.textContent || '';
    }
    return '';
  });
}

/**
 * Focus the editor (click to simulate realistic user interaction)
 */
export async function focusEditor(page: Page): Promise<void> {
  const textarea = page.locator('textarea');
  const isTextareaVisible = await textarea.isVisible().catch(() => false);
  if (isTextareaVisible) {
    await textarea.click();
  } else {
    const contentEditable = page.locator('[contenteditable="true"]');
    await contentEditable.click();
  }
}

/**
 * Get scroll position of the editor
 */
export async function getScrollPosition(page: Page): Promise<{ scrollTop: number; scrollLeft: number }> {
  return page.evaluate(() => {
    const textarea = document.querySelector('textarea') as HTMLTextAreaElement;
    if (textarea) {
      return { scrollTop: textarea.scrollTop ?? 0, scrollLeft: textarea.scrollLeft ?? 0 };
    }
    const contentEditable = document.querySelector('[contenteditable="true"]') as HTMLDivElement;
    if (contentEditable) {
      return { scrollTop: contentEditable.scrollTop ?? 0, scrollLeft: contentEditable.scrollLeft ?? 0 };
    }
    return { scrollTop: 0, scrollLeft: 0 };
  });
}

/**
 * Scroll to a specific line (approximately)
 */
export async function scrollToLine(page: Page, lineNumber: number): Promise<void> {
  await page.evaluate((line) => {
    const textarea = document.querySelector('textarea') as HTMLTextAreaElement;
    if (textarea) {
      textarea.scrollTop = (line - 1) * 20;
      return;
    }
    const contentEditable = document.querySelector('[contenteditable="true"]') as HTMLDivElement;
    if (contentEditable) {
      contentEditable.scrollTop = (line - 1) * 20;
    }
  }, lineNumber);
}

/**
 * Change syntax highlighting mode.
 * The language selector uses a Popover/Command UI pattern with lazy-loaded options.
 */
export async function setSyntaxHighlight(page: Page, language: string): Promise<void> {
  // First, open the options panel by clicking the Options button
  const optionsBtn = page.locator('button:has-text("Options")');
  await optionsBtn.click();
  await page.waitForTimeout(300);

  // Find the language selector button - it shows current language (e.g., "Plain Text")
  const langButton = page.locator('button').filter({ hasText: /Plain\s*Text|JavaScript|Python|TypeScript|HTML|CSS|JSON/i }).first();
  await langButton.click({ timeout: 5000 });

  // Wait for the popover to open and languages to load
  await page.waitForTimeout(500);

  // Type in the search box to filter languages
  const searchInput = page.locator('input[placeholder*="Search"]');
  if (await searchInput.isVisible({ timeout: 2000 }).catch(() => false)) {
    await searchInput.fill(language);
    await page.waitForTimeout(300);
  }

  // Click the language option
  const langOption = page.locator('[data-value], [role="option"]').filter({ hasText: language }).first();
  await langOption.click({ timeout: 5000 });

  // Wait for syntax highlighting to apply and popover to close
  await page.waitForTimeout(500);

  // Close options panel by clicking Options button again
  await optionsBtn.click();
  await page.waitForTimeout(300);

  // Verify the contenteditable element is now visible (syntax mode uses contenteditable)
  if (language.toLowerCase() !== 'plaintext') {
    await page.waitForSelector('[contenteditable="true"]', { timeout: 5000 });
  }
}

/**
 * Check if currently in syntax highlight mode (contenteditable) or plaintext (textarea)
 */
export async function isInSyntaxHighlightMode(page: Page): Promise<boolean> {
  const contentEditable = page.locator('[contenteditable="true"]');
  return contentEditable.isVisible().catch(() => false);
}

/**
 * Setup 2 clients connected to the same note
 */
export async function setup2Clients(browser: any, initialContent: string, options?: {
  secondClientMobile?: boolean;
}): Promise<{
  clients: ClientInfo[];
  noteUrl: string;
  cleanup: () => Promise<void>;
}> {
  const context1 = await browser.newContext();
  const page1 = await context1.newPage();
  const noteUrl = await createNote(page1, initialContent);

  const context2 = options?.secondClientMobile
    ? await browser.newContext({ ...MOBILE_DEVICE })
    : await browser.newContext();
  const page2 = await context2.newPage();
  await page2.goto(noteUrl);
  await waitForConnection(page2);

  // Wait for both to be fully connected
  await page1.waitForTimeout(1000);

  const clients: ClientInfo[] = [
    { context: context1, page: page1, name: 'Client1', isMobile: false },
    { context: context2, page: page2, name: 'Client2', isMobile: options?.secondClientMobile ?? false }
  ];

  const cleanup = async () => {
    await context1.close();
    await context2.close();
  };

  return { clients, noteUrl, cleanup };
}

/**
 * Setup desktop and mobile clients connected to the same note
 */
export async function setupDesktopMobileClients(browser: any, initialContent: string): Promise<{
  desktop: ClientInfo;
  mobile: ClientInfo;
  noteUrl: string;
  cleanup: () => Promise<void>;
}> {
  const result = await setup2Clients(browser, initialContent, { secondClientMobile: true });
  return {
    desktop: result.clients[0],
    mobile: result.clients[1],
    noteUrl: result.noteUrl,
    cleanup: result.cleanup
  };
}

/**
 * Setup 3 clients connected to the same note
 */
export async function setup3Clients(browser: any, initialContent: string): Promise<{
  clients: ClientInfo[];
  noteUrl: string;
  cleanup: () => Promise<void>;
}> {
  const context1 = await browser.newContext();
  const page1 = await context1.newPage();
  const noteUrl = await createNote(page1, initialContent);

  const context2 = await browser.newContext();
  const page2 = await context2.newPage();
  await page2.goto(noteUrl);
  await waitForConnection(page2);

  const context3 = await browser.newContext();
  const page3 = await context3.newPage();
  await page3.goto(noteUrl);
  await waitForConnection(page3);

  await page1.waitForTimeout(1000);

  const clients: ClientInfo[] = [
    { context: context1, page: page1, name: 'Client1' },
    { context: context2, page: page2, name: 'Client2' },
    { context: context3, page: page3, name: 'Client3' }
  ];

  const cleanup = async () => {
    await context1.close();
    await context2.close();
    await context3.close();
  };

  return { clients, noteUrl, cleanup };
}
