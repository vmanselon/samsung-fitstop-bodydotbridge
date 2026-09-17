import { useCallback, useEffect, useRef, useState } from "react";
import QrScanner from "qr-scanner";
import { BrandHeader } from "./BrandHeader";

const INACTIVITY_MS = 30_000;
const INACTIVITY_SECONDS = INACTIVITY_MS / 1000;

interface Props {
  onBack: () => void;
  onCode: (code: string) => void;
  debugValidScan: () => void;
  debugInvalidScan: () => void;
  errorMessage?: string;
  saving?: boolean;
}

export function QrScannerScreen({ onBack, onCode, debugValidScan, debugInvalidScan, errorMessage, saving }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const scannerRef = useRef<QrScanner | null>(null);
  const timeoutRef = useRef<number | undefined>(undefined);
  const deadlineRef = useRef(Date.now() + INACTIVITY_MS);
  const [cameraError, setCameraError] = useState<string>();
  const [cameraReady, setCameraReady] = useState(false);
  const [secondsRemaining, setSecondsRemaining] = useState(INACTIVITY_SECONDS);

  const resetInactivity = useCallback(() => {
    window.clearTimeout(timeoutRef.current);
    deadlineRef.current = Date.now() + INACTIVITY_MS;
    setSecondsRemaining(INACTIVITY_SECONDS);
    timeoutRef.current = window.setTimeout(onBack, INACTIVITY_MS);
  }, [onBack]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      const remaining = Math.max(0, Math.ceil((deadlineRef.current - Date.now()) / 1000));
      setSecondsRemaining(remaining);
    }, 250);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const scanner = new QrScanner(video, ({ data }) => {
      resetInactivity();
      onCode(data);
    }, {
      preferredCamera: "user",
      highlightScanRegion: true,
      highlightCodeOutline: true,
      maxScansPerSecond: 8,
      returnDetailedScanResult: true,
    });
    scannerRef.current = scanner;
    resetInactivity();
    void scanner.start().catch((error: unknown) => {
      setCameraError(error instanceof Error ? error.message : "카메라를 시작할 수 없습니다.");
    });

    return () => {
      window.clearTimeout(timeoutRef.current);
      scanner.stop();
      scanner.destroy();
      scannerRef.current = null;
    };
  }, [onBack, onCode, resetInactivity]);

  return (
    <main className="kiosk-page scanner-screen" onPointerDown={resetInactivity} onKeyDown={resetInactivity}>
      <div className="checker checker--top" aria-hidden="true" />
      <BrandHeader />
      <h1 className="page-title">QR 코드를 스캔해 주세요</h1>
      <p className="scanner-subtitle">스캔 화면은 <strong>{secondsRemaining}초</strong> 후 자동으로 닫힙니다</p>
      <div className="camera-preview">
        <video
          ref={videoRef}
          className={cameraReady ? "is-ready" : ""}
          muted
          playsInline
          onPlaying={() => setCameraReady(true)}
          aria-label="QR 코드 카메라 화면"
        />
        {!cameraReady && !cameraError && (
          <div className="camera-loading" aria-label="카메라를 준비하는 중입니다">
            <img src="/images/global/spinner.svg" alt="" aria-hidden="true" />
          </div>
        )}
        {cameraError && <div className="camera-message">{cameraError}</div>}
        {saving && <div className="camera-message">결과를 저장하는 중입니다...</div>}
        {errorMessage && <div className="scanner-toast" role="alert">{errorMessage}</div>}
      </div>
      <button className="action-button action-button--secondary" type="button" onClick={onBack}>뒤로</button>
      <div className="checker checker--bottom" aria-hidden="true" />
      <aside className="debug-tools" aria-label="Debug tools">
        <span>DEBUG</span>
        <button type="button" onClick={debugValidScan}>Valid QR</button>
        <button type="button" onClick={debugInvalidScan}>Invalid QR</button>
      </aside>
    </main>
  );
}
