import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    include: ['**/*.test.ts', '**/*.test.svelte.ts'],
    exclude: ['node_modules', 'dist', '.wrangler'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: [
        // Durable Object handlers
        'src/durable-objects/handlers/**/*.ts',
        // Client-side realtime and crypto (testable without Svelte)
        'client/lib/realtime/**/*.ts',
        'client/lib/crypto.ts',
        // Configuration
        'config/**/*.ts'
      ],
      exclude: [
        'node_modules',
        'dist',
        '.wrangler',
        '**/*.test.ts',
        '**/*.d.ts',
        // Type definitions only
        'src/durable-objects/handlers/types.ts',
        'src/types/**/*.ts',
        // Re-export barrels
        'src/durable-objects/handlers/index.ts',
      ],
      thresholds: {
        lines: 95,
        functions: 100,
        branches: 90,
        statements: 95
      }
    },
    setupFiles: ['./tests/setup.ts'],
  },
  resolve: {
    alias: {
      '$lib': path.resolve(__dirname, './client/lib')
    }
  }
});
