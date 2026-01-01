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
        // Core OT logic
        'src/ot/**/*.ts',
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
        'src/ot/types.ts',
      ],
      thresholds: {
        lines: 90,
        functions: 90,
        branches: 85,
        statements: 90
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
