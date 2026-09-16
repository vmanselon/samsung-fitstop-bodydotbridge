/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_BODYDOT_API_BASE_URL?: string;
  readonly VITE_USE_MOCK_DATA?: "true" | "false";
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
