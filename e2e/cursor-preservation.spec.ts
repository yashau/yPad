import { test, expect, Page, BrowserContext } from '@playwright/test';

/**
 * Local Cursor Preservation E2E Tests
 *
 * Tests that the LOCAL user's cursor position is preserved when remote
 * users make edits. This is critical for a good editing experience -
 * your cursor shouldn't jump around when others are typing.
 *
 * These tests specifically verify the ACTUAL cursor (not remote cursors)
 * remains stable during collaborative editing.
 */

interface ClientInfo {
  context: BrowserContext;
  page: Page;
  name: string;
}

/**
 * Helper to create a note and wait for WebSocket connection
 */
async function createNote(page: Page, content: string): Promise<string> {
  await page.goto('/');
  await page.waitForLoadState('networkidle');

  const textarea = page.locator('textarea');
  await textarea.click();
  await textarea.fill(content);

  // Wait for auto-save and URL update
  await page.waitForFunction(() => window.location.pathname.length > 1, { timeout: 10000 });

  // Wait for WebSocket connection
  await page.waitForTimeout(500);

  return page.url();
}

/**
 * Helper to wait for WebSocket connection (green dot)
 */
async function waitForConnection(page: Page): Promise<void> {
  await page.waitForSelector('header .bg-green-500', { timeout: 10000 });
  await page.waitForTimeout(500);
}

/**
 * Get the current cursor position in the textarea
 */
async function getCursorPosition(page: Page): Promise<number> {
  return page.evaluate(() => {
    const textarea = document.querySelector('textarea') as HTMLTextAreaElement;
    return textarea?.selectionStart ?? -1;
  });
}

/**
 * Get the current selection range in the textarea
 */
async function getSelectionRange(page: Page): Promise<{ start: number; end: number }> {
  return page.evaluate(() => {
    const textarea = document.querySelector('textarea') as HTMLTextAreaElement;
    return {
      start: textarea?.selectionStart ?? -1,
      end: textarea?.selectionEnd ?? -1
    };
  });
}

/**
 * Set cursor position in the textarea
 */
async function setCursorPosition(page: Page, position: number): Promise<void> {
  await page.evaluate((pos) => {
    const textarea = document.querySelector('textarea') as HTMLTextAreaElement;
    if (textarea) {
      textarea.focus();
      textarea.setSelectionRange(pos, pos);
    }
  }, position);
}

/**
 * Set selection range in the textarea
 */
async function setSelectionRange(page: Page, start: number, end: number): Promise<void> {
  await page.evaluate(({ start, end }) => {
    const textarea = document.querySelector('textarea') as HTMLTextAreaElement;
    if (textarea) {
      textarea.focus();
      textarea.setSelectionRange(start, end);
    }
  }, { start, end });
}

/**
 * Get editor content
 */
async function getEditorContent(page: Page): Promise<string> {
  const textarea = page.locator('textarea');
  return textarea.inputValue();
}

/**
 * Focus the editor
 */
async function focusEditor(page: Page): Promise<void> {
  const textarea = page.locator('textarea');
  await textarea.click();
}

/**
 * Setup 2 clients connected to the same note
 */
async function setup2Clients(browser: any, initialContent: string): Promise<{
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

  // Wait for both to be fully connected
  await page1.waitForTimeout(1000);

  const clients: ClientInfo[] = [
    { context: context1, page: page1, name: 'Client1' },
    { context: context2, page: page2, name: 'Client2' }
  ];

  const cleanup = async () => {
    await context1.close();
    await context2.close();
  };

  return { clients, noteUrl, cleanup };
}

/**
 * Setup 3 clients connected to the same note
 */
async function setup3Clients(browser: any, initialContent: string): Promise<{
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

test.describe('Local Cursor Preservation - 2 Clients', () => {

  test('Cursor stays in place when remote user types AFTER cursor position', async ({ browser }) => {
    // Content: "Hello World"
    // Client1 cursor at position 5 (after "Hello")
    // Client2 types at end -> Client1 cursor should stay at 5
    const { clients, cleanup } = await setup2Clients(browser, 'Hello World');

    try {
      const [client1, client2] = clients;

      // Client1: position cursor at 5 (after "Hello")
      await focusEditor(client1.page);
      await setCursorPosition(client1.page, 5);
      await client1.page.waitForTimeout(300);

      const cursorBefore = await getCursorPosition(client1.page);
      expect(cursorBefore).toBe(5);

      // Client2: type at the end
      await focusEditor(client2.page);
      await client2.page.keyboard.press('End');
      await client2.page.keyboard.type('!!!', { delay: 50 });

      // Wait for sync
      await client1.page.waitForTimeout(1500);

      // Client1's cursor should still be at position 5
      const cursorAfter = await getCursorPosition(client1.page);
      expect(cursorAfter).toBe(5);

      // Verify content synced
      const content = await getEditorContent(client1.page);
      expect(content).toBe('Hello World!!!');

    } finally {
      await cleanup();
    }
  });

  test('Cursor shifts right when remote user types BEFORE cursor position', async ({ browser }) => {
    // Content: "Hello World"
    // Client1 cursor at position 6 (after "Hello ")
    // Client2 types "Hi " at start -> Client1 cursor should move to 9
    const { clients, cleanup } = await setup2Clients(browser, 'Hello World');

    try {
      const [client1, client2] = clients;

      // Client1: position cursor at 6 (after "Hello ")
      await focusEditor(client1.page);
      await setCursorPosition(client1.page, 6);
      await client1.page.waitForTimeout(300);

      const cursorBefore = await getCursorPosition(client1.page);
      expect(cursorBefore).toBe(6);

      // Client2: type "Hi " at the beginning
      await focusEditor(client2.page);
      await client2.page.keyboard.press('Home');
      await client2.page.keyboard.type('Hi ', { delay: 50 });

      // Wait for sync
      await client1.page.waitForTimeout(1500);

      // Client1's cursor should have shifted right by 3 characters
      const cursorAfter = await getCursorPosition(client1.page);
      expect(cursorAfter).toBe(9); // 6 + 3 = 9

      // Verify content synced
      const content = await getEditorContent(client1.page);
      expect(content).toBe('Hi Hello World');

    } finally {
      await cleanup();
    }
  });

  test('Cursor shifts left when remote user deletes BEFORE cursor position', async ({ browser }) => {
    // Content: "Hello World"
    // Client1 cursor at position 11 (at end)
    // Client2 deletes "Hello " -> Client1 cursor should move to 5
    const { clients, cleanup } = await setup2Clients(browser, 'Hello World');

    try {
      const [client1, client2] = clients;

      // Client1: position cursor at end (11)
      await focusEditor(client1.page);
      await client1.page.keyboard.press('End');
      await client1.page.waitForTimeout(300);

      const cursorBefore = await getCursorPosition(client1.page);
      expect(cursorBefore).toBe(11);

      // Client2: delete "Hello " (6 chars) from the beginning
      await focusEditor(client2.page);
      await client2.page.keyboard.press('Home');
      for (let i = 0; i < 6; i++) {
        await client2.page.keyboard.press('Delete');
      }

      // Wait for sync
      await client1.page.waitForTimeout(1500);

      // Client1's cursor should have shifted left by 6 characters
      const cursorAfter = await getCursorPosition(client1.page);
      expect(cursorAfter).toBe(5); // 11 - 6 = 5

      // Verify content synced
      const content = await getEditorContent(client1.page);
      expect(content).toBe('World');

    } finally {
      await cleanup();
    }
  });

  test('Selection preserved when remote user types elsewhere', async ({ browser }) => {
    // Content: "Hello World!"
    // Client1 selects "World" (positions 6-11)
    // Client2 types at end (after "!") -> Client1 selection should stay 6-11
    // Note: We use "Hello World!" to have a character AFTER the selection end
    const { clients, cleanup } = await setup2Clients(browser, 'Hello World!');

    try {
      const [client1, client2] = clients;

      // Client1: select "World" (positions 6-11)
      await focusEditor(client1.page);
      await setSelectionRange(client1.page, 6, 11);
      await client1.page.waitForTimeout(300);

      const selectionBefore = await getSelectionRange(client1.page);
      expect(selectionBefore.start).toBe(6);
      expect(selectionBefore.end).toBe(11);

      // Client2: type at end (after the "!")
      await focusEditor(client2.page);
      await client2.page.keyboard.press('End');
      await client2.page.keyboard.type('?', { delay: 50 });

      // Wait for sync
      await client1.page.waitForTimeout(1500);

      // Client1's selection should be preserved (not affected by typing after)
      const selectionAfter = await getSelectionRange(client1.page);
      expect(selectionAfter.start).toBe(6);
      expect(selectionAfter.end).toBe(11);

      // Verify content synced
      const content = await getEditorContent(client1.page);
      expect(content).toBe('Hello World!?');

    } finally {
      await cleanup();
    }
  });

  test('Selection shifts when remote user types before it', async ({ browser }) => {
    // Content: "Hello World"
    // Client1 selects "World" (positions 6-11)
    // Client2 types "XX" at start -> Client1 selection should shift to 8-13
    const { clients, cleanup } = await setup2Clients(browser, 'Hello World');

    try {
      const [client1, client2] = clients;

      // Client1: select "World" (positions 6-11)
      await focusEditor(client1.page);
      await setSelectionRange(client1.page, 6, 11);
      await client1.page.waitForTimeout(300);

      const selectionBefore = await getSelectionRange(client1.page);
      expect(selectionBefore.start).toBe(6);
      expect(selectionBefore.end).toBe(11);

      // Client2: type "XX" at start
      await focusEditor(client2.page);
      await client2.page.keyboard.press('Home');
      await client2.page.keyboard.type('XX', { delay: 50 });

      // Wait for sync
      await client1.page.waitForTimeout(1500);

      // Client1's selection should shift right by 2
      const selectionAfter = await getSelectionRange(client1.page);
      expect(selectionAfter.start).toBe(8);  // 6 + 2
      expect(selectionAfter.end).toBe(13);   // 11 + 2

      // Verify content synced
      const content = await getEditorContent(client1.page);
      expect(content).toBe('XXHello World');

    } finally {
      await cleanup();
    }
  });

  test('Cursor preserved during rapid typing from remote user', async ({ browser }) => {
    // Content: "ABCDEFGHIJ"
    // Client1 cursor at position 5 (after "ABCDE")
    // Client2 rapidly types at end -> Client1 cursor should stay at 5
    const { clients, cleanup } = await setup2Clients(browser, 'ABCDEFGHIJ');

    try {
      const [client1, client2] = clients;

      // Client1: position cursor at 5
      await focusEditor(client1.page);
      await setCursorPosition(client1.page, 5);
      await client1.page.waitForTimeout(300);

      const cursorBefore = await getCursorPosition(client1.page);
      expect(cursorBefore).toBe(5);

      // Client2: rapid typing at end
      await focusEditor(client2.page);
      await client2.page.keyboard.press('End');
      await client2.page.keyboard.type('1234567890', { delay: 20 });

      // Wait for sync
      await client1.page.waitForTimeout(2000);

      // Client1's cursor should still be at position 5
      const cursorAfter = await getCursorPosition(client1.page);
      expect(cursorAfter).toBe(5);

      // Verify content synced
      const content = await getEditorContent(client1.page);
      expect(content).toBe('ABCDEFGHIJ1234567890');

    } finally {
      await cleanup();
    }
  });

});

test.describe('Local Cursor Preservation - 3 Clients Simultaneous', () => {

  test('Cursor preserved when 2 remote users type at different positions', async ({ browser }) => {
    // Multi-line content for more realistic test
    const initialContent = 'Line 1: Hello World\nLine 2: Foo Bar\nLine 3: Test Data';
    const { clients, cleanup } = await setup3Clients(browser, initialContent);

    try {
      const [client1, client2, client3] = clients;

      // Client1: position cursor at start of Line 2 (position 20)
      await focusEditor(client1.page);
      await setCursorPosition(client1.page, 20);
      await client1.page.waitForTimeout(300);

      const cursorBefore = await getCursorPosition(client1.page);
      expect(cursorBefore).toBe(20);

      // Client2: type at end of Line 1 (position 19)
      await focusEditor(client2.page);
      await setCursorPosition(client2.page, 19);
      await client2.page.keyboard.type('!', { delay: 50 });

      // Client3: type at end of Line 3
      await focusEditor(client3.page);
      await client3.page.keyboard.press('End');
      await client3.page.keyboard.type('***', { delay: 50 });

      // Wait for sync
      await client1.page.waitForTimeout(2000);

      // Client1's cursor should have shifted right by 1 (Client2's insert was before)
      // Client3's insert was after, so no effect from that
      const cursorAfter = await getCursorPosition(client1.page);
      expect(cursorAfter).toBe(21); // 20 + 1

      // Verify content synced
      const content = await getEditorContent(client1.page);
      expect(content).toContain('Line 1: Hello World!');
      expect(content).toContain('Line 3: Test Data***');

    } finally {
      await cleanup();
    }
  });

  test('Cursor stable during interleaved typing from multiple users', async ({ browser }) => {
    const initialContent = 'START|MIDDLE|END';
    const { clients, cleanup } = await setup3Clients(browser, initialContent);

    try {
      const [client1, client2, client3] = clients;

      // Client1: position cursor at 6 (after "START|")
      await focusEditor(client1.page);
      await setCursorPosition(client1.page, 6);
      await client1.page.waitForTimeout(300);

      const cursorBefore = await getCursorPosition(client1.page);
      expect(cursorBefore).toBe(6);

      // Client2 and Client3 type interleaved at the end
      await focusEditor(client2.page);
      await client2.page.keyboard.press('End');

      await focusEditor(client3.page);
      await client3.page.keyboard.press('End');

      // Interleave typing
      for (let i = 0; i < 5; i++) {
        await client2.page.keyboard.type('A', { delay: 30 });
        await client3.page.keyboard.type('B', { delay: 30 });
      }

      // Wait for all syncs
      await client1.page.waitForTimeout(3000);

      // Client1's cursor should still be at position 6 (all inserts were after it)
      const cursorAfter = await getCursorPosition(client1.page);
      expect(cursorAfter).toBe(6);

      // Content should have both A's and B's at the end
      const content = await getEditorContent(client1.page);
      expect(content.startsWith('START|MIDDLE|END')).toBe(true);
      expect(content).toContain('A');
      expect(content).toContain('B');

    } finally {
      await cleanup();
    }
  });

  test('Can continue typing smoothly while remote users edit', async ({ browser }) => {
    // This is the key user experience test:
    // Client1 should be able to type continuously while Client2 types at a DIFFERENT position
    // WITHOUT cursor jumping
    //
    // Client1 types at the END while Client2 types at the BEGINNING.
    // After both finish, all characters should be present.
    const { clients, cleanup } = await setup2Clients(browser, 'Middle');

    try {
      const [client1, client2] = clients;

      // Client1 positions cursor at end
      await focusEditor(client1.page);
      await client1.page.keyboard.press('End');
      await client1.page.waitForTimeout(500);

      // Client2 positions cursor at beginning (setCursorPosition includes focus)
      await setCursorPosition(client2.page, 0);
      await client2.page.waitForTimeout(500);

      // Verify Client2 cursor is at position 0
      const client2CursorBefore = await getCursorPosition(client2.page);
      expect(client2CursorBefore).toBe(0);

      // Client2 types "Start" at position 0
      // Don't call focusEditor again - it would reset cursor position!
      await client2.page.keyboard.type('Start', { delay: 100 });

      // Wait for Client1 to receive all updates
      await client1.page.waitForTimeout(1500);

      // Now Client1 types at end (cursor should have shifted due to "Start" being inserted before it)
      // Don't call focusEditor again - it would reset cursor position!
      await client1.page.keyboard.type('End', { delay: 100 });

      // Wait for final sync
      await client1.page.waitForTimeout(2000);

      // Both pieces of text should be present
      const content1 = await getEditorContent(client1.page);
      const content2 = await getEditorContent(client2.page);

      // Content should converge
      expect(content1).toBe(content2);

      // Verify content is exactly "StartMiddleEnd"
      expect(content1).toBe('StartMiddleEnd');

    } finally {
      await cleanup();
    }
  });

});

test.describe('Cursor Preservation Edge Cases', () => {

  test('Cursor at position 0 stays at 0 when remote types after', async ({ browser }) => {
    const { clients, cleanup } = await setup2Clients(browser, 'Hello');

    try {
      const [client1, client2] = clients;

      // Client1 at position 0
      await focusEditor(client1.page);
      await client1.page.keyboard.press('Home');
      await client1.page.waitForTimeout(300);

      const cursorBefore = await getCursorPosition(client1.page);
      expect(cursorBefore).toBe(0);

      // Client2 types at end
      await focusEditor(client2.page);
      await client2.page.keyboard.press('End');
      await client2.page.keyboard.type(' World', { delay: 50 });

      // Wait for sync
      await client1.page.waitForTimeout(1500);

      // Client1 cursor should still be at 0
      const cursorAfter = await getCursorPosition(client1.page);
      expect(cursorAfter).toBe(0);

    } finally {
      await cleanup();
    }
  });

  test('Cursor at end stays at end when remote types before', async ({ browser }) => {
    const { clients, cleanup } = await setup2Clients(browser, 'World');

    try {
      const [client1, client2] = clients;

      // Client1 at end (position 5)
      await focusEditor(client1.page);
      await client1.page.keyboard.press('End');
      await client1.page.waitForTimeout(300);

      const cursorBefore = await getCursorPosition(client1.page);
      expect(cursorBefore).toBe(5);

      // Client2 types "Hello " at start
      await focusEditor(client2.page);
      await client2.page.keyboard.press('Home');
      await client2.page.keyboard.type('Hello ', { delay: 50 });

      // Wait for sync
      await client1.page.waitForTimeout(1500);

      // Client1 cursor should shift to the new end (5 + 6 = 11)
      const cursorAfter = await getCursorPosition(client1.page);
      expect(cursorAfter).toBe(11);

      // Verify content
      const content = await getEditorContent(client1.page);
      expect(content).toBe('Hello World');

    } finally {
      await cleanup();
    }
  });

  test('Cursor preserved when remote user does cut operation', async ({ browser }) => {
    const { clients, cleanup } = await setup2Clients(browser, 'ABCDEFGHIJ');

    try {
      const [client1, client2] = clients;

      // Client1 at position 8 (after "ABCDEFGH")
      await focusEditor(client1.page);
      await setCursorPosition(client1.page, 8);
      await client1.page.waitForTimeout(300);

      const cursorBefore = await getCursorPosition(client1.page);
      expect(cursorBefore).toBe(8);

      // Client2 cuts "BCD" (positions 1-4)
      await focusEditor(client2.page);
      await setSelectionRange(client2.page, 1, 4);
      await client2.page.keyboard.press('Control+x');

      // Wait for sync
      await client1.page.waitForTimeout(1500);

      // Client1 cursor should shift left by 3
      const cursorAfter = await getCursorPosition(client1.page);
      expect(cursorAfter).toBe(5); // 8 - 3 = 5

      // Verify content
      const content = await getEditorContent(client1.page);
      expect(content).toBe('AEFGHIJ');

    } finally {
      await cleanup();
    }
  });

  test('Cursor on multi-line document with newlines inserted before', async ({ browser }) => {
    const { clients, cleanup } = await setup2Clients(browser, 'Line1\nLine2\nLine3');

    try {
      const [client1, client2] = clients;

      // Client1 at start of Line3 (position 12)
      await focusEditor(client1.page);
      await setCursorPosition(client1.page, 12);
      await client1.page.waitForTimeout(300);

      const cursorBefore = await getCursorPosition(client1.page);
      expect(cursorBefore).toBe(12);

      // Client2 inserts new line at very start (position 0)
      // Use setCursorPosition to reliably go to position 0 in multi-line content
      await focusEditor(client2.page);
      await setCursorPosition(client2.page, 0);
      await client2.page.keyboard.type('Line0\n', { delay: 50 });

      // Wait for sync
      await client1.page.waitForTimeout(1500);

      // Client1 cursor should shift right by 6 ("Line0\n".length)
      const cursorAfter = await getCursorPosition(client1.page);
      expect(cursorAfter).toBe(18); // 12 + 6

      // Verify content
      const content = await getEditorContent(client1.page);
      expect(content).toBe('Line0\nLine1\nLine2\nLine3');

    } finally {
      await cleanup();
    }
  });

});
