export const RUNTIME = {
  apiBaseUrl: import.meta.env.VITE_BODYDOT_API_BASE_URL?.trim() ?? "",
  useMockData: import.meta.env.VITE_USE_MOCK_DATA?.trim().toLowerCase() !== "false",
};
