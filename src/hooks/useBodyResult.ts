import { useCallback, useEffect, useState } from "react";
import { RUNTIME } from "../config/runtime";
import { bodydotApiRepository } from "../services/bodydotClient";
import { advanceMockBodyResult, mockBodydotRepository } from "../services/mockBodydotClient";
import type { BodyResult } from "../types/bodyResult";

interface BodyResultState { result?: BodyResult; loading: boolean; error?: string; }

export function useBodyResult() {
  const [reloadKey, setReloadKey] = useState(0);
  const [state, setState] = useState<BodyResultState>({ loading: true });
  const reload = useCallback(() => setReloadKey((value) => value + 1), []);
  const simulateNewResult = useCallback(() => {
    advanceMockBodyResult();
    setReloadKey((value) => value + 1);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setState((current) => ({ ...current, loading: true, error: undefined }));
    const minimumDelay = new Promise((resolve) => window.setTimeout(resolve, 1500));
    const repository = RUNTIME.useMockData ? mockBodydotRepository : bodydotApiRepository;

    void Promise.all([repository.getLatest(controller.signal), minimumDelay])
      .then(([result]) => setState({ loading: false, result }))
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setState({ loading: false, error: error instanceof Error ? error.message : "Unknown API error" });
      });
    return () => controller.abort();
  }, [reloadKey]);

  return { ...state, reload, simulateNewResult };
}
