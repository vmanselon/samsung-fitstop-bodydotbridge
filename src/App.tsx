import { useCallback, useEffect, useRef, useState } from "react";
import type { FormEvent, PointerEvent as ReactPointerEvent } from "react";
import { BrandHeader } from "./components/BrandHeader";
import { LoadingScreen } from "./components/LoadingScreen";
import { MeasurementSection } from "./components/MeasurementSection";
import { OfflineNotice } from "./components/OfflineNotice";
import { QrScannerScreen } from "./components/QrScannerScreen";
import { RUNTIME } from "./config/runtime";
import { useBodyResult } from "./hooks/useBodyResult";
import { getQrSecret } from "./services/qrSecret";
import { signUserQrPayload, verifyUserQrToken } from "./services/qrToken";
import { resultSaver } from "./services/resultSave";
import { getBdotApiEnabled, getKioskClientId, saveKioskClientId, setBdotApiEnabled } from "./services/kioskClientId";
import "./App.css";

type Page = "result" | "scanner";
const INVALID_QR_MESSAGE = "QR 코드를 인식할 수 없습니다. 다시 시도해 주세요.";
const SAVE_FAILED_MESSAGE = "결과를 저장하지 못했습니다. 다시 시도해 주세요.";
const KIOSK_SETTINGS_HOLD_MS = 5_000;
const DUMMY_RESULT_TAP_WINDOW_MS = 600;
const PULL_TO_REFRESH_START_Y = 260;
const PULL_TO_REFRESH_DISTANCE = 72;

export default function App() {
  const [bdotApiDisabled, setBdotApiDisabled] = useState(false);
  const { result, loading, error, errorCode, reload, showDummyResult, simulateNewResult } = useBodyResult(!bdotApiDisabled);
  const [page, setPage] = useState<Page>("result");
  const [selectedSection, setSelectedSection] = useState(0);
  const [scannerError, setScannerError] = useState<string>();
  const [saving, setSaving] = useState(false);
  const [saveNotice, setSaveNotice] = useState<string>();
  const [kioskEditorOpen, setKioskEditorOpen] = useState(false);
  const [kioskClientId, setKioskClientId] = useState("");
  const [kioskEditorError, setKioskEditorError] = useState<string>();
  const [kioskEditorBusy, setKioskEditorBusy] = useState(false);
  const [apiToggleBusy, setApiToggleBusy] = useState(false);
  const toastTimer = useRef<number | undefined>(undefined);
  const saveNoticeTimer = useRef<number | undefined>(undefined);
  const kioskSettingsHoldTimer = useRef<number | undefined>(undefined);
  const dummyResultTapTimer = useRef<number | undefined>(undefined);
  const dummyResultTapCount = useRef(0);
  const processing = useRef(false);
  const saveController = useRef<AbortController | null>(null);
  const swipeStart = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => () => {
    window.clearTimeout(toastTimer.current);
    window.clearTimeout(saveNoticeTimer.current);
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
      .catch((statusError) => console.error("Could not read Bodydot API status", statusError));
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
    if (!result) return;
    setSelectedSection(0);
    setPage("result");
  }, [result?.measurementId]);

  const showInvalidQr = useCallback(() => {
    window.clearTimeout(toastTimer.current);
    setScannerError(INVALID_QR_MESSAGE);
    toastTimer.current = window.setTimeout(() => setScannerError(undefined), 3000);
  }, []);

  const leaveScanner = useCallback(() => {
    saveController.current?.abort();
    saveController.current = null;
    processing.current = false;
    setSaving(false);
    setScannerError(undefined);
    setPage("result");
  }, []);

  const handleCode = useCallback(async (code: string) => {
    if (!result || processing.current) return;
    processing.current = true;
    let payload;
    try {
      payload = await verifyUserQrToken(code, await getQrSecret());
    } catch (validationError) {
      console.error("QR token verification failed", validationError);
    }
    if (!payload) {
      showInvalidQr();
      processing.current = false;
      return;
    }

    const controller = new AbortController();
    saveController.current?.abort();
    saveController.current = controller;
    try {
      setSaving(true);
      await resultSaver.save({ user: payload, result }, controller.signal);
      setSaveNotice(
        RUNTIME.useMockSave
          ? `Mock save completed for ${payload.nickname}.`
          : `${payload.nickname}님의 결과를 저장했습니다.`,
      );
      leaveScanner();
      window.clearTimeout(saveNoticeTimer.current);
      saveNoticeTimer.current = window.setTimeout(() => setSaveNotice(undefined), 3500);
    } catch (saveError) {
      if (controller.signal.aborted) return;
      console.error("Bodydot result save failed", saveError);
      window.clearTimeout(toastTimer.current);
      setScannerError(SAVE_FAILED_MESSAGE);
      toastTimer.current = window.setTimeout(() => setScannerError(undefined), 3000);
    } finally {
      if (saveController.current === controller) saveController.current = null;
      processing.current = false;
      setSaving(false);
    }
  }, [leaveScanner, result, showInvalidQr]);

  const debugValidScan = useCallback(async () => {
    const qrSecret = await getQrSecret();
    const token = await signUserQrPayload({
      userId: "debug-user-001",
      nickname: "Debug User",
      issuedAt: Date.now(),
      stamps: [1, 2, 3, 4].map((stationId) => ({ stationId, status: "collected" as const })),
    }, qrSecret);
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

  if (loading) return <><LoadingScreen />{pullToRefreshZone}<OfflineNotice networkError={errorCode === "NETWORK_ERROR"} /></>;
  if (!result) {
    return <><main className="app-state app-state--error"><h1>측정 결과를 불러올 수 없습니다.</h1><p>{error ?? "잠시 후 다시 시도해 주세요."}</p><button type="button" onClick={reload}>다시 시도</button></main>{pullToRefreshZone}{kioskSettingsControls}<OfflineNotice networkError={errorCode === "NETWORK_ERROR"} /></>;
  }
  if (page === "scanner") {
    return <><QrScannerScreen onBack={leaveScanner} onCode={handleCode} debugValidScan={debugValidScan} debugInvalidScan={() => void handleCode("invalid-debug-token")} errorMessage={scannerError} saving={saving} />{pullToRefreshZone}<OfflineNotice networkError={errorCode === "NETWORK_ERROR"} /></>;
  }

  return (
    <main className="kiosk-page result-page">
      {pullToRefreshZone}
      <div className="checker checker--top" aria-hidden="true" />
      {!bdotApiDisabled && (
        <button
          className="dummy-result-hotspot"
          type="button"
          aria-label="Show dummy result"
          onClick={handleDummyResultTap}
        />
      )}
      {kioskSettingsControls}
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
      <button className="action-button action-button--primary" type="button" onClick={() => setPage("scanner")}>QR 코드 스캔하기</button>
      {saveNotice && <div className="action-button save-notice" role="status">{saveNotice}</div>}
      <div className="checker checker--bottom" aria-hidden="true" />
      {RUNTIME.useMockData && <aside className="debug-tools"><span>DEBUG · {result.measurementId}</span><button type="button" onClick={simulateNewResult}>Simulate New Result</button></aside>}
      <OfflineNotice networkError={errorCode === "NETWORK_ERROR"} />
    </main>
  );
}
