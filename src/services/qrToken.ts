export type UserQrStampStatus = "collected" | "missed" | "pending";

export interface UserQrStamp { stationId: number; status: UserQrStampStatus; }
export interface UserQrPayload {
  userId: string;
  nickname: string;
  stamps: UserQrStamp[];
  issuedAt: number;
}

const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", { fatal: true });
const TRUNCATED_MAC_BYTES = 16;
let lastDiagnostic = "";
let lastDiagnosticAt = 0;

function reportQrError(reason: string, details?: Record<string, unknown>): void {
  const diagnostic = `${reason}:${JSON.stringify(details ?? {})}`;
  const now = Date.now();
  if (diagnostic === lastDiagnostic && now - lastDiagnosticAt < 3_000) return;
  lastDiagnostic = diagnostic;
  lastDiagnosticAt = now;
  console.error("[FITSTOP QR VALIDATION FAILED]", reason, details ?? {});
}

function decodeBase64Url(value: string): ArrayBuffer | undefined {
  if (!value || !/^[A-Za-z0-9_-]+$/.test(value)) return undefined;
  try {
    const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
    return Uint8Array.from(atob(padded), (character) => character.charCodeAt(0)).buffer;
  } catch { return undefined; }
}

async function importHmacKey(secret: string) {
  return crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
}

function bytesToUuid(bytes: ArrayBuffer): string | undefined {
  const value = new Uint8Array(bytes);
  if (value.length !== 16) return undefined;
  const hex = Array.from(value, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function parseCompactUserQrPayload(compact: string): UserQrPayload | undefined {
  const parts = compact.split("|");
  if (parts.length !== 4) {
    reportQrError("COMPACT_PART_COUNT", { expected: 4, actual: parts.length });
    return undefined;
  }
  const [uuidB64, nickname, stampsCompact, issuedAtB36] = parts;
  const uuidBytes = decodeBase64Url(uuidB64);
  if (!uuidBytes) {
    reportQrError("UUID_BASE64_INVALID", { encodedLength: uuidB64.length });
    return undefined;
  }
  if (!nickname) {
    reportQrError("NICKNAME_MISSING");
    return undefined;
  }
  const userId = bytesToUuid(uuidBytes);
  if (!userId) {
    reportQrError("UUID_BYTE_LENGTH", { expected: 16, actual: uuidBytes.byteLength });
    return undefined;
  }

  const stamps: UserQrStamp[] = [];
  if (stampsCompact) {
    const statusCodes: Record<string, UserQrStampStatus> = {
      p: "pending",
      c: "collected",
      m: "missed",
    };
    for (const entry of stampsCompact.split(",")) {
      const match = entry.match(/^(\d+)([pcm])$/);
      if (!match) {
        reportQrError("STAMP_ENTRY_INVALID", { entry });
        return undefined;
      }
      stamps.push({ stationId: Number(match[1]), status: statusCodes[match[2]] });
    }
  }

  const issuedAt = parseInt(issuedAtB36, 36);
  if (Number.isNaN(issuedAt)) {
    reportQrError("ISSUED_AT_INVALID", { value: issuedAtB36 });
    return undefined;
  }
  return { userId, nickname: nickname.normalize("NFC"), stamps, issuedAt };
}

function parseEncodedUserQrPayload(encodedPayload: ArrayBuffer): UserQrPayload | undefined {
  try {
    return parseCompactUserQrPayload(decoder.decode(encodedPayload));
  } catch (error) {
    reportQrError("PAYLOAD_UTF8_INVALID", {
      message: error instanceof Error ? error.message : String(error),
    });
    return undefined;
  }
}

function signaturesMatch(provided: ArrayBuffer, fullMac: ArrayBuffer): boolean {
  const actual = new Uint8Array(provided);
  const expected = new Uint8Array(fullMac);
  if (actual.length !== TRUNCATED_MAC_BYTES) return false;
  let difference = 0;
  for (let index = 0; index < actual.length; index += 1) {
    difference |= actual[index] ^ expected[index];
  }
  return difference === 0;
}

/** Call only after the token signature has been verified. */
export function parseVerifiedQrPayload(token: string): UserQrPayload | undefined {
  const bytes = decodeBase64Url(token.slice(0, token.lastIndexOf(".")));
  return bytes ? parseEncodedUserQrPayload(bytes) : undefined;
}

/** Verifies the current compact payload with its 128-bit truncated HMAC. */
export async function verifyUserQrToken(token: string, secret: string): Promise<UserQrPayload | undefined> {
  if (!secret) {
    reportQrError("QR_SECRET_MISSING");
    return undefined;
  }
  const trimmedToken = token.trim();
  const separatorIndex = trimmedToken.lastIndexOf(".");
  if (separatorIndex === -1) {
    reportQrError("TOKEN_SEPARATOR_MISSING", { tokenLength: trimmedToken.length });
    return undefined;
  }
  const payloadB64 = trimmedToken.slice(0, separatorIndex);
  const signature = decodeBase64Url(trimmedToken.slice(separatorIndex + 1));
  if (!payloadB64) {
    reportQrError("PAYLOAD_MISSING");
    return undefined;
  }
  if (!signature) {
    reportQrError("MAC_BASE64_INVALID", { tokenLength: trimmedToken.length });
    return undefined;
  }
  if (signature.byteLength !== TRUNCATED_MAC_BYTES) {
    reportQrError("MAC_BYTE_LENGTH", { expected: TRUNCATED_MAC_BYTES, actual: signature.byteLength });
    return undefined;
  }
  try {
    const key = await importHmacKey(secret);
    const fullMac = await crypto.subtle.sign("HMAC", key, encoder.encode(payloadB64));
    if (!signaturesMatch(signature, fullMac)) {
      reportQrError("MAC_MISMATCH", { payloadLength: payloadB64.length });
      return undefined;
    }
    const encodedPayload = decodeBase64Url(payloadB64);
    if (!encodedPayload) {
      reportQrError("PAYLOAD_BASE64_INVALID", { payloadLength: payloadB64.length });
      return undefined;
    }
    return parseEncodedUserQrPayload(encodedPayload);
  } catch (error) {
    reportQrError("VERIFICATION_ERROR", {
      message: error instanceof Error ? error.message : String(error),
    });
    return undefined;
  }
}
