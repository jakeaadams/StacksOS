"use client";

import { clientLogger } from "./client-logger";

/**
 * Client-side fetch helpers with CSRF protection.
 *
 * Goals:
 * - Centralize 401 handling (session expired)
 * - Always include credentials for cookie-based auth
 * - Automatic CSRF token handling for state-changing requests
 */

let lastAuthExpiredAt = 0;
let csrfToken: string | null = null;

function notifyAuthExpired() {
  if (typeof window === "undefined") return;
  const now = Date.now();
  if (now - lastAuthExpiredAt < 5000) return;
  lastAuthExpiredAt = now;
  window.dispatchEvent(new Event("stacksos:auth-expired"));
}

/**
 * Fetch CSRF token from server
 */
async function fetchCSRFToken(): Promise<string> {
  const res = await fetch("/api/csrf-token", {
    credentials: "include",
  });
  
  if (!res.ok) {
    throw new Error("Failed to fetch CSRF token");
  }
  
  const data = await res.json();
  return data.token;
}

/**
 * Get CSRF token (cached or fetch new)
 */
async function getCSRFToken(): Promise<string> {
  if (!csrfToken) {
    csrfToken = await fetchCSRFToken();
  }
  return csrfToken;
}

/**
 * Check if request method requires CSRF protection
 */
function requiresCSRF(method?: string): boolean {
  const upperMethod = (method || "GET").toUpperCase();
  return ["POST", "PUT", "PATCH", "DELETE"].includes(upperMethod);
}

/**
 * Client-side fetch with automatic auth and CSRF handling
 */
export async function fetchWithAuth(url: string, init?: RequestInit): Promise<Response> {
  const headers = new Headers(init?.headers);
  
  // Add CSRF token for state-changing requests
  if (requiresCSRF(init?.method)) {
    try {
      const token = await getCSRFToken();
      headers.set("x-csrf-token", token);
    } catch (error) {
      clientLogger.error("Failed to get CSRF token:", error);
      // Continue without CSRF token - server will reject if needed
    }
  }
  
  const res = await fetch(url, {
    ...init,
    credentials: "include",
    headers,
  });
  
  // Handle 401 (session expired)
  if (res.status === 401) {
    notifyAuthExpired();
  }
  
  // Handle 403 CSRF failure - refresh token and retry once
  if (res.status === 403 && requiresCSRF(init?.method)) {
    try {
      const errorData = await res.clone().json();
      if (errorData.error?.includes("CSRF")) {
        // CSRF token invalid - fetch new one and retry
        csrfToken = await fetchCSRFToken();
        headers.set("x-csrf-token", csrfToken);
        
        return fetch(url, {
          ...init,
          credentials: "include",
          headers,
        });
      }
    } catch {
      // If parsing error fails, just return original response
    }
  }
  
  return res;
}

/**
 * Reset CSRF token (call when needed, e.g., after logout)
 */
export function resetCSRFToken() {
  csrfToken = null;
}

export default fetchWithAuth;
