import { afterEach, describe, expect, it } from "vitest";
import {
  decryptPasskeyPinDigest,
  encryptPasskeyPinDigest,
  isPasskeyConfigured,
} from "@/lib/passkey-secret";

const originalSecret = process.env.STACKSOS_PASSKEY_SECRET;

afterEach(() => {
  process.env.STACKSOS_PASSKEY_SECRET = originalSecret;
});

describe("passkey-secret", () => {
  it("encrypts and decrypts passkey pin digests", () => {
    process.env.STACKSOS_PASSKEY_SECRET = "0123456789abcdef0123456789abcdef";
    const digest = "0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f";
    const encrypted = encryptPasskeyPinDigest(digest);
    expect(encrypted).toContain(".");
    expect(decryptPasskeyPinDigest(encrypted)).toBe(digest);
  });

  it("reports configured only when secret meets minimum length", () => {
    process.env.STACKSOS_PASSKEY_SECRET = "short";
    expect(isPasskeyConfigured()).toBe(false);
    process.env.STACKSOS_PASSKEY_SECRET = "0123456789abcdef0123456789abcdef";
    expect(isPasskeyConfigured()).toBe(true);
  });

  it("rejects malformed encrypted payloads", () => {
    process.env.STACKSOS_PASSKEY_SECRET = "0123456789abcdef0123456789abcdef";
    expect(() => decryptPasskeyPinDigest("invalid")).toThrow("Invalid encrypted passkey payload");
  });
});
