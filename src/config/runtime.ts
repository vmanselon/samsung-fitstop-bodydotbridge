export const RUNTIME = {
  apiBaseUrl: import.meta.env.VITE_BODYDOT_API_BASE_URL?.trim() ?? "",
  useMockData: import.meta.env.VITE_USE_MOCK_DATA?.trim().toLowerCase() !== "false",
  saveUrl: import.meta.env.VITE_BODYDOT_SAVE_URL?.trim() ?? "",
  useMockSave: import.meta.env.VITE_USE_MOCK_SAVE?.trim().toLowerCase() !== "false",
  debugQrSecret: import.meta.env.VITE_QR_SECRET?.trim() || "fitstop-bodydot-debug-secret",
};
