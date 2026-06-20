import crypto from "crypto";

// ──────────────────────────────────────────────────────────────────────────
// AES-256-GCM encryption/decryption for storing TOTP secrets at rest
// ──────────────────────────────────────────────────────────────────────────

const MFA_KEY_MATERIAL = process.env.SESSION_SECRET ?? "jabeen-dev-secret-change-in-prod";

function deriveKey(): Buffer {
  return crypto.createHash("sha256").update(MFA_KEY_MATERIAL).digest();
}

export function encryptMfaData(plaintext: string): string {
  const key = deriveKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${tag.toString("hex")}:${encrypted.toString("hex")}`;
}

export function decryptMfaData(ciphertext: string): string {
  const [ivHex, tagHex, dataHex] = ciphertext.split(":");
  const key = deriveKey();
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(ivHex, "hex"));
  decipher.setAuthTag(Buffer.from(tagHex, "hex"));
  return Buffer.concat([decipher.update(Buffer.from(dataHex, "hex")), decipher.final()]).toString("utf8");
}

// ──────────────────────────────────────────────────────────────────────────
// Base32 encoding/decoding (RFC 4648) — used by TOTP authenticator apps
// ──────────────────────────────────────────────────────────────────────────

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function encodeBase32(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) {
    out += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }
  return out;
}

function decodeBase32(str: string): Buffer {
  const s = str.toUpperCase().replace(/=+$/, "");
  const bytes: number[] = [];
  let bits = 0;
  let value = 0;
  for (const ch of s) {
    const idx = BASE32_ALPHABET.indexOf(ch);
    if (idx === -1) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

// ──────────────────────────────────────────────────────────────────────────
// HOTP (RFC 4226) and TOTP (RFC 6238) — implemented with Node.js crypto
// ──────────────────────────────────────────────────────────────────────────

function hotp(secretBase32: string, counter: number): string {
  const key = decodeBase32(secretBase32);
  const counterBuf = Buffer.alloc(8);
  counterBuf.writeBigUInt64BE(BigInt(counter));
  const hmac = crypto.createHmac("sha1", key).update(counterBuf).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const code = ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  return String(code % 1_000_000).padStart(6, "0");
}

function totpCounter(timeMs = Date.now(), step = 30): number {
  return Math.floor(timeMs / 1000 / step);
}

function totpCode(secretBase32: string, timeMs = Date.now()): string {
  return hotp(secretBase32, totpCounter(timeMs));
}

// Allow ±1 time window for clock skew
function verifyTotp(secretBase32: string, code: string, timeMs = Date.now()): boolean {
  const counter = totpCounter(timeMs);
  for (const offset of [-1, 0, 1]) {
    if (hotp(secretBase32, counter + offset) === code) return true;
  }
  return false;
}

// ──────────────────────────────────────────────────────────────────────────
// Public API
// ──────────────────────────────────────────────────────────────────────────

export function generateTotpSecret(email: string): { secret: string; otpauthUri: string } {
  const secret = encodeBase32(crypto.randomBytes(20));
  const issuer = encodeURIComponent("JABEEN Portal");
  const account = encodeURIComponent(email);
  const otpauthUri = `otpauth://totp/${issuer}:${account}?secret=${secret}&issuer=${issuer}&algorithm=SHA1&digits=6&period=30`;
  return { secret, otpauthUri };
}

export function verifyTotpCode(encryptedSecret: string, code: string): boolean {
  try {
    const secret = decryptMfaData(encryptedSecret);
    return verifyTotp(secret, code.replace(/\s/g, ""));
  } catch {
    return false;
  }
}

const RECOVERY_CODE_COUNT = 8;

function generateSingleRecoveryCode(): string {
  const hex = crypto.randomBytes(8).toString("hex");
  return `${hex.slice(0, 4)}-${hex.slice(4, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}`;
}

function hashRecoveryCode(code: string): string {
  return crypto.createHash("sha256").update(code.replace(/-/g, "").toLowerCase()).digest("hex");
}

export function generateRecoveryCodes(): { plainCodes: string[]; encryptedCodes: string } {
  const plainCodes = Array.from({ length: RECOVERY_CODE_COUNT }, generateSingleRecoveryCode);
  const hashes = plainCodes.map(hashRecoveryCode);
  return {
    plainCodes,
    encryptedCodes: encryptMfaData(JSON.stringify(hashes)),
  };
}

export function verifyAndConsumeRecoveryCode(
  encryptedCodes: string,
  providedCode: string,
): { valid: boolean; updatedEncryptedCodes: string | null } {
  try {
    const hashes: string[] = JSON.parse(decryptMfaData(encryptedCodes));
    const providedHash = hashRecoveryCode(providedCode);
    const idx = hashes.indexOf(providedHash);
    if (idx === -1) return { valid: false, updatedEncryptedCodes: null };
    const remaining = hashes.filter((_, i) => i !== idx);
    return {
      valid: true,
      updatedEncryptedCodes: encryptMfaData(JSON.stringify(remaining)),
    };
  } catch {
    return { valid: false, updatedEncryptedCodes: null };
  }
}

// ──────────────────────────────────────────────────────────────────────────
// QR Code generation using pure Node.js (no external package)
// Produces a data URL containing an SVG QR code that browsers can display.
// Uses the qrcode package which was manually placed in node_modules.
// ──────────────────────────────────────────────────────────────────────────

export async function generateQrCodeDataUrl(otpauthUri: string): Promise<string> {
  // Dynamic require to avoid TS module resolution issues (no @types/qrcode available)
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const QRCode = require("qrcode") as { toDataURL: (text: string, opts: object) => Promise<string> };
  return QRCode.toDataURL(otpauthUri, { width: 256, margin: 2 });
}
