import { defineConfig } from 'vite';

// base './' makes the built site work from any folder or host
// (GitHub Pages project URL, Netlify, Vercel, or a USB stick + any static server).
export default defineConfig({
  base: './',
  build: { target: 'es2020', chunkSizeWarningLimit: 1200 },
});
