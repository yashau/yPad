/**
 * Syntax Highlighting E2E Tests
 *
 * Tests that syntax highlighting works correctly with lazy-loaded highlight.js.
 */

import { test, expect } from '@playwright/test';
import {
  createNote,
  waitForConnection,
  setSyntaxHighlight,
  isInSyntaxHighlightMode,
  getEditorContent
} from './utils/test-helpers';

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Check if syntax highlighting is applied (look for hljs spans).
 */
async function hasHighlightedCode(page: import('@playwright/test').Page): Promise<boolean> {
  const editor = page.locator('[contenteditable="true"]');
  const html = await editor.innerHTML();
  // highlight.js adds span elements with hljs- prefixed classes
  return html.includes('hljs-');
}

// ============================================================================
// TESTS
// ============================================================================

test.describe('Syntax Highlighting', () => {

  test('JavaScript highlighting loads and applies', async ({ page }) => {
    const jsCode = 'function greet(name) {\n  console.log("Hello " + name);\n}';
    await createNote(page, jsCode);
    await waitForConnection(page);

    await setSyntaxHighlight(page, 'JavaScript');
    expect(await isInSyntaxHighlightMode(page)).toBe(true);

    // Wait for highlight.js to lazy-load and apply
    await page.waitForTimeout(1500);

    expect(await hasHighlightedCode(page)).toBe(true);

    const content = await getEditorContent(page);
    expect(content).toContain('function greet');
  });

  test('Python highlighting works', async ({ page }) => {
    const pyCode = 'def greet(name):\n    print(f"Hello {name}")';
    await createNote(page, pyCode);
    await waitForConnection(page);

    await setSyntaxHighlight(page, 'Python');
    await page.waitForTimeout(1500);

    expect(await isInSyntaxHighlightMode(page)).toBe(true);
    expect(await hasHighlightedCode(page)).toBe(true);
  });

  test('TypeScript highlighting works', async ({ page }) => {
    const tsCode = 'interface User {\n  name: string;\n}\nconst user: User = { name: "Alice" };';
    await createNote(page, tsCode);
    await waitForConnection(page);

    await setSyntaxHighlight(page, 'TypeScript');
    await page.waitForTimeout(1500);

    expect(await isInSyntaxHighlightMode(page)).toBe(true);
    expect(await hasHighlightedCode(page)).toBe(true);
  });

  test('Switching back to Plain Text removes highlighting', async ({ page }) => {
    const jsCode = 'const x = 42;';
    await createNote(page, jsCode);
    await waitForConnection(page);

    // Switch to JavaScript
    await setSyntaxHighlight(page, 'JavaScript');
    await page.waitForTimeout(1500);
    expect(await isInSyntaxHighlightMode(page)).toBe(true);

    // Switch back to Plain Text manually (setSyntaxHighlight expects contenteditable)
    const optionsBtn = page.locator('button:has-text("Options")');
    await optionsBtn.click();
    await page.waitForTimeout(300);

    const langButton = page.locator('button').filter({ hasText: /JavaScript/i }).first();
    await langButton.click({ timeout: 5000 });
    await page.waitForTimeout(500);

    const searchInput = page.locator('input[placeholder*="Search"]');
    if (await searchInput.isVisible({ timeout: 2000 }).catch(() => false)) {
      await searchInput.fill('Plain Text');
      await page.waitForTimeout(300);
    }

    const langOption = page.locator('[data-value], [role="option"]').filter({ hasText: 'Plain Text' }).first();
    await langOption.click({ timeout: 5000 });
    await page.waitForTimeout(500);

    await optionsBtn.click();
    await page.waitForTimeout(300);

    // Should now be in textarea mode
    const textarea = page.locator('textarea');
    expect(await textarea.isVisible()).toBe(true);
  });

  test('Note with language pre-set loads with highlighting', async ({ page }) => {
    const jsCode = 'function test() { return true; }';
    const noteUrl = await createNote(page, jsCode);
    await waitForConnection(page);

    // Set language
    await setSyntaxHighlight(page, 'JavaScript');
    await page.waitForTimeout(1500);
    expect(await hasHighlightedCode(page)).toBe(true);

    // Reload the page
    await page.goto(noteUrl);
    await page.waitForLoadState('networkidle');
    await waitForConnection(page);
    await page.waitForTimeout(2000);

    // Should still have highlighting after reload
    expect(await isInSyntaxHighlightMode(page)).toBe(true);
    expect(await hasHighlightedCode(page)).toBe(true);
  });

});

test.describe('Syntax Highlighting - Dark Theme', () => {

  test('JavaScript highlighting works in dark theme', async ({ page }) => {
    const jsCode = 'function greet(name) {\n  return "Hello " + name;\n}';
    await createNote(page, jsCode);
    await waitForConnection(page);

    // Toggle to dark theme
    const themeButton = page.locator('header button').filter({ has: page.locator('svg') }).last();
    await themeButton.click();
    await page.waitForTimeout(300);

    // Verify dark mode is active
    const isDark = await page.evaluate(() => document.documentElement.classList.contains('dark'));
    expect(isDark).toBe(true);

    // Switch to JavaScript
    await setSyntaxHighlight(page, 'JavaScript');
    await page.waitForTimeout(1500);

    expect(await isInSyntaxHighlightMode(page)).toBe(true);
    expect(await hasHighlightedCode(page)).toBe(true);
  });

  test('Python highlighting works in dark theme', async ({ page }) => {
    const pyCode = 'def greet(name):\n    print(f"Hello {name}")';
    await createNote(page, pyCode);
    await waitForConnection(page);

    // Toggle to dark theme
    const themeButton = page.locator('header button').filter({ has: page.locator('svg') }).last();
    await themeButton.click();
    await page.waitForTimeout(300);

    await setSyntaxHighlight(page, 'Python');
    await page.waitForTimeout(1500);

    expect(await isInSyntaxHighlightMode(page)).toBe(true);
    expect(await hasHighlightedCode(page)).toBe(true);
  });

  test('TypeScript highlighting works in dark theme', async ({ page }) => {
    const tsCode = 'interface User {\n  name: string;\n}\nconst user: User = { name: "Alice" };';
    await createNote(page, tsCode);
    await waitForConnection(page);

    // Toggle to dark theme
    const themeButton = page.locator('header button').filter({ has: page.locator('svg') }).last();
    await themeButton.click();
    await page.waitForTimeout(300);

    await setSyntaxHighlight(page, 'TypeScript');
    await page.waitForTimeout(1500);

    expect(await isInSyntaxHighlightMode(page)).toBe(true);
    expect(await hasHighlightedCode(page)).toBe(true);
  });

  test('Highlighting persists after theme toggle', async ({ page }) => {
    const pyCode = 'def greet(name):\n    print(f"Hello {name}")';
    await createNote(page, pyCode);
    await waitForConnection(page);

    // Enable highlighting in light mode
    await setSyntaxHighlight(page, 'Python');
    await page.waitForTimeout(1500);
    expect(await hasHighlightedCode(page)).toBe(true);

    // Toggle to dark mode
    const themeButton = page.locator('header button').filter({ has: page.locator('svg') }).last();
    await themeButton.click();
    await page.waitForTimeout(500);

    // Highlighting should still be present
    expect(await hasHighlightedCode(page)).toBe(true);

    // Toggle back to light mode
    await themeButton.click();
    await page.waitForTimeout(500);

    // Highlighting should still be present
    expect(await hasHighlightedCode(page)).toBe(true);
  });

});
