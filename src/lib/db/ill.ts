import { query, querySingle, withTransaction } from "@/lib/db/evergreen";
import { assertLibrarySchemaExists } from "@/lib/db/library-schema";

export type IllRequestType = "borrow" | "lend";
export type IllRequestStatus =
  | "new"
  | "requested"
  | "in_transit"
  | "received"
  | "completed"
  | "canceled";
export type IllPriority = "low" | "normal" | "high";
export type IllSyncStatus = "manual" | "pending" | "synced" | "failed";

export interface IllRequestRow {
  id: number;
  request_type: IllRequestType;
  status: IllRequestStatus;
  priority: IllPriority;
  patron_id: number | null;
  patron_barcode: string;
  patron_name: string | null;
  title: string;
  author: string | null;
  isbn: string | null;
  source: string | null;
  needed_by: string | null;
  notes: string | null;
  provider: string | null;
  provider_request_id: string | null;
  sync_status: IllSyncStatus;
  sync_error: string | null;
  sync_attempts: number;
  last_synced_at: Date | null;
  requested_at: Date;
  updated_at: Date;
  created_by: number | null;
  updated_by: number | null;
}

let tablesReady = false;

export async function ensureIllTables(): Promise<void> {
  if (tablesReady) return;

  await withTransaction(async (client) => {
    await assertLibrarySchemaExists(client);

    await client.query(`
      CREATE TABLE IF NOT EXISTS library.ill_requests (
        id SERIAL PRIMARY KEY,
        request_type TEXT NOT NULL CHECK (request_type IN ('borrow', 'lend')),
        status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'requested', 'in_transit', 'received', 'completed', 'canceled')),
        priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high')),
        patron_id INTEGER,
        patron_barcode TEXT NOT NULL,
        patron_name TEXT,
        title TEXT NOT NULL,
        author TEXT,
        isbn TEXT,
        source TEXT,
        needed_by DATE,
        notes TEXT,
        provider TEXT,
        provider_request_id TEXT,
        sync_status TEXT NOT NULL DEFAULT 'manual' CHECK (sync_status IN ('manual', 'pending', 'synced', 'failed')),
        sync_error TEXT,
        sync_attempts INTEGER NOT NULL DEFAULT 0,
        last_synced_at TIMESTAMP,
        requested_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
        created_by INTEGER,
        updated_by INTEGER
      )
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_ill_requests_status
      ON library.ill_requests(status, requested_at DESC, id DESC)
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_ill_requests_patron_barcode
      ON library.ill_requests(patron_barcode)
    `);

    // Backfill columns for older databases.
    await client.query(`ALTER TABLE library.ill_requests ADD COLUMN IF NOT EXISTS provider TEXT`);
    await client.query(`ALTER TABLE library.ill_requests ADD COLUMN IF NOT EXISTS provider_request_id TEXT`);
    await client.query(`ALTER TABLE library.ill_requests ADD COLUMN IF NOT EXISTS sync_status TEXT`);
    await client.query(`ALTER TABLE library.ill_requests ADD COLUMN IF NOT EXISTS sync_error TEXT`);
    await client.query(`ALTER TABLE library.ill_requests ADD COLUMN IF NOT EXISTS sync_attempts INTEGER`);
    await client.query(`ALTER TABLE library.ill_requests ADD COLUMN IF NOT EXISTS last_synced_at TIMESTAMP`);
    await client.query(`UPDATE library.ill_requests SET sync_status = 'manual' WHERE sync_status IS NULL`);
    await client.query(`UPDATE library.ill_requests SET sync_attempts = 0 WHERE sync_attempts IS NULL`);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_ill_requests_sync_status
      ON library.ill_requests(sync_status, updated_at DESC, id DESC)
    `);
  });

  tablesReady = true;
}

export async function listIllRequests(args?: {
  status?: IllRequestStatus | null;
  limit?: number;
}): Promise<IllRequestRow[]> {
  await ensureIllTables();
  const limit = Math.min(500, Math.max(1, args?.limit ?? 100));

  const rows = await query<IllRequestRow>(
    `
      SELECT
        id,
        request_type,
        status,
        priority,
        patron_id,
        patron_barcode,
        patron_name,
        title,
        author,
        isbn,
        source,
        needed_by,
        notes,
        provider,
        provider_request_id,
        sync_status,
        sync_error,
        sync_attempts,
        last_synced_at,
        requested_at,
        updated_at,
        created_by,
        updated_by
      FROM library.ill_requests
      WHERE ($1::text IS NULL OR status = $1)
      ORDER BY requested_at DESC, id DESC
      LIMIT $2
    `,
    [args?.status ?? null, limit]
  );

  return rows;
}

export async function createIllRequest(args: {
  requestType: IllRequestType;
  priority?: IllPriority;
  patronId?: number | null;
  patronBarcode: string;
  patronName?: string | null;
  title: string;
  author?: string | null;
  isbn?: string | null;
  source?: string | null;
  neededBy?: string | null;
  notes?: string | null;
  provider?: string | null;
  providerRequestId?: string | null;
  syncStatus?: IllSyncStatus;
  syncError?: string | null;
  syncAttempts?: number;
  lastSyncedAt?: string | null;
  createdBy?: number | null;
}): Promise<{ id: number }> {
  await ensureIllTables();

  const row = await querySingle<{ id: number }>(
    `
      INSERT INTO library.ill_requests (
        request_type,
        status,
        priority,
        patron_id,
        patron_barcode,
        patron_name,
        title,
        author,
        isbn,
        source,
        needed_by,
        notes,
        provider,
        provider_request_id,
        sync_status,
        sync_error,
        sync_attempts,
        last_synced_at,
        created_by,
        updated_by
      ) VALUES (
        $1, 'new', $2, $3, $4, $5, $6, $7, $8, $9, $10::date, $11, $12, $13, $14, $15, $16, $17::timestamp, $18, $18
      )
      RETURNING id
    `,
    [
      args.requestType,
      args.priority ?? "normal",
      args.patronId ?? null,
      args.patronBarcode,
      args.patronName ?? null,
      args.title,
      args.author ?? null,
      args.isbn ?? null,
      args.source ?? null,
      args.neededBy ?? null,
      args.notes ?? null,
      args.provider ?? null,
      args.providerRequestId ?? null,
      args.syncStatus ?? "manual",
      args.syncError ?? null,
      args.syncAttempts ?? 0,
      args.lastSyncedAt ?? null,
      args.createdBy ?? null,
    ]
  );

  if (!row?.id) throw new Error("Failed to create ILL request");
  return row;
}

export async function updateIllRequest(
  id: number,
  args: Partial<{
    status: IllRequestStatus;
    priority: IllPriority;
    source: string | null;
    notes: string | null;
    neededBy: string | null;
    updatedBy: number | null;
  }>
): Promise<boolean> {
  await ensureIllTables();

  const result = await querySingle<{ id: number }>(
    `
      UPDATE library.ill_requests
      SET
        status = COALESCE($2::text, status),
        priority = COALESCE($3::text, priority),
        source = COALESCE($4::text, source),
        notes = COALESCE($5::text, notes),
        needed_by = COALESCE($6::date, needed_by),
        updated_by = COALESCE($7::integer, updated_by),
        updated_at = NOW()
      WHERE id = $1
      RETURNING id
    `,
    [
      id,
      args.status ?? null,
      args.priority ?? null,
      args.source ?? null,
      args.notes ?? null,
      args.neededBy ?? null,
      args.updatedBy ?? null,
    ]
  );

  return Boolean(result?.id);
}

export async function updateIllRequestSync(
  id: number,
  args: {
    syncStatus: IllSyncStatus;
    provider?: string | null;
    providerRequestId?: string | null;
    syncError?: string | null;
    incrementAttempts?: boolean;
    markSyncedAt?: boolean;
    updatedBy?: number | null;
  }
): Promise<boolean> {
  await ensureIllTables();

  const result = await querySingle<{ id: number }>(
    `
      UPDATE library.ill_requests
      SET
        sync_status = $2::text,
        provider = COALESCE($3::text, provider),
        provider_request_id = COALESCE($4::text, provider_request_id),
        sync_error = $5::text,
        sync_attempts = COALESCE(sync_attempts, 0) + CASE WHEN $6 THEN 1 ELSE 0 END,
        last_synced_at = CASE WHEN $7 THEN NOW() ELSE last_synced_at END,
        updated_by = COALESCE($8::integer, updated_by),
        updated_at = NOW()
      WHERE id = $1
      RETURNING id
    `,
    [
      id,
      args.syncStatus,
      args.provider ?? null,
      args.providerRequestId ?? null,
      args.syncError ?? null,
      Boolean(args.incrementAttempts),
      Boolean(args.markSyncedAt),
      args.updatedBy ?? null,
    ]
  );

  return Boolean(result?.id);
}

export async function getIllSyncCounts(): Promise<Record<IllSyncStatus, number>> {
  await ensureIllTables();

  const rows = await query<{ sync_status: string; count: number }>(
    `
      SELECT sync_status, COUNT(*)::int AS count
      FROM library.ill_requests
      GROUP BY sync_status
    `
  );

  const counts: Record<IllSyncStatus, number> = {
    manual: 0,
    pending: 0,
    synced: 0,
    failed: 0,
  };

  for (const row of rows) {
    if (row.sync_status === "manual" || row.sync_status === "pending" || row.sync_status === "synced" || row.sync_status === "failed") {
      counts[row.sync_status] = Number(row.count) || 0;
    }
  }

  return counts;
}
