import { logger } from "@/lib/logger";
import { querySingle, query } from "@/lib/db/evergreen";
import type { AiCompletion, AiConfig } from "./types";
import { ensureLibrarySchemaExists } from "@/lib/db/library-schema";

let aiTelemetryInitialized = false;

async function ensureAiTelemetryTables(): Promise<void> {
  if (aiTelemetryInitialized) return;
  await ensureLibrarySchemaExists();
  await query(`
    CREATE TABLE IF NOT EXISTS library.ai_calls (
      id SERIAL PRIMARY KEY,
      created_at TIMESTAMP DEFAULT NOW(),
      type TEXT,
      request_id TEXT,
      actor_id INTEGER,
      provider TEXT,
      model TEXT,
      prompt_hash TEXT,
      prompt_template TEXT,
      prompt_version INTEGER,
      latency_ms INTEGER,
      input_tokens INTEGER,
      output_tokens INTEGER,
      total_tokens INTEGER,
      cost_usd NUMERIC,
      ip TEXT,
      user_agent TEXT
    )
  `);
  await query(`ALTER TABLE library.ai_calls ADD COLUMN IF NOT EXISTS prompt_template TEXT`);
  await query(`ALTER TABLE library.ai_calls ADD COLUMN IF NOT EXISTS prompt_version INTEGER`);
  await query(`CREATE INDEX IF NOT EXISTS idx_ai_calls_created_at ON library.ai_calls(created_at DESC)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_ai_calls_type_created_at ON library.ai_calls(type, created_at DESC)`);
  aiTelemetryInitialized = true;
  logger.info({}, "AI telemetry tables initialized");
}

export async function enforceAiBudgets(args: {
  config: AiConfig;
  callType: string;
}): Promise<void> {
  // Unit tests and the mock provider should not require a DB connection.
  if (process.env.VITEST || process.env.NODE_ENV === "test" || args.config.provider === "mock") {
    return;
  }

  try {
    await ensureAiTelemetryTables();
  } catch (error) {
    logger.warn({ err: String(error) }, "AI budget enforcement disabled (DB unavailable)");
    return;
  }

  const maxCalls = args.config.budgets?.maxCallsPerHour || 0;
  const maxUsd = args.config.budgets?.maxUsdPerDay || 0;
  if (!maxCalls && !maxUsd) return;

  let row;
  try {
    row = await querySingle<{
      calls_last_hour: number;
      cost_last_day: number;
    }>(
      `
        SELECT
          (SELECT COUNT(*)::int FROM library.ai_calls WHERE created_at > (NOW() - interval '1 hour')) as calls_last_hour,
          (SELECT COALESCE(SUM(cost_usd),0)::float FROM library.ai_calls WHERE created_at > (NOW() - interval '1 day')) as cost_last_day
      `
    );
  } catch (error) {
    logger.warn({ err: String(error) }, "AI budget enforcement skipped (query failed)");
    return;
  }

  const callsLastHour = Number(row?.calls_last_hour || 0) || 0;
  const costLastDay = Number(row?.cost_last_day || 0) || 0;

  if (maxCalls && callsLastHour >= maxCalls) {
    throw new Error(`AI budget exceeded (calls/hour). Please try again later.`);
  }
  if (maxUsd && costLastDay >= maxUsd) {
    throw new Error(`AI budget exceeded (daily spend). Please try again later.`);
  }
}

function estimateCostUsd(_completion: AiCompletion): number | null {
  // Cost estimation is intentionally conservative. Many providers/models vary and
  // pricing can change; for pilots we rely on call-count budgets by default.
  return null;
}

export async function recordAiCall(args: {
  callType: string;
  requestId?: string;
  actorId?: number | null;
  promptHash?: string;
  promptTemplateId?: string | null;
  promptVersion?: number | null;
  completion: AiCompletion;
  latencyMs: number;
  ip?: string | null;
  userAgent?: string | null;
}): Promise<void> {
  // Unit tests and the mock provider should not require a DB connection.
  if (process.env.VITEST || process.env.NODE_ENV === "test" || args.completion.provider === "mock") {
    return;
  }

  try {
    await ensureAiTelemetryTables();
  } catch (error) {
    logger.warn({ err: String(error) }, "AI telemetry skipped (DB unavailable)");
    return;
  }
  const usage = args.completion.usage || {};
  const costUsd = estimateCostUsd(args.completion);

  await query(
    `
      INSERT INTO library.ai_calls (
        type, request_id, actor_id, provider, model, prompt_hash, prompt_template, prompt_version,
        latency_ms, input_tokens, output_tokens, total_tokens, cost_usd,
        ip, user_agent
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
    `,
    [
      args.callType,
      args.requestId || null,
      args.actorId || null,
      args.completion.provider,
      args.completion.model || null,
      args.promptHash || null,
      args.promptTemplateId || null,
      typeof args.promptVersion === "number" ? args.promptVersion : null,
      Math.max(0, Math.round(args.latencyMs)),
      usage.inputTokens ?? null,
      usage.outputTokens ?? null,
      usage.totalTokens ?? null,
      costUsd,
      args.ip || null,
      args.userAgent || null,
    ]
  );
}
