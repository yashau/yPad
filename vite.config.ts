import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { fileURLToPath } from 'url';
import path from 'path';
import { copyFileSync, existsSync } from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [
    svelte(),
    {
      name: 'preserve-favicons',
      writeBundle() {
        // Preserve favicons in dist directory after build
        const iconsDir = path.resolve(__dirname, 'dist', 'icons');
        const manifestPath = path.resolve(__dirname, 'dist', 'site.webmanifest');
        const faviconIco = path.resolve(__dirname, 'dist', 'favicon.ico');

        if (existsSync(iconsDir)) {
          console.log('Preserving icons directory');
        }
        if (existsSync(manifestPath)) {
          console.log('Preserving site.webmanifest');
        }
        if (existsSync(faviconIco)) {
          console.log('Preserving favicon.ico');
        }
      }
    }
  ],
  build: {
    outDir: 'dist',
    emptyOutDir: false, // Don't empty dist to preserve favicons
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
