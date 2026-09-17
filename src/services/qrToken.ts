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

function decodeBase64Url(value: string): ArrayBuffer | undefined {
  if (!value || !/^[A-Za-z0-9_-]+$/.test(value)) return undefined;
  try {
    const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
    return Uint8Array.from(atob(padded), (character) => character.charCodeAt(0)).buffer;
  } catch { return undefined; }
}

function encodeBase64Url(value: ArrayBuffer): string {
  let binary = "";
  for (const byte of new Uint8Array(value)) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/u, "");
}

async function importHmacKey(secret: string, usage: KeyUsage[]) {
  return crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, usage);
}

function isUserQrPayload(value: unknown): value is UserQrPayload {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const payload = value as Record<string, unknown>;
  return typeof payload.userId === "string" && payload.userId.length > 0 &&
    typeof payload.nickname === "string" && Array.isArray(payload.stamps) &&
    payload.stamps.every((stamp: unknown) => {
      if (!stamp || typeof stamp !== "object" || Array.isArray(stamp)) return false;
      const item = stamp as Record<string, unknown>;
      return typeof item.stationId === "number" &&
        (item.status === "collected" || item.status === "missed" || item.status === "pending");
    }) && typeof payload.issuedAt === "number";
}

/** Kept byte-for-byte compatible with the Samsung printer kiosk token scheme. */
export async function verifyUserQrToken(token: string, secret: string): Promise<UserQrPayload | undefined> {
  if (!secret) return undefined;
  const trimmedToken = token.trim();
  const separatorIndex = trimmedToken.lastIndexOf(".");
  if (separatorIndex === -1) return undefined;
  const payloadB64 = trimmedToken.slice(0, separatorIndex);
  const signature = decodeBase64Url(trimmedToken.slice(separatorIndex + 1));
  if (!payloadB64 || !signature) return undefined;
  try {
    const key = await importHmacKey(secret, ["verify"]);
    if (!await crypto.subtle.verify("HMAC", key, signature, encoder.encode(payloadB64))) return undefined;
    const encodedPayload = decodeBase64Url(payloadB64);
    if (!encodedPayload) return undefined;
    const parsed: unknown = JSON.parse(decoder.decode(encodedPayload));
    return isUserQrPayload(parsed) ? parsed : undefined;
  } catch { return undefined; }
}

export async function signUserQrPayload(payload: UserQrPayload, secret: string): Promise<string> {
  const payloadB64 = encodeBase64Url(encoder.encode(JSON.stringify(payload)).buffer);
  const key = await importHmacKey(secret, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(payloadB64));
  return `${payloadB64}.${encodeBase64Url(signature)}`;
}
