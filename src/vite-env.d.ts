/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_BODYDOT_API_BASE_URL?: string;
  readonly VITE_USE_MOCK_DATA?: "true" | "false";
  readonly VITE_BODYDOT_SAVE_URL?: string;
  readonly VITE_USE_MOCK_SAVE?: "true" | "false";
  readonly VITE_QR_SECRET?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
