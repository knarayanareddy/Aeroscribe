import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv, type ProxyOptions } from 'vite';

/**
 * Two modes, chosen by whether `VITE_API_URL` is set at all.
 *
 * - **unset** — fixture mode. The built bundle has no API address in it and
 *   says "Fixtures · illustrative data" on every screen.
 * - **set** — live mode. `VITE_API_URL` may be a full origin or an empty string;
 *   empty means "same origin", which is what the dev proxy below provides.
 *
 * The proxy exists so a developer never has to put an API key in the browser:
 * it injects `Authorization` from `AEROSCRIBE_API_KEY`, a variable Vite only
 * ever sees in this Node process. Nothing prefixed `AEROSCRIBE_` is inlined
 * into client code.
 */
export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const target = env.VITE_API_PROXY_TARGET ?? 'http://127.0.0.1:8787';
  const apiKey = env.AEROSCRIBE_API_KEY;

  const proxy: Record<string, ProxyOptions> = {
    '/api': {
      target,
      changeOrigin: true,
      configure: (server) => {
        server.on('proxyReq', (request) => {
          // Injected here, in the dev server's Node process. The browser never
          // receives the key and no `VITE_` variable carries it.
          if (apiKey) request.setHeader('authorization', `Bearer ${apiKey}`);
        });
      },
    },
    '/health': { target, changeOrigin: true },
  };

  return {
    plugins: [react(), tailwindcss()],
    /**
     * The dashboard is published as a sub-app of the landing page:
     * https://<user>.github.io/Aeroscribe/dashboard/. Override with BASE_PATH.
     */
    base: command === 'serve' ? '/' : (process.env.BASE_PATH ?? '/Aeroscribe/dashboard/'),
    // `allowedHosts` lists the hosts the dev/preview server answers for. The
    // sandbox preview domain is included explicitly rather than allowing every
    // host, which would make the dev server a DNS-rebinding target.
    server: { host: true, port: 5174, proxy, allowedHosts: ['.e2b.app', 'localhost'] },
    preview: { host: true, port: 4174, proxy, allowedHosts: ['.e2b.app', 'localhost'] },
  };
});
