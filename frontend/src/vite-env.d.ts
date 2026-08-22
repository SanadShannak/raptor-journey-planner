/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Origin of the journey-planning backend, e.g. `http://localhost:3000`. */
  readonly VITE_API_BASE_URL?: string;
  /**
   * Optional. Enables Digitransit's transit-aware geocoder, which knows the
   * network's stops. Without it the app uses Photon, which needs no key.
   */
  readonly VITE_DIGITRANSIT_SUBSCRIPTION_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
