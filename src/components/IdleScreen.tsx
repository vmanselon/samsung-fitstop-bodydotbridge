import { BrandHeader } from "./BrandHeader";

interface Props {
  disabled: boolean;
  onIconClick: () => void;
  onStart: () => void;
}

export function IdleScreen({ disabled, onIconClick, onStart }: Props) {
  return (
    <main className="kiosk-page idle-screen">
      <div className="checker checker--top" aria-hidden="true" />
      <BrandHeader onIconClick={onIconClick} />
      <h1 className="page-title">프레임 교정 측정 결과</h1>
      <button
        className="action-button action-button--primary"
        type="button"
        onClick={onStart}
        disabled={disabled}
      >
       측정 결과 불러오기
      </button>
      <div className="checker checker--bottom" aria-hidden="true" />
    </main>
  );
}
