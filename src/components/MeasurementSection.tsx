import type { MeasurementSectionData } from "../types/bodyResult";

interface Props { section: MeasurementSectionData; }

export function MeasurementSection({ section }: Props) {
  const characterFrames = section.imageUrl
    ? [section.imageUrl]
    : [0, 1].map((frame) => `/images/character/character_${section.view}_${frame}.svg`);

  return (
    <section className="measurement-section">
      <div className={`measurement-visual measurement-visual--${section.view}`}>
        <img className="measurement-visual__guide" src="/images/character/character_guide.svg" alt="" aria-hidden="true" />
        <div
          className="measurement-visual__character"
          role="img"
          aria-label={`${section.title} 캐릭터 분석`}
        >
          {characterFrames.map((source, frame) => (
            <img
              className={`measurement-visual__character-frame${characterFrames.length > 1 ? ` measurement-visual__character-frame--${frame}` : ""}`}
              src={source}
              alt=""
              aria-hidden="true"
              key={source}
            />
          ))}
        </div>
        <i className="target-ring target-ring--one" aria-hidden="true" />
        <i className="target-ring target-ring--two" aria-hidden="true" />
        <i className="target-ring target-ring--three" aria-hidden="true" />
      </div>
      <div className="metric-grid">
        {section.metrics.map((metric) => (
          <article className="metric-card" key={metric.label}>
            <p className="metric-card__label">{metric.label}</p>
            <p className={`metric-card__value metric-card__value--${metric.tone}`}>{metric.value}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
