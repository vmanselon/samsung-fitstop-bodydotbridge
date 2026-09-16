import { fetch as tauriFetch } from "@tauri-apps/plugin-http";
import { RUNTIME } from "../config/runtime";
import type { BodyResult, MeasurementMetric, MeasurementSectionData } from "../types/bodyResult";

function isMetric(value: unknown): value is MeasurementMetric {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const metric = value as Record<string, unknown>;
  return typeof metric.label === "string" && typeof metric.value === "string" && (metric.tone === "normal" || metric.tone === "attention");
}

function isSection(value: unknown): value is MeasurementSectionData {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const section = value as Record<string, unknown>;
  return (
    typeof section.id === "string" &&
    typeof section.title === "string" &&
    (section.view === "front" || section.view === "side" || section.view === "back") &&
    (section.imageUrl === undefined || typeof section.imageUrl === "string") &&
    Array.isArray(section.metrics) &&
    section.metrics.length === 3 &&
    section.metrics.every(isMetric)
  );
}

function parseBodyResult(value: unknown): BodyResult {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid BODYDOT response");
  const result = value as Record<string, unknown>;
  if (
    typeof result.measurementId !== "string" ||
    (result.measuredAt !== undefined && typeof result.measuredAt !== "string") ||
    !Array.isArray(result.sections) ||
    result.sections.length !== 3 ||
    !result.sections.every(isSection)
  ) throw new Error("Invalid BODYDOT response");
  return result as unknown as BodyResult;
}

export async function getBodyResult(measurementId: string, signal?: AbortSignal): Promise<BodyResult> {
  if (!RUNTIME.apiBaseUrl) throw new Error("BODYDOT API URL is not configured");
  const endpoint = new URL(`/measurements/${encodeURIComponent(measurementId)}`, RUNTIME.apiBaseUrl);
  const request = "__TAURI_INTERNALS__" in window ? tauriFetch : globalThis.fetch;
  const response = await request(endpoint, { method: "GET", signal });
  if (!response.ok) throw new Error(`BODYDOT API returned ${response.status}`);
  return parseBodyResult(await response.json());
}
