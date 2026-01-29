/**
 * Client-side logger.
 *
 * In production we avoid writing to the browser console.
 * In development we keep lightweight logging for debugging.
 *
 * Future: send errors to a server-side ingestion endpoint (P1+).
 */

function isProd(): boolean {
  return process.env.NODE_ENV === "production";
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
    if (isProd()) return;
    console.warn(...args);
  },
  error: (...args: unknown[]) => {
    if (isProd()) return;
    console.error(...args);
  },
};
