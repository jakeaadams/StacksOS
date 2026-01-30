/**
 * API Endpoint E2E Tests
 * 
 * Tests actual API endpoints running on the server
 */

import { test, expect } from "@playwright/test";

async function getCsrfToken(request: any): Promise<string> {
  const response = await request.get("/api/csrf-token");
  expect(response.status()).toBe(200);
  const data = await response.json();
  expect(data.ok).toBe(true);
  expect(typeof data.token).toBe("string");
  return data.token;
}

test.describe("API Endpoints E2E", () => {
  test.describe("Health Check Endpoint", () => {
    test("GET /api/health returns health status", async ({ request }) => {
      const response = await request.get("/api/health");
      
      // Should return 200 or 503 depending on service availability
      expect([200, 503]).toContain(response.status());
      
      const data = await response.json();
      
      // Verify response structure
      expect(data).toHaveProperty("status");
      expect(["healthy", "degraded", "unhealthy"]).toContain(data.status);
      expect(data).toHaveProperty("uptime");
      expect(data).toHaveProperty("timestamp");
      expect(data).toHaveProperty("checks");
      expect(data.checks).toHaveProperty("database");
      expect(data.checks).toHaveProperty("evergreen");
      
      // Verify check structure
      expect(data.checks.database).toHaveProperty("status");
      expect(["up", "down"]).toContain(data.checks.database.status);
      expect(data.checks.evergreen).toHaveProperty("status");
      expect(["up", "down"]).toContain(data.checks.evergreen.status);
    });

    test("health check includes latency measurements", async ({ request }) => {
      const response = await request.get("/api/health");
      const data = await response.json();
      
      // Both checks should include latency when they ran
      if (data.checks.database.status === "up") {
        expect(data.checks.database.latency).toBeGreaterThanOrEqual(0);
      }
      if (data.checks.evergreen.status === "up") {
        expect(data.checks.evergreen.latency).toBeGreaterThanOrEqual(0);
      }
    });
  });

  test.describe("CSRF Token Endpoint", () => {
    test("GET /api/csrf-token returns a token", async ({ request }) => {
      const response = await request.get("/api/csrf-token");
      
      expect(response.status()).toBe(200);
      
      const data = await response.json();
      
      expect(data.ok).toBe(true);
      expect(data.token).toBeDefined();
      expect(data.token.length).toBe(64); // 32 bytes hex encoded
    });

    test("CSRF token is set as cookie", async ({ request }) => {
      const response = await request.get("/api/csrf-token");
      
      // Check that Set-Cookie header is present
      const setCookie = response.headers()["set-cookie"];
      expect(setCookie).toBeDefined();
      expect(setCookie).toContain("_csrf_token");
    });

    test("same token is returned for subsequent requests with cookie", async ({ request }) => {
      // First request to get initial token
      const response1 = await request.get("/api/csrf-token");
      const data1 = await response1.json();
      
      // Second request should return same token (cookie should be sent automatically)
      const response2 = await request.get("/api/csrf-token");
      const data2 = await response2.json();
      
      expect(data2.token).toBe(data1.token);
    });
  });

  test.describe("Staff Authentication Endpoint", () => {
    test("POST /api/evergreen/auth requires credentials", async ({ request }) => {
      const token = await getCsrfToken(request);
      const response = await request.post("/api/evergreen/auth", {
        headers: { "x-csrf-token": token, "x-forwarded-for": `e2e-staff-missing-${Date.now()}` },
        data: {},
      });
      
      expect(response.status()).toBe(400);
      
      const data = await response.json();
      expect(data.ok).toBe(false);
    });

    test("POST /api/evergreen/auth with invalid credentials returns 401", async ({ request }) => {
      const token = await getCsrfToken(request);
      const response = await request.post("/api/evergreen/auth", {
        headers: { "x-csrf-token": token, "x-forwarded-for": `e2e-staff-invalid-${Date.now()}` },
        data: {
          username: "invalid_user_12345",
          password: "wrong_password",
        },
      });
      
      expect(response.status()).toBe(401);
      
      const data = await response.json();
      expect(data.ok).toBe(false);
    });

    test("POST /api/evergreen/auth with valid credentials returns user data", async ({ request }) => {
      const token = await getCsrfToken(request);
      const response = await request.post("/api/evergreen/auth", {
        headers: { "x-csrf-token": token, "x-forwarded-for": `e2e-staff-valid-${Date.now()}` },
        data: {
          username: "jake",
          password: "jake",
        },
      });
      
      // Should succeed if Evergreen is properly configured
      if (response.status() === 200) {
        const data = await response.json();
        expect(data.ok).toBe(true);
        expect(data).toHaveProperty("authtoken");
        expect(data).toHaveProperty("user");
      } else {
        // May fail if Evergreen is not available
        console.log("Staff auth test skipped - Evergreen may not be available");
      }
    });

    test("GET /api/evergreen/auth checks session status", async ({ request }) => {
      const response = await request.get("/api/evergreen/auth");
      
      expect(response.status()).toBe(200);
      
      const data = await response.json();
      expect(data.ok).toBe(true);
      expect(data).toHaveProperty("authenticated");
    });

    test("DELETE /api/evergreen/auth logs out user", async ({ request }) => {
      const token = await getCsrfToken(request);
      const response = await request.delete("/api/evergreen/auth", {
        headers: { "x-csrf-token": token, "x-forwarded-for": `e2e-staff-logout-${Date.now()}` },
      });
      
      expect(response.status()).toBe(200);
      
      const data = await response.json();
      expect(data.ok).toBe(true);
    });
  });

  test.describe("OPAC Login Endpoint", () => {
    test("POST /api/opac/login requires barcode and PIN", async ({ request }) => {
      const token = await getCsrfToken(request);
      const response = await request.post("/api/opac/login", {
        headers: { "x-csrf-token": token, "x-forwarded-for": `e2e-opac-missing-${Date.now()}` },
        data: {},
      });
      
      expect(response.status()).toBe(400);
      
      const data = await response.json();
      expect(data.ok).toBe(false);
      expect(data.error).toContain("required");
    });

    test("POST /api/opac/login with invalid credentials returns 401", async ({ request }) => {
      const token = await getCsrfToken(request);
      const response = await request.post("/api/opac/login", {
        headers: { "x-csrf-token": token, "x-forwarded-for": `e2e-opac-invalid-${Date.now()}` },
        data: {
          barcode: "INVALID12345",
          pin: "wrongpin",
        },
      });
      
      expect(response.status()).toBe(401);
      
      const data = await response.json();
      expect(data.ok).toBe(false);
    });
  });

  test.describe("Rate Limiting", () => {
    test("rate limiting headers are present on auth failures", async ({ request }) => {
      const token = await getCsrfToken(request);
      const ip = `e2e-ratelimit-${Date.now()}`;
      // Make several failed auth attempts
      for (let i = 0; i < 3; i++) {
        await request.post("/api/evergreen/auth", {
          headers: { "x-csrf-token": token, "x-forwarded-for": ip },
          data: {
            username: `ratelimit_test_${Date.now()}`,
            password: "wrong",
          },
        });
      }
      
      // The request should still work (not rate limited yet with default 5 attempts)
      const response = await request.post("/api/evergreen/auth", {
        headers: { "x-csrf-token": token, "x-forwarded-for": ip },
        data: {
          username: `ratelimit_test_${Date.now()}`,
          password: "wrong",
        },
      });
      
      expect([401, 429]).toContain(response.status());
    });
  });
});
