import { invoke, isTauri } from "@tauri-apps/api/core";

export const DEFAULT_KIOSK_CLIENT_ID = "ff31aaa2-6621-4561-a756-ffb6d50dfa7b";
const BROWSER_STORAGE_KEY = "fitstop-bdot-kiosk-client-id";
const BROWSER_API_ENABLED_KEY = "fitstop-bdot-api-enabled";

export async function getKioskClientId(): Promise<string> {
  if (!isTauri()) return localStorage.getItem(BROWSER_STORAGE_KEY) || DEFAULT_KIOSK_CLIENT_ID;
  return invoke<string>("get_kiosk_client_id");
}

export async function saveKioskClientId(kioskClientId: string): Promise<string> {
  const normalized = kioskClientId.trim();
  if (!normalized || normalized.length > 200 || /[\u0000-\u001f\u007f]/.test(normalized)) {
    throw new Error("Client ID must contain between 1 and 200 printable characters.");
  }
  if (!isTauri()) {
    localStorage.setItem(BROWSER_STORAGE_KEY, normalized);
    return normalized;
  }
  return invoke<string>("set_kiosk_client_id", { kioskClientId: normalized });
}

export async function setBdotApiEnabled(enabled: boolean): Promise<boolean> {
  if (!isTauri()) {
    sessionStorage.setItem(BROWSER_API_ENABLED_KEY, String(enabled));
    return enabled;
  }
  return invoke<boolean>("set_bdot_api_enabled", { enabled });
}

export async function getBdotApiEnabled(): Promise<boolean> {
  if (!isTauri()) return sessionStorage.getItem(BROWSER_API_ENABLED_KEY) !== "false";
  return invoke<boolean>("get_bdot_api_enabled");
}
