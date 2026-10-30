import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig(({ command }) => ({
  plugins: [react(), tailwindcss()],
  /**
   * The dashboard is published as a sub-app of the landing page:
   * https://<user>.github.io/Aeroscribe/dashboard/. Override with BASE_PATH.
   */
  base: command === 'serve' ? '/' : (process.env.BASE_PATH ?? '/Aeroscribe/dashboard/'),
  server: { host: true, port: 5174 },
  preview: { host: true, port: 4174 },
}));
