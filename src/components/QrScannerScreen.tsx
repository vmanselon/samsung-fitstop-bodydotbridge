import { useCallback, useEffect, useRef, useState } from "react";
import QrScanner from "qr-scanner";
import { KIOSK_TIMING } from "../config/kiosk";
import { RUNTIME } from "../config/runtime";
import { BrandHeader } from "./BrandHeader";

const INACTIVITY_MS = KIOSK_TIMING.qrScannerInactivityTimeoutMs;
const INACTIVITY_SECONDS = Math.ceil(INACTIVITY_MS / 1000);

interface Props {
  onExit: () => void;
  onTimeout: () => void;
  onCode: (code: string) => Promise<void>;
  debugInvalidScan: () => void;
  error?: { kind: "toast" | "dialog"; title: string; message: string; userId?: string };
  onErrorDismiss: () => void;
  saving?: boolean;
}

export function QrScannerScreen({ onExit, onTimeout, onCode, debugInvalidScan, error, onErrorDismiss, saving }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const scannerRef = useRef<QrScanner | null>(null);
  const deadlineRef = useRef(Date.now() + INACTIVITY_MS);
  const timedOutRef = useRef(false);
  const onTimeoutRef = useRef(onTimeout);
  const [cameraError, setCameraError] = useState<string>();
  const [cameraReady, setCameraReady] = useState(false);
  const [secondsRemaining, setSecondsRemaining] = useState(INACTIVITY_SECONDS);
  onTimeoutRef.current = onTimeout;

  const resetInactivity = useCallback(() => {
    timedOutRef.current = false;
    deadlineRef.current = Date.now() + INACTIVITY_MS;
    setSecondsRemaining(INACTIVITY_SECONDS);
  }, []);

  useEffect(() => {
    const interval = window.setInterval(() => {
      const remaining = Math.max(0, Math.ceil((deadlineRef.current - Date.now()) / 1000));
      setSecondsRemaining(remaining);
      if (remaining === 0 && !timedOutRef.current) {
        timedOutRef.current = true;
        onTimeoutRef.current();
        resetInactivity();
      }
    }, 250);
    return () => window.clearInterval(interval);
  }, [resetInactivity]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const scanner = new QrScanner(video, ({ data }) => {
      resetInactivity();
      void onCode(data);
    }, {
      preferredCamera: "user",
      highlightScanRegion: false,
      highlightCodeOutline: false,
      maxScansPerSecond: 8,
      returnDetailedScanResult: true,
    });
    scannerRef.current = scanner;
    resetInactivity();
    void scanner.start().catch((error: unknown) => {
      setCameraError(error instanceof Error ? error.message : "카메라를 시작할 수 없습니다.");
    });

    return () => {
      scanner.stop();
      scanner.destroy();
      scannerRef.current = null;
    };
  }, [onCode, resetInactivity]);

  return (
    <main className="kiosk-page scanner-screen" onPointerDown={resetInactivity} onKeyDown={resetInactivity}>
      <div className="checker checker--top" aria-hidden="true" />
      <BrandHeader />
      <h1 className="page-title">QR 코드를 스캔해 주세요</h1>
      <p className="scanner-subtitle">QR 코드 인식 대기 시간 <strong>{secondsRemaining}초</strong></p>
      <div className="camera-preview">
        <video
          ref={videoRef}
          className={cameraReady ? "is-ready" : ""}
          muted
          playsInline
          onPlaying={() => setCameraReady(true)}
          aria-label="QR 코드 카메라 화면"
        />
        {cameraReady && !cameraError && (
          <svg
            className="camera-scan-frame"
            viewBox="0 0 238 238"
            aria-hidden="true"
          >
            <path d="M31 2H10a8 8 0 0 0-8 8v21M207 2h21a8 8 0 0 1 8 8v21m0 176v21a8 8 0 0 1-8 8h-21m-176 0H10a8 8 0 0 1-8-8v-21" />
          </svg>
        )}
        {!cameraReady && !cameraError && (
          <div className="camera-loading" aria-label="카메라를 준비하는 중입니다">
            <img src="/images/global/spinner.svg" alt="" aria-hidden="true" />
          </div>
        )}
        {cameraError && <div className="camera-message">{cameraError}</div>}
        {saving && <div className="camera-message">결과를 저장하는 중입니다...</div>}
        {error?.kind === "toast" && <div className="scanner-toast" role="alert">{error.message}</div>}
      </div>
      <button className="action-button action-button--secondary" type="button" onClick={onExit}>종료하기</button>
      <div className="checker checker--bottom" aria-hidden="true" />
      {RUNTIME.useMockSave && (
        <aside className="debug-tools" aria-label="Debug tools">
          <span>DEBUG</span>
          <button type="button" onClick={debugInvalidScan}>Invalid QR</button>
        </aside>
      )}
      {error?.kind === "dialog" && (
        <div className="scanner-error-backdrop">
          <section className="scanner-error-dialog" role="alertdialog" aria-modal="true" aria-labelledby="scanner-error-title" aria-describedby="scanner-error-message">
            <h2 id="scanner-error-title">{error.title}</h2>
            <p id="scanner-error-message">{error.message}</p>
            {error.userId && (
              <div className="scanner-error-user-id">
                <span>Sent userId</span>
                <code>{error.userId}</code>
              </div>
            )}
            <button type="button" onClick={onErrorDismiss}>Close</button>
          </section>
        </div>
      )}
    </main>
  );
}
