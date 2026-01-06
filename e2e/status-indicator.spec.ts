/**
 * Status Indicator E2E Tests
 *
 * Tests the behavior of the status indicator (spinner/check) in the header,
 * particularly around WebSocket connections and slow sync scenarios.
 *
 * Uses server-side latency injection via /api/notes/:id/test-latency endpoint
 * to properly simulate WebSocket delays (CDP network emulation doesn't affect WebSockets).
 */

import { test, expect } from '@playwright/test';
import {
  createNote,
  waitForConnection,
  setServerLatency,
  getNoteIdFromUrl,
  openOptionsPanel,
  setNotePassword,
  STATUS_SELECTORS
} from './utils/test-helpers';

// ============================================================================
// TESTS
// ============================================================================

test.describe('Status Indicator - WebSocket Connected', () => {

  test('should hide spinner/check when WebSocket is connected and idle', async ({ page }) => {
    await createNote(page, 'test content');
    await waitForConnection(page);

    // Wait for any UI transitions to settle
    await page.waitForTimeout(2000);

    // The real-time indicator (green dot) should be visible
    await expect(page.locator(STATUS_SELECTORS.realtimeIndicator)).toBeVisible();

    // Check should NOT be visible when WebSocket is connected and idle
    const checkIcon = page.locator(STATUS_SELECTORS.check);
    await expect(checkIcon).not.toBeVisible();

    // Spinner should also not be visible
    const spinner = page.locator(STATUS_SELECTORS.spinner);
    await expect(spinner).not.toBeVisible();
  });

  test('should show spinner only after 2 seconds of slow sync', async ({ page, request }) => {
    const noteUrl = await createNote(page, 'initial content');
    await waitForConnection(page);
    const noteId = getNoteIdFromUrl(noteUrl);

    // Set server-side latency (5 seconds - enough to trigger slow sync but not connection lost)
    await setServerLatency(request, noteId, 5000);

    const textarea = page.locator('textarea');
    await textarea.click();
    await page.keyboard.press('End');

    // Type something to trigger sync
    await page.keyboard.type('x');

    // Immediately after typing, spinner should NOT be visible yet (WebSocket hides it initially)
    await page.waitForTimeout(500);
    const spinnerEarly = page.locator(STATUS_SELECTORS.spinner);
    await expect(spinnerEarly).not.toBeVisible();

    // Wait for slow sync threshold (2+ seconds) - spinner should appear
    await page.waitForTimeout(2500);

    // Now the spinner SHOULD be visible due to slow sync
    const spinnerLate = page.locator(STATUS_SELECTORS.spinner);
    await expect(spinnerLate).toBeVisible({ timeout: 2000 });

    // Clean up: reset latency
    await setServerLatency(request, noteId, 0);
  });

  test('should show check briefly after slow sync completes, then hide', async ({ page, request }) => {
    const noteUrl = await createNote(page, 'initial');
    await waitForConnection(page);
    const noteId = getNoteIdFromUrl(noteUrl);

    // Use 1.1s latency - this will trigger slow sync (2s threshold) when combined with
    // multiple WebSocket messages (yjs_update + awareness), but complete before connection lost (5s)
    // Each message gets delayed, so 2 messages × 1.1s = 2.2s total pending time
    await setServerLatency(request, noteId, 1100);

    const textarea = page.locator('textarea');
    await textarea.click();
    await page.keyboard.press('End');
    await page.keyboard.type('y');

    // Wait for slow sync to trigger (2+ seconds with multiple delayed messages)
    await page.waitForTimeout(2200);

    // Spinner should be visible after 2 seconds of pending
    await expect(page.locator(STATUS_SELECTORS.spinner)).toBeVisible({ timeout: 2000 });

    // After sync completes, check should appear briefly
    const checkIcon = page.locator(STATUS_SELECTORS.check);
    await expect(checkIcon).toBeVisible({ timeout: 5000 });

    // Wait for check to disappear (1.5 seconds timer)
    await page.waitForTimeout(2000);

    // Check should be hidden now
    await expect(checkIcon).not.toBeVisible();

    // Clean up: reset latency
    await setServerLatency(request, noteId, 0);
  });

  test('should show connection lost after 5 seconds of pending', async ({ page, request }) => {
    const noteUrl = await createNote(page, 'initial');
    await waitForConnection(page);
    const noteId = getNoteIdFromUrl(noteUrl);

    // Set extreme server-side latency (10 seconds - simulates connection issues)
    await setServerLatency(request, noteId, 10000);

    const textarea = page.locator('textarea');
    await textarea.click();
    await page.keyboard.press('End');
    await page.keyboard.type('z');

    // Wait for connection lost threshold (5+ seconds)
    await page.waitForTimeout(5500);

    // WiFi-off icon should appear
    const wifiOff = page.locator(STATUS_SELECTORS.wifiOff);
    await expect(wifiOff).toBeVisible({ timeout: 2000 });

    // Spinner should NOT be visible (replaced by wifi-off)
    await expect(page.locator(STATUS_SELECTORS.spinner)).not.toBeVisible();

    // Clean up: reset latency
    await setServerLatency(request, noteId, 0);
  });

});

test.describe('Status Indicator - Non-WebSocket (Encrypted notes)', () => {

  test('should show persistent check for encrypted notes', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Fill content first
    const textarea = page.locator('textarea');
    await textarea.click();
    await textarea.fill('test content for encryption');

    // Wait for note to be created
    await page.waitForFunction(() => window.location.pathname.length > 1, { timeout: 10000 });

    // Wait for WebSocket to connect first
    await page.waitForSelector(STATUS_SELECTORS.realtimeIndicator, { timeout: 5000 });

    // Open options and set password
    await openOptionsPanel(page);
    await setNotePassword(page, 'testpassword123');

    // Wait for encryption to be applied - the encrypted note indicator should appear
    const encryptedIndicator = page.locator('[title*="disabled for encrypted notes"]');
    await expect(encryptedIndicator).toBeVisible({ timeout: 10000 });

    // For encrypted (non-WebSocket) notes, check should be visible and stay visible
    const checkIcon = page.locator(STATUS_SELECTORS.check);
    await expect(checkIcon).toBeVisible({ timeout: 5000 });

    // Wait and verify it stays visible
    await page.waitForTimeout(2000);
    await expect(checkIcon).toBeVisible();
  });

});

test.describe('Status Indicator - Connection States', () => {

  test('should show no spinner or check after WebSocket connects', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const textarea = page.locator('textarea');
    await textarea.click();
    await textarea.fill('test');

    // Wait for note creation
    await page.waitForFunction(() => window.location.pathname.length > 1, { timeout: 10000 });

    // Eventually real-time indicator should appear (connection complete)
    await page.waitForSelector(STATUS_SELECTORS.realtimeIndicator, { timeout: 10000 });

    // After connection, no spinner or check should be shown (WebSocket mode)
    await page.waitForTimeout(2000);
    await expect(page.locator(STATUS_SELECTORS.spinner)).not.toBeVisible();
    await expect(page.locator(STATUS_SELECTORS.check)).not.toBeVisible();
  });

  test('real-time indicator should be visible when WebSocket is connected', async ({ page }) => {
    await createNote(page, 'hello world');
    await waitForConnection(page);

    // Real-time indicator should be visible
    const realtimeIndicator = page.locator(STATUS_SELECTORS.realtimeIndicator);
    await expect(realtimeIndicator).toBeVisible();
  });

});
