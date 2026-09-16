export type MeasurementTone = "normal" | "attention";
export type MeasurementView = "front" | "side" | "back";

export interface MeasurementMetric { label: string; value: string; tone: MeasurementTone; }
export interface MeasurementSectionData {
  id: string;
  title: string;
  view: MeasurementView;
  imageUrl?: string;
  metrics: [MeasurementMetric, MeasurementMetric, MeasurementMetric];
}
export interface BodyResult {
  measurementId: string;
  measuredAt?: string;
  sections: [MeasurementSectionData, MeasurementSectionData, MeasurementSectionData];
}
