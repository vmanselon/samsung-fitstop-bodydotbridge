import { useCallback, useEffect, useRef, useState } from "react";
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
  const [state, setState] = useState<BodyResultState>({ loading: true });
  const lastRealMeasurementId = useRef<string | undefined>(undefined);
  const reload = useCallback(() => setReloadKey((value) => value + 1), []);
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
    let requestInFlight = false;
    const repository = RUNTIME.useMockData ? mockBodydotRepository : bodydotApiRepository;
    if (!enabled) {
      setState((current) => ({
        result: current.result ?? mockBodyResult,
        loading: false,
        error: undefined,
        errorCode: undefined,
      }));
      return () => controller.abort();
    }
    setState((current) => ({ ...current, loading: !current.result, error: undefined }));
    const minimumLoadingDuration = state.result
      ? Promise.resolve()
      : new Promise<void>((resolve) => window.setTimeout(resolve, MIN_LOADING_DURATION_MS));

    const poll = async () => {
      if (cancelled || requestInFlight) return;
      requestInFlight = true;
      try {
        const result = await repository.getLatest(controller.signal);
        await Promise.all([minimumLoadingDuration, preloadResultAssets(result)]);
        if (cancelled) return;
        const isNewMeasurement = lastRealMeasurementId.current !== result.measurementId;
        if (isNewMeasurement) lastRealMeasurementId.current = result.measurementId;
        setState((current) => {
          if (!isNewMeasurement && !current.loading && !current.error) {
            return current;
          }
          return {
            loading: false,
            result: isNewMeasurement ? result : current.result ?? result,
          };
        });
      } catch (error: unknown) {
        await minimumLoadingDuration;
        if (cancelled || controller.signal.aborted) return;
        const commandError = normalizeBdotError(error);
        if (commandError?.code === "API_DISABLED") {
          setState((current) => ({
            loading: false,
            result: current.result ?? mockBodyResult,
            error: undefined,
            errorCode: undefined,
          }));
          return;
        }
        setState((current) => ({
          ...current,
          loading: false,
          error: commandError?.message ?? (error instanceof Error ? error.message : "Unknown API error"),
          errorCode: commandError?.code,
        }));
      } finally {
        requestInFlight = false;
      }
    };

    void poll();
    const interval = window.setInterval(() => void poll(), RUNTIME.bdotPollIntervalMs);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
      controller.abort();
    };
  }, [enabled, reloadKey]);

  return { ...state, reload, showDummyResult, simulateNewResult };
}
