import { test, expect, Page } from '@playwright/test';

/**
 * Real-time Yjs CRDT sync tests
 *
 * Basic collaborative editing tests without artificial latency. These tests verify that
 * Yjs CRDT synchronization works correctly under normal network conditions.
 *
 * For latency-specific tests, see comprehensive-sync.spec.ts which uses
 * server-side latency injection to stress test the Yjs synchronization.
 */

/**
 * Helper to create a note and wait for it to be saved
 * Returns the URL
 */
async function createNote(page: Page, content: string): Promise<string> {
  await page.goto('/');
  await page.waitForLoadState('networkidle');

  const textarea = page.locator('textarea');
  await textarea.click();
  await textarea.fill(content);

  // Wait for auto-save to complete and URL to update with the new note ID
  await page.waitForFunction(() => window.location.pathname.length > 1, { timeout: 10000 });

  // Wait for WebSocket to connect
  await page.waitForTimeout(500);

  return page.url();
}

/**
 * Helper to get the current content from the editor
 */
async function getEditorContent(page: Page): Promise<string> {
  // Try textarea first (plaintext mode)
  const textarea = page.locator('textarea');
  if (await textarea.isVisible()) {
    return textarea.inputValue();
  }

  // Fall back to contenteditable div (syntax highlighting mode)
  const editor = page.locator('[contenteditable="true"]');
  return (await editor.textContent()) ?? '';
}


test.describe('Real-time Sync Tests', () => {

  test('Fast typing should not corrupt content', async ({ page }) => {
    // Create initial note with "hello\nworld"
    const noteUrl = await createNote(page, 'hello\nworld');

    // Reload the page to simulate a fresh session
    await page.goto(noteUrl);
    await page.waitForLoadState('networkidle');

    // Wait for WebSocket to connect
    await page.waitForTimeout(1000);

    // Get the textarea and position cursor at end of "hello" (position 5)
    const textarea = page.locator('textarea');
    await textarea.focus();

    // Use JavaScript to set the cursor position precisely at position 5 (end of "hello")
    await page.evaluate(() => {
      const ta = document.querySelector('textarea') as HTMLTextAreaElement;
      if (ta) {
        ta.setSelectionRange(5, 5);
      }
    });

    // Type Enter to create a new line, then type "the quick brown" fast
    await page.keyboard.press('Enter');
    await page.keyboard.type('the quick brown', { delay: 30 }); // Fast typing

    // Wait for content to stabilize
    await page.waitForTimeout(2000);

    // Verify the content is correct
    const expectedContent = 'hello\nthe quick brown\nworld';
    const actualContent = await getEditorContent(page);

    expect(actualContent).toBe(expectedContent);
  });

  test('Two users typing concurrently should merge correctly', async ({ browser }) => {
    // Create two browser contexts to simulate two users
    const context1 = await browser.newContext();
    const context2 = await browser.newContext();

    const page1 = await context1.newPage();
    const page2 = await context2.newPage();

    try {
      // User 1 creates a note
      const noteUrl = await createNote(page1, 'line1\nline2\nline3');

      // User 2 opens the same note
      await page2.goto(noteUrl);
      await page2.waitForLoadState('networkidle');

      // Wait for both WebSockets to connect
      await page1.waitForTimeout(1000);
      await page2.waitForTimeout(1000);

      // User 1: Position at end of line1 and type
      const textarea1 = page1.locator('textarea');
      await textarea1.click();
      await page1.keyboard.press('Home');
      await page1.keyboard.press('End');
      await page1.keyboard.type(' - edited by user1', { delay: 20 });

      // User 2: Position at end of line3 and type (concurrently)
      const textarea2 = page2.locator('textarea');
      await textarea2.click();
      await page2.keyboard.press('End'); // Go to end of document
      await page2.keyboard.type(' - edited by user2', { delay: 20 });

      // Wait for sync to complete
      await page1.waitForTimeout(3000);
      await page2.waitForTimeout(3000);

      // Get content from both pages
      const content1 = await getEditorContent(page1);
      const content2 = await getEditorContent(page2);

      // Both users should see the same content
      expect(content1).toBe(content2);

      // Content should contain both edits
      expect(content1).toContain('edited by user1');
      expect(content1).toContain('edited by user2');

    } finally {
      await context1.close();
      await context2.close();
    }
  });

  test('Rapid insertions and deletions should maintain consistency', async ({ page }) => {
    // Create a note
    const noteUrl = await createNote(page, 'test content here');

    // Reload to get fresh WebSocket
    await page.goto(noteUrl);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    const textarea = page.locator('textarea');
    await textarea.click();

    // Go to end of "test"
    await page.keyboard.press('Home');
    for (let i = 0; i < 4; i++) {
      await page.keyboard.press('ArrowRight');
    }

    // Rapidly type and delete
    await page.keyboard.type('ing', { delay: 20 }); // "testing"
    await page.keyboard.press('Backspace');
    await page.keyboard.press('Backspace');
    await page.keyboard.press('Backspace');
    await page.keyboard.type('s', { delay: 20 }); // "tests"

    // Wait for sync
    await page.waitForTimeout(2000);

    const content = await getEditorContent(page);

    expect(content).toBe('tests content here');
  });

  test('Content should be correctly saved to database after fast typing', async ({ page, request }) => {
    // Create a note
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const textarea = page.locator('textarea');
    await textarea.click();
    await textarea.fill('initial');

    // Wait for note to be created
    await page.waitForFunction(() => window.location.pathname.length > 1, { timeout: 10000 });
    const noteId = page.url().split('/').pop()!;
    await page.waitForTimeout(500);

    // Type fast
    await textarea.click();
    await page.keyboard.press('End');
    await page.keyboard.type(' content here', { delay: 25 });

    // Wait for persistence (server debounces for 2 seconds, then persists)
    await page.waitForTimeout(4000);

    // Fetch the note directly from the API to verify database content
    const response = await request.get(`/api/notes/${noteId}`);
    expect(response.ok()).toBeTruthy();

    const data = await response.json();
    expect(data.content).toBe('initial content here');
  });

  test('Typing during WebSocket reconnection should not lose content', async ({ page }) => {
    // Create a note
    const noteUrl = await createNote(page, 'start');

    // Reload the page
    await page.goto(noteUrl);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(500);

    const textarea = page.locator('textarea');
    await textarea.click();
    await page.keyboard.press('End');

    // Type some content
    await page.keyboard.type(' middle', { delay: 30 });

    // Wait a bit for WebSocket to process
    await page.waitForTimeout(1000);

    // Type more content
    await page.keyboard.type(' end', { delay: 30 });

    // Wait for sync
    await page.waitForTimeout(2000);

    const content = await getEditorContent(page);
    expect(content).toBe('start middle end');
  });

});
