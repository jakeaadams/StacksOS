/**
 * One-time credential store for generated patron passwords.
 *
 * When a patron is created with an auto-generated password, the password is
 * stored here (keyed by a random token) instead of being sent in the API
 * response body.  The client receives only the token and must call the
 * retrieval endpoint to read the password exactly once — after which the
 * entry is deleted.
 *
 * Entries auto-expire after CREDENTIAL_TTL_MS (default 5 minutes) to avoid
 * leaking memory if the client never retrieves them.
 */

import { randomUUID } from "node:crypto";

const CREDENTIAL_TTL_MS = 5 * 60 * 1000; // 5 minutes

interface StoredCredential {
  password: string;
  createdAt: number;
  timer: ReturnType<typeof setTimeout>;
}

const store = new Map<string, StoredCredential>();

/**
 * Store a generated password and return a one-time retrieval token.
 */
export function storeCredential(password: string): string {
  const token = randomUUID();
  const timer = setTimeout(() => {
    store.delete(token);
  }, CREDENTIAL_TTL_MS);

  // Prevent the timer from keeping the Node process alive in tests / dev
  if (typeof timer.unref === "function") timer.unref();

  store.set(token, { password, createdAt: Date.now(), timer });
  return token;
}

/**
 * Retrieve (and permanently delete) a stored credential by token.
 * Returns the password string, or null if the token is invalid / expired.
 */
export function consumeCredential(token: string): string | null {
  const entry = store.get(token);
  if (!entry) return null;

  clearTimeout(entry.timer);
  store.delete(token);
  return entry.password;
}
