import { mockBodyResult } from "../data/mockBodyResult";
import type { BodyResult, BodyResultRepository } from "../types/bodyResult";

let sequence = 1;

export const mockBodydotRepository: BodyResultRepository = {
  async getLatest(signal): Promise<BodyResult> {
    await new Promise<void>((resolve, reject) => {
      const timer = window.setTimeout(resolve, 250);
      signal?.addEventListener("abort", () => {
        window.clearTimeout(timer);
        reject(new DOMException("Aborted", "AbortError"));
      }, { once: true });
    });
    return {
      ...structuredClone(mockBodyResult),
      measurementId: `debug-measurement-${sequence}`,
      measuredAt: new Date().toISOString(),
    };
  },
};

export function advanceMockBodyResult() {
  sequence += 1;
}
