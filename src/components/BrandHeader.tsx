interface Props {
  onIconClick?: () => void;
}

export function BrandHeader({ onIconClick }: Props) {
  return (
    <header className="brand-header" aria-label="삼성생명 FITSTOP">
      {onIconClick ? (
        <button
          className="brand-header__icon-button"
          type="button"
          aria-label="삼성생명 FITSTOP"
          onClick={onIconClick}
        >
          <img className="brand-header__samsung" src="/images/global/logo_samsung.svg" alt="" />
          <img className="brand-header__fitstop" src="/images/global/logo_min.svg" alt="" />
        </button>
      ) : (
        <>
          <img className="brand-header__samsung" src="/images/global/logo_samsung.svg" alt="삼성생명" />
          <img className="brand-header__fitstop" src="/images/global/logo_min.svg" alt="FITSTOP" />
        </>
      )}
    </header>
  );
}
