import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [svelte()],
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: './client/index.html'
    }
  },
  resolve: {
    alias: {
      '$lib': path.resolve(__dirname, './client/lib')
    }
  }
});
