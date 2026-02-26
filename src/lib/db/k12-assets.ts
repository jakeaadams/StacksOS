import { query, querySingle } from "@/lib/db/evergreen";
import { logger } from "@/lib/logger";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface K12Asset {
  id: number;
  tenantId: string;
  assetTag: string;
  name: string;
  category: string;
  model: string | null;
  serialNumber: string | null;
  status: string;
  condition: string | null;
  conditionNotes: string | null;
  purchaseDate: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface K12AssetAssignment {
  id: number;
  assetId: number;
  studentId: number;
  studentName: string | null;
  assetTag: string | null;
  assetName: string | null;
  assignedAt: string;
  returnedAt: string | null;
  assignedBy: number | null;
  conditionOnReturn: string | null;
  notes: string | null;
}

type AssetRow = {
  id: number;
  tenant_id: string;
  asset_tag: string;
  name: string;
  category: string;
  model: string | null;
  serial_number: string | null;
  status: string;
  condition: string | null;
  condition_notes: string | null;
  purchase_date: string | null;
  created_at: string;
  updated_at: string;
};

type AssignmentRow = {
  id: number;
  asset_id: number;
  student_id: number;
  student_name: string | null;
  asset_tag: string | null;
  asset_name: string | null;
  assigned_at: string;
  returned_at: string | null;
  assigned_by: number | null;
  condition_on_return: string | null;
  notes: string | null;
};

// ---------------------------------------------------------------------------
// Row mappers
// ---------------------------------------------------------------------------

function toAsset(row: AssetRow): K12Asset {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    assetTag: row.asset_tag,
    name: row.name,
    category: row.category,
    model: row.model,
    serialNumber: row.serial_number,
    status: row.status,
    condition: row.condition,
    conditionNotes: row.condition_notes,
    purchaseDate: row.purchase_date,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toAssignment(row: AssignmentRow): K12AssetAssignment {
  return {
    id: row.id,
    assetId: row.asset_id,
    studentId: row.student_id,
    studentName: row.student_name,
    assetTag: row.asset_tag,
    assetName: row.asset_name,
    assignedAt: row.assigned_at,
    returnedAt: row.returned_at,
    assignedBy: row.assigned_by,
    conditionOnReturn: row.condition_on_return,
    notes: row.notes,
  };
}

// ---------------------------------------------------------------------------
// Asset CRUD
// ---------------------------------------------------------------------------

export async function createAsset(args: {
  tenantId?: string;
  assetTag: string;
  name: string;
  category?: string;
  model?: string | null;
  serialNumber?: string | null;
  status?: string;
  condition?: string;
  conditionNotes?: string | null;
  purchaseDate?: string | null;
}): Promise<K12Asset> {
  const row = await querySingle<AssetRow>(
    `
      INSERT INTO library.k12_assets (
        tenant_id,
        asset_tag,
        name,
        category,
        model,
        serial_number,
        status,
        condition,
        condition_notes,
        purchase_date,
        created_at,
        updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), NOW())
      RETURNING *
    `,
    [
      args.tenantId || "default",
      args.assetTag.trim(),
      args.name.trim(),
      args.category || "device",
      args.model?.trim() || null,
      args.serialNumber?.trim() || null,
      args.status || "available",
      args.condition || "good",
      args.conditionNotes?.trim() || null,
      args.purchaseDate || null,
    ]
  );

  if (!row) throw new Error("Failed to create asset");
  logger.info(
    { component: "k12-assets", assetId: row.id, assetTag: row.asset_tag },
    "Asset created"
  );
  return toAsset(row);
}

export async function listAssets(filters?: {
  tenantId?: string;
  status?: string;
  category?: string;
}): Promise<K12Asset[]> {
  const tenantId = filters?.tenantId || "default";
  const rows = await query<AssetRow>(
    `
      SELECT *
      FROM library.k12_assets
      WHERE tenant_id = $1
        AND ($2::text IS NULL OR status = $2)
        AND ($3::text IS NULL OR category = $3)
      ORDER BY lower(name), id
    `,
    [tenantId, filters?.status || null, filters?.category || null]
  );
  return rows.map(toAsset);
}

export async function getAsset(assetId: number): Promise<K12Asset | null> {
  const row = await querySingle<AssetRow>(`SELECT * FROM library.k12_assets WHERE id = $1`, [
    assetId,
  ]);
  if (!row) return null;
  return toAsset(row);
}

export async function updateAsset(
  assetId: number,
  updates: {
    name?: string;
    category?: string;
    model?: string | null;
    serialNumber?: string | null;
    status?: string;
    condition?: string;
    conditionNotes?: string | null;
    purchaseDate?: string | null;
  }
): Promise<K12Asset> {
  const row = await querySingle<AssetRow>(
    `
      UPDATE library.k12_assets
      SET
        name = COALESCE($2, name),
        category = COALESCE($3, category),
        model = CASE WHEN $4::boolean THEN $5 ELSE model END,
        serial_number = CASE WHEN $6::boolean THEN $7 ELSE serial_number END,
        status = COALESCE($8, status),
        condition = COALESCE($9, condition),
        condition_notes = CASE WHEN $10::boolean THEN $11 ELSE condition_notes END,
        purchase_date = CASE WHEN $12::boolean THEN $13::date ELSE purchase_date END,
        updated_at = NOW()
      WHERE id = $1
      RETURNING *
    `,
    [
      assetId,
      updates.name?.trim() || null,
      updates.category || null,
      updates.model !== undefined,
      updates.model?.trim() || null,
      updates.serialNumber !== undefined,
      updates.serialNumber?.trim() || null,
      updates.status || null,
      updates.condition || null,
      updates.conditionNotes !== undefined,
      updates.conditionNotes?.trim() || null,
      updates.purchaseDate !== undefined,
      updates.purchaseDate || null,
    ]
  );

  if (!row) throw new Error("Asset not found");
  return toAsset(row);
}

// ---------------------------------------------------------------------------
// Assignment operations
// ---------------------------------------------------------------------------

export async function assignAsset(
  assetId: number,
  studentId: number,
  assignedBy?: number | null
): Promise<K12AssetAssignment> {
  // Update the asset status to assigned
  await querySingle(
    `UPDATE library.k12_assets SET status = 'assigned', updated_at = NOW() WHERE id = $1`,
    [assetId]
  );

  // Insert assignment
  await querySingle(
    `
      INSERT INTO library.k12_asset_assignments (
        asset_id,
        student_id,
        assigned_at,
        assigned_by
      )
      VALUES ($1, $2, NOW(), $3)
    `,
    [assetId, studentId, assignedBy ?? null]
  );

  // Fetch full assignment with joined details
  const inserted = await querySingle<AssignmentRow>(
    `
      SELECT
        aa.id,
        aa.asset_id,
        aa.student_id,
        concat_ws(' ', s.first_name, s.last_name) AS student_name,
        a.asset_tag,
        a.name AS asset_name,
        aa.assigned_at,
        aa.returned_at,
        aa.assigned_by,
        aa.condition_on_return,
        aa.notes
      FROM library.k12_asset_assignments aa
      LEFT JOIN library.k12_students s ON s.id = aa.student_id
      LEFT JOIN library.k12_assets a ON a.id = aa.asset_id
      WHERE aa.asset_id = $1 AND aa.student_id = $2 AND aa.returned_at IS NULL
      ORDER BY aa.assigned_at DESC
      LIMIT 1
    `,
    [assetId, studentId]
  );

  if (!inserted) throw new Error("Failed to create asset assignment");

  logger.info(
    { component: "k12-assets", assetId, studentId, assignmentId: inserted.id },
    "Asset assigned to student"
  );

  return toAssignment(inserted);
}

export async function returnAsset(
  assignmentId: number,
  conditionOnReturn?: string | null,
  notes?: string | null
): Promise<K12AssetAssignment> {
  const row = await querySingle<AssignmentRow>(
    `
      UPDATE library.k12_asset_assignments
      SET
        returned_at = NOW(),
        condition_on_return = $2,
        notes = $3
      WHERE id = $1 AND returned_at IS NULL
      RETURNING
        id,
        asset_id,
        student_id,
        NULL::text AS student_name,
        NULL::text AS asset_tag,
        NULL::text AS asset_name,
        assigned_at,
        returned_at,
        assigned_by,
        condition_on_return,
        notes
    `,
    [assignmentId, conditionOnReturn || null, notes || null]
  );

  if (!row) throw new Error("Assignment not found or already returned");

  // Set the asset status back to available
  await querySingle(
    `UPDATE library.k12_assets SET status = 'available', updated_at = NOW() WHERE id = $1`,
    [row.asset_id]
  );

  logger.info({ component: "k12-assets", assignmentId, assetId: row.asset_id }, "Asset returned");

  return toAssignment(row);
}

export async function getAssetHistory(assetId: number): Promise<K12AssetAssignment[]> {
  const rows = await query<AssignmentRow>(
    `
      SELECT
        aa.id,
        aa.asset_id,
        aa.student_id,
        concat_ws(' ', s.first_name, s.last_name) AS student_name,
        a.asset_tag,
        a.name AS asset_name,
        aa.assigned_at,
        aa.returned_at,
        aa.assigned_by,
        aa.condition_on_return,
        aa.notes
      FROM library.k12_asset_assignments aa
      LEFT JOIN library.k12_students s ON s.id = aa.student_id
      LEFT JOIN library.k12_assets a ON a.id = aa.asset_id
      WHERE aa.asset_id = $1
      ORDER BY aa.assigned_at DESC
    `,
    [assetId]
  );
  return rows.map(toAssignment);
}

export async function getStudentAssets(studentId: number): Promise<K12AssetAssignment[]> {
  const rows = await query<AssignmentRow>(
    `
      SELECT
        aa.id,
        aa.asset_id,
        aa.student_id,
        concat_ws(' ', s.first_name, s.last_name) AS student_name,
        a.asset_tag,
        a.name AS asset_name,
        aa.assigned_at,
        aa.returned_at,
        aa.assigned_by,
        aa.condition_on_return,
        aa.notes
      FROM library.k12_asset_assignments aa
      LEFT JOIN library.k12_students s ON s.id = aa.student_id
      LEFT JOIN library.k12_assets a ON a.id = aa.asset_id
      WHERE aa.student_id = $1
      ORDER BY aa.assigned_at DESC
    `,
    [studentId]
  );
  return rows.map(toAssignment);
}
