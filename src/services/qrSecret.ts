import { invoke } from "@tauri-apps/api/core";
import { RUNTIME } from "../config/runtime";

export async function getQrSecret(): Promise<string> {
  if (RUNTIME.useMockData) return RUNTIME.debugQrSecret;
  if (!("__TAURI_INTERNALS__" in window)) throw new Error("QR secret is only available in the kiosk app");
  return invoke<string>("get_qr_secret");
}
