import "server-only";

/**
 * StacksOS Structured Logger
 *
 * Goals:
 * - JSON lines for easy ingestion (Loki/ELK/CloudWatch/etc.)
 * - Redact secrets by default
 * - Allow per-request context via child loggers
 *
 * Note: We intentionally avoid console.* in server code. This logger writes
 * directly to stdout/stderr.
 */

export type LogLevel = "debug" | "info" | "warn" | "error";

const LEVELS: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

function resolveMinLevel(): number {
  const raw = String(process.env.STACKSOS_LOG_LEVEL || "").toLowerCase() as LogLevel;
  if (raw && raw in LEVELS) return LEVELS[raw];
  // Keep unit test output clean by default. Override with STACKSOS_LOG_LEVEL.
  if (process.env.VITEST || process.env.NODE_ENV === "test") return LEVELS.error;
  return process.env.NODE_ENV === "production" ? LEVELS.info : LEVELS.debug;
}

const MIN_LEVEL = resolveMinLevel();

const REDACT_KEYS = new Set([
  "password",
  "passwd",
  "pin",
  "secret",
  "token",
  "authtoken",
  "authorization",
  "cookie",
  "set-cookie",
  "session",
]);

function scrub(value: unknown, depth = 0): unknown {
  if (depth > 6) return "[redacted-depth]";
  if (value === null || value === undefined) return value;
  if (typeof value !== "object") return value;

  if (Array.isArray(value)) {
    return value.map((item) => scrub(item, depth + 1));
  }

  const output: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
    if (REDACT_KEYS.has(key.toLowerCase())) {
      output[key] = "[redacted]";
      continue;
    }
    output[key] = scrub(val, depth + 1);
  }
  return output;
}

function safeJson(obj: unknown): string {
  try {
    return JSON.stringify(obj);
  } catch {
    // Last-ditch fallback.
    return JSON.stringify({ msg: "[unserializable]" });
  }
}

function writeLine(level: LogLevel, record: Record<string, unknown>): void {
  const line = safeJson(record) + "\n";

  // stderr for warn/error so logs can be split by stream.
  if (level === "warn" || level === "error") {
    process.stderr.write(line);
    return;
  }
  process.stdout.write(line);
}

export type LogMeta = Record<string, unknown> & {
  requestId?: string | null;
  route?: string;
  component?: string;
  actor?: { id?: number; username?: string };
  orgId?: number;
};

export interface Logger {
  child: (meta: LogMeta) => Logger;
  debug: (meta: LogMeta, msg: string) => void;
  info: (meta: LogMeta, msg: string) => void;
  warn: (meta: LogMeta, msg: string) => void;
  error: (meta: LogMeta, msg: string) => void;
}

function shouldLog(level: LogLevel): boolean {
  return (LEVELS[level] || 0) >= MIN_LEVEL;
}

function createLogger(baseMeta: LogMeta = {}): Logger {
  const base = scrub(baseMeta) as LogMeta;

  const log = (level: LogLevel, meta: LogMeta, msg: string) => {
    if (!shouldLog(level)) return;

    const record: Record<string, unknown> = {
      ts: new Date().toISOString(),
      level,
      msg,
      ...base,
      ...(scrub(meta) as LogMeta),
    };

    writeLine(level, record);
  };

  return {
    child: (meta: LogMeta) => createLogger({ ...base, ...(scrub(meta) as LogMeta) }),
    debug: (meta: LogMeta, msg: string) => log("debug", meta, msg),
    info: (meta: LogMeta, msg: string) => log("info", meta, msg),
    warn: (meta: LogMeta, msg: string) => log("warn", meta, msg),
    error: (meta: LogMeta, msg: string) => log("error", meta, msg),
  };
}

export const logger = createLogger({ component: "stacksos" });
