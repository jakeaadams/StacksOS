/**
 * Environment Validation Unit Tests
 *
 * Tests the Zod-based environment variable validation.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

describe("Environment Validation", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    // Reset modules to get a fresh import each time
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("should pass with all required env vars set", async () => {
    process.env.EVERGREEN_BASE_URL = "https://evergreen.example.com";
    process.env.EVERGREEN_DB_HOST = "db.example.com";
    process.env.EVERGREEN_DB_USER = "stacksos_app";
    process.env.EVERGREEN_DB_PASSWORD = "secret";

    const { validateEnv } = await import("@/lib/env-validation");
    const result = validateEnv();

    expect(result.EVERGREEN_BASE_URL).toBe("https://evergreen.example.com");
    expect(result.EVERGREEN_DB_HOST).toBe("db.example.com");
    expect(result.EVERGREEN_DB_USER).toBe("stacksos_app");
  });

  it("should throw when EVERGREEN_BASE_URL is missing", async () => {
    process.env.EVERGREEN_DB_HOST = "db.example.com";
    process.env.EVERGREEN_DB_USER = "stacksos_app";
    process.env.EVERGREEN_DB_PASSWORD = "secret";
    delete process.env.EVERGREEN_BASE_URL;

    const { validateEnv } = await import("@/lib/env-validation");
    expect(() => validateEnv()).toThrow();
  });

  it("should throw when EVERGREEN_DB_HOST is missing", async () => {
    process.env.EVERGREEN_BASE_URL = "https://evergreen.example.com";
    process.env.EVERGREEN_DB_USER = "stacksos_app";
    process.env.EVERGREEN_DB_PASSWORD = "secret";
    delete process.env.EVERGREEN_DB_HOST;

    const { validateEnv } = await import("@/lib/env-validation");
    expect(() => validateEnv()).toThrow();
  });

  it("should throw when EVERGREEN_DB_PASSWORD is missing", async () => {
    process.env.EVERGREEN_BASE_URL = "https://evergreen.example.com";
    process.env.EVERGREEN_DB_HOST = "db.example.com";
    process.env.EVERGREEN_DB_USER = "stacksos_app";
    delete process.env.EVERGREEN_DB_PASSWORD;

    const { validateEnv } = await import("@/lib/env-validation");
    expect(() => validateEnv()).toThrow();
  });

  it("should default EVERGREEN_DB_PORT to 5432 when not set", async () => {
    process.env.EVERGREEN_BASE_URL = "https://evergreen.example.com";
    process.env.EVERGREEN_DB_HOST = "db.example.com";
    process.env.EVERGREEN_DB_USER = "stacksos_app";
    process.env.EVERGREEN_DB_PASSWORD = "secret";
    delete process.env.EVERGREEN_DB_PORT;

    const { validateEnv } = await import("@/lib/env-validation");
    const result = validateEnv();
    expect(result.EVERGREEN_DB_PORT).toBe(5432);
  });

  it("should parse EVERGREEN_DB_PORT as a number", async () => {
    process.env.EVERGREEN_BASE_URL = "https://evergreen.example.com";
    process.env.EVERGREEN_DB_HOST = "db.example.com";
    process.env.EVERGREEN_DB_USER = "stacksos_app";
    process.env.EVERGREEN_DB_PASSWORD = "secret";
    process.env.EVERGREEN_DB_PORT = "5433";

    const { validateEnv } = await import("@/lib/env-validation");
    const result = validateEnv();
    expect(result.EVERGREEN_DB_PORT).toBe(5433);
  });

  it("should default STACKSOS_RBAC_MODE to strict", async () => {
    process.env.EVERGREEN_BASE_URL = "https://evergreen.example.com";
    process.env.EVERGREEN_DB_HOST = "db.example.com";
    process.env.EVERGREEN_DB_USER = "stacksos_app";
    process.env.EVERGREEN_DB_PASSWORD = "secret";
    delete process.env.STACKSOS_RBAC_MODE;

    const { validateEnv } = await import("@/lib/env-validation");
    const result = validateEnv();
    expect(result.STACKSOS_RBAC_MODE).toBe("strict");
  });
});
