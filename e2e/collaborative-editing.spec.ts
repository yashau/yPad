/**
 * Collaborative Editing E2E Tests
 *
 * Tests cursor preservation and content synchronization during collaborative editing.
 * Covers both plaintext mode (textarea) and syntax highlight mode (contenteditable).
 *
 * Key scenarios tested:
 * - Local cursor stays in place when remote user edits at different location
 * - Local cursor shifts correctly when remote user edits before it
 * - Selection preservation during remote edits
 * - Content convergence after concurrent editing
 * - Desktop/mobile concurrent editing with scrolling
 */

import { test, expect } from '@playwright/test';
import {
  generateLongContent,
  createNote,
  waitForConnection,
  getCursorPosition,
  getSelectionRange,
  setCursorPosition,
  setSelectionRange,
  getEditorContent,
  focusEditor,
  getScrollPosition,
  setSyntaxHighlight,
  setup2Clients,
  setupDesktopMobileClients,
  setup3Clients,
  MOBILE_DEVICE
} from './utils/test-helpers';

/**
 * Generate syntax-highlighted code content (JavaScript) with enough lines for vertical scrolling
 * AND long enough lines for horizontal scrolling (syntax mode doesn't wrap text)
 */
function generateCodeContent(lineCount: number = 100): string {
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

  // Add more lines to ensure both vertical AND horizontal scrolling is needed
  for (let i = lines.length; i < lineCount; i++) {
    if (i % 15 === 0) {
      lines.push('');
      lines.push(`// === Section ${Math.floor(i / 15)} === This section contains important code that demonstrates the functionality of this module with comprehensive comments`);
      lines.push(`function section${Math.floor(i / 15)}HandlerWithLongNameForTesting(dataObject, configurationSettings, extraOptions) {`);
    } else if (i % 15 === 14) {
      lines.push('}');
    } else if (i % 5 === 0) {
      // Extra long comment lines for horizontal scrolling
      lines.push(`  // Line ${i}: Processing step with a very long comment that explains what this code does in great detail to ensure horizontal scrolling is tested properly on all devices`);
    } else if (i % 3 === 0) {
      // Long variable assignments
      lines.push(`  const calculatedValue${i} = calculateComplexValueWithManyParameters(${i}, configurationSettings.param1, configurationSettings.param2, extraOptions);`);
    } else if (i % 7 === 0) {
      // Long string literals
      lines.push(`  const message${i} = "This is line ${i} with a very long string value that contains important information and will cause horizontal scrolling in the editor";`);
    } else {
      lines.push(`  console.log("Processing line ${i} with standard logging output for debugging purposes");`);
    }
  }

  return lines.join('\n');
}

// ============================================================================
// PLAINTEXT MODE TESTS
// ============================================================================

test.describe('Plaintext Mode - Cursor Preservation', () => {

  test('Cursor stays in place when remote user types AFTER cursor position', async ({ browser }) => {
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
    const { clients, cleanup } = await setup2Clients(browser, 'Hello World');

    try {
      const [client1, client2] = clients;

      // Client1: position cursor at 6 (after "Hello ")
      await focusEditor(client1.page);
      await setCursorPosition(client1.page, 6);
      await client1.page.waitForTimeout(300);

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

      // Client1's selection should be preserved
      const selectionAfter = await getSelectionRange(client1.page);
      expect(selectionAfter.start).toBe(6);
      expect(selectionAfter.end).toBe(11);

    } finally {
      await cleanup();
    }
  });

  test('Selection shifts when remote user types before it', async ({ browser }) => {
    const { clients, cleanup } = await setup2Clients(browser, 'Hello World');

    try {
      const [client1, client2] = clients;

      // Client1: select "World" (positions 6-11)
      await focusEditor(client1.page);
      await setSelectionRange(client1.page, 6, 11);
      await client1.page.waitForTimeout(300);

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

    } finally {
      await cleanup();
    }
  });

});

// ============================================================================
// PLAINTEXT MODE - DESKTOP/MOBILE CONCURRENT EDITING
// ============================================================================

test.describe('Plaintext Mode - Desktop/Mobile Concurrent Editing', () => {

  test('CRITICAL: Cursor should NOT jump to end during concurrent editing', async ({ browser }) => {
    const longContent = generateLongContent(100);
    const { desktop, mobile, cleanup } = await setupDesktopMobileClients(browser, longContent);

    try {
      // Position cursors at different locations in the document
      // Desktop: around line 30 (roughly position 30 * 20 = 600)
      // Mobile: around line 70 (roughly position 70 * 20 = 1400)
      const desktopTargetLine = 30;
      const mobileTargetLine = 70;

      // Find positions for these lines
      const content = await getEditorContent(desktop.page);
      const lines = content.split('\n');
      let desktopTargetPos = 0;
      let mobileTargetPos = 0;
      for (let i = 0; i < lines.length; i++) {
        if (i < desktopTargetLine) {
          desktopTargetPos += lines[i].length + 1;
        }
        if (i < mobileTargetLine) {
          mobileTargetPos += lines[i].length + 1;
        }
      }

      // Position desktop cursor
      await focusEditor(desktop.page);
      await setCursorPosition(desktop.page, desktopTargetPos);
      await desktop.page.waitForTimeout(500);

      // Position mobile cursor
      await focusEditor(mobile.page);
      await setCursorPosition(mobile.page, mobileTargetPos);
      await mobile.page.waitForTimeout(500);

      const desktopCursorStart = await getCursorPosition(desktop.page);
      const mobileCursorStart = await getCursorPosition(mobile.page);
      const docLength = content.length;

      console.log('=== BEFORE CONCURRENT EDITING ===');
      console.log('Document length:', docLength);
      console.log('Desktop cursor start:', desktopCursorStart, '(expected ~', desktopTargetPos, ')');
      console.log('Mobile cursor start:', mobileCursorStart, '(expected ~', mobileTargetPos, ')');

      // Both type simultaneously in rounds
      for (let round = 1; round <= 3; round++) {
        console.log(`Round ${round}: ${round === 3 ? 'Typing with backspaces...' : 'Both typing simultaneously...'}`);

        // Type characters interleaved
        for (let i = 0; i < 6; i++) {
          await desktop.page.keyboard.type('D', { delay: 10 });
          await mobile.page.keyboard.type('M', { delay: 10 });
        }

        // Add some backspaces in round 3
        if (round === 3) {
          await desktop.page.keyboard.press('Backspace');
          await mobile.page.keyboard.press('Backspace');
        }

        await desktop.page.waitForTimeout(1000);

        const desktopCursor = await getCursorPosition(desktop.page);
        const mobileCursor = await getCursorPosition(mobile.page);
        const currentDocLength = (await getEditorContent(desktop.page)).length;

        console.log(`=== AFTER ROUND ${round} ===`);
        console.log('Document length:', currentDocLength);
        console.log('Desktop cursor:', desktopCursor);
        console.log('Mobile cursor:', mobileCursor);

        if (round === 1) {
          console.log('Desktop expected near:', desktopCursorStart + 6 + 6);
          console.log('Mobile expected near:', mobileTargetPos + 6 + 11);
        }

        // CRITICAL: Neither cursor should have jumped to the end
        const docEnd = currentDocLength;
        const desktopJumpedToEnd = Math.abs(desktopCursor - docEnd) < 50;
        const mobileJumpedToEnd = Math.abs(mobileCursor - docEnd) < 50;

        if (desktopJumpedToEnd) {
          throw new Error(`Desktop cursor jumped to end! Position: ${desktopCursor}, Doc length: ${docEnd}`);
        }
        if (mobileJumpedToEnd) {
          throw new Error(`Mobile cursor jumped to end! Position: ${mobileCursor}, Doc length: ${docEnd}`);
        }
      }

      console.log('=== TEST PASSED ===');
      console.log('Cursors did not jump to end during concurrent editing');

    } finally {
      await cleanup();
    }
  });

  test('Scroll position maintained during remote edits at distant location', async ({ browser }) => {
    const longContent = generateLongContent(100);
    const { desktop, mobile, cleanup } = await setupDesktopMobileClients(browser, longContent);

    try {
      // Desktop scrolls to middle of document
      await focusEditor(desktop.page);
      await desktop.page.evaluate(() => {
        const textarea = document.querySelector('textarea') as HTMLTextAreaElement;
        if (textarea) textarea.scrollTop = 500;
      });
      await desktop.page.waitForTimeout(300);

      const scrollBefore = await getScrollPosition(desktop.page);

      // Mobile types at the end (far from desktop's scroll position)
      await focusEditor(mobile.page);
      await mobile.page.keyboard.press('End');
      await mobile.page.keyboard.type('Mobile was here!', { delay: 30 });

      // Wait for sync
      await desktop.page.waitForTimeout(1500);

      const scrollAfter = await getScrollPosition(desktop.page);

      // Desktop's scroll position should be approximately preserved
      expect(Math.abs(scrollAfter.scrollTop - scrollBefore.scrollTop)).toBeLessThan(50);

    } finally {
      await cleanup();
    }
  });

  test('Content convergence after heavy concurrent editing', async ({ browser }) => {
    const { desktop, mobile, cleanup } = await setupDesktopMobileClients(browser, 'Initial content here');

    try {
      // Both type rapidly
      await focusEditor(desktop.page);
      await desktop.page.keyboard.press('End');
      await focusEditor(mobile.page);
      await mobile.page.keyboard.press('Home');

      // Interleaved typing
      for (let i = 0; i < 10; i++) {
        await desktop.page.keyboard.type(`D${i}`, { delay: 20 });
        await mobile.page.keyboard.type(`M${i}`, { delay: 20 });
      }

      // Wait for convergence
      await desktop.page.waitForTimeout(3000);

      const desktopContent = await getEditorContent(desktop.page);
      const mobileContent = await getEditorContent(mobile.page);

      // Content should be identical
      expect(desktopContent).toBe(mobileContent);

      // Should contain text from both users
      expect(desktopContent).toContain('D');
      expect(desktopContent).toContain('M');

    } finally {
      await cleanup();
    }
  });

});

// ============================================================================
// SYNTAX HIGHLIGHT MODE TESTS
// ============================================================================

test.describe('Syntax Highlight Mode - Cursor Preservation', () => {

  test('Cursor stays in place when remote user types AFTER cursor position', async ({ browser }) => {
    const codeContent = generateCodeContent(100);
    const { clients, cleanup } = await setup2Clients(browser, codeContent);

    try {
      const [client1, client2] = clients;

      // Switch both clients to JavaScript syntax highlighting
      await setSyntaxHighlight(client1.page, 'JavaScript');
      await client1.page.waitForTimeout(500);
      await setSyntaxHighlight(client2.page, 'JavaScript');
      await client2.page.waitForTimeout(500);

      // Find a position around line 30
      const content = await getEditorContent(client1.page);
      const lines = content.split('\n');
      let targetPos = 0;
      for (let i = 0; i < 30 && i < lines.length; i++) {
        targetPos += lines[i].length + 1;
      }

      // Client1: position cursor at target position
      await focusEditor(client1.page);
      await setCursorPosition(client1.page, targetPos);
      await client1.page.waitForTimeout(500);

      const cursorBefore = await getCursorPosition(client1.page);

      // Client2: type at the end
      await focusEditor(client2.page);
      await client2.page.keyboard.press('End');
      await client2.page.keyboard.type('// appended', { delay: 30 });

      // Wait for sync
      await client1.page.waitForTimeout(2000);

      // Client1's cursor should stay at approximately the same position
      const cursorAfter = await getCursorPosition(client1.page);

      // Allow larger variance for contenteditable due to DOM manipulation complexities
      // (TreeWalker/Range APIs are less precise than textarea's integer positions)
      expect(Math.abs(cursorAfter - cursorBefore)).toBeLessThan(15);

    } finally {
      await cleanup();
    }
  });

  test('Cursor shifts when remote user types BEFORE cursor position', async ({ browser }) => {
    const codeContent = generateCodeContent(100);
    const { clients, cleanup } = await setup2Clients(browser, codeContent);

    try {
      const [client1, client2] = clients;

      // Switch both clients to JavaScript syntax highlighting
      await setSyntaxHighlight(client1.page, 'JavaScript');
      await client1.page.waitForTimeout(500);
      await setSyntaxHighlight(client2.page, 'JavaScript');
      await client2.page.waitForTimeout(500);

      // Find a position around line 50 (middle of document)
      const content = await getEditorContent(client1.page);
      const lines = content.split('\n');
      let targetPos = 0;
      for (let i = 0; i < 50 && i < lines.length; i++) {
        targetPos += lines[i].length + 1;
      }

      // Client1: position cursor at target position
      await focusEditor(client1.page);
      await setCursorPosition(client1.page, targetPos);
      await client1.page.waitForTimeout(500);

      const cursorBefore = await getCursorPosition(client1.page);

      // Client2: type at the beginning
      await focusEditor(client2.page);
      await client2.page.keyboard.press('Home');
      const insertText = '// PREFIX\n';
      await client2.page.keyboard.type(insertText, { delay: 30 });

      // Wait for sync
      await client1.page.waitForTimeout(2000);

      // Client1's cursor should have shifted right by the length of inserted text
      const cursorAfter = await getCursorPosition(client1.page);
      const expectedShift = insertText.length;

      // Allow small variance
      expect(Math.abs(cursorAfter - (cursorBefore + expectedShift))).toBeLessThan(5);

    } finally {
      await cleanup();
    }
  });

});

test.describe('Syntax Highlight Mode - Desktop/Mobile Concurrent Editing', () => {

  test('CRITICAL: Cursor should NOT jump to end during concurrent editing in syntax mode', async ({ browser }) => {
    const codeContent = generateCodeContent(100);
    const { desktop, mobile, cleanup } = await setupDesktopMobileClients(browser, codeContent);

    try {
      // Switch both to JavaScript syntax highlighting
      await setSyntaxHighlight(desktop.page, 'JavaScript');
      await desktop.page.waitForTimeout(500);
      await setSyntaxHighlight(mobile.page, 'JavaScript');
      await mobile.page.waitForTimeout(500);

      // Find positions for line 30 and line 70
      const content = await getEditorContent(desktop.page);
      const lines = content.split('\n');
      let desktopTargetPos = 0;
      let mobileTargetPos = 0;
      for (let i = 0; i < lines.length; i++) {
        if (i < 30) desktopTargetPos += lines[i].length + 1;
        if (i < 70) mobileTargetPos += lines[i].length + 1;
      }

      // Position cursors
      await focusEditor(desktop.page);
      await setCursorPosition(desktop.page, desktopTargetPos);
      await desktop.page.waitForTimeout(500);

      await focusEditor(mobile.page);
      await setCursorPosition(mobile.page, mobileTargetPos);
      await mobile.page.waitForTimeout(500);

      const desktopCursorStart = await getCursorPosition(desktop.page);
      const mobileCursorStart = await getCursorPosition(mobile.page);
      const docLength = content.length;

      console.log('=== SYNTAX MODE: BEFORE CONCURRENT EDITING ===');
      console.log('Document length:', docLength);
      console.log('Desktop cursor start:', desktopCursorStart);
      console.log('Mobile cursor start:', mobileCursorStart);

      // Both type simultaneously
      for (let round = 1; round <= 3; round++) {
        for (let i = 0; i < 5; i++) {
          await desktop.page.keyboard.type('x', { delay: 20 });
          await mobile.page.keyboard.type('y', { delay: 20 });
        }

        await desktop.page.waitForTimeout(1000);

        const desktopCursor = await getCursorPosition(desktop.page);
        const mobileCursor = await getCursorPosition(mobile.page);
        const currentDocLength = (await getEditorContent(desktop.page)).length;

        console.log(`=== SYNTAX MODE: AFTER ROUND ${round} ===`);
        console.log('Document length:', currentDocLength);
        console.log('Desktop cursor:', desktopCursor);
        console.log('Mobile cursor:', mobileCursor);

        // CRITICAL: Neither cursor should have jumped to the end
        const docEnd = currentDocLength;
        const desktopJumpedToEnd = Math.abs(desktopCursor - docEnd) < 50;
        const mobileJumpedToEnd = Math.abs(mobileCursor - docEnd) < 50;

        if (desktopJumpedToEnd) {
          throw new Error(`SYNTAX MODE: Desktop cursor jumped to end! Position: ${desktopCursor}, Doc length: ${docEnd}`);
        }
        if (mobileJumpedToEnd) {
          throw new Error(`SYNTAX MODE: Mobile cursor jumped to end! Position: ${mobileCursor}, Doc length: ${docEnd}`);
        }
      }

      console.log('=== SYNTAX MODE: TEST PASSED ===');

    } finally {
      await cleanup();
    }
  });

  test('Content convergence in syntax highlight mode', async ({ browser }) => {
    const { desktop, mobile, cleanup } = await setupDesktopMobileClients(browser, 'const x = 1;');

    try {
      // Switch both to JavaScript
      await setSyntaxHighlight(desktop.page, 'JavaScript');
      await desktop.page.waitForTimeout(500);
      await setSyntaxHighlight(mobile.page, 'JavaScript');
      await mobile.page.waitForTimeout(500);

      // Both type at different positions
      await focusEditor(desktop.page);
      await desktop.page.keyboard.press('End');
      await focusEditor(mobile.page);
      await mobile.page.keyboard.press('Home');

      for (let i = 0; i < 5; i++) {
        await desktop.page.keyboard.type(`\nconst d${i} = ${i};`, { delay: 20 });
        await mobile.page.keyboard.type(`// comment ${i}\n`, { delay: 20 });
      }

      // Wait for convergence
      await desktop.page.waitForTimeout(3000);

      const desktopContent = await getEditorContent(desktop.page);
      const mobileContent = await getEditorContent(mobile.page);

      // Content should be identical
      expect(desktopContent).toBe(mobileContent);

    } finally {
      await cleanup();
    }
  });

});

// ============================================================================
// MULTI-CLIENT TESTS
// ============================================================================

test.describe('Multi-Client Cursor Preservation', () => {

  test('Cursor preserved when 2 remote users type at different positions', async ({ browser }) => {
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

  test('Can continue typing while remote users edit at different positions', async ({ browser }) => {
    const { clients, cleanup } = await setup2Clients(browser, 'Middle');

    try {
      const [client1, client2] = clients;

      // Client1 positions cursor at end
      await focusEditor(client1.page);
      await client1.page.keyboard.press('End');
      await client1.page.waitForTimeout(500);

      // Client2 positions cursor at beginning
      await setCursorPosition(client2.page, 0);
      await client2.page.waitForTimeout(500);

      // Client2 types "Start" at position 0
      await client2.page.keyboard.type('Start', { delay: 100 });

      // Wait for Client1 to receive updates
      await client1.page.waitForTimeout(1500);

      // Client1 types at end
      await client1.page.keyboard.type('End', { delay: 100 });

      // Wait for final sync
      await client1.page.waitForTimeout(2000);

      // Both pieces of text should be present
      const content1 = await getEditorContent(client1.page);
      const content2 = await getEditorContent(client2.page);

      // Content should converge
      expect(content1).toBe(content2);
      expect(content1).toBe('StartMiddleEnd');

    } finally {
      await cleanup();
    }
  });

});
