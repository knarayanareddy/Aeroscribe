import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig(({ command }) => ({
  plugins: [react(), tailwindcss()],
  /**
   * GitHub Pages serves this app from `/Aeroscribe/`. The dev server always
   * serves from `/` so local URLs stay short, and forks or custom domains can
   * override the production base with BASE_PATH.
   */
  base: command === 'serve' ? '/' : (process.env.BASE_PATH ?? '/Aeroscribe/'),
  server: { host: true, port: 5173 },
  preview: { host: true, port: 4173 },
}));
