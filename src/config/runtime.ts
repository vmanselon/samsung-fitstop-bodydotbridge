const DEFAULT_BDOT_POLL_INTERVAL_MS = 12_000;

function positiveInterval(value: string | undefined, fallback: number): number {
  const interval = Number(value);
  return Number.isFinite(interval) && interval > 0 ? interval : fallback;
}

export const RUNTIME = {
  useMockData: import.meta.env.VITE_USE_MOCK_DATA?.trim().toLowerCase() !== "false",
  logBdotSession: import.meta.env.VITE_BDOT_LOG_SESSION?.trim().toLowerCase() === "true",
  bdotPollIntervalMs: positiveInterval(
    import.meta.env.VITE_BDOT_POLL_INTERVAL_MS?.trim(),
    DEFAULT_BDOT_POLL_INTERVAL_MS,
  ),
  apiBaseUrl: import.meta.env.VITE_API_BASE_URL?.trim().replace(/\/+$/u, "") ?? "",
  useMockSave: import.meta.env.VITE_USE_MOCK_SAVE?.trim().toLowerCase() !== "false",
};
