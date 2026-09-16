import { BrandHeader } from "./components/BrandHeader";
import { MeasurementSection } from "./components/MeasurementSection";
import { useBodyResult } from "./hooks/useBodyResult";
import "./App.css";

export default function App() {
  const { result, loading, error, reload } = useBodyResult();

  if (loading) {
    return <main className="app-state" aria-live="polite">측정 결과를 불러오고 있습니다.</main>;
  }

  if (error || !result) {
    return (
      <main className="app-state app-state--error">
        <h1>측정 결과를 불러올 수 없습니다.</h1>
        <p>{error ?? "잠시 후 다시 시도해 주세요."}</p>
        <button type="button" onClick={reload}>다시 시도</button>
      </main>
    );
  }

  return (
    <main className="result-page">
      <div className="checker checker--top" aria-hidden="true" />
      <BrandHeader />
      <h1 className="page-title">프레임 교정 측정 결과</h1>
      <div className="measurement-list">
        {result.sections.map((section) => <MeasurementSection key={section.id} section={section} />)}
      </div>
      <div className="checker checker--bottom" aria-hidden="true" />
    </main>
  );
}
