import type { MeasurementSectionData } from "../types/bodyResult";

interface Props { section: MeasurementSectionData; }

export function MeasurementSection({ section }: Props) {
  return (
    <section className="measurement-section">
      <h2 className="measurement-section__title">{section.title}</h2>
      <div className={`measurement-visual measurement-visual--${section.view}`}>
        <img className="measurement-visual__character" src={section.imageUrl || "/images/character-placeholder.svg"} alt={`${section.title} 캐릭터 분석`} />
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
