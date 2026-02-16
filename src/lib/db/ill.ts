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
        created_by,
        updated_by
      ) VALUES (
        $1, 'new', $2, $3, $4, $5, $6, $7, $8, $9, $10::date, $11, $12, $12
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
