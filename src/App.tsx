import { useCallback, useEffect, useRef, useState } from "react";
import type { FormEvent, PointerEvent as ReactPointerEvent } from "react";
import { BrandHeader } from "./components/BrandHeader";
import { IdleScreen } from "./components/IdleScreen";
import { InactivityOverlay } from "./components/InactivityOverlay";
import { LoadingScreen } from "./components/LoadingScreen";
import { MeasurementSection } from "./components/MeasurementSection";
import { OfflineNotice } from "./components/OfflineNotice";
import { QrScannerScreen } from "./components/QrScannerScreen";
import { KIOSK_TIMING } from "./config/kiosk";
import { RUNTIME } from "./config/runtime";
import { useBodyResult } from "./hooks/useBodyResult";
import { useInactivityTimeout } from "./hooks/useInactivityTimeout";
import { getQrSecret } from "./services/qrSecret";
import { decodeQrUser } from "./services/qrCode";
import { resultSaver } from "./services/resultSave";
import { getBdotApiEnabled, getKioskClientId, saveKioskClientId, setBdotApiEnabled } from "./services/kioskClientId";
import "./App.css";

type Page = "idle" | "loading" | "result" | "scanner";
interface ScannerError {
  kind: "toast" | "dialog";
  title: string;
  message: string;
  userId?: string;
}

const INVALID_QR_ERROR: ScannerError = {
  kind: "toast",
  title: "QR code error",
  message: "Unable to recognize this QR code. Please try again.",
};
const SAVE_FAILED_MESSAGE = "Failed to save your results.";
const KIOSK_SETTINGS_HOLD_MS = 5_000;
const DUMMY_RESULT_TAP_WINDOW_MS = 600;
const PULL_TO_REFRESH_START_Y = 260;
const PULL_TO_REFRESH_DISTANCE = 72;

export default function App() {
  const [bdotApiDisabled, setBdotApiDisabled] = useState(true);
  const [apiStatusLoaded, setApiStatusLoaded] = useState(false);
  const [measurementRequested, setMeasurementRequested] = useState(false);
  const { result, loading, error, errorCode, reload, showDummyResult, simulateNewResult } = useBodyResult(
    measurementRequested && !bdotApiDisabled,
  );
  const [page, setPage] = useState<Page>("idle");
  const [selectedSection, setSelectedSection] = useState(0);
  const [scannerError, setScannerError] = useState<ScannerError>();
  const [saving, setSaving] = useState(false);
  const [kioskEditorOpen, setKioskEditorOpen] = useState(false);
  const [kioskClientId, setKioskClientId] = useState("");
  const [kioskEditorError, setKioskEditorError] = useState<string>();
  const [kioskEditorBusy, setKioskEditorBusy] = useState(false);
  const [apiToggleBusy, setApiToggleBusy] = useState(false);
  const qrToastTimer = useRef<number | undefined>(undefined);
  const kioskSettingsHoldTimer = useRef<number | undefined>(undefined);
  const dummyResultTapTimer = useRef<number | undefined>(undefined);
  const dummyResultTapCount = useRef(0);
  const processing = useRef(false);
  const saveController = useRef<AbortController | null>(null);
  const swipeStart = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => () => {
    window.clearTimeout(qrToastTimer.current);
    window.clearTimeout(kioskSettingsHoldTimer.current);
    window.clearTimeout(dummyResultTapTimer.current);
    saveController.current?.abort();
  }, []);

  useEffect(() => {
    let cancelled = false;
    void getBdotApiEnabled()
      .then((enabled) => {
        if (!cancelled) setBdotApiDisabled(!enabled);
      })
      .catch((statusError) => console.error("Could not read Bodydot API status", statusError))
      .finally(() => {
        if (!cancelled) setApiStatusLoaded(true);
      });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let start: { pointerId: number; x: number; y: number } | undefined;

    const handlePointerDown = (event: PointerEvent) => {
      if (!event.isPrimary || (event.pointerType === "mouse" && event.button !== 0)) return;
      start = event.clientY <= PULL_TO_REFRESH_START_Y
        ? { pointerId: event.pointerId, x: event.clientX, y: event.clientY }
        : undefined;
    };
    const handlePullProgress = (event: PointerEvent) => {
      if (!start || start.pointerId !== event.pointerId) return;
      const horizontalDistance = event.clientX - start.x;
      const verticalDistance = event.clientY - start.y;
      if (verticalDistance >= PULL_TO_REFRESH_DISTANCE && verticalDistance > Math.abs(horizontalDistance)) {
        start = undefined;
        window.location.reload();
      }
    };
    const handlePointerUp = (event: PointerEvent) => {
      handlePullProgress(event);
      start = undefined;
    };
    const cancelPull = () => { start = undefined; };

    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("pointermove", handlePullProgress);
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", cancelPull);
    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("pointermove", handlePullProgress);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", cancelPull);
    };
  }, []);

  useEffect(() => {
    if (!result || !measurementRequested) return;
    setSelectedSection(0);
    setPage("result");
  }, [measurementRequested, result?.measurementId]);

  const startMeasurement = useCallback(() => {
    if (!apiStatusLoaded) return;
    if (bdotApiDisabled) {
      showDummyResult();
      setSelectedSection(0);
      setPage("result");
      return;
    }
    setMeasurementRequested(true);
    setPage("loading");
  }, [apiStatusLoaded, bdotApiDisabled, showDummyResult]);

  const retryMeasurement = useCallback(() => {
    setPage("loading");
    reload();
  }, [reload]);

  const finishMeasurement = useCallback(() => {
    saveController.current?.abort();
    saveController.current = null;
    processing.current = false;
    setSaving(false);
    window.clearTimeout(qrToastTimer.current);
    setScannerError(undefined);
    setSelectedSection(0);
    setMeasurementRequested(false);
    setPage("idle");
  }, []);

  const showInvalidQr = useCallback(() => {
    window.clearTimeout(qrToastTimer.current);
    setScannerError(INVALID_QR_ERROR);
    qrToastTimer.current = window.setTimeout(() => setScannerError(undefined), 3_000);
  }, []);

  const dismissScannerError = useCallback(() => {
    window.clearTimeout(qrToastTimer.current);
    setScannerError(undefined);
  }, []);

  const handleCode = useCallback(async (code: string) => {
    if (!result || processing.current) return;
    processing.current = true;
    let payload;
    try {
      payload = await decodeQrUser(code, getQrSecret);
    } catch {
      // Report verification errors through the scanner toast.
    }
    if (!payload) {
      showInvalidQr();
      processing.current = false;
      return;
    }

    window.clearTimeout(qrToastTimer.current);
    setScannerError(undefined);

    console.log("QR code decoded, userId:", payload.userId);

    const controller = new AbortController();
    saveController.current?.abort();
    saveController.current = controller;
    try {
      setSaving(true);
      await resultSaver.save({ user: payload, result }, controller.signal);
      finishMeasurement();
    } catch (error) {
      if (controller.signal.aborted) return;
      console.error("[BODYDOT SAVE FAILED]", error);
      const detail = error instanceof Error
        ? error.message
        : typeof error === "string"
          ? error
          : JSON.stringify(error);
      setScannerError({
        kind: "dialog",
        title: SAVE_FAILED_MESSAGE,
        message: detail || "Unknown error. Please try again.",
        userId: payload.userId,
      });
    } finally {
      if (saveController.current === controller) saveController.current = null;
      processing.current = false;
      setSaving(false);
    }
  }, [finishMeasurement, result, showInvalidQr]);

  const debugValidScan = useCallback(async () => {
    const token = JSON.stringify({
      id: "debug-user-001",
      name: "Debug User",
      result: [1, 1, 1, 1],
    });
    await handleCode(token);
  }, [handleCode]);

  const startSwipe = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    swipeStart.current = { x: event.clientX, y: event.clientY };
  }, []);

  const finishSwipe = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const start = swipeStart.current;
    swipeStart.current = null;
    if (!start || !result) return;
    const horizontalDistance = event.clientX - start.x;
    const verticalDistance = event.clientY - start.y;
    if (Math.abs(horizontalDistance) < 55 || Math.abs(horizontalDistance) <= Math.abs(verticalDistance)) return;
    setSelectedSection((current) => {
      if (horizontalDistance < 0) return Math.min(current + 1, result.sections.length - 1);
      return Math.max(current - 1, 0);
    });
  }, [result]);

  const openKioskEditor = useCallback(async () => {
    setKioskEditorOpen(true);
    setKioskEditorError(undefined);
    setKioskEditorBusy(true);
    try {
      const [clientId, apiEnabled] = await Promise.all([getKioskClientId(), getBdotApiEnabled()]);
      setKioskClientId(clientId);
      setBdotApiDisabled(!apiEnabled);
    } catch (editorError) {
      setKioskEditorError(editorError instanceof Error ? editorError.message : "Could not load the client ID.");
    } finally {
      setKioskEditorBusy(false);
    }
  }, []);

  const cancelKioskSettingsHold = useCallback(() => {
    window.clearTimeout(kioskSettingsHoldTimer.current);
    kioskSettingsHoldTimer.current = undefined;
  }, []);

  const startKioskSettingsHold = useCallback((event: ReactPointerEvent<HTMLButtonElement>) => {
    if (!event.isPrimary || (event.pointerType === "mouse" && event.button !== 0)) return;
    event.preventDefault();
    cancelKioskSettingsHold();
    event.currentTarget.setPointerCapture(event.pointerId);
    kioskSettingsHoldTimer.current = window.setTimeout(() => {
      kioskSettingsHoldTimer.current = undefined;
      void openKioskEditor();
    }, KIOSK_SETTINGS_HOLD_MS);
  }, [cancelKioskSettingsHold, openKioskEditor]);

  const handleDummyResultTap = useCallback(() => {
    window.clearTimeout(dummyResultTapTimer.current);
    dummyResultTapCount.current += 1;
    if (dummyResultTapCount.current >= 3) {
      dummyResultTapCount.current = 0;
      showDummyResult();
      setSelectedSection(0);
      setPage("result");
      return;
    }
    dummyResultTapTimer.current = window.setTimeout(() => {
      dummyResultTapCount.current = 0;
      dummyResultTapTimer.current = undefined;
    }, DUMMY_RESULT_TAP_WINDOW_MS);
  }, [showDummyResult]);

  const submitKioskClientId = useCallback(async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setKioskEditorError(undefined);
    setKioskEditorBusy(true);
    try {
      await saveKioskClientId(kioskClientId);
      window.location.reload();
    } catch (editorError) {
      const commandMessage = typeof editorError === "object" && editorError && "message" in editorError
        ? String(editorError.message)
        : undefined;
      setKioskEditorError(commandMessage ?? (editorError instanceof Error ? editorError.message : "Could not save the client ID."));
    } finally {
      setKioskEditorBusy(false);
    }
  }, [kioskClientId]);

  const toggleBdotApi = useCallback(async () => {
    const disabled = !bdotApiDisabled;
    setKioskEditorError(undefined);
    setApiToggleBusy(true);
    setBdotApiDisabled(disabled);
    try {
      await setBdotApiEnabled(!disabled);
      window.location.reload();
    } catch (toggleError) {
      setBdotApiDisabled(!disabled);
      const commandMessage = typeof toggleError === "object" && toggleError && "message" in toggleError
        ? String(toggleError.message)
        : undefined;
      setKioskEditorError(commandMessage ?? (toggleError instanceof Error ? toggleError.message : "Could not change the Bodydot API status."));
    } finally {
      setApiToggleBusy(false);
    }
  }, [bdotApiDisabled]);

  const kioskSettingsControls = (
    <>
      <button
        className="kiosk-settings-hotspot"
        type="button"
        aria-label="Configure Bodydot kiosk client ID"
        onPointerDown={startKioskSettingsHold}
        onPointerUp={cancelKioskSettingsHold}
        onPointerCancel={cancelKioskSettingsHold}
        onLostPointerCapture={cancelKioskSettingsHold}
        onContextMenu={(event) => event.preventDefault()}
      />
      {kioskEditorOpen && (
        <div className="settings-dialog-backdrop" role="presentation">
          <form className="settings-dialog" role="dialog" aria-modal="true" aria-labelledby="kiosk-settings-title" onSubmit={submitKioskClientId}>
            <h2 id="kiosk-settings-title">Bodydot kiosk settings</h2>
            <label htmlFor="kiosk-client-id">BDOT_KIOSK_CLIENT_ID</label>
            <input
              id="kiosk-client-id"
              type="text"
              value={kioskClientId}
              onChange={(event) => setKioskClientId(event.target.value)}
              disabled={kioskEditorBusy}
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              autoFocus
            />
            {kioskEditorError && <p className="settings-dialog__error" role="alert">{kioskEditorError}</p>}
            <div className={`settings-dialog__api-status${bdotApiDisabled ? " is-disabled" : ""}`}>
              <p>Bodydot API: <strong>{bdotApiDisabled ? "Disabled" : "Enabled"}</strong></p>
              <p>This safety setting resets to Enabled when the app restarts.</p>
              <button type="button" onClick={() => void toggleBdotApi()} disabled={apiToggleBusy || kioskEditorBusy}>
                {apiToggleBusy ? "Updating…" : bdotApiDisabled ? "Enable Bodydot API" : "Disable Bodydot API"}
              </button>
            </div>
            <div className="settings-dialog__actions">
              <button type="button" onClick={() => setKioskEditorOpen(false)} disabled={kioskEditorBusy}>Cancel</button>
              <button type="submit" disabled={kioskEditorBusy || !kioskClientId.trim()}>{kioskEditorBusy ? "Saving…" : "Save"}</button>
            </div>
          </form>
        </div>
      )}
    </>
  );
  const pullToRefreshZone = <div className="pull-to-refresh-zone" aria-hidden="true" />;
  const resultInactivity = useInactivityTimeout({
    enabled: page === "result" && Boolean(result),
    timeoutMs: KIOSK_TIMING.resultInactivityTimeoutMs,
    warningMs: KIOSK_TIMING.resultInactivityWarningMs,
    onTimeout: finishMeasurement,
  });

  if (page === "idle") {
    return <><IdleScreen disabled={!apiStatusLoaded} onStart={startMeasurement} />{pullToRefreshZone}<button className="dummy-result-hotspot" type="button" aria-label="Show dummy result" onClick={handleDummyResultTap} />{kioskSettingsControls}<OfflineNotice networkError={false} /></>;
  }
  if (loading || (page === "loading" && !error)) return <><LoadingScreen />{pullToRefreshZone}<OfflineNotice networkError={errorCode === "NETWORK_ERROR"} /></>;
  if (!result) {
    return <><main className="app-state app-state--error"><h1>측정 결과를 불러올 수 없습니다.</h1><p>{error ?? "잠시 후 다시 시도해 주세요."}</p><button type="button" onClick={retryMeasurement}>다시 시도</button></main>{pullToRefreshZone}<OfflineNotice networkError={errorCode === "NETWORK_ERROR"} /></>;
  }
  if (page === "scanner") {
    return <><QrScannerScreen onExit={finishMeasurement} onTimeout={finishMeasurement} onCode={handleCode} debugValidScan={debugValidScan} debugInvalidScan={() => void handleCode("invalid-debug-token")} error={scannerError} onErrorDismiss={dismissScannerError} saving={saving} />{pullToRefreshZone}<OfflineNotice networkError={errorCode === "NETWORK_ERROR"} /></>;
  }

  return (
    <main className="kiosk-page result-page">
      {pullToRefreshZone}
      <div className="checker checker--top" aria-hidden="true" />
      <BrandHeader />
      <h1 className="page-title">프레임 교정 측정 결과</h1>
      <nav className="result-tabs" aria-label="측정 결과 종류">
        {result.sections.map((section, index) => <button type="button" key={section.id} className={selectedSection === index ? "is-active" : ""} onClick={() => setSelectedSection(index)}>{section.title}</button>)}
      </nav>
      <div
        className="result-swipe-area"
        onPointerDown={startSwipe}
        onPointerUp={finishSwipe}
        onPointerCancel={() => { swipeStart.current = null; }}
      >
        <MeasurementSection section={result.sections[selectedSection]} />
      </div>
      <nav className="result-pagination" aria-label="Result slides">
        {result.sections.map((section, index) => (
          <button
            type="button"
            key={section.id}
            className={selectedSection === index ? "is-active" : ""}
            aria-label={`Show ${section.title}`}
            aria-current={selectedSection === index ? "page" : undefined}
            onClick={() => setSelectedSection(index)}
          />
        ))}
      </nav>
      <div className="result-actions">
        <button className="action-button action-button--secondary" type="button" onClick={finishMeasurement}>종료하기</button>
        <button className="action-button action-button--primary" type="button" onClick={() => setPage("scanner")}>QR 코드 스캔하기</button>
      </div>
      <div className="checker checker--bottom" aria-hidden="true" />
      {RUNTIME.useMockData && <aside className="debug-tools"><span>DEBUG · {result.measurementId}</span><button type="button" onClick={simulateNewResult}>Simulate New Result</button></aside>}
      <OfflineNotice networkError={errorCode === "NETWORK_ERROR"} />
      <InactivityOverlay seconds={resultInactivity.remainingSeconds} visible={resultInactivity.showWarning} />
    </main>
  );
}
