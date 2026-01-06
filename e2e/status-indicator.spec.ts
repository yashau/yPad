import { test, expect, Page, APIRequestContext } from '@playwright/test';

/**
 * Status Indicator E2E Tests
 *
 * Tests the behavior of the status indicator (spinner/check) in the header,
 * particularly around WebSocket connections and slow sync scenarios.
 *
 * Uses server-side latency injection via /api/notes/:id/test-latency endpoint
 * to properly simulate WebSocket delays (CDP network emulation doesn't affect WebSockets).
 */

/**
 * Helper to create a note and wait for WebSocket connection
 */
async function createNoteAndWaitForWebSocket(page: Page, content: string): Promise<string> {
  await page.goto('/');
  await page.waitForLoadState('networkidle');

  const textarea = page.locator('textarea');
  await textarea.click();
  await textarea.fill(content);

  // Wait for auto-save to complete and URL to update with the new note ID
  await page.waitForFunction(() => window.location.pathname.length > 1, { timeout: 10000 });

  // Wait for WebSocket to connect (green dot appears)
  await page.waitForSelector('[title*="Real-time"]', { timeout: 5000 });

  return page.url();
}

/**
 * Extract note ID from URL
 */
function getNoteIdFromUrl(url: string): string {
  return new URL(url).pathname.slice(1);
}

/**
 * Set server-side latency for WebSocket message processing
 */
async function setServerLatency(request: APIRequestContext, noteId: string, latencyMs: number): Promise<void> {
  await request.post(`/api/notes/${noteId}/test-latency`, {
    data: { latencyMs }
  });
}

/**
 * Selectors for status indicator states
 */
const STATUS_SELECTORS = {
  spinner: 'header svg.animate-spin',
  check: '[title="All changes saved"] svg',
  wifiOff: '[title="Connection lost - check your internet connection"]',
  slowSyncSpinner: '[title*="Taking longer than usual"]',
  connecting: '[title="Connecting to real-time sync..."]',
  realtimeIndicator: '[title*="Real-time"]',
};

test.describe('Status Indicator - WebSocket Connected', () => {

  test('should hide spinner/check when WebSocket is connected and idle', async ({ page }) => {
    // Create note and wait for WebSocket
    await createNoteAndWaitForWebSocket(page, 'test content');

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
    // Create note and wait for WebSocket
    const noteUrl = await createNoteAndWaitForWebSocket(page, 'initial content');
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
    // The spinner appears after 2 seconds if isSyncing is still true
    await page.waitForTimeout(2500);

    // Now the spinner SHOULD be visible due to slow sync
    const spinnerLate = page.locator(STATUS_SELECTORS.spinner);
    await expect(spinnerLate).toBeVisible({ timeout: 2000 });

    // Clean up: reset latency
    await setServerLatency(request, noteId, 0);
  });

  test('should show check briefly after slow sync completes, then hide', async ({ page, request }) => {
    // Create note and wait for WebSocket
    const noteUrl = await createNoteAndWaitForWebSocket(page, 'initial');
    const noteId = getNoteIdFromUrl(noteUrl);

    // Set server-side latency (4 seconds - triggers slow sync, then completes before connection lost)
    await setServerLatency(request, noteId, 4000);

    const textarea = page.locator('textarea');
    await textarea.click();
    await page.keyboard.press('End');
    await page.keyboard.type('y');

    // Wait for slow sync to trigger (2+ seconds) and verify spinner is visible
    // At 2.5s the spinner should be showing because ACK hasn't come back yet (latency is 4s)
    await page.waitForTimeout(2500);

    // Spinner should be visible
    await expect(page.locator(STATUS_SELECTORS.spinner)).toBeVisible({ timeout: 2000 });

    // Wait for sync to complete (latency is 4s, so around 4.5s total from typing)
    // We're at 2.5s, need to wait another ~2s for the ACK
    await page.waitForTimeout(2500);

    // After sync completes, check should appear briefly
    const checkIcon = page.locator(STATUS_SELECTORS.check);
    await expect(checkIcon).toBeVisible({ timeout: 3000 });

    // Wait for check to disappear (1.5 seconds timer)
    await page.waitForTimeout(2000);

    // Check should be hidden now
    await expect(checkIcon).not.toBeVisible();

    // Clean up: reset latency
    await setServerLatency(request, noteId, 0);
  });

  test('should show connection lost after 5 seconds of pending', async ({ page, request }) => {
    // Create note and wait for WebSocket
    const noteUrl = await createNoteAndWaitForWebSocket(page, 'initial');
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
    // Navigate to homepage
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

    // Open options panel
    const optionsBtn = page.locator('button:has-text("Options")');
    await optionsBtn.click();
    await page.waitForTimeout(300);

    // Enter password in the password input field (in Options panel)
    const passwordInput = page.locator('input#password');
    await passwordInput.fill('testpassword123');

    // Click the lock button to set password (it's a submit button inside the form)
    const lockButton = page.locator('form:has(input#password) button[type="submit"]');
    await lockButton.click();

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
    await createNoteAndWaitForWebSocket(page, 'hello world');

    // Real-time indicator should be visible
    const realtimeIndicator = page.locator(STATUS_SELECTORS.realtimeIndicator);
    await expect(realtimeIndicator).toBeVisible();
  });

});
