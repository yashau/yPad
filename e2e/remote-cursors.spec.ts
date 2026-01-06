/**
 * Remote Cursor E2E Tests
 *
 * Tests the remote cursor synchronization feature with 3 clients.
 * Uses Yjs relative positions to ensure cursors track correctly
 * when other users edit the document.
 *
 * These tests verify VISUAL cursor positions, not just content sync.
 */

import { test, expect } from '@playwright/test';
import {
  createNote,
  waitForConnection,
  getEditorContent,
  focusEditor,
  setCursorPosition,
  getRemoteCursorPositions,
  getRemoteCursorCount,
  setup3Clients
} from './utils/test-helpers';

// ============================================================================
// TESTS
// ============================================================================

test.describe('Remote Cursor Synchronization - 3 Clients', () => {

  test('Remote cursors appear when other clients place their cursors', async ({ browser }) => {
    const { clients, cleanup } = await setup3Clients(browser, 'Hello World');

    try {
      const [client1, client2, client3] = clients;

      // Client 2 places cursor at position 5
      await focusEditor(client2.page);
      await setCursorPosition(client2.page, 5);
      await client2.page.keyboard.press('ArrowRight');
      await client2.page.keyboard.press('ArrowLeft');
      await client2.page.waitForTimeout(800);

      // Client 3 places cursor at position 11
      await focusEditor(client3.page);
      await setCursorPosition(client3.page, 11);
      await client3.page.keyboard.press('ArrowRight');
      await client3.page.keyboard.press('ArrowLeft');
      await client3.page.waitForTimeout(800);

      // Wait for cursor sync
      await client1.page.waitForTimeout(1000);

      // Client 1 should see 2 remote cursors
      const cursorCount = await getRemoteCursorCount(client1.page);
      expect(cursorCount).toBe(2);

      // Get positions and verify they're at different horizontal locations
      const positions = await getRemoteCursorPositions(client1.page);
      expect(positions.length).toBe(2);

      const leftValues = positions.map(p => p.left).sort((a, b) => a - b);
      // The cursor at position 11 should be further right than cursor at position 5
      expect(leftValues[1]).toBeGreaterThan(leftValues[0]);

    } finally {
      await cleanup();
    }
  });

  test('Cursor shifts RIGHT when text is inserted BEFORE it', async ({ browser }) => {
    const { clients, cleanup } = await setup3Clients(browser, 'World');

    try {
      const [client1, client2] = clients;

      // Client 2 places cursor at end of "World" (position 5)
      await focusEditor(client2.page);
      await client2.page.keyboard.press('Control+End');
      await client2.page.waitForTimeout(800);

      // Get initial cursor position as seen by client 1
      await client1.page.waitForTimeout(500);
      const initialCursors = await getRemoteCursorPositions(client1.page);
      expect(initialCursors.length).toBe(1);
      const initialLeft = initialCursors[0].left;

      // Client 1 types "Hello " at the beginning
      await focusEditor(client1.page);
      await client1.page.keyboard.press('Home');
      await client1.page.keyboard.type('Hello ', { delay: 30 });

      // Wait for Yjs sync and cursor position recalculation
      await client1.page.waitForTimeout(1500);

      // Client 2's cursor should have shifted RIGHT
      const updatedCursors = await getRemoteCursorPositions(client1.page);
      expect(updatedCursors.length).toBe(1);
      const updatedLeft = updatedCursors[0].left;

      expect(updatedLeft).toBeGreaterThan(initialLeft);

      // Verify content
      const content = await getEditorContent(client1.page);
      expect(content).toBe('Hello World');

    } finally {
      await cleanup();
    }
  });

  test('Cursor shifts LEFT when text is deleted BEFORE it', async ({ browser }) => {
    const { clients, cleanup } = await setup3Clients(browser, 'Hello World');

    try {
      const [client1, client2] = clients;

      // Client 2 places cursor at end
      await focusEditor(client2.page);
      await client2.page.keyboard.press('Control+End');
      await client2.page.waitForTimeout(800);

      // Get initial cursor position
      await client1.page.waitForTimeout(500);
      const initialCursors = await getRemoteCursorPositions(client1.page);
      expect(initialCursors.length).toBe(1);
      const initialLeft = initialCursors[0].left;

      // Client 1 deletes "Hello " from the beginning
      await focusEditor(client1.page);
      await client1.page.keyboard.press('Home');
      for (let i = 0; i < 6; i++) {
        await client1.page.keyboard.press('Delete');
      }
      await client1.page.waitForTimeout(1500);

      // Client 2's cursor should have shifted LEFT
      const updatedCursors = await getRemoteCursorPositions(client1.page);
      expect(updatedCursors.length).toBe(1);
      const updatedLeft = updatedCursors[0].left;

      expect(updatedLeft).toBeLessThan(initialLeft);

      // Verify content
      const content = await getEditorContent(client1.page);
      expect(content).toBe('World');

    } finally {
      await cleanup();
    }
  });

  test('Cursor between two others only shifts the one after the edit', async ({ browser }) => {
    const { clients, cleanup } = await setup3Clients(browser, 'ABCDEFGHIJ');

    try {
      const [client1, client2, client3] = clients;

      // Client 2 at position 3 (after "ABC")
      await focusEditor(client2.page);
      await setCursorPosition(client2.page, 3);
      await client2.page.keyboard.press('ArrowRight');
      await client2.page.keyboard.press('ArrowLeft');
      await client2.page.waitForTimeout(500);

      // Client 3 at position 7 (after "ABCDEFG")
      await focusEditor(client3.page);
      await setCursorPosition(client3.page, 7);
      await client3.page.keyboard.press('ArrowRight');
      await client3.page.keyboard.press('ArrowLeft');
      await client3.page.waitForTimeout(500);

      await client1.page.waitForTimeout(1000);

      // Get initial positions
      const initialCursors = await getRemoteCursorPositions(client1.page);
      expect(initialCursors.length).toBe(2);

      // Sort by left to identify positions
      const sortedInitial = [...initialCursors].sort((a, b) => a.left - b.left);
      const cursorAtPos3Left = sortedInitial[0].left;
      const cursorAtPos7Left = sortedInitial[1].left;

      // Client 1 inserts "XX" at position 5 (between the cursors)
      await focusEditor(client1.page);
      await setCursorPosition(client1.page, 5);
      await client1.page.keyboard.type('XX', { delay: 30 });
      await client1.page.waitForTimeout(1500);

      // Get updated positions
      const updatedCursors = await getRemoteCursorPositions(client1.page);
      expect(updatedCursors.length).toBe(2);
      const sortedUpdated = [...updatedCursors].sort((a, b) => a.left - b.left);

      // Cursor at position 3 should NOT have moved (insertion was after it)
      expect(Math.abs(sortedUpdated[0].left - cursorAtPos3Left)).toBeLessThan(5);

      // Cursor at position 7 SHOULD have moved right
      expect(sortedUpdated[1].left).toBeGreaterThan(cursorAtPos7Left);

      // Verify content
      const content = await getEditorContent(client1.page);
      expect(content).toBe('ABCDEXXFGHIJ');

    } finally {
      await cleanup();
    }
  });

  test('Cursor moves when newline inserted before it', async ({ browser }) => {
    const { clients, cleanup } = await setup3Clients(browser, 'Line1 END');

    try {
      const [client1, client2] = clients;

      // Client 2 places cursor at "END"
      await focusEditor(client2.page);
      await client2.page.keyboard.press('Control+End');
      await client2.page.waitForTimeout(800);

      // Get initial position
      await client1.page.waitForTimeout(500);
      const initialCursors = await getRemoteCursorPositions(client1.page);
      expect(initialCursors.length).toBe(1);
      const initialTop = initialCursors[0].top;

      // Client 1 inserts a newline before "END"
      await focusEditor(client1.page);
      await client1.page.keyboard.press('Home');
      await client1.page.keyboard.type('Line0\n', { delay: 30 });
      await client1.page.waitForTimeout(1500);

      // Client 2's cursor should have moved down (increased top value)
      const updatedCursors = await getRemoteCursorPositions(client1.page);
      expect(updatedCursors.length).toBe(1);
      const updatedTop = updatedCursors[0].top;

      // The cursor should be on a lower line now
      expect(updatedTop).toBeGreaterThan(initialTop);

    } finally {
      await cleanup();
    }
  });

  test('Cursors still visible for remaining clients after one disconnects', async ({ browser }) => {
    const { clients } = await setup3Clients(browser, 'Test content');
    const [client1, client2, client3] = clients;

    try {
      // Clients 2 and 3 place cursors
      await focusEditor(client2.page);
      await setCursorPosition(client2.page, 5);
      await client2.page.keyboard.press('ArrowRight');
      await client2.page.keyboard.press('ArrowLeft');
      await client2.page.waitForTimeout(500);

      await focusEditor(client3.page);
      await setCursorPosition(client3.page, 10);
      await client3.page.keyboard.press('ArrowRight');
      await client3.page.keyboard.press('ArrowLeft');
      await client3.page.waitForTimeout(500);

      await client1.page.waitForTimeout(1000);

      // Client 1 should see 2 cursors
      let cursorCount = await getRemoteCursorCount(client1.page);
      expect(cursorCount).toBe(2);

      // Client 2 disconnects
      await client2.context.close();

      // Client 3 moves cursor to trigger awareness update
      await focusEditor(client3.page);
      await client3.page.keyboard.press('ArrowLeft');
      await client3.page.waitForTimeout(2000);

      // Client 1 should still see client 3's cursor (at minimum)
      cursorCount = await getRemoteCursorCount(client1.page);
      expect(cursorCount).toBeGreaterThanOrEqual(1);

    } finally {
      await client1.context.close();
      await client3.context.close();
    }
  });

  test('Cursors on different lines have different top values', async ({ browser }) => {
    const { clients, cleanup } = await setup3Clients(browser, 'Line1\nLine2\nLine3');

    try {
      const [client1, client2, client3] = clients;

      // Client 2 at Line1 (position 0)
      await focusEditor(client2.page);
      await setCursorPosition(client2.page, 0);
      await client2.page.keyboard.press('ArrowRight');
      await client2.page.keyboard.press('ArrowLeft');
      await client2.page.waitForTimeout(500);

      // Client 3 at Line3 (position 12)
      await focusEditor(client3.page);
      await setCursorPosition(client3.page, 12);
      await client3.page.keyboard.press('ArrowRight');
      await client3.page.keyboard.press('ArrowLeft');
      await client3.page.waitForTimeout(500);

      await client1.page.waitForTimeout(1000);

      // Get cursor positions
      const cursors = await getRemoteCursorPositions(client1.page);
      expect(cursors.length).toBe(2);

      // They should have different top values (different lines)
      const topValues = cursors.map(c => c.top).sort((a, b) => a - b);
      expect(topValues[1]).toBeGreaterThan(topValues[0]);

    } finally {
      await cleanup();
    }
  });

  test('New client joining sees existing remote cursors', async ({ browser }) => {
    // Create 2 clients first
    const context1 = await browser.newContext();
    const page1 = await context1.newPage();
    const noteUrl = await createNote(page1, 'Some text here');

    const context2 = await browser.newContext();
    const page2 = await context2.newPage();
    await page2.goto(noteUrl);
    await waitForConnection(page2);

    try {
      // Client 2 places cursor
      await focusEditor(page2);
      await setCursorPosition(page2, 5);
      await page2.keyboard.press('ArrowRight');
      await page2.keyboard.press('ArrowLeft');
      await page2.waitForTimeout(1000);

      // Client 1 should see client 2's cursor
      let cursorCount = await getRemoteCursorCount(page1);
      expect(cursorCount).toBe(1);

      // Client 3 joins
      const context3 = await browser.newContext();
      const page3 = await context3.newPage();
      await page3.goto(noteUrl);
      await waitForConnection(page3);

      // Client 2 moves cursor to trigger an awareness update
      await focusEditor(page2);
      await page2.keyboard.press('ArrowRight');
      await page2.waitForTimeout(1000);

      // Client 3 should eventually see client 2's cursor
      await page3.waitForTimeout(1500);
      cursorCount = await getRemoteCursorCount(page3);
      expect(cursorCount).toBeGreaterThanOrEqual(1);

      await context3.close();

    } finally {
      await context1.close();
      await context2.close();
    }
  });

});
