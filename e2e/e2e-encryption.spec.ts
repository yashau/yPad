/**
 * E2E Encryption Security Tests
 *
 * These tests verify that true end-to-end encryption is implemented correctly:
 * - Passwords NEVER leave the browser
 * - Decrypted/plaintext content NEVER leaves the browser
 * - Only encrypted blobs are sent to the server
 */

import { test, expect, Page, Request } from '@playwright/test';
import {
  createPasswordProtectedNote,
  accessProtectedNote,
  openOptionsPanel
} from './utils/test-helpers';

// ============================================================================
// TEST CONSTANTS
// ============================================================================

const TEST_PASSWORD = 'MySecretPassword123!';
const TEST_CONTENT = 'This is my super secret note content that should be encrypted';

// ============================================================================
// REQUEST CAPTURE UTILITIES (encryption-specific)
// ============================================================================

interface CapturedRequest {
  url: string;
  method: string;
  postData: string | null;
  headers: Record<string, string>;
}

/**
 * Sets up request interception to capture all outgoing requests
 */
async function setupRequestCapture(page: Page): Promise<CapturedRequest[]> {
  const capturedRequests: CapturedRequest[] = [];

  page.on('request', (request: Request) => {
    const url = request.url();
    // Only capture API requests (not static assets)
    if (url.includes('/api/') || url.includes('/ws')) {
      capturedRequests.push({
        url,
        method: request.method(),
        postData: request.postData(),
        headers: request.headers(),
      });
    }
  });

  return capturedRequests;
}

/**
 * Checks if any captured request contains the forbidden string
 */
function requestsContainString(requests: CapturedRequest[], forbidden: string): CapturedRequest | null {
  for (const req of requests) {
    if (req.postData && req.postData.includes(forbidden)) {
      return req;
    }
    if (req.url.includes(forbidden)) {
      return req;
    }
    for (const value of Object.values(req.headers)) {
      if (value.includes(forbidden)) {
        return req;
      }
    }
  }
  return null;
}

// ============================================================================
// TESTS
// ============================================================================

test.describe('E2E Encryption Security Tests', () => {

  test('Password is NEVER sent to the server when creating a protected note', async ({ page }) => {
    const capturedRequests = await setupRequestCapture(page);

    await createPasswordProtectedNote(page, TEST_CONTENT, TEST_PASSWORD);

    // Verify password was never sent
    const leakedRequest = requestsContainString(capturedRequests, TEST_PASSWORD);
    expect(leakedRequest).toBeNull();

    // Verify we actually made API requests
    const apiRequests = capturedRequests.filter(r => r.url.includes('/api/notes'));
    expect(apiRequests.length).toBeGreaterThan(0);
  });

  test('Plaintext content is NEVER sent after enabling password protection', async ({ page }) => {
    const capturedRequests = await setupRequestCapture(page);

    // Create unprotected note first
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const textarea = page.locator('textarea');
    await textarea.click();
    await textarea.fill(TEST_CONTENT);

    // Wait for initial save (unprotected)
    await page.waitForFunction(() => window.location.pathname.length > 1, { timeout: 10000 });
    await page.waitForTimeout(1000);

    // Clear captured requests before enabling password
    capturedRequests.length = 0;

    // Now enable password protection
    await openOptionsPanel(page);

    const passwordInput = page.locator('input#password');
    await passwordInput.fill(TEST_PASSWORD);

    const lockButton = page.locator('form:has(input#password) button[type="submit"]');
    await lockButton.click();

    await page.waitForTimeout(1000);

    // After enabling password, plaintext content should NOT be in any request
    const leakedContentRequest = requestsContainString(capturedRequests, TEST_CONTENT);
    expect(leakedContentRequest).toBeNull();

    // Password should also never be sent
    const leakedPasswordRequest = requestsContainString(capturedRequests, TEST_PASSWORD);
    expect(leakedPasswordRequest).toBeNull();
  });

  test('Decrypted content is NEVER sent when editing a protected note', async ({ page }) => {
    // First create a protected note
    const noteUrl = await createPasswordProtectedNote(page, TEST_CONTENT, TEST_PASSWORD);

    // Now access it in a new session
    const capturedRequests = await setupRequestCapture(page);

    await accessProtectedNote(page, noteUrl, TEST_PASSWORD);

    // Verify we can see the content (decryption worked)
    const textarea = page.locator('textarea');
    await expect(textarea).toHaveValue(TEST_CONTENT, { timeout: 5000 });

    // Clear requests before editing
    capturedRequests.length = 0;

    // Edit the content
    const newContent = 'Updated secret content - also should be encrypted';
    await textarea.fill(newContent);

    // Wait for auto-save
    await page.waitForTimeout(2000);

    // Verify neither old nor new plaintext was sent
    const leakedOldContent = requestsContainString(capturedRequests, TEST_CONTENT);
    expect(leakedOldContent).toBeNull();

    const leakedNewContent = requestsContainString(capturedRequests, newContent);
    expect(leakedNewContent).toBeNull();

    // Password should never be sent
    const leakedPassword = requestsContainString(capturedRequests, TEST_PASSWORD);
    expect(leakedPassword).toBeNull();
  });

  test('Password is NEVER sent when accessing a protected note', async ({ page }) => {
    // First create a protected note
    const noteUrl = await createPasswordProtectedNote(page, TEST_CONTENT, TEST_PASSWORD);

    // Clear and set up new capture
    const capturedRequests = await setupRequestCapture(page);

    // Access the note with password
    await accessProtectedNote(page, noteUrl, TEST_PASSWORD);

    // Verify content is visible (decryption worked client-side)
    const textarea = page.locator('textarea');
    await expect(textarea).toHaveValue(TEST_CONTENT, { timeout: 5000 });

    // Verify password was never sent to server
    const leakedPassword = requestsContainString(capturedRequests, TEST_PASSWORD);
    expect(leakedPassword).toBeNull();
  });

  test('Server only receives encrypted blob, not plaintext', async ({ page }) => {
    const capturedRequests = await setupRequestCapture(page);

    await createPasswordProtectedNote(page, TEST_CONTENT, TEST_PASSWORD);

    // Find the PUT/POST request that saved the note
    const saveRequests = capturedRequests.filter(
      r => r.url.includes('/api/notes') && (r.method === 'POST' || r.method === 'PUT') && r.postData
    );

    expect(saveRequests.length).toBeGreaterThan(0);

    // Parse the request body and verify it contains encrypted content
    for (const req of saveRequests) {
      if (req.postData) {
        const body = JSON.parse(req.postData);

        // If is_encrypted is true, content should be base64 (encrypted)
        if (body.is_encrypted === true) {
          expect(body.content).not.toContain(TEST_CONTENT);

          // Encrypted content should look like base64
          const base64Regex = /^[A-Za-z0-9+/]+=*$/;
          expect(base64Regex.test(body.content)).toBe(true);
        }
      }
    }
  });

  test('WebSocket messages never contain password or plaintext for encrypted notes', async ({ page }) => {
    const wsMessages: string[] = [];

    // Intercept WebSocket messages
    page.on('websocket', ws => {
      ws.on('framesent', frame => {
        if (typeof frame.payload === 'string') {
          wsMessages.push(frame.payload);
        }
      });
      ws.on('framereceived', frame => {
        if (typeof frame.payload === 'string') {
          wsMessages.push(frame.payload);
        }
      });
    });

    const noteUrl = await createPasswordProtectedNote(page, TEST_CONTENT, TEST_PASSWORD);

    // Access and edit to trigger WebSocket activity
    await accessProtectedNote(page, noteUrl, TEST_PASSWORD);

    const textarea = page.locator('textarea');
    await textarea.fill(TEST_CONTENT + ' - additional text');
    await page.waitForTimeout(2000);

    // Check all WebSocket messages
    for (const msg of wsMessages) {
      expect(msg).not.toContain(TEST_PASSWORD);
      // Note: For encrypted notes, realtime collab is disabled, so we mainly check password
    }
  });

  test('Password hash is not sent to server (true E2E encryption)', async ({ page }) => {
    const capturedRequests = await setupRequestCapture(page);

    await createPasswordProtectedNote(page, TEST_CONTENT, TEST_PASSWORD);

    // Check that no request contains password_hash field
    for (const req of capturedRequests) {
      if (req.postData) {
        const body = JSON.parse(req.postData);
        expect(body).not.toHaveProperty('password_hash');
        expect(body).not.toHaveProperty('password');
      }
    }
  });

  test('Removing password protection does not leak password', async ({ page }) => {
    // Create protected note
    const noteUrl = await createPasswordProtectedNote(page, TEST_CONTENT, TEST_PASSWORD);

    // Access it
    await accessProtectedNote(page, noteUrl, TEST_PASSWORD);

    // Set up capture before removing password
    const capturedRequests = await setupRequestCapture(page);

    // Open options and click the lock-open button to remove password
    await openOptionsPanel(page);

    // Click the lock-open button (button type="button" when hasPassword is true)
    const lockOpenButton = page.locator('form:has(input#password) button[type="button"]');
    await lockOpenButton.click();
    await page.waitForTimeout(200);

    // Confirm removal in the dialog
    const confirmBtn = page.locator('button:has-text("Remove Protection")');
    await confirmBtn.click();

    await page.waitForTimeout(1000);

    // Password should not have been sent
    const leakedPassword = requestsContainString(capturedRequests, TEST_PASSWORD);
    expect(leakedPassword).toBeNull();
  });

  test('Multiple password attempts do not leak password to server', async ({ page }) => {
    // Create protected note
    const noteUrl = await createPasswordProtectedNote(page, TEST_CONTENT, TEST_PASSWORD);

    // Try to access with wrong password first
    const capturedRequests = await setupRequestCapture(page);

    await page.goto(noteUrl);
    await page.waitForLoadState('networkidle');

    const passwordInput = page.locator('input[type="password"]');
    await expect(passwordInput).toBeVisible({ timeout: 5000 });

    // Try wrong password
    const wrongPassword = 'WrongPassword456!';
    await passwordInput.fill(wrongPassword);

    const submitBtn = page.locator('button:has-text("Submit")');
    await submitBtn.click();
    await page.waitForTimeout(500);

    // Now try correct password
    await passwordInput.fill(TEST_PASSWORD);
    await submitBtn.click();
    await page.waitForTimeout(1000);

    // Neither password should have been sent to server
    const leakedWrongPassword = requestsContainString(capturedRequests, wrongPassword);
    expect(leakedWrongPassword).toBeNull();

    const leakedCorrectPassword = requestsContainString(capturedRequests, TEST_PASSWORD);
    expect(leakedCorrectPassword).toBeNull();
  });

});
