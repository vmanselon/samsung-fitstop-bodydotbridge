/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_USE_MOCK_DATA?: "true" | "false";
  readonly VITE_BDOT_LOG_SESSION?: "true" | "false";
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_USE_MOCK_SAVE?: "true" | "false";
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
