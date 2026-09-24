import { invoke, isTauri } from "@tauri-apps/api/core";
import { RUNTIME } from "../config/runtime";
import type { BodyResult, BodyResultRepository, MeasurementMetric, MeasurementSectionData } from "../types/bodyResult";

export interface MeasurementStepResult {
  data?: { values?: unknown; [key: string]: unknown };
  [key: string]: unknown;
}

export interface MeasurementSequence {
  stepResults?: MeasurementStepResult[];
  [key: string]: unknown;
}

export interface MeasurementSession {
  id: string;
  createdAt?: string;
  sequences: MeasurementSequence[];
  [key: string]: unknown;
}

export interface BdotCommandError {
  code: "MEASUREMENT_SESSION_NOT_FOUND" | "NETWORK_ERROR" | "AUTHENTICATION_FAILED" |
    "RATE_LIMITED" | "CONFIGURATION_ERROR" | "INVALID_RESPONSE" | "BODYDOT_API_ERROR" | "API_DISABLED" |
    "INCOMPLETE_MEASUREMENT";
  message: string;
  retryAfterSeconds?: number;
}

const INCOMPLETE_MEASUREMENT_MESSAGE = "현재 다른 사용자가 이용 중입니다. 잠시 후 다시 시도해 주세요.";

class IncompleteMeasurementError extends Error {
  readonly code = "INCOMPLETE_MEASUREMENT";

  constructor() {
    super(INCOMPLETE_MEASUREMENT_MESSAGE);
    this.name = "IncompleteMeasurementError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function parseMeasurementSession(value: unknown): MeasurementSession {
  if (!isRecord(value) || typeof value.id !== "string" || !value.id.trim() || !Array.isArray(value.sequences)) {
    throw new IncompleteMeasurementError();
  }
  if (value.createdAt !== undefined && typeof value.createdAt !== "string") {
    throw new IncompleteMeasurementError();
  }
  return value as unknown as MeasurementSession;
}

function collectValues(value: unknown, values: Map<string, number>): void {
  if (Array.isArray(value)) {
    value.forEach((item) => collectValues(item, values));
    return;
  }
  if (!isRecord(value)) return;

  if (typeof value.valueCode === "string" && typeof value.value === "number" && Number.isFinite(value.value)) {
    values.set(value.valueCode, value.value);
    return;
  }
  Object.values(value).forEach((child) => collectValues(child, values));
}

function containsStepCode(value: unknown, stepCode: string): boolean {
  if (value === stepCode) return true;
  if (Array.isArray(value)) return value.some((item) => containsStepCode(item, stepCode));
  if (!isRecord(value)) return false;
  return Object.entries(value).some(([key, child]) => key !== "data" && containsStepCode(child, stepCode));
}

function stepValues(session: MeasurementSession, stepCode: string): Map<string, number> {
  const values = new Map<string, number>();
  session.sequences.forEach((sequence) => {
    if (!isRecord(sequence) || !Array.isArray(sequence.stepResults)) return;
    sequence.stepResults.forEach((step) => {
      if (!isRecord(step) || !containsStepCode(step, stepCode) || !isRecord(step.data)) return;
      collectValues(step.data.values, values);
    });
  });
  return values;
}

function rangeStatus(value: number, normalStart: number, normalEnd: number): MeasurementMetric["value"] {
  return value >= normalStart && value <= normalEnd ? "정상" : "이상";
}

function toneFor(value: string): MeasurementMetric["tone"] {
  if (value === "정상") return "normal";
  if (value.includes("보통")) return "moderate";
  return "attention";
}

function metric(label: string, value: string): MeasurementMetric {
  return { label, value, tone: toneFor(value) };
}

interface MappedBdotDatum {
  label: string;
  step: string;
  code: string;
  unit: "°" | "m";
  value: number | undefined;
}

function mappedBdotData(session: MeasurementSession): MappedBdotDatum[] {
  const mappings: Array<Omit<MappedBdotDatum, "value">> = [
    { label: "머리 수평", step: "standingFront", code: "headHorizontalAngle", unit: "°" },
    { label: "어깨 수평", step: "standingFront", code: "shoulderHorizontalAngle", unit: "°" },
    { label: "골반 수평", step: "standingFront", code: "frontalASISAlignment", unit: "°" },
    { label: "거북목", step: "standingRight", code: "forwardHeadAngle", unit: "°" },
    { label: "흉추", step: "standingRight", code: "thoracicKyphosis", unit: "°" },
    { label: "요추", step: "standingRight", code: "lumbarLordosis", unit: "°" },
    { label: "어깨 유연성 R", step: "apleyScratchRightUp", code: "apleyScratchRightUpDistance", unit: "m" },
    { label: "어깨 유연성 L", step: "apleyScratchLeftUp", code: "apleyScratchLeftUpDistance", unit: "m" },
    { label: "서서 발끝잡기", step: "toeTouchingRight", code: "toeTouchKneeAngle", unit: "°" },
  ];

  return mappings.map((mapping) => ({
    ...mapping,
    value: stepValues(session, mapping.step).get(mapping.code),
  }));
}

/**
 * The kiosk UI requires three cards in each of three views. Keep the
 * BAS-to-design mapping and supplied classification rules isolated here.
 */
function toBodyResult(session: MeasurementSession): BodyResult {
  const data = mappedBdotData(session);
  if (RUNTIME.logBdotData) console.table(data);

  const valueAt = (index: number): number => {
    const value = data[index]?.value;
    if (value === undefined) throw new IncompleteMeasurementError();
    return value;
  };

  const headHorizontal = rangeStatus(valueAt(0), -5, 5);
  const shoulderHorizontal = rangeStatus(valueAt(1), -2, 2);
  const pelvisHorizontal = rangeStatus(valueAt(2), -2, 2);

  const forwardHead = rangeStatus(valueAt(3), 0, 30);
  const thoracic = rangeStatus(valueAt(4), 35, 45);
  const lumbar = rangeStatus(valueAt(5), 45, 55);

  const shoulderRight = rangeStatus(valueAt(6), 0, 0.30);
  const shoulderLeft = rangeStatus(valueAt(7), 0, 0.30);
  const toeTouch = rangeStatus(valueAt(8), 170, 180);

  const sections: [MeasurementSectionData, MeasurementSectionData, MeasurementSectionData] = [
    {
      id: `front-${session.id}`,
      title: "정면 측정 결과",
      view: "front",
      metrics: [
        metric("머리 수평", headHorizontal),
        metric("어깨 수평", shoulderHorizontal),
        metric("골반 수평", pelvisHorizontal),
      ],
    },
    {
      id: `side-${session.id}`,
      title: "측면 측정 결과",
      view: "side",
      metrics: [
        metric("거북목", forwardHead),
        metric("흉추", thoracic),
        metric("요추", lumbar),
      ],
    },
    {
      id: `flexibility-${session.id}`,
      title: "유연성 측정 결과",
      view: "back",
      metrics: [
        metric("어깨 유연성 R", shoulderRight),
        metric("어깨 유연성 L", shoulderLeft),
        metric("유연성", toeTouch),
      ],
    },
  ];

  return {
    measurementId: session.id,
    measuredAt: session.createdAt,
    sections,
  };
}

export function normalizeBdotError(error: unknown): BdotCommandError | undefined {
  if (!isRecord(error) || typeof error.code !== "string" || typeof error.message !== "string") return undefined;
  return error as unknown as BdotCommandError;
}

export async function getLatestMeasurement(signal?: AbortSignal): Promise<MeasurementSession> {
  if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
  if (!isTauri()) {
    throw new Error(
      "Bodydot BAS is available only in the Tauri app. Start it with `npm run tauri dev`, or set VITE_USE_MOCK_DATA=true for browser-only development.",
    );
  }
  const session = parseMeasurementSession(await invoke<unknown>("get_latest_measurement"));
  if (RUNTIME.logBdotSession) console.info("[BODYDOT BAS SESSION]", session);
  if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
  return session;
}

export const bodydotApiRepository: BodyResultRepository = {
  async getLatest(signal) {
    return toBodyResult(await getLatestMeasurement(signal));
  },
};
