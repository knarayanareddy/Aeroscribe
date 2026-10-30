/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Optional HTTP endpoint that accepts contact requests as JSON. */
  readonly VITE_CONTACT_ENDPOINT?: string;
  /** Optional absolute or base-relative URL for the researcher dashboard. */
  readonly VITE_DASHBOARD_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
