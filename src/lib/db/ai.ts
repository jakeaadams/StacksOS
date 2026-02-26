import crypto from "crypto";
import { logger } from "@/lib/logger";
import { query, querySingle } from "./evergreen";
import { ensureLibrarySchemaExists } from "./library-schema";

export type AiDraftRow = {
  id: string;
  type: string;
  request_id: string | null;
  actor_id: number | null;
  provider: string | null;
  model: string | null;
  prompt_hash: string | null;
  prompt_template: string | null;
  prompt_version: number | null;
  input_redacted: unknown;
  output: unknown;
  created_at: string;
  decided_at: string | null;
  decision: string | null;
  decision_reason: string | null;
  decided_by: number | null;
  ip: string | null;
  user_agent: string | null;
};

export type AiDraftDecisionRow = {
  id: number;
  draft_id: string;
  suggestion_id: string | null;
  decision: string;
  reason: string | null;
  decided_at: string;
  decided_by: number | null;
};

let aiTablesInitialized = false;

async function ensureAiTables(): Promise<void> {
  if (aiTablesInitialized) return;

  await ensureLibrarySchemaExists();

  await query(`
    CREATE TABLE IF NOT EXISTS library.ai_drafts (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      request_id TEXT,
      actor_id INTEGER,
      provider TEXT,
      model TEXT,
      prompt_hash TEXT,
      prompt_template TEXT,
      prompt_version INTEGER,
      system_hash TEXT,
      user_hash TEXT,
      input_redacted JSONB,
      output JSONB,
      created_at TIMESTAMP DEFAULT NOW(),
      decided_at TIMESTAMP,
      decision TEXT,
      decision_reason TEXT,
      decided_by INTEGER,
      ip TEXT,
      user_agent TEXT,
      updated_at TIMESTAMP DEFAULT NOW()
    )
  `);

  // Backfill columns on older DBs.
  await query(`ALTER TABLE library.ai_drafts ADD COLUMN IF NOT EXISTS decision_reason TEXT`);
  await query(`ALTER TABLE library.ai_drafts ADD COLUMN IF NOT EXISTS prompt_template TEXT`);
  await query(`ALTER TABLE library.ai_drafts ADD COLUMN IF NOT EXISTS prompt_version INTEGER`);
  await query(
    `ALTER TABLE library.ai_drafts ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW()`
  );

  await query(`
    CREATE TABLE IF NOT EXISTS library.ai_draft_decisions (
      id SERIAL PRIMARY KEY,
      draft_id TEXT NOT NULL references library.ai_drafts(id) on delete cascade,
      suggestion_id TEXT,
      decision TEXT NOT NULL,
      reason TEXT,
      decided_at TIMESTAMP DEFAULT NOW(),
      decided_by INTEGER,
      UNIQUE(draft_id, suggestion_id)
    )
  `);

  await query(`
    CREATE INDEX IF NOT EXISTS idx_ai_drafts_type_created
    ON library.ai_drafts(type, created_at DESC)
  `);

  aiTablesInitialized = true;
  logger.info({}, "AI tables initialized");
}

export async function createAiDraft(args: {
  type: string;
  requestId?: string;
  actorId?: number;
  provider?: string;
  model?: string;
  promptHash: string;
  promptTemplateId?: string | null;
  promptVersion?: number | null;
  systemHash: string;
  userHash: string;
  inputRedacted: unknown;
  output: unknown;
  ip?: string | null;
  userAgent?: string | null;
}): Promise<string> {
  await ensureAiTables();
  const id = crypto.randomUUID();

  await query(
    `
      INSERT INTO library.ai_drafts (
        id, type, request_id, actor_id, provider, model,
        prompt_hash, prompt_template, prompt_version, system_hash, user_hash, input_redacted, output,
        ip, user_agent
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
    `,
    [
      id,
      args.type,
      args.requestId || null,
      args.actorId || null,
      args.provider || null,
      args.model || null,
      args.promptHash,
      args.promptTemplateId || null,
      typeof args.promptVersion === "number" ? args.promptVersion : null,
      args.systemHash,
      args.userHash,
      args.inputRedacted ?? null,
      args.output ?? null,
      args.ip || null,
      args.userAgent || null,
    ]
  );

  return id;
}

export async function decideAiDraft(args: {
  id: string;
  decision: "accepted" | "rejected";
  decidedBy?: number;
  reason?: string | null;
  suggestionId?: string | null;
}): Promise<void> {
  await ensureAiTables();
  const reason = args.reason ? String(args.reason).slice(0, 500) : null;
  const suggestionId = args.suggestionId ? String(args.suggestionId).slice(0, 200) : null;

  if (suggestionId) {
    await query(
      `
        INSERT INTO library.ai_draft_decisions (draft_id, suggestion_id, decision, reason, decided_by)
        VALUES ($1,$2,$3,$4,$5)
        ON CONFLICT (draft_id, suggestion_id)
        DO UPDATE SET decision = excluded.decision, reason = excluded.reason, decided_by = excluded.decided_by, decided_at = NOW()
      `,
      [args.id, suggestionId, args.decision, reason, args.decidedBy || null]
    );
  } else {
    await query(
      `
        INSERT INTO library.ai_draft_decisions (draft_id, suggestion_id, decision, reason, decided_by)
        VALUES ($1, '', $2, $3, $4)
        ON CONFLICT (draft_id, suggestion_id)
        DO UPDATE SET decision = excluded.decision, reason = excluded.reason, decided_by = excluded.decided_by, decided_at = NOW()
      `,
      [args.id, args.decision, reason, args.decidedBy || null]
    );
  }

  await query(
    `
      UPDATE library.ai_drafts
      SET decision = $2,
          decided_at = NOW(),
          decided_by = $3,
          decision_reason = $4,
          updated_at = NOW()
      WHERE id = $1
    `,
    [args.id, args.decision, args.decidedBy || null, reason]
  );
}

export async function listAiDrafts(args: {
  type?: string;
  dateFrom?: string;
  dateTo?: string;
  limit?: number;
  offset?: number;
}): Promise<{ drafts: AiDraftRow[]; total: number }> {
  await ensureAiTables();

  const conditions: string[] = [];
  const params: unknown[] = [];
  let paramIndex = 1;

  if (args.type) {
    conditions.push(`d.type = $${paramIndex++}`);
    params.push(args.type);
  }
  if (args.dateFrom) {
    conditions.push(`d.created_at >= $${paramIndex++}::timestamp`);
    params.push(args.dateFrom);
  }
  if (args.dateTo) {
    conditions.push(`d.created_at <= $${paramIndex++}::timestamp`);
    params.push(args.dateTo);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const limit = Math.min(Math.max(args.limit || 50, 1), 200);
  const offset = Math.max(args.offset || 0, 0);

  const countResult = await querySingle<{ count: number }>(
    `SELECT COUNT(*)::int AS count FROM library.ai_drafts d ${whereClause}`,
    params
  );
  const total = countResult?.count || 0;

  const drafts = await query<AiDraftRow>(
    `SELECT d.id, d.type, d.request_id, d.actor_id, d.provider, d.model,
            d.prompt_hash, d.prompt_template, d.prompt_version,
            d.input_redacted, d.output,
            d.created_at, d.decided_at, d.decision, d.decision_reason, d.decided_by,
            d.ip, d.user_agent
     FROM library.ai_drafts d
     ${whereClause}
     ORDER BY d.created_at DESC
     LIMIT $${paramIndex++} OFFSET $${paramIndex++}`,
    [...params, limit, offset]
  );

  return { drafts, total };
}

export async function getAiDraftWithDecisions(
  draftId: string
): Promise<{ draft: AiDraftRow; decisions: AiDraftDecisionRow[] } | null> {
  await ensureAiTables();

  const draft = await querySingle<AiDraftRow>(
    `SELECT id, type, request_id, actor_id, provider, model,
            prompt_hash, prompt_template, prompt_version,
            input_redacted, output,
            created_at, decided_at, decision, decision_reason, decided_by,
            ip, user_agent
     FROM library.ai_drafts
     WHERE id = $1`,
    [draftId]
  );

  if (!draft) return null;

  const decisions = await query<AiDraftDecisionRow>(
    `SELECT id, draft_id, suggestion_id, decision, reason, decided_at, decided_by
     FROM library.ai_draft_decisions
     WHERE draft_id = $1
     ORDER BY decided_at ASC`,
    [draftId]
  );

  return { draft, decisions };
}
