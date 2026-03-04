/**
 * Client-side logger.
 *
 * In production we avoid writing to the browser console for debug/info.
 * Errors and warnings are forwarded to `/api/client-errors` for server-side
 * ingestion (fire-and-forget, deduplicated by message within 60s).
 */

function isProd(): boolean {
  return process.env.NODE_ENV === "production";
}

/** Simple dedup cache — skip sending the same error within 60 seconds. */
const _recentlySent = new Map<string, number>();

function shouldSend(message: string): boolean {
  if (typeof window === "undefined") return false;

  const now = Date.now();
  const lastSent = _recentlySent.get(message);
  if (lastSent && now - lastSent < 60_000) return false;

  _recentlySent.set(message, now);

  // Prune old entries to avoid memory leaks
  if (_recentlySent.size > 50) {
    for (const [key, ts] of _recentlySent) {
      if (now - ts > 60_000) _recentlySent.delete(key);
    }
  }

  return true;
}

function sendToServer(level: "error" | "warn", args: unknown[]): void {
  try {
    const message = args
      .map((a) => (a instanceof Error ? a.message : typeof a === "string" ? a : JSON.stringify(a)))
      .join(" ");

    if (!shouldSend(message)) return;

    const stack = args.find((a): a is Error => a instanceof Error)?.stack;
    const url = typeof window !== "undefined" ? window.location.href : undefined;

    fetch("/api/client-errors", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        level,
        message: message.slice(0, 2000),
        stack: stack?.slice(0, 4000),
        url,
      }),
    }).catch(() => {
      // Fire-and-forget — silently ignore network failures
    });
  } catch {
    // Never let logging break the app
  }
}

export const clientLogger = {
  debug: (...args: unknown[]) => {
    if (isProd()) return;
    console.debug(...args);
  },
  info: (...args: unknown[]) => {
    if (isProd()) return;
    console.info(...args);
  },
  warn: (...args: unknown[]) => {
    console.warn(...args);
    if (isProd()) sendToServer("warn", args);
  },
  error: (...args: unknown[]) => {
    console.error(...args);
    if (isProd()) sendToServer("error", args);
  },
};
