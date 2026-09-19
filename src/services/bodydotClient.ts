import { invoke, isTauri } from "@tauri-apps/api/core";
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
    "RATE_LIMITED" | "CONFIGURATION_ERROR" | "INVALID_RESPONSE" | "BODYDOT_API_ERROR" | "API_DISABLED";
  message: string;
  retryAfterSeconds?: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function parseMeasurementSession(value: unknown): MeasurementSession {
  if (!isRecord(value) || typeof value.id !== "string" || !value.id || !Array.isArray(value.sequences)) {
    throw new Error("Bodydot returned an invalid measurement session");
  }
  if (value.createdAt !== undefined && typeof value.createdAt !== "string") {
    throw new Error("Bodydot returned an invalid measurement timestamp");
  }
  return value as unknown as MeasurementSession;
}

type Direction = "왼쪽" | "오른쪽";
type CurveDirection = "전만" | "후만";

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

function sessionValues(session: MeasurementSession): Map<string, number> {
  const values = new Map<string, number>();
  session.sequences.forEach((sequence) => {
    sequence.stepResults?.forEach((step) => collectValues(step.data?.values, values));
  });
  return values;
}

function requiredValue(values: Map<string, number>, valueCode: string): number {
  const value = values.get(valueCode);
  if (value === undefined) throw new Error(`Bodydot session is missing ${valueCode}`);
  return value;
}

function directionalStatus(value: number, normalLimit: number): MeasurementMetric["value"] {
  const magnitude = Math.abs(value);
  if (magnitude <= normalLimit / 2) return "정상";
  const direction: Direction = value < 0 ? "왼쪽" : "오른쪽";
  return magnitude <= normalLimit ? `보통(${direction})` : `이상(${direction})`;
}

function lowerIsBetterStatus(value: number, normalLimit: number): MeasurementMetric["value"] {
  if (value < 0) return "이상";
  if (value <= normalLimit / 2) return "정상";
  if (value <= normalLimit) return "보통";
  return "이상";
}

function higherIsBetterStatus(value: number, normalStart: number, normalEnd: number): MeasurementMetric["value"] {
  const halfway = normalStart + (normalEnd - normalStart) / 2;
  if (value >= halfway && value <= normalEnd) return "정상";
  if (value >= normalStart && value < halfway) return "보통";
  return "이상";
}

function centeredStatus(value: number, normalStart: number, normalEnd: number): MeasurementMetric["value"] {
  const quarter = (normalEnd - normalStart) / 4;
  if (value >= normalStart + quarter && value <= normalEnd - quarter) return "정상";
  if (value >= normalStart && value <= normalEnd) {
    const direction: CurveDirection = value < (normalStart + normalEnd) / 2 ? "전만" : "후만";
    return `보통(${direction})`;
  }
  return value < normalStart ? "전만" : "후만";
}

function toneFor(value: string): MeasurementMetric["tone"] {
  if (value === "정상") return "normal";
  if (value.startsWith("보통")) return "moderate";
  return "attention";
}

function metric(label: string, value: string): MeasurementMetric {
  return { label, value, tone: toneFor(value) };
}

/**
 * The kiosk UI requires three cards in each of three views. Keep the
 * BAS-to-design mapping and supplied classification rules isolated here.
 */
function toBodyResult(session: MeasurementSession): BodyResult {
  const values = sessionValues(session);

  const headHorizontal = directionalStatus(requiredValue(values, "headHorizontalAngle"), 5);
  const shoulderHorizontal = directionalStatus(requiredValue(values, "shoulderHorizontalAngle"), 2);
  const pelvisHorizontal = directionalStatus(requiredValue(values, "frontalASISAlignment"), 2);

  const forwardHead = lowerIsBetterStatus(requiredValue(values, "forwardHeadAngle"), 30);
  const thoracic = centeredStatus(requiredValue(values, "thoracicKyphosis"), 35, 45);
  const lumbar = centeredStatus(requiredValue(values, "lumbarLordosis"), 45, 55);

  // BAS twoPointDistance values are expressed in metres; the supplied rules use centimetres.
  const shoulderRightCm = requiredValue(values, "apleyScratchRightUpDistance") * 100;
  const shoulderLeftCm = requiredValue(values, "apleyScratchLeftUpDistance") * 100;
  const toeTouch = higherIsBetterStatus(requiredValue(values, "toeTouchKneeAngle"), 170, 180);

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
        metric("어깨 유연성 R", lowerIsBetterStatus(shoulderRightCm, 30)),
        metric("어깨 유연성 L", lowerIsBetterStatus(shoulderLeftCm, 30)),
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
  if (import.meta.env.DEV) console.info("[BODYDOT BAS SESSION]", session);
  if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
  return session;
}

export const bodydotApiRepository: BodyResultRepository = {
  async getLatest(signal) {
    return toBodyResult(await getLatestMeasurement(signal));
  },
};
