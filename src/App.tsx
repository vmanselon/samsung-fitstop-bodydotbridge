import { useCallback, useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { BrandHeader } from "./components/BrandHeader";
import { LoadingScreen } from "./components/LoadingScreen";
import { MeasurementSection } from "./components/MeasurementSection";
import { QrScannerScreen } from "./components/QrScannerScreen";
import { RUNTIME } from "./config/runtime";
import { useBodyResult } from "./hooks/useBodyResult";
import { getQrSecret } from "./services/qrSecret";
import { signUserQrPayload, verifyUserQrToken } from "./services/qrToken";
import { resultSaver } from "./services/resultSave";
import "./App.css";

type Page = "result" | "scanner";
const INVALID_QR_MESSAGE = "QR 코드를 인식할 수 없습니다. 다시 시도해 주세요.";
const SAVE_FAILED_MESSAGE = "결과를 저장하지 못했습니다. 다시 시도해 주세요.";

export default function App() {
  const { result, loading, error, reload, simulateNewResult } = useBodyResult();
  const [page, setPage] = useState<Page>("result");
  const [selectedSection, setSelectedSection] = useState(0);
  const [scannerError, setScannerError] = useState<string>();
  const [saving, setSaving] = useState(false);
  const [saveNotice, setSaveNotice] = useState<string>();
  const toastTimer = useRef<number | undefined>(undefined);
  const processing = useRef(false);
  const saveController = useRef<AbortController | null>(null);
  const swipeStart = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => () => {
    window.clearTimeout(toastTimer.current);
    saveController.current?.abort();
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
      window.setTimeout(() => setSaveNotice(undefined), 3500);
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
    const token = await signUserQrPayload({
      userId: "debug-user-001",
      nickname: "Debug User",
      issuedAt: Date.now(),
      stamps: [1, 2, 3, 4].map((stationId) => ({ stationId, status: "collected" as const })),
    }, RUNTIME.debugQrSecret);
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

  if (loading) return <LoadingScreen />;
  if (error || !result) {
    return <main className="app-state app-state--error"><h1>측정 결과를 불러올 수 없습니다.</h1><p>{error ?? "잠시 후 다시 시도해 주세요."}</p><button type="button" onClick={reload}>다시 시도</button></main>;
  }
  if (page === "scanner") {
    return <QrScannerScreen onBack={leaveScanner} onCode={handleCode} debugValidScan={debugValidScan} debugInvalidScan={() => void handleCode("invalid-debug-token")} errorMessage={scannerError} saving={saving} />;
  }

  return (
    <main className="kiosk-page result-page">
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
      <button className="action-button action-button--primary" type="button" onClick={() => setPage("scanner")}>결과 저장</button>
      {saveNotice && <div className="action-button save-notice" role="status">{saveNotice}</div>}
      <div className="checker checker--bottom" aria-hidden="true" />
      {RUNTIME.useMockData && <aside className="debug-tools"><span>DEBUG · {result.measurementId}</span><button type="button" onClick={simulateNewResult}>Simulate New Result</button></aside>}
    </main>
  );
}
