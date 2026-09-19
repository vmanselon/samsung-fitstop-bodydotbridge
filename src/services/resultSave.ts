import { fetch as tauriFetch } from "@tauri-apps/plugin-http";
import { RUNTIME } from "../config/runtime";
import type { BodyResult } from "../types/bodyResult";
import type { UserQrPayload } from "./qrToken";

export interface ResultSaveRequest {
  user: UserQrPayload;
  result: BodyResult;
}

/**
 * This is the POST body contract offered to the main application.
 * Keep API-specific mapping here so scanner and result UI do not change when
 * the server's final endpoint or DTO becomes available.
 */
export interface BodydotSavePayload {
  userId: string;
  nickname: string;
  measurementId: string;
  measuredAt?: string;
  sections: BodyResult["sections"];
  qr: {
    issuedAt: number;
    stamps: UserQrPayload["stamps"];
  };
}

export interface ResultSaver {
  save(request: ResultSaveRequest, signal?: AbortSignal): Promise<void>;
}

export function toBodydotSavePayload({ user, result }: ResultSaveRequest): BodydotSavePayload {
  return {
    userId: user.userId,
    nickname: user.nickname,
    measurementId: result.measurementId,
    measuredAt: result.measuredAt,
    sections: result.sections,
    qr: {
      issuedAt: user.issuedAt,
      stamps: user.stamps,
    },
  };
}

export const mockResultSaver: ResultSaver = {
  async save(request, signal) {
    const payload = toBodydotSavePayload(request);
    console.info("[BODYDOT MOCK POST]", {
      url: RUNTIME.saveUrl || "<VITE_FITSTOP_SAVE_URL>",
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
    if (!RUNTIME.saveUrl) throw new Error("VITE_FITSTOP_SAVE_URL is not configured");
    const fetchRequest = "__TAURI_INTERNALS__" in window ? tauriFetch : globalThis.fetch;
    const response = await fetchRequest(RUNTIME.saveUrl, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(toBodydotSavePayload(request)),
      signal,
    });
    if (!response.ok) {
      const responseText = await response.text().catch(() => "");
      throw new Error(`Bodydot save API returned ${response.status}${responseText ? `: ${responseText}` : ""}`);
    }
  },
};

export const resultSaver = RUNTIME.useMockSave ? mockResultSaver : apiResultSaver;
