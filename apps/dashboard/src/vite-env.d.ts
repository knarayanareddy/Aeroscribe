/// <reference types="vite/client" />

interface ImportMetaEnv {
  /**
   * Where the API lives. **Unset means fixture mode** — the build says
   * "Fixtures · illustrative data" on every screen.
   *
   * Set it to `''`… not possible through an env file, so use the dev proxy with
   * `VITE_API_URL=http://localhost:8787`, or a production reverse proxy that
   * serves the dashboard and the API from one origin.
   */
  readonly VITE_API_URL?: string;
  /** Dev-server only: where `/api` and `/health` are proxied to. */
  readonly VITE_API_PROXY_TARGET?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
