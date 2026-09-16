import type { BodyResult } from "../types/bodyResult";

export const mockBodyResult: BodyResult = {
  measurementId: "demo-measurement",
  measuredAt: new Date().toISOString(),
  sections: [
    { id: "front-posture", title: "정면 측정 결과", view: "front", metrics: [
      { label: "머리 수평", value: "정상", tone: "normal" },
      { label: "어깨 수평", value: "이상", tone: "attention" },
      { label: "골반 수평", value: "이상", tone: "attention" },
    ] },
    { id: "side-posture", title: "측면 측정 결과", view: "side", metrics: [
      { label: "거북목", value: "이상", tone: "attention" },
      { label: "흉추", value: "전만", tone: "attention" },
      { label: "요추", value: "정상", tone: "normal" },
    ] },
    { id: "flexibility", title: "유연성 측정 결과", view: "back", metrics: [
      { label: "어깨 유연성 R", value: "이상", tone: "attention" },
      { label: "어깨 유연성 L", value: "전만", tone: "attention" },
      { label: "유연성", value: "정상", tone: "normal" },
    ] },
  ],
};
