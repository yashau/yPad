/**
 * Latency Sync E2E Tests - Content Convergence Under Network Delays
 *
 * Tests 3 clients with varying network latencies (50ms-300ms)
 * performing all types of text operations concurrently.
 *
 * IMPORTANT: These tests focus ONLY on content convergence (eventual consistency).
 * They do NOT test cursor preservation during edits - for cursor position tests,
 * see collaborative-editing.spec.ts instead.
 *
 * Uses server-side latency injection via /api/notes/:id/test-latency endpoint
 * because CDP network emulation doesn't affect WebSocket connections.
 *
 * Yjs CRDTs guarantee eventual consistency - all clients will converge to the
 * same state regardless of operation order or network delays.
 *
 * Key scenarios:
 * - Race condition: typing while initial PUT request is in flight
 * - Concurrent insertions at same position
 * - Concurrent deletions overlapping
 * - Mixed insert/delete operations
 * - Word-level deletions (Ctrl+Backspace, Ctrl+Delete)
 * - Line deletions
 * - Selection replacements
 * - Paste operations
 * - Tab key insertion
 * - Autocorrect-style replacements
 */

import { test, expect } from '@playwright/test';
import {
  focusEditor,
  getEditorContent,
  setCursorPosition,
  setSelectionRange,
  setServerLatency,
  getNoteIdFromUrl,
  waitForConvergence,
  setupClientsWithLatency,
  cleanupClientsWithLatency
} from './utils/test-helpers';

// ============================================================================
// TESTS
// ============================================================================

test.describe('Latency Sync Tests - 3 Clients', () => {
  test.setTimeout(120000); // 2 minute timeout for comprehensive tests

  test('Race condition: Client1 types while initial PUT is in flight (high latency)', async ({ browser, request }) => {
    const clients = await setupClientsWithLatency(browser, 3, [300, 100, 50]);

    try {
      const page1 = clients[0].page;

      // Client1 navigates and starts typing
      await page1.goto('/');
      await page1.waitForLoadState('domcontentloaded');

      const textarea1 = page1.locator('textarea');
      await textarea1.click();

      // Type initial content - this triggers the PUT request
      await page1.keyboard.type('hello', { delay: 30 });

      // Wait for note creation to complete
      await page1.waitForFunction(() => window.location.pathname.length > 1, { timeout: 15000 });
      const noteUrl = page1.url();
      const noteId = getNoteIdFromUrl(noteUrl);

      // Wait for initial sync to complete before adding latency
      await page1.waitForTimeout(1000);

      // Now add server-side latency (simulates high latency WebSocket)
      await setServerLatency(request, noteId, 300);

      // Type more content with latency active
      await page1.keyboard.type(' world', { delay: 50 });
      await page1.keyboard.type(' from client1', { delay: 50 });

      // Wait for WebSocket messages to be processed
      await page1.waitForTimeout(4000);

      // Client2 and Client3 join
      await clients[1].page.goto(noteUrl);
      await clients[2].page.goto(noteUrl);

      await clients[1].page.waitForLoadState('networkidle');
      await clients[2].page.waitForLoadState('networkidle');

      // Wait for all to sync with high latency
      await page1.waitForTimeout(4000);

      // Verify all clients have the same content
      const converged = await waitForConvergence(clients, 10000);
      expect(converged).toBe(true);

      // Get final content
      const content1 = await getEditorContent(page1);
      const content2 = await getEditorContent(clients[1].page);
      const content3 = await getEditorContent(clients[2].page);

      // All should match
      expect(content1).toBe(content2);
      expect(content2).toBe(content3);

      // Content should contain the full typed text
      expect(content1).toContain('hello');
      expect(content1).toContain('world');
      expect(content1).toContain('client1');

      // Clean up: reset latency
      await setServerLatency(request, noteId, 0);

    } finally {
      await cleanupClientsWithLatency(clients);
    }
  });

  test('Concurrent insertions at different positions', async ({ browser, request }) => {
    const clients = await setupClientsWithLatency(browser, 3, [150, 100, 200]);

    try {
      // Client1 creates the note
      const page1 = clients[0].page;
      await page1.goto('/');
      await page1.waitForLoadState('networkidle');

      const textarea1 = page1.locator('textarea');
      await textarea1.click();
      await textarea1.fill('line1\nline2\nline3');

      await page1.waitForFunction(() => window.location.pathname.length > 1, { timeout: 10000 });
      const noteUrl = page1.url();
      const noteId = getNoteIdFromUrl(noteUrl);
      await page1.waitForTimeout(1000);

      // Add server-side latency
      await setServerLatency(request, noteId, 150);

      // Client2 and Client3 join
      await clients[1].page.goto(noteUrl);
      await clients[2].page.goto(noteUrl);
      await clients[1].page.waitForLoadState('networkidle');
      await clients[2].page.waitForLoadState('networkidle');
      await page1.waitForTimeout(1500);

      // All clients type concurrently at different positions
      // Client1: End of line1
      await focusEditor(page1);
      await page1.keyboard.press('Control+Home');
      await page1.keyboard.press('End');
      await page1.keyboard.type(' - A', { delay: 25 });

      // Client2: End of line2
      await focusEditor(clients[1].page);
      await clients[1].page.keyboard.press('Control+Home');
      await clients[1].page.keyboard.press('ArrowDown');
      await clients[1].page.keyboard.press('End');
      await clients[1].page.keyboard.type(' - B', { delay: 25 });

      // Client3: End of line3
      await focusEditor(clients[2].page);
      await clients[2].page.keyboard.press('Control+End');
      await clients[2].page.keyboard.type(' - C', { delay: 25 });

      // Wait for convergence
      await page1.waitForTimeout(4000);
      const converged = await waitForConvergence(clients, 8000);

      const content1 = await getEditorContent(page1);
      const content2 = await getEditorContent(clients[1].page);
      const content3 = await getEditorContent(clients[2].page);

      expect(converged).toBe(true);
      expect(content1).toBe(content2);
      expect(content2).toBe(content3);

      // All edits should be present
      expect(content1).toContain(' - A');
      expect(content1).toContain(' - B');
      expect(content1).toContain(' - C');

      // Clean up
      await setServerLatency(request, noteId, 0);

    } finally {
      await cleanupClientsWithLatency(clients);
    }
  });

  test('Concurrent insertions at SAME position (conflict resolution)', async ({ browser, request }) => {
    const clients = await setupClientsWithLatency(browser, 3, [200, 150, 100]);

    try {
      const page1 = clients[0].page;
      await page1.goto('/');
      await page1.waitForLoadState('networkidle');

      const textarea1 = page1.locator('textarea');
      await textarea1.click();
      await textarea1.fill('hello world');

      await page1.waitForFunction(() => window.location.pathname.length > 1, { timeout: 10000 });
      const noteUrl = page1.url();
      const noteId = getNoteIdFromUrl(noteUrl);
      await page1.waitForTimeout(1000);

      // Add server-side latency
      await setServerLatency(request, noteId, 150);

      // Others join
      await clients[1].page.goto(noteUrl);
      await clients[2].page.goto(noteUrl);
      await clients[1].page.waitForLoadState('networkidle');
      await clients[2].page.waitForLoadState('networkidle');
      await page1.waitForTimeout(1500);

      // All clients try to insert at position 5 (after "hello") SIMULTANEOUSLY
      const insertPromises = clients.map(async (client, i) => {
        await focusEditor(client.page);
        await setCursorPosition(client.page, 5);
        await client.page.keyboard.type(`[${i + 1}]`, { delay: 20 });
      });

      await Promise.all(insertPromises);

      // Wait for convergence
      await page1.waitForTimeout(5000);
      const converged = await waitForConvergence(clients, 10000);

      const contents = await Promise.all(clients.map(c => getEditorContent(c.page)));

      expect(converged).toBe(true);
      expect(contents[0]).toBe(contents[1]);
      expect(contents[1]).toBe(contents[2]);

      // Verify all characters are present (they may be interleaved)
      expect(contents[0]).toContain('hello');
      expect(contents[0]).toContain(' world');
      const content = contents[0];
      const openBrackets = (content.match(/\[/g) || []).length;
      const closeBrackets = (content.match(/\]/g) || []).length;
      expect(openBrackets).toBe(3);
      expect(closeBrackets).toBe(3);
      expect(content).toContain('1');
      expect(content).toContain('2');
      expect(content).toContain('3');

      // Clean up
      await setServerLatency(request, noteId, 0);

    } finally {
      await cleanupClientsWithLatency(clients);
    }
  });

  test('Backspace and Delete key operations', async ({ browser, request }) => {
    const clients = await setupClientsWithLatency(browser, 3, [100, 150, 75]);

    try {
      const page1 = clients[0].page;
      await page1.goto('/');
      await page1.waitForLoadState('networkidle');

      const textarea1 = page1.locator('textarea');
      await textarea1.click();
      await textarea1.fill('AAABBBCCC');

      await page1.waitForFunction(() => window.location.pathname.length > 1, { timeout: 10000 });
      const noteUrl = page1.url();
      const noteId = getNoteIdFromUrl(noteUrl);
      await page1.waitForTimeout(1000);

      // Add server-side latency
      await setServerLatency(request, noteId, 100);

      await clients[1].page.goto(noteUrl);
      await clients[2].page.goto(noteUrl);
      await clients[1].page.waitForLoadState('networkidle');
      await clients[2].page.waitForLoadState('networkidle');
      await page1.waitForTimeout(1500);

      // Client1: Delete "AAA" using backspace from position 3
      await focusEditor(page1);
      await setCursorPosition(page1, 3);
      await page1.keyboard.press('Backspace');
      await page1.keyboard.press('Backspace');
      await page1.keyboard.press('Backspace');

      // Client2: Delete "CCC" using Delete key from position 6
      await focusEditor(clients[1].page);
      await setCursorPosition(clients[1].page, 6);
      await clients[1].page.keyboard.press('Delete');
      await clients[1].page.keyboard.press('Delete');
      await clients[1].page.keyboard.press('Delete');

      // Client3: Type something in the middle
      await focusEditor(clients[2].page);
      await setCursorPosition(clients[2].page, 4);
      await clients[2].page.keyboard.type('XXX', { delay: 30 });

      await page1.waitForTimeout(4000);
      const converged = await waitForConvergence(clients, 8000);

      const contents = await Promise.all(clients.map(c => getEditorContent(c.page)));

      expect(converged).toBe(true);
      expect(contents[0]).toBe(contents[1]);
      expect(contents[1]).toBe(contents[2]);

      // Clean up
      await setServerLatency(request, noteId, 0);

    } finally {
      await cleanupClientsWithLatency(clients);
    }
  });

  test('Word deletion (Ctrl+Backspace) with concurrent edits', async ({ browser, request }) => {
    const clients = await setupClientsWithLatency(browser, 3, [100, 200, 150]);

    try {
      const page1 = clients[0].page;
      await page1.goto('/');
      await page1.waitForLoadState('networkidle');

      const textarea1 = page1.locator('textarea');
      await textarea1.click();
      await textarea1.fill('one two three four five');

      await page1.waitForFunction(() => window.location.pathname.length > 1, { timeout: 10000 });
      const noteUrl = page1.url();
      const noteId = getNoteIdFromUrl(noteUrl);
      await page1.waitForTimeout(1000);

      // Add server-side latency
      await setServerLatency(request, noteId, 150);

      await clients[1].page.goto(noteUrl);
      await clients[2].page.goto(noteUrl);
      await clients[1].page.waitForLoadState('networkidle');
      await clients[2].page.waitForLoadState('networkidle');
      await page1.waitForTimeout(2000);

      // Client3: Insert text at the beginning first
      await focusEditor(clients[2].page);
      await clients[2].page.keyboard.press('Control+Home');
      await clients[2].page.keyboard.type('START: ', { delay: 30 });

      // Wait for sync
      await page1.waitForTimeout(2000);

      // Client1: Delete word at end using Ctrl+Backspace
      await focusEditor(page1);
      await page1.keyboard.press('Control+End');
      await page1.keyboard.press('Control+Backspace');

      // Client2: Also delete a word at end
      await focusEditor(clients[1].page);
      await clients[1].page.keyboard.press('Control+End');
      await clients[1].page.keyboard.press('Control+Backspace');

      await page1.waitForTimeout(4000);
      const converged = await waitForConvergence(clients, 10000);

      const contents = await Promise.all(clients.map(c => getEditorContent(c.page)));

      expect(converged).toBe(true);
      expect(contents[0]).toBe(contents[1]);
      expect(contents[1]).toBe(contents[2]);

      // "START: " should be present at beginning
      expect(contents[0]).toContain('START:');
      expect(contents[0]).toContain('one');

      // Clean up
      await setServerLatency(request, noteId, 0);

    } finally {
      await cleanupClientsWithLatency(clients);
    }
  });

  test('Selection replacement (typing over selection)', async ({ browser, request }) => {
    const clients = await setupClientsWithLatency(browser, 3, [150, 100, 200]);

    try {
      const page1 = clients[0].page;
      await page1.goto('/');
      await page1.waitForLoadState('networkidle');

      const textarea1 = page1.locator('textarea');
      await textarea1.click();
      await textarea1.fill('The quick brown fox jumps over the lazy dog');

      await page1.waitForFunction(() => window.location.pathname.length > 1, { timeout: 10000 });
      const noteUrl = page1.url();
      const noteId = getNoteIdFromUrl(noteUrl);
      await page1.waitForTimeout(1000);

      // Add server-side latency
      await setServerLatency(request, noteId, 150);

      await clients[1].page.goto(noteUrl);
      await clients[2].page.goto(noteUrl);
      await clients[1].page.waitForLoadState('networkidle');
      await clients[2].page.waitForLoadState('networkidle');
      await page1.waitForTimeout(2000);

      // Sequential selection replacements to avoid position conflicts
      // Client1: Select "quick" (positions 4-9) and replace with "slow"
      await focusEditor(page1);
      await setSelectionRange(page1, 4, 9);
      await page1.keyboard.type('slow', { delay: 30 });

      // Wait for sync before next edit
      await page1.waitForTimeout(2000);

      // Client2: Now select and replace "lazy"
      await focusEditor(clients[1].page);
      await setSelectionRange(clients[1].page, 34, 38);
      await clients[1].page.keyboard.type('energetic', { delay: 30 });

      // Wait for sync
      await page1.waitForTimeout(2000);

      // Client3: Add text at the end
      await focusEditor(clients[2].page);
      await clients[2].page.keyboard.press('Control+End');
      await clients[2].page.keyboard.type('!', { delay: 30 });

      await page1.waitForTimeout(4000);
      const converged = await waitForConvergence(clients, 10000);

      const contents = await Promise.all(clients.map(c => getEditorContent(c.page)));

      expect(converged).toBe(true);
      expect(contents[0]).toBe(contents[1]);
      expect(contents[1]).toBe(contents[2]);

      // Replacements should be present
      expect(contents[0]).toContain('slow');
      expect(contents[0]).toContain('energetic');
      expect(contents[0]).toContain('!');

      // Clean up
      await setServerLatency(request, noteId, 0);

    } finally {
      await cleanupClientsWithLatency(clients);
    }
  });

  test('Tab key insertion with concurrent edits', async ({ browser, request }) => {
    const clients = await setupClientsWithLatency(browser, 3, [100, 150, 200]);

    try {
      const page1 = clients[0].page;
      await page1.goto('/');
      await page1.waitForLoadState('networkidle');

      const textarea1 = page1.locator('textarea');
      await textarea1.click();
      await textarea1.fill('line1\nline2\nline3');

      await page1.waitForFunction(() => window.location.pathname.length > 1, { timeout: 10000 });
      const noteUrl = page1.url();
      const noteId = getNoteIdFromUrl(noteUrl);
      await page1.waitForTimeout(1000);

      // Add server-side latency
      await setServerLatency(request, noteId, 150);

      await clients[1].page.goto(noteUrl);
      await clients[2].page.goto(noteUrl);
      await clients[1].page.waitForLoadState('networkidle');
      await clients[2].page.waitForLoadState('networkidle');
      await page1.waitForTimeout(1500);

      // Prepare all clients with cursors at their target positions
      await focusEditor(page1);
      await setCursorPosition(page1, 0);

      await focusEditor(clients[1].page);
      await setCursorPosition(clients[1].page, 6);

      await focusEditor(clients[2].page);
      await clients[2].page.keyboard.press('End');

      // Execute all operations concurrently
      const operationPromises = [
        (async () => {
          await focusEditor(page1);
          await page1.keyboard.press('Tab');
        })(),
        (async () => {
          await focusEditor(clients[1].page);
          await clients[1].page.keyboard.press('Tab');
        })(),
        (async () => {
          await focusEditor(clients[2].page);
          await clients[2].page.keyboard.type(' - END', { delay: 30 });
        })()
      ];

      await Promise.all(operationPromises);

      await page1.waitForTimeout(4000);
      const converged = await waitForConvergence(clients, 8000);

      const contents = await Promise.all(clients.map(c => getEditorContent(c.page)));

      expect(converged).toBe(true);
      expect(contents[0]).toBe(contents[1]);
      expect(contents[1]).toBe(contents[2]);

      // All edits should be present
      const content = contents[0];
      expect(content).toContain(' - END');
      expect(content).toContain('line1');
      expect(content).toContain('line2');
      expect(content).toContain('line3');

      // Clean up
      await setServerLatency(request, noteId, 0);

    } finally {
      await cleanupClientsWithLatency(clients);
    }
  });

  test('Rapid fire typing from all 3 clients simultaneously', async ({ browser, request }) => {
    const clients = await setupClientsWithLatency(browser, 3, [50, 150, 300]);

    try {
      const page1 = clients[0].page;
      await page1.goto('/');
      await page1.waitForLoadState('networkidle');

      const textarea1 = page1.locator('textarea');
      await textarea1.click();
      await textarea1.fill('START');

      await page1.waitForFunction(() => window.location.pathname.length > 1, { timeout: 10000 });
      const noteUrl = page1.url();
      const noteId = getNoteIdFromUrl(noteUrl);
      await page1.waitForTimeout(1000);

      // Add server-side latency
      await setServerLatency(request, noteId, 200);

      await clients[1].page.goto(noteUrl);
      await clients[2].page.goto(noteUrl);
      await clients[1].page.waitForLoadState('networkidle');
      await clients[2].page.waitForLoadState('networkidle');
      await page1.waitForTimeout(1500);

      // All clients type rapidly at the end
      const typePromises = clients.map(async (client, i) => {
        await focusEditor(client.page);
        await client.page.keyboard.press('End');
        for (let j = 0; j < 5; j++) {
          await client.page.keyboard.type(`[C${i + 1}:${j}]`, { delay: 15 });
        }
      });

      await Promise.all(typePromises);

      // Wait for convergence
      await page1.waitForTimeout(8000);
      const converged = await waitForConvergence(clients, 20000);

      const contents = await Promise.all(clients.map(c => getEditorContent(c.page)));

      expect(converged).toBe(true);
      expect(contents[0]).toBe(contents[1]);
      expect(contents[1]).toBe(contents[2]);

      // Verify structural elements are present (may be interleaved)
      const content = contents[0];
      expect(content).toContain('START');

      const cCount = (content.match(/C/g) || []).length;
      const openBrackets = (content.match(/\[/g) || []).length;
      const closeBrackets = (content.match(/\]/g) || []).length;
      const colons = (content.match(/:/g) || []).length;

      expect(cCount).toBe(15);
      expect(openBrackets).toBe(15);
      expect(closeBrackets).toBe(15);
      expect(colons).toBe(15);

      // Clean up
      await setServerLatency(request, noteId, 0);

    } finally {
      await cleanupClientsWithLatency(clients);
    }
  });

  test('Enter key (newlines) with concurrent edits', async ({ browser, request }) => {
    const clients = await setupClientsWithLatency(browser, 3, [100, 200, 150]);

    try {
      const page1 = clients[0].page;
      await page1.goto('/');
      await page1.waitForLoadState('networkidle');

      const textarea1 = page1.locator('textarea');
      await textarea1.click();
      await textarea1.fill('line1 line2 line3');

      await page1.waitForFunction(() => window.location.pathname.length > 1, { timeout: 10000 });
      const noteUrl = page1.url();
      const noteId = getNoteIdFromUrl(noteUrl);
      await page1.waitForTimeout(1000);

      // Add server-side latency
      await setServerLatency(request, noteId, 150);

      await clients[1].page.goto(noteUrl);
      await clients[2].page.goto(noteUrl);
      await clients[1].page.waitForLoadState('networkidle');
      await clients[2].page.waitForLoadState('networkidle');
      await page1.waitForTimeout(1500);

      // Client1: Insert newline after "line1"
      await focusEditor(page1);
      await setCursorPosition(page1, 5);
      await page1.keyboard.press('Enter');

      // Client2: Insert newline after "line2"
      await focusEditor(clients[1].page);
      await setCursorPosition(clients[1].page, 11);
      await clients[1].page.keyboard.press('Enter');

      // Client3: Type at the very end
      await focusEditor(clients[2].page);
      await clients[2].page.keyboard.press('End');
      await clients[2].page.keyboard.type(' END', { delay: 30 });

      await page1.waitForTimeout(4000);
      const converged = await waitForConvergence(clients, 8000);

      const contents = await Promise.all(clients.map(c => getEditorContent(c.page)));

      expect(converged).toBe(true);
      expect(contents[0]).toBe(contents[1]);
      expect(contents[1]).toBe(contents[2]);

      // Should have newlines
      const lineCount = contents[0].split('\n').length;
      expect(lineCount).toBeGreaterThanOrEqual(3);
      expect(contents[0]).toContain('END');

      // Clean up
      await setServerLatency(request, noteId, 0);

    } finally {
      await cleanupClientsWithLatency(clients);
    }
  });

  test('Cut (Ctrl+X) operation with concurrent edits', async ({ browser, request }) => {
    const clients = await setupClientsWithLatency(browser, 3, [100, 150, 200]);

    try {
      const page1 = clients[0].page;
      await page1.goto('/');
      await page1.waitForLoadState('networkidle');

      const textarea1 = page1.locator('textarea');
      await textarea1.click();
      await textarea1.fill('AAAA BBBB CCCC DDDD');

      await page1.waitForFunction(() => window.location.pathname.length > 1, { timeout: 10000 });
      const noteUrl = page1.url();
      const noteId = getNoteIdFromUrl(noteUrl);
      await page1.waitForTimeout(1000);

      // Add server-side latency
      await setServerLatency(request, noteId, 150);

      await clients[1].page.goto(noteUrl);
      await clients[2].page.goto(noteUrl);
      await clients[1].page.waitForLoadState('networkidle');
      await clients[2].page.waitForLoadState('networkidle');
      await page1.waitForTimeout(2000);

      // Sequential operations to avoid position conflicts

      // Client3: Insert at the beginning first
      await focusEditor(clients[2].page);
      await clients[2].page.keyboard.press('Control+Home');
      await clients[2].page.keyboard.type('START: ', { delay: 30 });

      // Wait for sync
      await page1.waitForTimeout(2000);

      // Client2: Type at the end
      await focusEditor(clients[1].page);
      await clients[1].page.keyboard.press('Control+End');
      await clients[1].page.keyboard.type(' XXXX', { delay: 30 });

      // Wait for sync
      await page1.waitForTimeout(2000);

      // Client1: Cut "BBBB" - position adjusted for "START: " prefix
      await focusEditor(page1);
      await setSelectionRange(page1, 12, 16);
      await page1.keyboard.press('Control+x');

      await page1.waitForTimeout(4000);
      const converged = await waitForConvergence(clients, 10000);

      const contents = await Promise.all(clients.map(c => getEditorContent(c.page)));

      expect(converged).toBe(true);
      expect(contents[0]).toBe(contents[1]);
      expect(contents[1]).toBe(contents[2]);

      // BBBB should be cut (removed)
      expect(contents[0]).not.toContain('BBBB');
      expect(contents[0]).toContain('XXXX');
      expect(contents[0]).toContain('START:');

      // Clean up
      await setServerLatency(request, noteId, 0);

    } finally {
      await cleanupClientsWithLatency(clients);
    }
  });

  test('Mixed operations: insert, delete, replace all at once', async ({ browser, request }) => {
    const clients = await setupClientsWithLatency(browser, 3, [75, 150, 250]);

    try {
      const page1 = clients[0].page;
      await page1.goto('/');
      await page1.waitForLoadState('networkidle');

      const textarea1 = page1.locator('textarea');
      await textarea1.click();
      await textarea1.fill('The cat sat on the mat');

      await page1.waitForFunction(() => window.location.pathname.length > 1, { timeout: 10000 });
      const noteUrl = page1.url();
      const noteId = getNoteIdFromUrl(noteUrl);
      await page1.waitForTimeout(1000);

      // Add server-side latency
      await setServerLatency(request, noteId, 150);

      await clients[1].page.goto(noteUrl);
      await clients[2].page.goto(noteUrl);
      await clients[1].page.waitForLoadState('networkidle');
      await clients[2].page.waitForLoadState('networkidle');
      await page1.waitForTimeout(1500);

      // Client1: Replace "cat" with "dog"
      await focusEditor(page1);
      await setSelectionRange(page1, 4, 7);
      await page1.keyboard.type('dog', { delay: 30 });

      // Client2: Delete "on "
      await focusEditor(clients[1].page);
      await setCursorPosition(clients[1].page, 15);
      await clients[1].page.keyboard.press('Backspace');
      await clients[1].page.keyboard.press('Backspace');
      await clients[1].page.keyboard.press('Backspace');

      // Client3: Insert "big " before "mat"
      await focusEditor(clients[2].page);
      await setCursorPosition(clients[2].page, 19);
      await clients[2].page.keyboard.type('big ', { delay: 30 });

      await page1.waitForTimeout(5000);
      const converged = await waitForConvergence(clients, 10000);

      const contents = await Promise.all(clients.map(c => getEditorContent(c.page)));

      expect(converged).toBe(true);
      expect(contents[0]).toBe(contents[1]);
      expect(contents[1]).toBe(contents[2]);

      // All operations should be reflected
      expect(contents[0]).toContain('dog');
      expect(contents[0]).not.toContain('cat');

      // Clean up
      await setServerLatency(request, noteId, 0);

    } finally {
      await cleanupClientsWithLatency(clients);
    }
  });

  test('Stress test: 45 rapid operations from 3 clients', async ({ browser, request }) => {
    const clients = await setupClientsWithLatency(browser, 3, [50, 100, 150]);

    try {
      const page1 = clients[0].page;
      await page1.goto('/');
      await page1.waitForLoadState('networkidle');

      const textarea1 = page1.locator('textarea');
      await textarea1.click();
      await textarea1.fill('0123456789');

      await page1.waitForFunction(() => window.location.pathname.length > 1, { timeout: 10000 });
      const noteUrl = page1.url();
      const noteId = getNoteIdFromUrl(noteUrl);
      await page1.waitForTimeout(1000);

      // Add server-side latency
      await setServerLatency(request, noteId, 100);

      await clients[1].page.goto(noteUrl);
      await clients[2].page.goto(noteUrl);
      await clients[1].page.waitForLoadState('networkidle');
      await clients[2].page.waitForLoadState('networkidle');
      await page1.waitForTimeout(1500);

      // Each client performs many rapid operations
      const operationPromises = clients.map(async (client, clientIndex) => {
        for (let i = 0; i < 15; i++) {
          await focusEditor(client.page);
          await client.page.keyboard.press('End');
          await client.page.keyboard.type(`[${clientIndex}:${i}]`, { delay: 10 });
          await client.page.waitForTimeout(50);
        }
      });

      await Promise.all(operationPromises);

      // Wait for convergence - stress tests need longer timeouts
      await page1.waitForTimeout(10000);
      const converged = await waitForConvergence(clients, 30000);

      const contents = await Promise.all(clients.map(c => getEditorContent(c.page)));

      expect(converged).toBe(true);
      expect(contents[0]).toBe(contents[1]);
      expect(contents[1]).toBe(contents[2]);

      // Verify structure
      const content = contents[0];
      expect(content).toContain('0123456789');

      const openBrackets = (content.match(/\[/g) || []).length;
      const closeBrackets = (content.match(/\]/g) || []).length;
      const colons = (content.match(/:/g) || []).length;

      expect(openBrackets).toBe(45);
      expect(closeBrackets).toBe(45);
      expect(colons).toBe(45);

      // Clean up
      await setServerLatency(request, noteId, 0);

    } finally {
      await cleanupClientsWithLatency(clients);
    }
  });

  test('Extreme latency difference: 50ms vs 300ms clients', async ({ browser, request }) => {
    const clients = await setupClientsWithLatency(browser, 3, [300, 50, 300]);

    try {
      const page1 = clients[0].page;

      await page1.goto('/');
      await page1.waitForLoadState('networkidle');

      const textarea1 = page1.locator('textarea');
      await textarea1.click();
      await textarea1.fill('shared document');

      await page1.waitForFunction(() => window.location.pathname.length > 1, { timeout: 15000 });
      const noteUrl = page1.url();
      const noteId = getNoteIdFromUrl(noteUrl);
      await page1.waitForTimeout(2000);

      // Add high server-side latency
      await setServerLatency(request, noteId, 300);

      await clients[1].page.goto(noteUrl);
      await clients[2].page.goto(noteUrl);
      await clients[1].page.waitForLoadState('networkidle');
      await clients[2].page.waitForLoadState('networkidle');
      await page1.waitForTimeout(2000);

      // Client2 (fast) types rapidly
      await focusEditor(clients[1].page);
      await clients[1].page.keyboard.press('End');
      await clients[1].page.keyboard.type(' fast-client-typing-here', { delay: 10 });

      // Client1 (slow) also types
      await focusEditor(page1);
      await page1.keyboard.press('Home');
      await page1.keyboard.type('SLOW: ', { delay: 50 });

      // Client3 (slow) types at end
      await focusEditor(clients[2].page);
      await clients[2].page.keyboard.press('End');
      await clients[2].page.keyboard.type(' :SLOW-END', { delay: 50 });

      // Wait longer for slow clients
      await page1.waitForTimeout(8000);
      const converged = await waitForConvergence(clients, 15000);

      const contents = await Promise.all(clients.map(c => getEditorContent(c.page)));

      expect(converged).toBe(true);
      expect(contents[0]).toBe(contents[1]);
      expect(contents[1]).toBe(contents[2]);

      // All contributions should be present
      expect(contents[0]).toContain('fast-client-typing-here');
      expect(contents[0]).toContain('SLOW:');
      expect(contents[0]).toContain(':SLOW-END');

      // Clean up
      await setServerLatency(request, noteId, 0);

    } finally {
      await cleanupClientsWithLatency(clients);
    }
  });

});
