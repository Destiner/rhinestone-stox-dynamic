/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_RHINESTONE_API_KEY: string;
  readonly VITE_DYNAMIC_ENVIRONMENT_ID: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
