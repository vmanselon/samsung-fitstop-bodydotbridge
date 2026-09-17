import { BrandHeader } from "./BrandHeader";

export function LoadingScreen() {
  return (
    <main className="kiosk-page loading-screen" aria-live="polite">
      <div className="checker checker--top" aria-hidden="true" />
      <BrandHeader />
      <h1 className="page-title">프레임 교정 측정 결과</h1>
      <div className="loading-screen__content">
        <img className="spinner" src="/images/global/spinner.svg" alt="" aria-hidden="true" />
        <p>Bodydot 결과 불러오는 중...</p>
      </div>
      <div className="checker checker--bottom" aria-hidden="true" />
    </main>
  );
}
