export const RUNTIME = {
  useMockData: import.meta.env.VITE_USE_MOCK_DATA?.trim().toLowerCase() !== "false",
  saveUrl: import.meta.env.VITE_FITSTOP_SAVE_URL?.trim() ?? "",
  useMockSave: import.meta.env.VITE_USE_MOCK_SAVE?.trim().toLowerCase() !== "false",
};
