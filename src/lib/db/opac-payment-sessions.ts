/**
 * OPAC payment session storage.
 *
 * StacksOS owns this table so provider-specific browser flows can complete
 * cleanly without writing transient checkout state into Evergreen core tables.
 */

import { randomUUID } from "node:crypto";

import { logger } from "@/lib/logger";
import { query, querySingle } from "@/lib/db/evergreen";
import { ensureLibrarySchemaExists } from "./library-schema";

let paymentSessionTablesInitialized = false;

export type OpacPaymentSessionRow = {
  id: string;
  provider: string;
  patron_id: number | string;
  amount_cents: number | string;
  currency: string;
  fine_ids: Array<number | string> | null;
  description: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  expires_at: string;
  consumed_at: string | null;
  provider_payment_id: string | null;
};

export interface OpacPaymentSession {
  id: string;
  provider: string;
  patronId: number;
  amountCents: number;
  currency: string;
  fineIds: number[];
  description: string;
  metadata: Record<string, unknown>;
  createdAt: string;
  expiresAt: string;
  consumedAt: string | null;
  providerPaymentId: string | null;
}

function mapSessionRow(row: OpacPaymentSessionRow): OpacPaymentSession {
  return {
    id: row.id,
    provider: row.provider,
    patronId: Number(row.patron_id),
    amountCents: Number(row.amount_cents),
    currency: row.currency,
    fineIds: (row.fine_ids || []).map((value) => Number(value)).filter((value) => value > 0),
    description: row.description || "",
    metadata: row.metadata || {},
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    consumedAt: row.consumed_at,
    providerPaymentId: row.provider_payment_id,
  };
}

export async function ensureOpacPaymentSessionTables(): Promise<void> {
  if (paymentSessionTablesInitialized) return;

  await ensureLibrarySchemaExists();

  await query(`
    CREATE TABLE IF NOT EXISTS library.opac_payment_sessions (
      id TEXT PRIMARY KEY,
      provider TEXT NOT NULL CHECK (provider IN ('square')),
      patron_id INTEGER NOT NULL,
      amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
      currency TEXT NOT NULL,
      fine_ids INTEGER[] NOT NULL DEFAULT '{}',
      description TEXT NOT NULL DEFAULT '',
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      expires_at TIMESTAMPTZ NOT NULL,
      consumed_at TIMESTAMPTZ,
      provider_payment_id TEXT
    )
  `);

  await query(`
    CREATE INDEX IF NOT EXISTS idx_opac_payment_sessions_patron_active
    ON library.opac_payment_sessions (patron_id, provider, expires_at)
    WHERE consumed_at IS NULL
  `);

  paymentSessionTablesInitialized = true;
  logger.debug({ component: "payments" }, "OPAC payment session tables ensured");
}

export async function createOpacPaymentSession(params: {
  provider: "square";
  patronId: number;
  amountCents: number;
  currency: string;
  fineIds: number[];
  description: string;
  metadata?: Record<string, unknown>;
  expiresInMinutes?: number;
}): Promise<OpacPaymentSession> {
  await ensureOpacPaymentSessionTables();

  const id = randomUUID();
  const expiresInMinutes = Math.max(5, Math.min(params.expiresInMinutes ?? 30, 120));

  const row = await querySingle<OpacPaymentSessionRow>(
    `INSERT INTO library.opac_payment_sessions (
       id,
       provider,
       patron_id,
       amount_cents,
       currency,
       fine_ids,
       description,
       metadata,
       expires_at
     )
     VALUES (
       $1,
       $2,
       $3,
       $4,
       $5,
       $6::integer[],
       $7,
       $8::jsonb,
       NOW() + ($9::integer * INTERVAL '1 minute')
     )
     RETURNING *`,
    [
      id,
      params.provider,
      params.patronId,
      params.amountCents,
      params.currency.toLowerCase(),
      params.fineIds,
      params.description,
      JSON.stringify(params.metadata || {}),
      expiresInMinutes,
    ]
  );

  if (!row) {
    throw new Error("Failed to create payment session");
  }

  return mapSessionRow(row);
}

export async function getActiveOpacPaymentSession(
  sessionId: string,
  patronId: number,
  provider: "square"
): Promise<OpacPaymentSession | null> {
  await ensureOpacPaymentSessionTables();

  const row = await querySingle<OpacPaymentSessionRow>(
    `SELECT *
     FROM library.opac_payment_sessions
     WHERE id = $1
       AND patron_id = $2
       AND provider = $3
       AND consumed_at IS NULL
       AND expires_at > NOW()`,
    [sessionId, patronId, provider]
  );

  return row ? mapSessionRow(row) : null;
}

export async function markOpacPaymentSessionConsumed(params: {
  sessionId: string;
  providerPaymentId?: string;
}): Promise<void> {
  await ensureOpacPaymentSessionTables();

  await query(
    `UPDATE library.opac_payment_sessions
     SET consumed_at = NOW(),
         provider_payment_id = COALESCE($2, provider_payment_id)
     WHERE id = $1
       AND consumed_at IS NULL`,
    [params.sessionId, params.providerPaymentId || null]
  );
}
