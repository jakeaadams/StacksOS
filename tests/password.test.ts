/**
 * Password Utilities Unit Tests
 *
 * Tests MD5 password hashing for Evergreen ILS compatibility.
 */

import { describe, it, expect } from "vitest";
import { hashPassword, hashPasswordFromDigest, passwordDigest } from "@/lib/password";
import * as crypto from "crypto";

describe("Password Utilities", () => {
  describe("hashPassword", () => {
    it("should return a 32-character hex string (MD5)", () => {
      const result = hashPassword("password", "someseed");
      expect(result).toMatch(/^[0-9a-f]{32}$/);
    });

    it("should produce consistent results for the same input", () => {
      const result1 = hashPassword("testpass", "seed123");
      const result2 = hashPassword("testpass", "seed123");
      expect(result1).toBe(result2);
    });

    it("should produce different results for different passwords", () => {
      const result1 = hashPassword("password1", "seed");
      const result2 = hashPassword("password2", "seed");
      expect(result1).not.toBe(result2);
    });

    it("should produce different results for different seeds", () => {
      const result1 = hashPassword("password", "seed1");
      const result2 = hashPassword("password", "seed2");
      expect(result1).not.toBe(result2);
    });

    it("should match the Evergreen hash formula: md5(seed + md5(password))", () => {
      const password = "librarypass";
      const seed = "abc123";

      // Manual computation
      const passwordMd5 = crypto.createHash("md5").update(password).digest("hex");
      const expected = crypto
        .createHash("md5")
        .update(seed + passwordMd5)
        .digest("hex");

      const result = hashPassword(password, seed);
      expect(result).toBe(expected);
    });

    it("should handle empty password", () => {
      const result = hashPassword("", "seed");
      expect(result).toMatch(/^[0-9a-f]{32}$/);
    });

    it("should handle empty seed", () => {
      const result = hashPassword("password", "");
      expect(result).toMatch(/^[0-9a-f]{32}$/);
    });

    it("should handle unicode characters", () => {
      const result = hashPassword("pässwörd", "seed");
      expect(result).toMatch(/^[0-9a-f]{32}$/);
    });
  });

  describe("passwordDigest", () => {
    it("should generate md5 digest for a password", () => {
      const digest = passwordDigest("librarypass");
      expect(digest).toMatch(/^[0-9a-f]{32}$/);
      expect(digest).toBe(crypto.createHash("md5").update("librarypass").digest("hex"));
    });
  });

  describe("hashPasswordFromDigest", () => {
    it("should match hashPassword when using derived digest", () => {
      const password = "stacksos-pin";
      const seed = "evergreen-seed";
      const digest = passwordDigest(password);
      expect(hashPasswordFromDigest(seed, digest)).toBe(hashPassword(password, seed));
    });
  });
});
