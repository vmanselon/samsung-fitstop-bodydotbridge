import { useCallback, useEffect, useState } from "react";
import { RUNTIME } from "../config/runtime";
import { mockBodyResult } from "../data/mockBodyResult";
import { getBodyResult } from "../services/bodydotClient";
import type { BodyResult } from "../types/bodyResult";

interface BodyResultState { result?: BodyResult; loading: boolean; error?: string; }

export function useBodyResult() {
  const [reloadKey, setReloadKey] = useState(0);
  const [state, setState] = useState<BodyResultState>({ loading: true });
  const reload = useCallback(() => setReloadKey((value) => value + 1), []);

  useEffect(() => {
    const controller = new AbortController();
    const measurementId = new URLSearchParams(window.location.search).get("measurementId")?.trim();
    if (RUNTIME.useMockData) {
      setState({ loading: false, result: mockBodyResult });
      return () => controller.abort();
    }
    if (!measurementId) {
      setState({ loading: false, error: "measurementId가 필요합니다." });
      return () => controller.abort();
    }

    setState({ loading: true });
    void getBodyResult(measurementId, controller.signal)
      .then((result) => setState({ loading: false, result }))
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setState({ loading: false, error: error instanceof Error ? error.message : "Unknown API error" });
      });
    return () => controller.abort();
  }, [reloadKey]);

  return { ...state, reload };
}
