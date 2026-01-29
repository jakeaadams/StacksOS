"use client";

/**
 * Client-side fetch helpers.
 *
 * Goals:
 * - Centralize 401 handling (session expired) so pages using raw fetch
 *   don't silently fail.
 * - Always include credentials for cookie-based auth
 * - Keep semantics simple: return the Response, let callers decide how to
 *   parse/handle ok:false payloads.
 */

let lastAuthExpiredAt = 0;

function notifyAuthExpired() {
  if (typeof window === "undefined") return;
  const now = Date.now();
  if (now - lastAuthExpiredAt < 5000) return;
  lastAuthExpiredAt = now;
  window.dispatchEvent(new Event("stacksos:auth-expired"));
}

export async function fetchWithAuth(url: string, init?: RequestInit): Promise<Response> {
  const res = await fetch(url, {
    ...init,
    credentials: "include",
  });
  if (res.status === 401) {
    notifyAuthExpired();
  }
  return res;
}

export default fetchWithAuth;
