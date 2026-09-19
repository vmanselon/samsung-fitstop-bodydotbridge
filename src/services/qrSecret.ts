import { invoke, isTauri } from "@tauri-apps/api/core";

export async function getQrSecret(): Promise<string> {
  if (isTauri()) return invoke<string>("get_qr_secret");
  return "fitstop-bodydot-debug-secret";
}
