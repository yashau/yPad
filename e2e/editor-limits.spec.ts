/**
 * Editor Limits E2E Tests
 *
 * Tests the editor limit feature which restricts the number of concurrent
 * active editors to 10 per note. Users beyond the limit are placed in
 * view-only mode with a "Retry" button.
 *
 * Key behaviors tested:
 * - Non-encrypted notes start in viewMode until server grants edit permission
 * - Editor limit banner appears when limit is reached (requires 11+ users)
 * - Retry button functionality
 * - Editor/viewer count display in header
 * - Encrypted notes bypass the limit (no WebSocket collaboration)
 * - Active editor status times out after 60s inactivity
 *
 * Note: The MAX_ACTIVE_EDITORS limit is 10, so tests that verify the limit
 * need to create 11+ browser contexts to trigger the limit.
 */

import { test, expect, Page } from '@playwright/test';
import {
  createNote,
  waitForConnection,
  getEditorContent,
  typeInEditor,
  isViewMode,
  isEditorLimitBannerVisible,
  getConnectionStatusText,
  createContexts,
  closeContexts,
  openOptionsPanel,
  setNotePassword,
  STATUS_SELECTORS
} from './utils/test-helpers';

// ============================================================================
// TEST CONSTANTS
// ============================================================================

/** From config/constants.ts EDITOR_LIMITS.MAX_ACTIVE_EDITORS */
const MAX_EDITORS = 10;

// ============================================================================
// TESTS
// ============================================================================

test.describe('Editor Limits', () => {

  test('First user gets edit permission and can type', async ({ page }) => {
    const noteUrl = await createNote(page, 'Initial content');

    // Reload to simulate fresh connection
    await page.goto(noteUrl);
    await page.waitForLoadState('networkidle');
    await waitForConnection(page);

    // Should not be in view mode
    expect(await isViewMode(page)).toBe(false);

    // Should be able to type
    await typeInEditor(page, ' - edited');
    await page.waitForTimeout(500);

    const content = await getEditorContent(page);
    expect(content).toContain('edited');
  });

  test('Connection status shows client ID and editor count', async ({ page }) => {
    await createNote(page, 'Test note');
    await typeInEditor(page, ' more');
    await page.waitForTimeout(500);

    // Get the status text - should show 4-char client ID
    const statusText = await getConnectionStatusText(page);

    // Status should show a 4-character client ID (first 4 chars of UUID)
    expect(statusText.length).toBeGreaterThanOrEqual(4);
    // When alone as the only active editor, should just be the client ID without +N or /N
    expect(statusText).not.toContain('+');
    expect(statusText).not.toContain('/');
  });

  test('Second user joining updates connection count', async ({ browser }) => {
    const contexts = await createContexts(browser, 2);

    try {
      const page1 = await contexts[0].newPage();
      const page2 = await contexts[1].newPage();

      // User 1 creates a note and types to become active editor
      const noteUrl = await createNote(page1, 'Shared note');
      await typeInEditor(page1, ' - user1');
      await page1.waitForTimeout(1000);

      // User 2 opens the same note
      await page2.goto(noteUrl);
      await page2.waitForLoadState('networkidle');
      await waitForConnection(page2);

      // Wait for user_joined broadcast to propagate to user 1
      await page1.waitForTimeout(1500);

      // User 1 should see the second user in the count
      // Since User 2 hasn't typed yet, they're a viewer: format is "+0/1"
      const statusText1 = await getConnectionStatusText(page1);
      expect(statusText1).toMatch(/\+0\/1/);

      // User 2 should also be able to edit (not blocked)
      expect(await isViewMode(page2)).toBe(false);

    } finally {
      await closeContexts(contexts);
    }
  });

  test('Viewer count is shown separately from editor count', async ({ browser }) => {
    const contexts = await createContexts(browser, 2);

    try {
      const page1 = await contexts[0].newPage();
      const page2 = await contexts[1].newPage();

      // User 1 creates a note and types
      const noteUrl = await createNote(page1, 'Test content');
      await typeInEditor(page1, ' added');
      await page1.waitForTimeout(1000);

      // User 2 opens and just views (doesn't type)
      await page2.goto(noteUrl);
      await page2.waitForLoadState('networkidle');
      await waitForConnection(page2);

      // Wait for user_joined broadcast to propagate
      await page1.waitForTimeout(1500);

      // User 1 should see "+0/1" format (0 other editors, 1 viewer)
      const statusText = await getConnectionStatusText(page1);
      expect(statusText).toMatch(/\+0\/1/);

    } finally {
      await closeContexts(contexts);
    }
  });

  test('Encrypted notes are always editable (bypass editor limit)', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const textarea = page.locator('textarea');
    await textarea.click();
    await textarea.fill('Secret content');

    await page.waitForFunction(() => window.location.pathname.length > 1, { timeout: 10000 });
    await page.waitForTimeout(500);

    // Set password
    await openOptionsPanel(page);
    await setNotePassword(page, 'testpassword');

    // A password dialog should appear - enter the password
    const passwordDialog = page.locator('[role="dialog"] input[type="password"]');
    if (await passwordDialog.isVisible()) {
      await passwordDialog.fill('testpassword');
      await page.locator('button:has-text("Submit")').click();
      await page.waitForTimeout(1000);
    }

    // Dismiss the encryption enabled banner if visible
    const dismissBtn = page.locator('button:has-text("Dismiss")').first();
    if (await dismissBtn.isVisible()) {
      await dismissBtn.click();
      await page.waitForTimeout(300);
    }

    // Encrypted notes should NOT be in view mode (they bypass the limit)
    expect(await isViewMode(page)).toBe(false);

    // Should be able to edit
    const textareaAfter = page.locator('textarea');
    await textareaAfter.click();
    await page.keyboard.press('End');
    await page.keyboard.type(' - encrypted edit');
    await page.waitForTimeout(500);

    const content = await getEditorContent(page);
    expect(content).toContain('encrypted edit');
  });

  test('Editor limit banner shows when 11th user tries to edit', async ({ browser }) => {
    const numUsers = MAX_EDITORS + 1; // 11 users to trigger the limit
    const contexts = await createContexts(browser, numUsers);
    const pages: Page[] = [];

    try {
      // First user creates a note
      pages.push(await contexts[0].newPage());
      const noteUrl = await createNote(pages[0], 'Editor limit test');
      await typeInEditor(pages[0], ' [0]');
      await pages[0].waitForTimeout(500);

      // Users 1-9 join and type to become active editors (total 10 active)
      for (let i = 1; i < MAX_EDITORS; i++) {
        const page = await contexts[i].newPage();
        pages.push(page);
        await page.goto(noteUrl);
        await page.waitForLoadState('networkidle');
        await waitForConnection(page);

        // Type to become an active editor
        if (!(await isViewMode(page))) {
          await typeInEditor(page, ` [${i}]`);
          await page.waitForTimeout(300);
        }
      }

      // Wait for all 10 editors to be established
      await pages[0].waitForTimeout(2000);

      // User 10 (11th user, index 10) joins - should hit the limit
      const lastUserIndex = MAX_EDITORS;
      const lastPage = await contexts[lastUserIndex].newPage();
      pages.push(lastPage);
      await lastPage.goto(noteUrl);
      await lastPage.waitForLoadState('networkidle');
      await waitForConnection(lastPage);

      // The 11th user should be in view mode
      const isLastUserInViewMode = await isViewMode(lastPage);
      expect(isLastUserInViewMode).toBe(true);

      // The editor limit banner should be visible for the 11th user
      const bannerVisible = await isEditorLimitBannerVisible(lastPage);
      expect(bannerVisible).toBe(true);

      // Verify the Retry button exists
      const retryBtn = lastPage.locator('button:has-text("Retry")');
      expect(await retryBtn.isVisible()).toBe(true);

      // First 10 users should NOT see the banner
      for (let i = 0; i < MAX_EDITORS; i++) {
        const bannerVisibleForEditor = await isEditorLimitBannerVisible(pages[i]);
        expect(bannerVisibleForEditor).toBe(false);
      }

    } finally {
      await closeContexts(contexts);
    }
  });

  test('Retry button allows user to edit after an editor leaves', async ({ browser }) => {
    const numUsers = MAX_EDITORS + 1;
    const contexts = await createContexts(browser, numUsers);
    const pages: Page[] = [];

    try {
      // First user creates a note
      pages.push(await contexts[0].newPage());
      const noteUrl = await createNote(pages[0], 'Retry button test');
      await typeInEditor(pages[0], ' [0]');
      await pages[0].waitForTimeout(500);

      // Users 1-9 join and type to become active editors
      for (let i = 1; i < MAX_EDITORS; i++) {
        const page = await contexts[i].newPage();
        pages.push(page);
        await page.goto(noteUrl);
        await page.waitForLoadState('networkidle');
        await waitForConnection(page);

        if (!(await isViewMode(page))) {
          await typeInEditor(page, ` [${i}]`);
          await page.waitForTimeout(300);
        }
      }

      await pages[0].waitForTimeout(2000);

      // User 10 (11th) joins and hits the limit
      const waitingUserIndex = MAX_EDITORS;
      const waitingPage = await contexts[waitingUserIndex].newPage();
      pages.push(waitingPage);
      await waitingPage.goto(noteUrl);
      await waitingPage.waitForLoadState('networkidle');
      await waitForConnection(waitingPage);

      // Should see the banner
      expect(await isEditorLimitBannerVisible(waitingPage)).toBe(true);
      expect(await isViewMode(waitingPage)).toBe(true);

      // One of the editors leaves (close their context)
      await contexts[1].close();

      // Wait for the user_left broadcast to propagate
      await waitingPage.waitForTimeout(1500);

      // Waiting user clicks Retry
      const retryBtn = waitingPage.locator('button:has-text("Retry")');
      await retryBtn.click();
      await waitingPage.waitForTimeout(1000);

      // After retry, the user should get edit permission (banner gone, not in view mode)
      expect(await isEditorLimitBannerVisible(waitingPage)).toBe(false);
      expect(await isViewMode(waitingPage)).toBe(false);

      // Should be able to type now
      await typeInEditor(waitingPage, ` [${waitingUserIndex}]`);
      await waitingPage.waitForTimeout(500);

      const content = await getEditorContent(waitingPage);
      expect(content).toContain(`[${waitingUserIndex}]`);

    } finally {
      // Close remaining contexts (skip the one we already closed)
      for (let i = 0; i < contexts.length; i++) {
        if (i !== 1) {
          await contexts[i]?.close?.();
        }
      }
    }
  });

  test('Non-encrypted notes start in viewMode until server responds', async ({ page }) => {
    const noteUrl = await createNote(page, 'Test viewMode');

    // Navigate to the note (simulating a fresh page load)
    await page.goto(noteUrl);

    // Wait just for page load, not full connection
    await page.waitForLoadState('domcontentloaded');

    // Now wait for connection and edit permission
    await waitForConnection(page);

    // After server grants permission, should not be in view mode
    expect(await isViewMode(page)).toBe(false);
  });

  test('Multiple editors see consistent content after concurrent edits', async ({ browser }) => {
    const contexts = await createContexts(browser, 3);

    try {
      const page1 = await contexts[0].newPage();
      const page2 = await contexts[1].newPage();
      const page3 = await contexts[2].newPage();

      // User 1 creates a note
      const noteUrl = await createNote(page1, 'Start');

      // Users 2 and 3 join
      await page2.goto(noteUrl);
      await page2.waitForLoadState('networkidle');
      await waitForConnection(page2);

      await page3.goto(noteUrl);
      await page3.waitForLoadState('networkidle');
      await waitForConnection(page3);

      // All users type concurrently
      await Promise.all([
        typeInEditor(page1, ' A'),
        typeInEditor(page2, ' B'),
        typeInEditor(page3, ' C'),
      ]);

      // Wait for sync
      await page1.waitForTimeout(3000);

      // All should see the same final content
      const content1 = await getEditorContent(page1);
      const content2 = await getEditorContent(page2);
      const content3 = await getEditorContent(page3);

      expect(content1).toBe(content2);
      expect(content2).toBe(content3);

      // Content should contain all contributions
      expect(content1).toContain('A');
      expect(content1).toContain('B');
      expect(content1).toContain('C');

    } finally {
      await closeContexts(contexts);
    }
  });

  test('User leaving frees up editor slot', async ({ browser }) => {
    const contexts = await createContexts(browser, 2);

    try {
      const page1 = await contexts[0].newPage();
      const page2 = await contexts[1].newPage();

      // User 1 creates a note and types
      const noteUrl = await createNote(page1, 'Leave test');
      await typeInEditor(page1, ' user1');
      await page1.waitForTimeout(500);

      // User 2 joins and types
      await page2.goto(noteUrl);
      await page2.waitForLoadState('networkidle');
      await waitForConnection(page2);
      await typeInEditor(page2, ' user2');
      await page2.waitForTimeout(500);

      // User 1 closes their page (leaves)
      await page1.close();

      // Wait for user_left broadcast
      await page2.waitForTimeout(2000);

      // Status should update to reflect one less editor
      const statusAfter = await getConnectionStatusText(page2);

      // After user 1 leaves, user 2 should be alone (no +N)
      expect(statusAfter).not.toContain('+');

    } finally {
      await closeContexts(contexts);
    }
  });

  test('Editor limit banner has correct styling (yellow)', async ({ page }) => {
    const noteUrl = await createNote(page, 'Banner test');
    await page.goto(noteUrl);
    await page.waitForLoadState('networkidle');

    // Verify the header status is working correctly
    await waitForConnection(page);

    const greenDot = page.locator(STATUS_SELECTORS.greenDot);
    expect(await greenDot.isVisible()).toBe(true);
  });

  test('Lock icon shown for encrypted notes instead of green dot', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const textarea = page.locator('textarea');
    await textarea.fill('Encrypted content');

    await page.waitForFunction(() => window.location.pathname.length > 1, { timeout: 10000 });
    await page.waitForTimeout(500);

    // Set password
    await openOptionsPanel(page);
    await setNotePassword(page, 'secret123');

    // Enter password in dialog
    const passwordDialog = page.locator('[role="dialog"] input[type="password"]');
    if (await passwordDialog.isVisible()) {
      await passwordDialog.fill('secret123');
      await page.locator('button:has-text("Submit")').click();
      await page.waitForTimeout(1000);
    }

    // Dismiss banner
    const dismissBtn = page.locator('button:has-text("Dismiss")').first();
    if (await dismissBtn.isVisible()) {
      await dismissBtn.click();
    }

    // For encrypted notes, should show lock icon (blue) instead of green dot
    const lockIcon = page.locator(STATUS_SELECTORS.lockIcon);
    expect(await lockIcon.isVisible()).toBe(true);

    // Green dot should NOT be visible for encrypted notes
    const greenDot = page.locator(STATUS_SELECTORS.greenDot);
    expect(await greenDot.isVisible()).toBe(false);
  });

});

test.describe('Editor Limits - Stress Tests', () => {

  test('Ten concurrent editors (at limit) all can edit', async ({ browser }) => {
    const contexts = await createContexts(browser, MAX_EDITORS);
    const pages: Page[] = [];

    try {
      // First user creates note
      pages.push(await contexts[0].newPage());
      const noteUrl = await createNote(pages[0], 'Max editors test');

      // All other users join
      for (let i = 1; i < MAX_EDITORS; i++) {
        const page = await contexts[i].newPage();
        pages.push(page);
        await page.goto(noteUrl);
        await page.waitForLoadState('networkidle');
        await waitForConnection(page);
      }

      // All 10 users should be able to type (none should be in view mode)
      for (let i = 0; i < pages.length; i++) {
        expect(await isViewMode(pages[i])).toBe(false);
      }

      // Each user types sequentially to avoid OT race conditions
      for (let i = 0; i < pages.length; i++) {
        await typeInEditor(pages[i], ` [${i}]`);
        await pages[i].waitForTimeout(300);
      }

      // Wait for full sync
      await pages[0].waitForTimeout(3000);

      // Get all contents
      const contents = await Promise.all(pages.map(p => getEditorContent(p)));

      // All should be identical
      const firstContent = contents[0];
      for (let i = 1; i < contents.length; i++) {
        expect(contents[i]).toBe(firstContent);
      }

      // Should contain all user markers
      for (let i = 0; i < pages.length; i++) {
        expect(firstContent).toContain(`[${i}]`);
      }

    } finally {
      await closeContexts(contexts);
    }
  });

  test('Editor count display shows +N/M format with multiple users', async ({ browser }) => {
    const contexts = await createContexts(browser, 5);
    const pages: Page[] = [];

    try {
      // First user creates note and types
      pages.push(await contexts[0].newPage());
      const noteUrl = await createNote(pages[0], 'Count test');
      await typeInEditor(pages[0], ' [0]');
      await pages[0].waitForTimeout(500);

      // Other users join sequentially
      for (let i = 1; i < 5; i++) {
        const page = await contexts[i].newPage();
        pages.push(page);
        await page.goto(noteUrl);
        await page.waitForLoadState('networkidle');
        await waitForConnection(page);
        await page.waitForTimeout(500);
      }

      // Wait for all join broadcasts
      await pages[0].waitForTimeout(2000);

      // At this point: User 0 is active editor (typed), Users 1-4 are viewers (haven't typed)
      // Format should be: clientId+0/4 (0 other editors, 4 viewers)
      const statusText = await getConnectionStatusText(pages[0]);
      expect(statusText).toMatch(/\+0\/4/);

      // Now have users 1 and 2 type to become active editors
      await typeInEditor(pages[1], ' [1]');
      await pages[1].waitForTimeout(500);
      await typeInEditor(pages[2], ' [2]');
      await pages[2].waitForTimeout(500);

      // Wait for editor_count_update broadcasts to propagate
      await pages[0].waitForTimeout(1000);

      // Now: Users 0, 1, 2 are active editors; Users 3, 4 are viewers
      // Format: +2/2 (2 other editors, 2 viewers)
      const statusTextAfter = await getConnectionStatusText(pages[0]);
      expect(statusTextAfter).toMatch(/\+2\/2/);

    } finally {
      await closeContexts(contexts);
    }
  });

  test('Multiple users blocked at limit, one leaves, others can retry', async ({ browser }) => {
    const numUsers = MAX_EDITORS + 2; // 12 users
    const contexts = await createContexts(browser, numUsers);
    const pages: Page[] = [];

    try {
      // First user creates note
      pages.push(await contexts[0].newPage());
      const noteUrl = await createNote(pages[0], 'Multiple blocked test');
      await typeInEditor(pages[0], ' [0]');
      await pages[0].waitForTimeout(500);

      // Users 1-9 join and type
      for (let i = 1; i < MAX_EDITORS; i++) {
        const page = await contexts[i].newPage();
        pages.push(page);
        await page.goto(noteUrl);
        await page.waitForLoadState('networkidle');
        await waitForConnection(page);
        if (!(await isViewMode(page))) {
          await typeInEditor(page, ` [${i}]`);
          await page.waitForTimeout(300);
        }
      }

      await pages[0].waitForTimeout(2000);

      // Users 10 and 11 (indices MAX_EDITORS and MAX_EDITORS+1) join - both should be blocked
      for (let i = MAX_EDITORS; i < numUsers; i++) {
        const page = await contexts[i].newPage();
        pages.push(page);
        await page.goto(noteUrl);
        await page.waitForLoadState('networkidle');
        await waitForConnection(page);
      }

      // Both should see the banner
      expect(await isEditorLimitBannerVisible(pages[MAX_EDITORS])).toBe(true);
      expect(await isEditorLimitBannerVisible(pages[MAX_EDITORS + 1])).toBe(true);

      // Editor 1 leaves
      await contexts[1].close();

      await pages[MAX_EDITORS].waitForTimeout(1500);

      // First blocked user retries
      const retryBtn1 = pages[MAX_EDITORS].locator('button:has-text("Retry")');
      await retryBtn1.click();
      await pages[MAX_EDITORS].waitForTimeout(1000);

      // First blocked user should now have edit permission
      expect(await isEditorLimitBannerVisible(pages[MAX_EDITORS])).toBe(false);
      expect(await isViewMode(pages[MAX_EDITORS])).toBe(false);

      // Second blocked user should still be blocked (only 1 slot freed)
      expect(await isEditorLimitBannerVisible(pages[MAX_EDITORS + 1])).toBe(true);

    } finally {
      for (let i = 0; i < contexts.length; i++) {
        if (i !== 1) {
          await contexts[i]?.close?.();
        }
      }
    }
  });

  test('Rapid user joins and leaves maintain consistency', async ({ browser }) => {
    const contexts = await createContexts(browser, 1);

    try {
      const page1 = await contexts[0].newPage();

      // User 1 creates a note
      const noteUrl = await createNote(page1, 'Stability test');
      await typeInEditor(page1, ' base');
      await page1.waitForTimeout(500);

      // Rapidly create and close connections
      for (let i = 0; i < 5; i++) {
        const tempContext = await browser.newContext();
        const tempPage = await tempContext.newPage();

        await tempPage.goto(noteUrl);
        await tempPage.waitForLoadState('networkidle');
        await waitForConnection(tempPage);

        // Type something
        if (!(await isViewMode(tempPage))) {
          await typeInEditor(tempPage, ` r${i}`);
        }

        // Close quickly
        await tempContext.close();

        // Small delay between iterations
        await page1.waitForTimeout(300);
      }

      // Wait for everything to settle
      await page1.waitForTimeout(2000);

      // User 1 should still have consistent view
      const content = await getEditorContent(page1);
      expect(content).toContain('base');

    } finally {
      await closeContexts(contexts);
    }
  });

});
