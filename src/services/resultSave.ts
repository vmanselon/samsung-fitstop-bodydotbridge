import { fetch as tauriFetch } from "@tauri-apps/plugin-http";
import { RUNTIME } from "../config/runtime";
import type { BodyResult } from "../types/bodyResult";
import type { QrUser } from "./qrCode";

const BODYDOT_SAVE_PATH = "/api/bodydot";

function bodydotSaveUrl(): string {
  if (!RUNTIME.apiBaseUrl) return "";
  if (import.meta.env.DEV && !("__TAURI_INTERNALS__" in window)) {
    return `/__dev/bodydot-api${BODYDOT_SAVE_PATH}`;
  }
  return `${RUNTIME.apiBaseUrl}${BODYDOT_SAVE_PATH}`;
}

export interface ResultSaveRequest {
  user: QrUser;
  result: BodyResult;
}

export interface CleanBodydotMetric {
  label: string;
  value: string;
}

export interface CleanBodydotSection {
  title: string;
  metrics: CleanBodydotMetric[];
}

export type CleanBodydotData = [CleanBodydotSection, CleanBodydotSection, CleanBodydotSection];

/**
 * This is the POST body contract offered to the main application.
 * Keep API-specific mapping here so scanner and result UI do not change when
 * the server's final endpoint or DTO becomes available.
 */
export interface BodydotSavePayload {
  userID: string;
  data: CleanBodydotData;
}

export interface ResultSaver {
  save(request: ResultSaveRequest, signal?: AbortSignal): Promise<void>;
}

export function toBodydotSavePayload({ user, result }: ResultSaveRequest): BodydotSavePayload {
  const cleanSection = (section: BodyResult["sections"][number]): CleanBodydotSection => ({
    title: section.title,
    metrics: section.metrics.map(({ label, value }) => ({ label, value })),
  });

  return {
    userID: user.userId,
    data: [
      cleanSection(result.sections[0]),
      cleanSection(result.sections[1]),
      cleanSection(result.sections[2]),
    ],
  };
}

function logCleanData(payload: BodydotSavePayload): void {
  if (RUNTIME.useMockSave) console.info("[BODYDOT CLEAN DATA]", payload.data);
}

export const mockResultSaver: ResultSaver = {
  async save(request, signal) {
    const payload = toBodydotSavePayload(request);
    logCleanData(payload);
    console.info("[BODYDOT MOCK POST]", {
      url: bodydotSaveUrl() || `<VITE_API_BASE_URL>${BODYDOT_SAVE_PATH}`,
      method: "POST",
      body: payload,
    });
    await new Promise<void>((resolve, reject) => {
      const timer = window.setTimeout(resolve, 350);
      signal?.addEventListener("abort", () => {
        window.clearTimeout(timer);
        reject(new DOMException("Aborted", "AbortError"));
      }, { once: true });
    });
  },
};

export const apiResultSaver: ResultSaver = {
  async save(request, signal) {
    const saveUrl = bodydotSaveUrl();
    if (!saveUrl) throw new Error("VITE_API_BASE_URL is not configured");
    const fetchRequest = "__TAURI_INTERNALS__" in window ? tauriFetch : globalThis.fetch;
    console.info("[BODYDOT SAVE REQUEST]", {
      url: saveUrl,
      transport: fetchRequest === tauriFetch ? "native HTTP" : "browser fetch",
    });
    const payload = toBodydotSavePayload(request);
    logCleanData(payload);
    const response = await fetchRequest(saveUrl, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      signal,
    });
    if (!response.ok) {
      const responseText = await response.text().catch(() => "");
      throw new Error(`Bodydot save API returned ${response.status}${responseText ? `: ${responseText}` : ""}`);
    }
  },
};

export const resultSaver = RUNTIME.useMockSave ? mockResultSaver : apiResultSaver;
