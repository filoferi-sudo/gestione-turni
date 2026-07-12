import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  // Il gestionale vive sotto /app (il sito marketing planivo.it è servito da un progetto separato).
  // `base` fa sì che index.html e gli asset referenzino /app/..., e `outDir: dist/app` li emette
  // fisicamente sotto dist/app/ così il proxy del sito resta banale e Vercel serve i file reali.
  base: '/app/',
  build: {
    outDir: 'dist/app',
  },
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:4000',
    },
  },
});
