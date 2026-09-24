export const RUNTIME = {
  useMockData: import.meta.env.VITE_USE_MOCK_DATA?.trim().toLowerCase() !== "false",
  logBdotSession: import.meta.env.VITE_BDOT_LOG_SESSION?.trim().toLowerCase() === "true",
  logBdotData: import.meta.env.VITE_BDOT_LOG_DATA?.trim().toLowerCase() === "true",
  apiBaseUrl: import.meta.env.VITE_API_BASE_URL?.trim().replace(/\/+$/u, "") ?? "",
  useMockSave: import.meta.env.VITE_USE_MOCK_SAVE?.trim().toLowerCase() !== "false",
};
