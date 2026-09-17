import type { MeasurementSectionData } from "../types/bodyResult";

interface Props { section: MeasurementSectionData; }

export function MeasurementSection({ section }: Props) {
  const characterImage = section.imageUrl || `/images/character/character_${section.view}.svg`;

  return (
    <section className="measurement-section">
      <div className={`measurement-visual measurement-visual--${section.view}`}>
        <img className="measurement-visual__guide" src="/images/character/character_guide.svg" alt="" aria-hidden="true" />
        <img
          className="measurement-visual__character"
          src={characterImage}
          alt={`${section.title} 캐릭터 분석`}
        />
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
