/**
 * MFA (TOTP) utilities.
 *
 * Uses `otpauth` for TOTP generation and verification.
 * Encryption follows the passkey-secret.ts pattern (AES-256-GCM).
 */

import crypto from "node:crypto";
import * as OTPAuth from "otpauth";

const MFA_ALGO = "aes-256-gcm";

// ---------------------------------------------------------------------------
// Encryption (same pattern as passkey-secret.ts)
// ---------------------------------------------------------------------------

function getMfaSecretKey(): Buffer {
  const raw = String(process.env.STACKSOS_MFA_SECRET || "").trim();
  if (!raw) throw new Error("STACKSOS_MFA_SECRET is not configured");
  return crypto.createHash("sha256").update(raw).digest();
}

export function isMfaConfigured(): boolean {
  return String(process.env.STACKSOS_MFA_SECRET || "").trim().length >= 32;
}

export function encryptTotpSecret(secret: string): string {
  const key = getMfaSecretKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(MFA_ALGO, key, iv);
  const ciphertext = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("base64url")}.${tag.toString("base64url")}.${ciphertext.toString("base64url")}`;
}

export function decryptTotpSecret(payload: string): string {
  const key = getMfaSecretKey();
  const [ivPart, tagPart, cipherPart] = String(payload || "").split(".");
  if (!ivPart || !tagPart || !cipherPart) throw new Error("Invalid encrypted MFA payload");

  const iv = Buffer.from(ivPart, "base64url");
  const tag = Buffer.from(tagPart, "base64url");
  const ciphertext = Buffer.from(cipherPart, "base64url");

  const decipher = crypto.createDecipheriv(MFA_ALGO, key, iv);
  decipher.setAuthTag(tag);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return plaintext.toString("utf8");
}

// ---------------------------------------------------------------------------
// TOTP operations
// ---------------------------------------------------------------------------

export function generateTotpSecret(): string {
  const secret = new OTPAuth.Secret({ size: 20 });
  return secret.base32;
}

export function generateTotpUri(secret: string, patronIdentifier: string, issuer?: string): string {
  const totp = new OTPAuth.TOTP({
    issuer: issuer || process.env.STACKSOS_MFA_ISSUER || "StacksOS Library",
    label: patronIdentifier,
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    secret: OTPAuth.Secret.fromBase32(secret),
  });
  return totp.toString();
}

export function verifyTotpCode(secret: string, code: string): boolean {
  const totp = new OTPAuth.TOTP({
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    secret: OTPAuth.Secret.fromBase32(secret),
  });

  // window=1 means ±1 period tolerance (30s drift)
  const delta = totp.validate({ token: code, window: 1 });
  return delta !== null;
}

// ---------------------------------------------------------------------------
// Recovery codes
// ---------------------------------------------------------------------------

export function generateRecoveryCodes(count = 8): string[] {
  const codes: string[] = [];
  for (let i = 0; i < count; i++) {
    // 8-char alphanumeric codes, grouped as XXXX-XXXX for readability
    const raw = crypto.randomBytes(5).toString("hex").slice(0, 8).toUpperCase();
    codes.push(`${raw.slice(0, 4)}-${raw.slice(4)}`);
  }
  return codes;
}

// ---------------------------------------------------------------------------
// Feature checks
// ---------------------------------------------------------------------------

export function isMfaRequired(): boolean {
  return process.env.STACKSOS_MFA_REQUIRED === "true";
}

export function isMfaEnabled(): boolean {
  return isMfaConfigured();
}
