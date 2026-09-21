interface Props {
  seconds: number;
  visible: boolean;
}

export function InactivityOverlay({ seconds, visible }: Props) {
  return (
    <div
      className={`inactivity-overlay${visible ? " is-visible" : ""}`}
      aria-hidden={!visible}
      aria-live="polite"
    >
      <div className="inactivity-dialog" role="status">
        <span className="inactivity-countdown" aria-hidden="true">
          <span>{seconds}</span>
        </span>
        <p className="inactivity-message">
          <strong>{seconds}초</strong> 후 처음 화면으로 돌아갑니다
        </p>
        <p className="inactivity-hint">계속 이용하시려면 화면을 터치해 주세요</p>
      </div>
    </div>
  );
}
