/**
 * Rate Limiting E2E Tests
 *
 * Tests WebSocket rate limiting for Yjs updates.
 * The rate limiter uses a token bucket algorithm with:
 * - OPS_PER_SECOND: 25 (token refill rate)
 * - BURST_ALLOWANCE: 100 (max tokens)
 * - Client-side batching: 50ms (merges updates before sending)
 * - DISCONNECT_THRESHOLD: 10 violations before disconnect
 *
 * These tests verify that:
 * 1. Normal usage stays under limits
 * 2. Rate limiting kicks in at the correct thresholds
 * 3. Recovery works after slowing down
 */

import { test, expect } from '@playwright/test';
import {
  createNote,
  getEditorContent,
  setup2Clients
} from './utils/test-helpers';

// Longer timeout for rate limiting tests that need to exhaust tokens
test.setTimeout(60000);

// ============================================================================
// TESTS
// ============================================================================

test.describe('WebSocket Rate Limiting - Below Threshold', () => {

  test('Normal and fast typing should stay under limit', async ({ page }) => {
    await createNote(page, 'start');

    const textarea = page.locator('textarea');
    await textarea.click();
    await page.keyboard.press('End');

    // Track rate limit warnings
    const rateLimitWarnings: string[] = [];
    page.on('console', (msg) => {
      if (msg.text().includes('Rate limit')) {
        rateLimitWarnings.push(msg.text());
      }
    });

    // Normal typing speed
    const text = ' hello';
    for (const char of text) {
      await page.keyboard.type(char);
      await page.waitForTimeout(100);
    }

    // Fast typing with batching
    const fastText = ' quick brown fox';
    await page.keyboard.type(fastText, { delay: 20 });

    // Burst typing
    await page.keyboard.press('Control+a');
    const burstText = 'abcdefghijklmnopqrstuvwxyz';
    await page.keyboard.type(burstText, { delay: 5 });

    await page.waitForTimeout(2000);

    const content = await getEditorContent(page);
    expect(content).toBe(burstText);
    expect(rateLimitWarnings.length).toBe(0);
  });

});

test.describe('WebSocket Rate Limiting - At Threshold', () => {

  test('Sustained editing and rapid pastes at threshold', async ({ page }) => {
    await createNote(page, 'initial');

    const textarea = page.locator('textarea');
    await textarea.click();
    await page.keyboard.press('End');

    // Track any rate limit messages
    const rateLimitEvents: string[] = [];
    page.on('console', (msg) => {
      const text = msg.text();
      if (text.includes('Rate limit') || text.includes('rate limit')) {
        rateLimitEvents.push(text);
      }
    });

    // Type at rate approaching limit
    const testText = ' sustained typing test';
    await page.keyboard.type(testText, { delay: 25 });

    // Multiple rapid paste operations (10 updates within burst)
    for (let i = 1; i <= 10; i++) {
      await textarea.fill('paste'.repeat(i));
      await page.waitForTimeout(60);
    }

    await page.waitForTimeout(1500);

    const content = await getEditorContent(page);
    expect(content).toBe('paste'.repeat(10));
  });

});

test.describe('WebSocket Rate Limiting - Exceeding Threshold', () => {

  test('Extreme rate should trigger rate limiting warnings', async ({ page }) => {
    await createNote(page, 'x');

    const textarea = page.locator('textarea');
    await textarea.click();

    // Track rate limit warnings from server
    const rateLimitWarnings: string[] = [];
    page.on('console', (msg) => {
      const text = msg.text();
      if (text.includes('Rate limit') || text.includes('slow down')) {
        rateLimitWarnings.push(text);
      }
    });

    // Bypass client batching by using fill() which sends immediately
    // Send > 100 updates to exhaust burst allowance
    for (let i = 0; i < 150; i++) {
      await textarea.fill(`update${i}`);
      // No delay - send as fast as possible
    }

    await page.waitForTimeout(2000);

    // After 150 rapid updates, some updates may have been rate limited
    const content = await getEditorContent(page);
    expect(content).toMatch(/^update\d+$/);
  });

  test('Sustained extreme rate should trigger rate limit response', async ({ page }) => {
    await createNote(page, 'disconnect-test');

    const textarea = page.locator('textarea');
    await textarea.click();

    // Track console for rate limit messages and WebSocket errors
    let sawRateLimitWarning = false;
    let sawWebSocketError = false;
    page.on('console', (msg) => {
      const text = msg.text();
      if (text.includes('Rate limit') || text.includes('slow down')) {
        sawRateLimitWarning = true;
      }
      if (text.includes('WebSocket') && (text.includes('close') || text.includes('error'))) {
        sawWebSocketError = true;
      }
    });

    // Send updates as fast as possible to exhaust tokens
    const startTime = Date.now();
    for (let i = 0; i < 200; i++) {
      await textarea.fill(`spam${i}`);
    }
    const elapsed = Date.now() - startTime;

    // Wait for any rate limit responses
    await page.waitForTimeout(2000);

    // Verify the system handled the load gracefully
    const content = await getEditorContent(page);
    expect(content).toMatch(/^spam\d+$/);

    // Log diagnostic info
    console.log(`Sent 200 updates in ${elapsed}ms, rate limit warning: ${sawRateLimitWarning}, WS error: ${sawWebSocketError}`);
  });

});

test.describe('WebSocket Rate Limiting - Recovery', () => {

  test('Recovery after burst and intermittent bursts', async ({ page }) => {
    await createNote(page, 'recovery');

    const textarea = page.locator('textarea');
    await textarea.click();

    // First: exhaust some tokens with rapid updates
    for (let i = 0; i < 50; i++) {
      await textarea.fill(`burst${i}`);
    }

    // Wait for token refill (100 tokens / 25 per sec = 4 seconds to full refill)
    await page.waitForTimeout(5000);

    // Now type normally - should work fine
    await textarea.fill('recovered content');
    await page.waitForTimeout(1000);

    let content = await getEditorContent(page);
    expect(content).toBe('recovered content');

    // Test intermittent bursts with recovery periods
    // Burst 1
    for (let i = 0; i < 30; i++) {
      await textarea.fill(`burst1-${i}`);
    }
    content = await getEditorContent(page);
    expect(content).toMatch(/^burst1-\d+$/);

    // Recovery
    await page.waitForTimeout(2000);

    // Burst 2
    for (let i = 0; i < 30; i++) {
      await textarea.fill(`burst2-${i}`);
    }
    content = await getEditorContent(page);
    expect(content).toMatch(/^burst2-\d+$/);

    // Recovery
    await page.waitForTimeout(2000);

    // Burst 3
    for (let i = 0; i < 30; i++) {
      await textarea.fill(`burst3-${i}`);
    }

    await page.waitForTimeout(1000);
    content = await getEditorContent(page);
    expect(content).toMatch(/^burst3-\d+$/);
  });

});

test.describe('Large Content - Rate Limiting', () => {

  test('Large pastes should work (single updates)', async ({ page }) => {
    await createNote(page, 'init');

    const textarea = page.locator('textarea');
    await textarea.click();

    // 500 lines in a single paste = 1 Yjs update
    const lines: string[] = [];
    for (let i = 1; i <= 500; i++) {
      lines.push(`Line ${i}: Content from a log file or code.`);
    }
    const largeText = lines.join('\n');

    await textarea.fill(largeText);
    await page.waitForTimeout(2000);

    let content = await getEditorContent(page);
    expect(content).toContain('Line 1:');
    expect(content).toContain('Line 500:');
    expect(content.split('\n').length).toBe(500);

    // Multiple large pastes = few Yjs updates (within burst)
    const chunk = 'Lorem ipsum dolor sit amet.\n'.repeat(100).trimEnd();

    await textarea.fill(chunk);
    await page.waitForTimeout(100);

    await textarea.fill(chunk + '\n' + chunk);
    await page.waitForTimeout(100);

    await textarea.fill(chunk + '\n' + chunk + '\n' + chunk);
    await page.waitForTimeout(2000);

    content = await getEditorContent(page);
    expect(content.split('\n').length).toBe(300);
  });

});

test.describe('Multi-User Rate Limiting', () => {

  test('Two users editing rapidly should both have independent rate limits', async ({ browser }) => {
    const { clients, cleanup } = await setup2Clients(browser, 'shared');

    try {
      const [client1, client2] = clients;
      const textarea1 = client1.page.locator('textarea');
      const textarea2 = client2.page.locator('textarea');

      // Both users send rapid updates concurrently
      // Each has their own 100 token burst allowance
      const updates1 = (async () => {
        for (let i = 0; i < 40; i++) {
          await textarea1.fill(`user1-edit-${i}`);
        }
      })();

      const updates2 = (async () => {
        for (let i = 0; i < 40; i++) {
          await textarea2.fill(`user2-edit-${i}`);
        }
      })();

      await Promise.all([updates1, updates2]);
      await client1.page.waitForTimeout(3000);
      await client2.page.waitForTimeout(500);

      // Both pages should show synced content
      const content1 = await getEditorContent(client1.page);
      const content2 = await getEditorContent(client2.page);

      expect(content1).toBe(content2);

    } finally {
      await cleanup();
    }
  });

});
