import { test, expect, Page } from '@playwright/test';

const SCREENSHOT_DIR = 'e2e/screenshots/syntax-highlighting';

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
 */
async function createNote(page: Page, content: string): Promise<string> {
  await page.goto('/');
  await page.waitForLoadState('networkidle');

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
 * Helper to select a syntax highlighting language
 */
async function selectLanguage(page: Page, languageLabel: string) {
  await openOptions(page);

  // Click on the language selector (the button showing "Plain Text" under Syntax Highlighting)
  const languageSelector = page.locator('button:has-text("Plain Text")');
  await languageSelector.click();
  await page.waitForTimeout(200);

  // Search for and select the language
  const searchInput = page.locator('input[placeholder="Search language..."]');
  await searchInput.fill(languageLabel);
  await page.waitForTimeout(200);

  // Click the language option (Command.Item with the matching text)
  const languageOption = page.locator(`[data-slot="command-item"]:has-text("${languageLabel}")`).first();
  await languageOption.click();
  await page.waitForTimeout(500);

  // Close options panel by clicking the Options button again
  const optionsBtn = page.locator('button:has-text("Options")');
  await optionsBtn.click();
  await page.waitForTimeout(300);
}

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
async function takeAllThemeScreenshots(page: Page, name: string) {
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

// Sample code snippets for testing
const JAVASCRIPT_CODE = `// Example JavaScript code
function fibonacci(n) {
  if (n <= 1) return n;
  return fibonacci(n - 1) + fibonacci(n - 2);
}

const numbers = [1, 2, 3, 4, 5];
const doubled = numbers.map(x => x * 2);

console.log('Fibonacci of 10:', fibonacci(10));
console.log('Doubled:', doubled);

class Calculator {
  constructor(value = 0) {
    this.value = value;
  }

  add(n) {
    this.value += n;
    return this;
  }

  multiply(n) {
    this.value *= n;
    return this;
  }
}`;

const JSON_CODE = `{
  "name": "yashau-paste",
  "version": "1.0.0",
  "description": "A collaborative paste application",
  "features": {
    "syntax_highlighting": true,
    "password_protection": true,
    "expiration": true,
    "max_views": true
  },
  "supported_languages": [
    "javascript",
    "typescript",
    "python",
    "json",
    "yaml"
  ],
  "config": {
    "max_content_size": 1048576,
    "default_expiration": null,
    "enable_realtime": true
  }
}`;

const PYTHON_CODE = `# Example Python code
from typing import List, Optional
import asyncio

class DataProcessor:
    """A class to process data asynchronously."""

    def __init__(self, batch_size: int = 100):
        self.batch_size = batch_size
        self.results: List[dict] = []

    async def process_item(self, item: dict) -> Optional[dict]:
        """Process a single item."""
        await asyncio.sleep(0.01)  # Simulate async work
        return {"id": item.get("id"), "processed": True}

    async def process_batch(self, items: List[dict]) -> List[dict]:
        """Process a batch of items concurrently."""
        tasks = [self.process_item(item) for item in items]
        return await asyncio.gather(*tasks)

# Usage example
async def main():
    processor = DataProcessor(batch_size=50)
    data = [{"id": i, "value": f"item_{i}"} for i in range(10)]
    results = await processor.process_batch(data)
    print(f"Processed {len(results)} items")

if __name__ == "__main__":
    asyncio.run(main())`;

const TYPESCRIPT_CODE = `// Example TypeScript code
interface User {
  id: number;
  name: string;
  email: string;
  roles: string[];
}

type UserCreateInput = Omit<User, 'id'>;

async function createUser(input: UserCreateInput): Promise<User> {
  const id = Math.floor(Math.random() * 10000);
  return { id, ...input };
}

class UserService {
  private users: Map<number, User> = new Map();

  async add(input: UserCreateInput): Promise<User> {
    const user = await createUser(input);
    this.users.set(user.id, user);
    return user;
  }

  get(id: number): User | undefined {
    return this.users.get(id);
  }

  list(): User[] {
    return Array.from(this.users.values());
  }
}

const service = new UserService();`;

const YAML_CODE = `# Example YAML configuration
apiVersion: apps/v1
kind: Deployment
metadata:
  name: yashau-paste
  labels:
    app: paste
    environment: production
spec:
  replicas: 3
  selector:
    matchLabels:
      app: paste
  template:
    metadata:
      labels:
        app: paste
    spec:
      containers:
        - name: app
          image: yashau-paste:latest
          ports:
            - containerPort: 8787
          env:
            - name: NODE_ENV
              value: "production"
            - name: DATABASE_URL
              valueFrom:
                secretKeyRef:
                  name: db-credentials
                  key: url
          resources:
            limits:
              memory: "512Mi"
              cpu: "500m"`;

const SQL_CODE = `-- Example SQL queries
CREATE TABLE notes (
    id VARCHAR(36) PRIMARY KEY,
    content TEXT NOT NULL,
    syntax_highlight VARCHAR(50) DEFAULT 'plaintext',
    password_hash VARCHAR(255),
    max_views INT,
    view_count INT DEFAULT 0,
    expires_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create index for faster lookups
CREATE INDEX idx_notes_expires_at ON notes(expires_at);
CREATE INDEX idx_notes_created_at ON notes(created_at);

-- Insert a sample note
INSERT INTO notes (id, content, syntax_highlight)
VALUES ('abc123', 'Hello, World!', 'plaintext');

-- Query notes with pagination
SELECT id, content, syntax_highlight, created_at
FROM notes
WHERE expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP
ORDER BY created_at DESC
LIMIT 10 OFFSET 0;`;

test.describe('Syntax Highlighting Tests', () => {

  test('1. JavaScript syntax highlighting', async ({ page }) => {
    await createNote(page, JAVASCRIPT_CODE);
    await selectLanguage(page, 'JavaScript');

    // Verify syntax highlighting is applied (editor switches from textarea to contenteditable div)
    const highlightedEditor = page.locator('[contenteditable="true"]');
    await expect(highlightedEditor).toBeVisible({ timeout: 5000 });

    // Take screenshots for all theme permutations
    await takeAllThemeScreenshots(page, '01-javascript');
  });

  test('2. JSON syntax highlighting', async ({ page }) => {
    await createNote(page, JSON_CODE);
    await selectLanguage(page, 'JSON');

    const highlightedEditor = page.locator('[contenteditable="true"]');
    await expect(highlightedEditor).toBeVisible({ timeout: 5000 });

    await takeAllThemeScreenshots(page, '02-json');
  });

  test('3. Python syntax highlighting', async ({ page }) => {
    await createNote(page, PYTHON_CODE);
    await selectLanguage(page, 'Python');

    const highlightedEditor = page.locator('[contenteditable="true"]');
    await expect(highlightedEditor).toBeVisible({ timeout: 5000 });

    await takeAllThemeScreenshots(page, '03-python');
  });

  test('4. TypeScript syntax highlighting', async ({ page }) => {
    await createNote(page, TYPESCRIPT_CODE);
    await selectLanguage(page, 'TypeScript');

    const highlightedEditor = page.locator('[contenteditable="true"]');
    await expect(highlightedEditor).toBeVisible({ timeout: 5000 });

    await takeAllThemeScreenshots(page, '04-typescript');
  });

  test('5. YAML syntax highlighting', async ({ page }) => {
    await createNote(page, YAML_CODE);
    await selectLanguage(page, 'YAML');

    const highlightedEditor = page.locator('[contenteditable="true"]');
    await expect(highlightedEditor).toBeVisible({ timeout: 5000 });

    await takeAllThemeScreenshots(page, '05-yaml');
  });

  test('6. SQL syntax highlighting', async ({ page }) => {
    await createNote(page, SQL_CODE);
    await selectLanguage(page, 'SQL');

    const highlightedEditor = page.locator('[contenteditable="true"]');
    await expect(highlightedEditor).toBeVisible({ timeout: 5000 });

    await takeAllThemeScreenshots(page, '06-sql');
  });

  test('7. Plain text (no highlighting)', async ({ page }) => {
    await createNote(page, JAVASCRIPT_CODE);

    // Verify it starts in plaintext mode (uses textarea)
    const textarea = page.locator('textarea');
    await expect(textarea).toBeVisible({ timeout: 5000 });

    await takeAllThemeScreenshots(page, '07-plaintext');
  });

});
