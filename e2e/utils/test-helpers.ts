/**
 * Shared E2E Test Utilities
 *
 * Common helpers for all E2E tests including:
 * - Editor interaction (get/set content, cursor, selection)
 * - Note creation and WebSocket connection
 * - Multi-client setup and cleanup
 * - Server-side test utilities (latency injection)
 * - Convergence waiting
 */

import { Page, BrowserContext, Browser, devices, APIRequestContext } from '@playwright/test';

// ============================================================================
// CONSTANTS & TYPES
// ============================================================================

/** Mobile device configuration (iPhone 12 Pro) */
export const MOBILE_DEVICE = devices['iPhone 12 Pro'];

/** Status indicator selectors */
export const STATUS_SELECTORS = {
  spinner: 'header svg.animate-spin',
  check: '[title="All changes saved"] svg',
  wifiOff: '[title="Connection lost - check your internet connection"]',
  slowSyncSpinner: '[title*="Taking longer than usual"]',
  connecting: '[title="Connecting to real-time sync..."]',
  realtimeIndicator: '[title*="Real-time"]',
  greenDot: 'header .bg-green-500',
  lockIcon: 'header .text-blue-500',
} as const;

/** Client information for multi-client tests */
export interface ClientInfo {
  context: BrowserContext;
  page: Page;
  name: string;
  isMobile?: boolean;
}

/** Client setup with latency info for latency tests */
export interface ClientSetup {
  context: BrowserContext;
  page: Page;
  latencyMs: number;
  name: string;
}

/** Cursor position with visual coordinates */
export interface CursorPosition {
  top: number;
  left: number;
  label: string;
}

// ============================================================================
// NOTE CREATION & NAVIGATION
// ============================================================================

/**
 * Create a note and wait for WebSocket connection
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
 * Wait for WebSocket connection (green dot indicator)
 */
export async function waitForConnection(page: Page): Promise<void> {
  await page.waitForSelector(STATUS_SELECTORS.greenDot, { timeout: 10000 });
  await page.waitForTimeout(500);
}

/**
 * Extract note ID from URL
 */
export function getNoteIdFromUrl(url: string): string {
  return new URL(url).pathname.slice(1);
}

// ============================================================================
// EDITOR CONTENT & CURSOR
// ============================================================================

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
 * Type text in the editor (handles both textarea and contenteditable)
 */
export async function typeInEditor(page: Page, text: string, options?: { delay?: number }): Promise<void> {
  const textarea = page.locator('textarea');
  if (await textarea.isVisible().catch(() => false)) {
    await textarea.click();
    await page.keyboard.type(text, { delay: options?.delay ?? 30 });
  } else {
    const contentEditable = page.locator('[contenteditable="true"]');
    await contentEditable.click();
    await page.keyboard.type(text, { delay: options?.delay ?? 30 });
  }
}

/**
 * Get the current cursor position in the active editor
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

/** Alias for setSelectionRange for compatibility */
export const selectRange = setSelectionRange;

// ============================================================================
// SCROLL & VIEW MODE
// ============================================================================

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
 * Check if the editor is in view-only mode
 */
export async function isViewMode(page: Page): Promise<boolean> {
  const textarea = page.locator('textarea');
  if (await textarea.isVisible().catch(() => false)) {
    const isReadonly = await textarea.getAttribute('readonly');
    return isReadonly !== null;
  }
  const editor = page.locator('[contenteditable="false"]');
  return await editor.isVisible().catch(() => false);
}

// ============================================================================
// SYNTAX HIGHLIGHTING
// ============================================================================

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

// ============================================================================
// SERVER-SIDE TEST UTILITIES
// ============================================================================

/**
 * Set server-side latency for WebSocket message processing.
 * This is the only reliable way to add latency to WebSocket connections
 * (CDP network emulation doesn't affect WebSockets).
 */
export async function setServerLatency(request: APIRequestContext, noteId: string, latencyMs: number): Promise<void> {
  await request.post(`/api/notes/${noteId}/test-latency`, {
    data: { latencyMs }
  });
}

// ============================================================================
// CONTENT GENERATION
// ============================================================================

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
 * Generate syntax-highlighted code content (JavaScript) with enough lines for vertical scrolling
 * AND long enough lines for horizontal scrolling (syntax mode doesn't wrap text)
 */
export function generateCodeContent(lineCount: number = 100): string {
  const lines: string[] = [
    '// JavaScript code for testing syntax highlight mode - this comment is intentionally long to test horizontal scrolling on both desktop and mobile devices',
    'const config = {',
    '  name: "test-application-with-a-very-long-name-to-ensure-horizontal-scrolling-works-correctly",',
    '  version: "1.0.0",',
    '  description: "This is a test configuration object with a very long description string that will definitely cause horizontal scrolling in syntax highlight mode"',
    '};',
    '',
    'function processDataWithVeryLongFunctionNameToTestHorizontalScrolling(inputDataArray, configurationOptions, additionalParameters) {',
    '  const result = [];',
    '  for (let i = 0; i < inputDataArray.length; i++) {',
    '    result.push(inputDataArray[i] * 2 + configurationOptions.multiplier + additionalParameters.offset);',
    '  }',
    '  return result;',
    '}',
    ''
  ];

  for (let i = lines.length; i < lineCount; i++) {
    if (i % 15 === 0) {
      lines.push('');
      lines.push(`// === Section ${Math.floor(i / 15)} === This section contains important code that demonstrates the functionality of this module with comprehensive comments`);
      lines.push(`function section${Math.floor(i / 15)}HandlerWithLongNameForTesting(dataObject, configurationSettings, extraOptions) {`);
    } else if (i % 15 === 14) {
      lines.push('}');
    } else if (i % 5 === 0) {
      lines.push(`  // Line ${i}: Processing step with a very long comment that explains what this code does in great detail to ensure horizontal scrolling is tested properly on all devices`);
    } else if (i % 3 === 0) {
      lines.push(`  const calculatedValue${i} = calculateComplexValueWithManyParameters(${i}, configurationSettings.param1, configurationSettings.param2, extraOptions);`);
    } else if (i % 7 === 0) {
      lines.push(`  const message${i} = "This is line ${i} with a very long string value that contains important information and will cause horizontal scrolling in the editor";`);
    } else {
      lines.push(`  console.log("Processing line ${i} with standard logging output for debugging purposes");`);
    }
  }

  return lines.join('\n');
}

// ============================================================================
// MULTI-CLIENT SETUP
// ============================================================================

/**
 * Create multiple browser contexts
 */
export async function createContexts(browser: Browser, count: number): Promise<BrowserContext[]> {
  const contexts: BrowserContext[] = [];
  for (let i = 0; i < count; i++) {
    contexts.push(await browser.newContext());
  }
  return contexts;
}

/**
 * Close all browser contexts
 */
export async function closeContexts(contexts: BrowserContext[]): Promise<void> {
  await Promise.all(contexts.map(ctx => ctx?.close?.()));
}

/**
 * Setup 2 clients connected to the same note
 */
export async function setup2Clients(browser: Browser, initialContent: string, options?: {
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
export async function setupDesktopMobileClients(browser: Browser, initialContent: string): Promise<{
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
export async function setup3Clients(browser: Browser, initialContent: string): Promise<{
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

/**
 * Setup multiple clients with different latencies for latency testing
 */
export async function setupClientsWithLatency(browser: Browser, count: number, latencies: number[]): Promise<ClientSetup[]> {
  const clients: ClientSetup[] = [];

  for (let i = 0; i < count; i++) {
    const context = await browser.newContext();
    const page = await context.newPage();
    clients.push({
      context,
      page,
      latencyMs: latencies[i] || 100,
      name: `Client${i + 1}`
    });
  }

  return clients;
}

/**
 * Cleanup clients with latency setup
 */
export async function cleanupClientsWithLatency(clients: ClientSetup[]): Promise<void> {
  for (const client of clients) {
    await client.context.close();
  }
}

// ============================================================================
// CONVERGENCE & SYNCHRONIZATION
// ============================================================================

/**
 * Wait for all clients to have the same content (convergence)
 */
export async function waitForConvergence(clients: { page: Page }[], timeoutMs: number = 10000): Promise<boolean> {
  const startTime = Date.now();

  while (Date.now() - startTime < timeoutMs) {
    const contents = await Promise.all(clients.map(c => getEditorContent(c.page)));

    // Check if all contents are the same
    if (contents.every(c => c === contents[0])) {
      return true;
    }

    await clients[0].page.waitForTimeout(200);
  }

  return false;
}

// ============================================================================
// REMOTE CURSOR HELPERS
// ============================================================================

/**
 * Get remote cursor visual positions from the page.
 * Remote cursors are rendered with inline styles containing top/left pixel values.
 */
export async function getRemoteCursorPositions(page: Page): Promise<CursorPosition[]> {
  return page.evaluate(() => {
    // Remote cursors have: div.absolute.pointer-events-none.z-50 with inline style
    const cursorContainers = document.querySelectorAll('.absolute.pointer-events-none.z-50');
    const results: { top: number; left: number; label: string }[] = [];

    cursorContainers.forEach((container) => {
      const style = container.getAttribute('style') || '';
      const topMatch = style.match(/top:\s*([\d.]+)px/);
      const leftMatch = style.match(/left:\s*([\d.]+)px/);

      if (topMatch && leftMatch) {
        const labelEl = container.querySelector('.text-xs.font-medium');
        const label = labelEl?.textContent || '';

        results.push({
          top: parseFloat(topMatch[1]),
          left: parseFloat(leftMatch[1]),
          label
        });
      }
    });

    return results;
  });
}

/**
 * Get the count of visible remote cursors
 */
export async function getRemoteCursorCount(page: Page): Promise<number> {
  const positions = await getRemoteCursorPositions(page);
  return positions.length;
}

// ============================================================================
// EDITOR LIMIT HELPERS
// ============================================================================

/**
 * Check if the editor limit banner is visible
 */
export async function isEditorLimitBannerVisible(page: Page): Promise<boolean> {
  const banner = page.locator('text=Editor limit reached');
  return await banner.isVisible().catch(() => false);
}

/**
 * Get the connection status display text from header
 */
export async function getConnectionStatusText(page: Page): Promise<string> {
  const statusSpan = page.locator('header .inline-flex span.text-xs');
  if (await statusSpan.isVisible().catch(() => false)) {
    return (await statusSpan.textContent()) ?? '';
  }
  return '';
}

// ============================================================================
// OPTIONS PANEL HELPERS
// ============================================================================

/**
 * Open the options panel
 */
export async function openOptionsPanel(page: Page): Promise<void> {
  const optionsBtn = page.locator('button:has-text("Options")');
  await optionsBtn.click();
  await page.waitForTimeout(300);
}

/**
 * Close the options panel
 */
export async function closeOptionsPanel(page: Page): Promise<void> {
  const optionsBtn = page.locator('button:has-text("Options")');
  await optionsBtn.click();
  await page.waitForTimeout(300);
}

/**
 * Set a password on the current note (must have Options panel open)
 */
export async function setNotePassword(page: Page, password: string): Promise<void> {
  const passwordInput = page.locator('input#password');
  await passwordInput.fill(password);

  const lockButton = page.locator('form:has(input#password) button[type="submit"]');
  await lockButton.click();

  await page.waitForTimeout(1000);
}

/**
 * Create a password-protected note
 */
export async function createPasswordProtectedNote(page: Page, content: string, password: string): Promise<string> {
  await page.goto('/');
  await page.waitForLoadState('networkidle');

  // Type content
  const textarea = page.locator('textarea');
  await textarea.click();
  await textarea.fill(content);

  // Wait for note to be created
  await page.waitForFunction(() => window.location.pathname.length > 1, { timeout: 10000 });

  // Open options and set password
  await openOptionsPanel(page);
  await setNotePassword(page, password);

  return page.url();
}

/**
 * Access a password-protected note by entering the password
 */
export async function accessProtectedNote(page: Page, url: string, password: string): Promise<void> {
  await page.goto(url);
  await page.waitForLoadState('networkidle');

  // Wait for password dialog
  const passwordInput = page.locator('input[type="password"]');
  await passwordInput.waitFor({ state: 'visible', timeout: 5000 });

  // Enter password
  await passwordInput.fill(password);

  // Submit
  const submitBtn = page.locator('button:has-text("Submit")');
  await submitBtn.click();

  // Wait for content to load
  await page.waitForTimeout(1000);
}
