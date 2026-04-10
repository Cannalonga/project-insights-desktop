/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_LICENSING_SUPABASE_URL?: string;
  readonly VITE_LICENSING_ANON_KEY?: string;
  readonly VITE_LICENSING_PROJECT_REF?: string;
  readonly VITE_LICENSING_TIMEOUT_MS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
