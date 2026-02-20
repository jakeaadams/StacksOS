import crypto from "crypto";
import { logger } from "@/lib/logger";
import { query } from "./evergreen";
import { ensureLibrarySchemaExists } from "./library-schema";

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
