import { isTauri } from "@tauri-apps/api/core";
import { parseVerifiedQrPayload, verifyUserQrToken } from "./qrToken";

export interface QrUser {
  userId: string;
  nickname: string;
}

const SIGNED_TOKEN_PATTERN = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;
let lastFormatDiagnosticAt = 0;

function reportFormatError(reason: string, code: string): void {
  const now = Date.now();
  if (now - lastFormatDiagnosticAt < 3_000) return;
  lastFormatDiagnosticAt = now;
  console.error("[FITSTOP QR FORMAT FAILED]", reason, {
    scannedLength: code.length,
    startsWithHttp: /^https?:/iu.test(code),
  });
}

/** Extracts a current compact token supplied bare or in the /collect?t=... URL form. */
export function extractSignedUserQrToken(code: string): string | undefined {
  const trimmed = code.trim();
  if (SIGNED_TOKEN_PATTERN.test(trimmed)) return trimmed;
  try {
    const url = new URL(trimmed);
    if ((url.protocol !== "https:" && url.protocol !== "http:") || !url.pathname.endsWith("/collect")) {
      reportFormatError("URL_PROTOCOL_OR_PATH", trimmed);
      return undefined;
    }
    const token = url.searchParams.get("t")?.trim();
    if (!token) {
      reportFormatError("URL_TOKEN_MISSING", trimmed);
      return undefined;
    }
    if (!SIGNED_TOKEN_PATTERN.test(token)) {
      reportFormatError("TOKEN_CHARACTERS_INVALID", token);
      return undefined;
    }
    return token;
  } catch {
    reportFormatError("NOT_TOKEN_OR_URL", trimmed);
    return undefined;
  }
}

export async function decodeQrUser(code: string, getSecret: () => Promise<string>): Promise<QrUser | undefined> {
  const token = extractSignedUserQrToken(code);
  if (!token) return undefined;
  let user: QrUser | undefined;
  if (!isTauri() && import.meta.env.DEV) {
    const response = await fetch("/__dev/verify-qr", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    });
    if (!response.ok) throw new Error(`QR verification server returned HTTP ${response.status}: ${await response.text()}`);
    const verification = await response.json();
    if (verification.valid === true) user = parseVerifiedQrPayload(token);
  } else {
    user = await verifyUserQrToken(token, await getSecret());
  }
  return user;
}
