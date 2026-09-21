import { useCallback, useEffect, useState } from "react";
import { RUNTIME } from "../config/runtime";
import { mockBodyResult } from "../data/mockBodyResult";
import { bodydotApiRepository, normalizeBdotError } from "../services/bodydotClient";
import type { BdotCommandError } from "../services/bodydotClient";
import { advanceMockBodyResult, mockBodydotRepository } from "../services/mockBodydotClient";
import { preloadResultAssets } from "../services/resultAssets";
import type { BodyResult } from "../types/bodyResult";

interface BodyResultState {
  result?: BodyResult;
  loading: boolean;
  error?: string;
  errorCode?: BdotCommandError["code"];
}
const MIN_LOADING_DURATION_MS = 500;

export function useBodyResult(enabled = true) {
  const [reloadKey, setReloadKey] = useState(0);
  const [state, setState] = useState<BodyResultState>({ loading: false });
  const reload = useCallback(() => {
    setState((current) => ({ ...current, loading: true, error: undefined, errorCode: undefined }));
    setReloadKey((value) => value + 1);
  }, []);
  const showDummyResult = useCallback(() => {
    setState({ loading: false, result: mockBodyResult });
  }, []);
  const simulateNewResult = useCallback(() => {
    advanceMockBodyResult();
    setReloadKey((value) => value + 1);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;
    const repository = RUNTIME.useMockData ? mockBodydotRepository : bodydotApiRepository;
    if (!enabled) {
      setState({ loading: false });
      return () => controller.abort();
    }
    setState({ loading: true });
    const minimumLoadingDuration = new Promise<void>((resolve) => window.setTimeout(resolve, MIN_LOADING_DURATION_MS));

    const load = async () => {
      if (cancelled) return;
      try {
        const result = await repository.getLatest(controller.signal);
        await Promise.all([minimumLoadingDuration, preloadResultAssets(result)]);
        if (cancelled) return;
        setState({ loading: false, result });
      } catch (error: unknown) {
        await minimumLoadingDuration;
        if (cancelled || controller.signal.aborted) return;
        const commandError = normalizeBdotError(error);
        setState({
          loading: false,
          error: commandError?.message ?? (error instanceof Error ? error.message : "Unknown API error"),
          errorCode: commandError?.code,
        });
      }
    };

    void load();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [enabled, reloadKey]);

  return { ...state, reload, showDummyResult, simulateNewResult };
}
