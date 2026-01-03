import { test, expect, Page } from '@playwright/test';

/**
 * Theme permutation configuration
 */
type SystemTheme = 'light' | 'dark';
type AppTheme = 'light' | 'dark';

interface ThemePermutation {
  name: string;
  system: SystemTheme;
  app: AppTheme;
}

const THEME_PERMUTATIONS: ThemePermutation[] = [
  { name: 'light', system: 'light', app: 'light' },
  { name: 'dark', system: 'dark', app: 'dark' },
  { name: 'system-light-app-light', system: 'light', app: 'light' },
  { name: 'system-light-app-dark', system: 'light', app: 'dark' },
  { name: 'system-dark-app-light', system: 'dark', app: 'light' },
  { name: 'system-dark-app-dark', system: 'dark', app: 'dark' },
];

/**
 * Helper to create a note by typing content in the editor.
 * The app only creates a note ID after content is typed and auto-saved.
 */
async function createNote(page: Page, content: string = 'Test note content'): Promise<string> {
  await page.goto('/');
  await page.waitForLoadState('networkidle');

  // Type content in the textarea - this triggers auto-save which creates the note
  const textarea = page.locator('textarea');
  await textarea.click();
  await textarea.fill(content);

  // Wait for auto-save to complete and URL to update with the new note ID
  await page.waitForFunction(() => window.location.pathname.length > 1, { timeout: 10000 });

  return page.url();
}

/**
 * Helper to open the Options panel
 */
async function openOptions(page: Page) {
  const optionsBtn = page.locator('button:has-text("Options")');
  await optionsBtn.click();
  await page.waitForTimeout(300);
}

/**
 * Helper to set a password on a note.
 * The password input has an icon button (Lock) to submit.
 */
async function setPassword(page: Page, password: string) {
  await openOptions(page);

  // Find and fill the password input
  const passwordInput = page.locator('input#password');
  await passwordInput.fill(password);

  // Click the submit button next to the password input (the Lock icon button)
  // It's the button inside the password form
  const passwordForm = page.locator('form:has(input#password)');
  await passwordForm.locator('button[type="submit"]').click();
  await page.waitForTimeout(1000);
}

const SCREENSHOT_DIR = 'e2e/screenshots/alert-banners';

/**
 * Helper to set app theme via class manipulation
 */
async function setAppTheme(page: Page, theme: AppTheme) {
  await page.evaluate((t) => {
    document.documentElement.classList.remove('light', 'dark');
    document.documentElement.classList.add(t);
    localStorage.setItem('theme', t);
  }, theme);
  await page.waitForTimeout(200);
}

/**
 * Helper to take screenshots for all theme permutations
 */
async function takeScreenshots(page: Page, name: string) {
  for (const permutation of THEME_PERMUTATIONS) {
    // Set system color scheme
    await page.emulateMedia({ colorScheme: permutation.system });

    // Set app theme
    await setAppTheme(page, permutation.app);

    // Take screenshot
    await page.screenshot({
      path: `${SCREENSHOT_DIR}/${name}-${permutation.name}.png`,
      fullPage: true
    });
  }
}

/**
 * Helper to take screenshots with a button hovered for all theme permutations
 */
async function takeScreenshotsWithHover(page: Page, name: string, buttonLocator: ReturnType<Page['locator']>) {
  for (const permutation of THEME_PERMUTATIONS) {
    // Set system color scheme
    await page.emulateMedia({ colorScheme: permutation.system });

    // Set app theme
    await setAppTheme(page, permutation.app);

    // Hover over the button
    await buttonLocator.hover();
    await page.waitForTimeout(100);

    // Take screenshot
    await page.screenshot({
      path: `${SCREENSHOT_DIR}/${name}-${permutation.name}.png`,
      fullPage: true
    });
  }
}

test.describe('Alert Banner Tests', () => {

  test('1. Encryption Enabled Banner', async ({ page }) => {
    // First create a note by typing content
    await createNote(page, 'This is a password protected note');

    // Now set a password
    await setPassword(page, 'testpass123');

    // Verify the encryption enabled banner appears
    const banner = page.locator('text=Password protection enabled');
    await expect(banner).toBeVisible({ timeout: 5000 });

    // Take screenshots without hover
    await takeScreenshots(page, '01-encryption-enabled');

    // Take screenshots with Dismiss button hovered
    const dismissBtn = page.locator('button:has-text("Dismiss")').first();
    await takeScreenshotsWithHover(page, '01-encryption-enabled-dismiss-hover', dismissBtn);
  });

  test('2. Encryption Disabled Banner', async ({ page }) => {
    // Create a note and set a password
    await createNote(page, 'Test note for password removal');
    await setPassword(page, 'testpass123');

    // Dismiss the enabled banner if visible
    const dismissBtn = page.locator('button:has-text("Dismiss")').first();
    if (await dismissBtn.isVisible()) {
      await dismissBtn.click();
      await page.waitForTimeout(300);
    }

    // Open options and click the LockOpen button to remove password
    await openOptions(page);

    // The remove password button is the icon button in the password form when hasPassword is true
    const passwordForm = page.locator('form:has(input#password)');
    await passwordForm.locator('button').click();
    await page.waitForTimeout(500);

    // Fill in the password in the remove dialog
    const removePasswordInput = page.locator('[role="dialog"] input[type="password"]');
    await removePasswordInput.fill('testpass123');
    await page.locator('button:has-text("Remove Protection")').click();
    await page.waitForTimeout(1000);

    // Verify the encryption disabled banner appears
    const banner = page.locator('text=Password protection removed');
    await expect(banner).toBeVisible({ timeout: 5000 });

    // Take screenshots without hover
    await takeScreenshots(page, '02-encryption-disabled');

    // Take screenshots with Dismiss button hovered
    const dismissBtnBanner = page.locator('button:has-text("Dismiss")').first();
    await takeScreenshotsWithHover(page, '02-encryption-disabled-dismiss-hover', dismissBtnBanner);
  });

  test('3. Note Deleted Banner', async ({ page }) => {
    // Create a note
    await createNote(page, 'This note will be deleted');

    // Handle the confirmation dialog
    page.on('dialog', async dialog => {
      await dialog.accept();
    });

    // Click the delete button in the header
    await page.locator('button:has-text("Delete")').click();

    // Wait for the banner to appear (may take a moment due to WebSocket)
    const banner = page.locator('text=This note has been deleted');
    await expect(banner).toBeVisible({ timeout: 10000 });

    // Take screenshots
    await takeScreenshots(page, '03-note-deleted');
  });

  test('4. Password Dialog Error', async ({ page }) => {
    // Create and protect a note
    await createNote(page, 'Protected note');
    await setPassword(page, 'correctpassword');

    // Get the note URL
    const noteUrl = page.url();

    // Navigate away to clear state and come back to trigger password dialog
    await page.goto('/');
    await page.waitForTimeout(500);
    await page.goto(noteUrl);
    await page.waitForTimeout(1000);

    // The password dialog should appear
    const passwordDialog = page.locator('text=Password Required');
    await expect(passwordDialog).toBeVisible({ timeout: 5000 });

    // Enter wrong password
    const passwordInput = page.locator('[role="dialog"] input[type="password"]');
    await passwordInput.fill('wrongpassword');
    await page.locator('button:has-text("Submit")').click();
    await page.waitForTimeout(1000);

    // Take screenshots showing the error state
    await takeScreenshots(page, '04-password-error');
  });

  test('5. Final View Banner (max views reached)', async ({ page }) => {
    // Create a note
    await createNote(page, 'This note has limited views');

    // Open options and set max views to 2
    await openOptions(page);

    const maxViewsInput = page.locator('input#max-views');
    await maxViewsInput.fill('2');

    // Click the submit button for max views (Check icon button)
    const maxViewsForm = page.locator('form:has(input#max-views)');
    await maxViewsForm.locator('button[type="submit"]').click();
    await page.waitForTimeout(1500);

    // Get the note URL
    const noteUrl = page.url();

    // Reload the page - this should trigger the final view banner
    await page.goto(noteUrl);
    await page.waitForTimeout(1500);

    // Take screenshots (banner may or may not appear depending on timing)
    await takeScreenshots(page, '05-final-view');
  });

  test('6. Reload Banner (encrypted note updated by another user)', async ({ browser }) => {
    // This test requires two browser contexts to simulate two users
    const context1 = await browser.newContext();
    const context2 = await browser.newContext();
    const page1 = await context1.newPage();
    const page2 = await context2.newPage();

    const password = 'sharedpassword';

    // User 1: Create a password-protected note
    await page1.goto('/');
    await page1.waitForLoadState('networkidle');

    const textarea1 = page1.locator('textarea');
    await textarea1.click();
    await textarea1.fill('Original content from user 1');

    // Wait for note to be created
    await page1.waitForFunction(() => window.location.pathname.length > 1, { timeout: 10000 });
    const noteUrl = page1.url();

    // Set password on the note
    await openOptions(page1);
    const passwordInput1 = page1.locator('input#password');
    await passwordInput1.fill(password);
    const passwordForm1 = page1.locator('form:has(input#password)');
    await passwordForm1.locator('button[type="submit"]').click();
    await page1.waitForTimeout(1000);

    // Dismiss the encryption enabled banner
    const dismissBtn = page1.locator('button:has-text("Dismiss")').first();
    if (await dismissBtn.isVisible()) {
      await dismissBtn.click();
      await page1.waitForTimeout(300);
    }

    // User 2: Open the same note and enter password
    await page2.goto(noteUrl);
    await page2.waitForTimeout(1000);

    // Enter password in dialog
    const passwordDialog = page2.locator('[role="dialog"] input[type="password"]');
    await passwordDialog.fill(password);
    await page2.locator('button:has-text("Submit")').click();
    await page2.waitForTimeout(1000);

    // User 1: Edit the note (this should trigger the reload banner for User 2)
    const textareaUser1 = page1.locator('textarea');
    await textareaUser1.click();
    await textareaUser1.fill('Updated content from user 1');
    await page1.waitForTimeout(2000); // Wait for auto-save

    // User 2: Should see the reload banner
    const reloadBanner = page2.locator('text=This note was updated by another user');
    await expect(reloadBanner).toBeVisible({ timeout: 10000 });

    // Take screenshots without hover
    await takeScreenshots(page2, '06-reload-banner');

    // Take screenshots with Reload button hovered
    const reloadBtn = page2.locator('button:has-text("Reload")');
    await takeScreenshotsWithHover(page2, '06-reload-banner-reload-hover', reloadBtn);

    // Take screenshots with Dismiss button hovered
    const dismissBtnReload = page2.locator('button:has-text("Dismiss")');
    await takeScreenshotsWithHover(page2, '06-reload-banner-dismiss-hover', dismissBtnReload);

    // Cleanup
    await context1.close();
    await context2.close();
  });

  test('7. Baseline screenshots (no banners)', async ({ page }) => {
    // Create a note without any special state
    await createNote(page, 'Baseline note for screenshots');

    // Take screenshots showing normal state
    await takeScreenshots(page, '07-baseline');
  });

});
