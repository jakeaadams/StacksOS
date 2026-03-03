import crypto from "crypto";

const PASSKEY_ALGO = "aes-256-gcm";

function base64UrlEncode(input: Buffer): string {
  return input.toString("base64url");
}

function base64UrlDecode(input: string): Buffer {
  return Buffer.from(input, "base64url");
}

function getPasskeySecretKey(): Buffer {
  const raw = String(process.env.STACKSOS_PASSKEY_SECRET || "").trim();
  if (!raw) {
    throw new Error("Passkey secret is not configured");
  }
  return crypto.createHash("sha256").update(raw).digest();
}

export function isPasskeyConfigured(): boolean {
  return String(process.env.STACKSOS_PASSKEY_SECRET || "").trim().length >= 32;
}

export function encryptPasskeyPinDigest(pinDigest: string): string {
  const key = getPasskeySecretKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(PASSKEY_ALGO, key, iv);
  const ciphertext = Buffer.concat([cipher.update(pinDigest, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${base64UrlEncode(iv)}.${base64UrlEncode(tag)}.${base64UrlEncode(ciphertext)}`;
}

export function decryptPasskeyPinDigest(payload: string): string {
  const key = getPasskeySecretKey();
  const [ivPart, tagPart, cipherPart] = String(payload || "").split(".");
  if (!ivPart || !tagPart || !cipherPart) {
    throw new Error("Invalid encrypted passkey payload");
  }

  const iv = base64UrlDecode(ivPart);
  const tag = base64UrlDecode(tagPart);
  const ciphertext = base64UrlDecode(cipherPart);

  const decipher = crypto.createDecipheriv(PASSKEY_ALGO, key, iv);
  decipher.setAuthTag(tag);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return plaintext.toString("utf8");
}
