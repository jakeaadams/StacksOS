/**
 * MFA (TOTP) Module Unit Tests
 *
 * Tests TOTP secret generation, encryption round-trip,
 * code verification, recovery codes, and feature checks.
 */

import { describe, it, expect, afterEach } from "vitest";
import * as OTPAuth from "otpauth";
import {
  generateTotpSecret,
  encryptTotpSecret,
  decryptTotpSecret,
  verifyTotpCode,
  generateRecoveryCodes,
  isMfaConfigured,
  isMfaEnabled,
} from "@/lib/mfa";

const originalMfaSecret = process.env.STACKSOS_MFA_SECRET;
const originalMfaEnabled = process.env.STACKSOS_MFA_ENABLED;

afterEach(() => {
  process.env.STACKSOS_MFA_SECRET = originalMfaSecret;
  process.env.STACKSOS_MFA_ENABLED = originalMfaEnabled;
});

describe("MFA Module", () => {
  describe("generateTotpSecret", () => {
    it("should return a valid base32 string", () => {
      const secret = generateTotpSecret();
      expect(secret).toMatch(/^[A-Z2-7]+=*$/);
      expect(secret.length).toBeGreaterThanOrEqual(16);
    });

    it("should return unique secrets on each call", () => {
      const s1 = generateTotpSecret();
      const s2 = generateTotpSecret();
      expect(s1).not.toBe(s2);
    });
  });

  describe("encryptTotpSecret / decryptTotpSecret round-trip", () => {
    it("should encrypt and decrypt back to the original secret", () => {
      process.env.STACKSOS_MFA_SECRET = "0123456789abcdef0123456789abcdef";
      const original = "JBSWY3DPEHPK3PXP";
      const encrypted = encryptTotpSecret(original);
      expect(encrypted).toContain(".");
      expect(decryptTotpSecret(encrypted)).toBe(original);
    });

    it("should produce different ciphertexts for the same input (random IV)", () => {
      process.env.STACKSOS_MFA_SECRET = "0123456789abcdef0123456789abcdef";
      const secret = "JBSWY3DPEHPK3PXP";
      const enc1 = encryptTotpSecret(secret);
      const enc2 = encryptTotpSecret(secret);
      expect(enc1).not.toBe(enc2);
    });

    it("should throw on malformed encrypted payload", () => {
      process.env.STACKSOS_MFA_SECRET = "0123456789abcdef0123456789abcdef";
      expect(() => decryptTotpSecret("invalid")).toThrow("Invalid encrypted MFA payload");
    });

    it("should throw when STACKSOS_MFA_SECRET is not set", () => {
      delete process.env.STACKSOS_MFA_SECRET;
      expect(() => encryptTotpSecret("test")).toThrow("STACKSOS_MFA_SECRET is not configured");
    });
  });

  describe("verifyTotpCode", () => {
    it("should return true for a valid TOTP code generated from the same secret", () => {
      const secret = generateTotpSecret();
      const totp = new OTPAuth.TOTP({
        algorithm: "SHA1",
        digits: 6,
        period: 30,
        secret: OTPAuth.Secret.fromBase32(secret),
      });
      const validCode = totp.generate();
      expect(verifyTotpCode(secret, validCode)).toBe(true);
    });

    it("should return false for an invalid code", () => {
      const secret = generateTotpSecret();
      expect(verifyTotpCode(secret, "000000")).toBe(false);
    });
  });

  describe("generateRecoveryCodes", () => {
    it("should return 8 codes by default", () => {
      const codes = generateRecoveryCodes();
      expect(codes).toHaveLength(8);
    });

    it("should return codes in XXXX-XXXX format", () => {
      const codes = generateRecoveryCodes();
      for (const code of codes) {
        expect(code).toMatch(/^[A-F0-9]{4}-[A-F0-9]{4}$/);
      }
    });

    it("should respect the count parameter", () => {
      const codes = generateRecoveryCodes(4);
      expect(codes).toHaveLength(4);
    });

    it("should generate unique codes", () => {
      const codes = generateRecoveryCodes(8);
      const unique = new Set(codes);
      expect(unique.size).toBe(8);
    });
  });

  describe("isMfaConfigured", () => {
    it("should return false when STACKSOS_MFA_SECRET is empty", () => {
      process.env.STACKSOS_MFA_SECRET = "";
      expect(isMfaConfigured()).toBe(false);
    });

    it("should return false when STACKSOS_MFA_SECRET is too short", () => {
      process.env.STACKSOS_MFA_SECRET = "short";
      expect(isMfaConfigured()).toBe(false);
    });

    it("should return true when STACKSOS_MFA_SECRET is 32+ chars", () => {
      process.env.STACKSOS_MFA_SECRET = "0123456789abcdef0123456789abcdef";
      expect(isMfaConfigured()).toBe(true);
    });
  });

  describe("isMfaEnabled", () => {
    it("should return false when STACKSOS_MFA_ENABLED is not 'true'", () => {
      process.env.STACKSOS_MFA_SECRET = "0123456789abcdef0123456789abcdef";
      process.env.STACKSOS_MFA_ENABLED = "false";
      expect(isMfaEnabled()).toBe(false);
    });

    it("should return false when STACKSOS_MFA_ENABLED is undefined", () => {
      process.env.STACKSOS_MFA_SECRET = "0123456789abcdef0123456789abcdef";
      delete process.env.STACKSOS_MFA_ENABLED;
      expect(isMfaEnabled()).toBe(false);
    });

    it("should return false when configured but MFA_SECRET is too short", () => {
      process.env.STACKSOS_MFA_SECRET = "short";
      process.env.STACKSOS_MFA_ENABLED = "true";
      expect(isMfaEnabled()).toBe(false);
    });

    it("should return true when properly configured and enabled", () => {
      process.env.STACKSOS_MFA_SECRET = "0123456789abcdef0123456789abcdef";
      process.env.STACKSOS_MFA_ENABLED = "true";
      expect(isMfaEnabled()).toBe(true);
    });
  });
});
