/**
 * Feature Flags Unit Tests
 *
 * Tests feature flag configuration and the AI feature flag.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

describe("Feature Flags", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe("isAiFeatureFlagEnabled", () => {
    it("should return true when NEXT_PUBLIC_STACKSOS_EXPERIMENTAL is 1", async () => {
      process.env.NEXT_PUBLIC_STACKSOS_EXPERIMENTAL = "1";
      const mod = await import("@/lib/ai/config");
      expect(mod.isAiFeatureFlagEnabled()).toBe(true);
    });

    it("should return false when NEXT_PUBLIC_STACKSOS_EXPERIMENTAL is 0", async () => {
      process.env.NEXT_PUBLIC_STACKSOS_EXPERIMENTAL = "0";
      const mod = await import("@/lib/ai/config");
      expect(mod.isAiFeatureFlagEnabled()).toBe(false);
    });

    it("should return false when NEXT_PUBLIC_STACKSOS_EXPERIMENTAL is not set", async () => {
      delete process.env.NEXT_PUBLIC_STACKSOS_EXPERIMENTAL;
      const mod = await import("@/lib/ai/config");
      expect(mod.isAiFeatureFlagEnabled()).toBe(false);
    });

    it("should return false for 'true' (only '1' is accepted)", async () => {
      process.env.NEXT_PUBLIC_STACKSOS_EXPERIMENTAL = "true";
      const mod = await import("@/lib/ai/config");
      expect(mod.isAiFeatureFlagEnabled()).toBe(false);
    });
  });

  describe("featureFlags object", () => {
    it("should have ILL enabled", async () => {
      const { featureFlags } = await import("@/lib/feature-flags");
      expect(featureFlags.ill).toBe(true);
    });

    it("should have OPAC kids enabled", async () => {
      const { featureFlags } = await import("@/lib/feature-flags");
      expect(featureFlags.opacKids).toBe(true);
    });

    it("should have report templates enabled", async () => {
      const { featureFlags } = await import("@/lib/feature-flags");
      expect(featureFlags.reportTemplates).toBe(true);
    });

    it("should have course reserves enabled", async () => {
      const { featureFlags } = await import("@/lib/feature-flags");
      expect(featureFlags.courseReserves).toBe(true);
    });

    it("should have policy editors enabled", async () => {
      const { featureFlags } = await import("@/lib/feature-flags");
      expect(featureFlags.policyEditors).toBe(true);
    });

    it("should have permissions explorer enabled", async () => {
      const { featureFlags } = await import("@/lib/feature-flags");
      expect(featureFlags.permissionsExplorer).toBe(true);
    });

    it("should have AI disabled when EXPERIMENTAL is not 1", async () => {
      delete process.env.NEXT_PUBLIC_STACKSOS_EXPERIMENTAL;
      const { featureFlags } = await import("@/lib/feature-flags");
      expect(featureFlags.ai).toBe(false);
    });

    it("should have AI enabled when EXPERIMENTAL is 1", async () => {
      process.env.NEXT_PUBLIC_STACKSOS_EXPERIMENTAL = "1";
      const { featureFlags } = await import("@/lib/feature-flags");
      expect(featureFlags.ai).toBe(true);
    });
  });
});
