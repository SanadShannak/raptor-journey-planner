/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Origin of the journey-planning backend, e.g. `http://localhost:3000`. */
  readonly VITE_API_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
