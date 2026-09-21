import { isTauri } from "@tauri-apps/api/core";
import { parseVerifiedQrPayload, verifyUserQrToken } from "./qrToken";

export interface QrUser {
  userId: string;
  nickname: string;
}

/** Current FITSTOP QR contract, shared with the printer kiosk. */
export function parseFitStopQrCode(code: string): QrUser | undefined {
  try {
    const value: unknown = JSON.parse(code.trim());
    if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
    const payload = value as Record<string, unknown>;
    const requiredKeys = ["id", "name", "result"];
    const keys = Object.keys(payload).sort();
    if (keys.length !== requiredKeys.length || keys.some((key, index) => key !== requiredKeys[index])) {
      return undefined;
    }
    if (typeof payload.id !== "string" || !payload.id.trim()) return undefined;
    const name = typeof payload.name === "string" ? payload.name.trim().normalize("NFC") : "";
    if (!name || Array.from(name).length > 30) return undefined;
    if (!Array.isArray(payload.result) || payload.result.length !== 4 ||
      !payload.result.every((item) => item === 0 || item === 1)) return undefined;
    return { userId: payload.id.trim(), nickname: name };
  } catch {
    return undefined;
  }
}

export async function decodeQrUser(code: string, getSecret: () => Promise<string>): Promise<QrUser | undefined> {
  const trimmed = code.trim();
  if (trimmed.startsWith("{")) {
    const user = parseFitStopQrCode(trimmed);
    return user;
  }
  // Only legacy signed tokens need the native HMAC secret.
  if (!/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(trimmed)) {
    return undefined;
  }
  let user: QrUser | undefined;
  if (!isTauri() && import.meta.env.DEV) {
    const response = await fetch("/__dev/verify-qr", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: trimmed }),
    });
    if (!response.ok) throw new Error(`QR verification server returned HTTP ${response.status}: ${await response.text()}`);
    const verification = await response.json();
    if (verification.valid === true) user = parseVerifiedQrPayload(trimmed);
  } else {
    user = await verifyUserQrToken(trimmed, await getSecret());
  }
  return user;
}
