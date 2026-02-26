import { query, querySingle, withTransaction } from "@/lib/db/evergreen";
import { assertLibrarySchemaExists } from "@/lib/db/library-schema";
import { logger } from "@/lib/logger";

export const SAAS_ROLE_VALUES = [
  "platform_owner",
  "platform_admin",
  "tenant_admin",
  "tenant_operator",
  "tenant_viewer",
] as const;

export type SaaSRole = (typeof SAAS_ROLE_VALUES)[number];

export interface SaaSRoleBinding {
  id: number;
  actorId: number | null;
  username: string | null;
  tenantId: string | null;
  role: SaaSRole;
  active: boolean;
  createdAt: string;
  updatedAt: string;
  createdBy: number | null;
  updatedBy: number | null;
}

interface SaaSRoleBindingRow {
  id: number;
  actor_id: number | null;
  username: string | null;
  tenant_id: string | null;
  role: string;
  active: boolean;
  created_at: string;
  updated_at: string;
  created_by: number | null;
  updated_by: number | null;
}

let tablesReady = false;
let tablesReadyPromise: Promise<void> | null = null;

function normalizeRole(role: string): SaaSRole {
  const normalized = String(role || "")
    .trim()
    .toLowerCase() as SaaSRole;
  if ((SAAS_ROLE_VALUES as readonly string[]).includes(normalized)) {
    return normalized;
  }
  throw new Error(`Invalid SaaS role: ${role}`);
}

function normalizeTenantId(tenantId?: string | null): string | null {
  if (!tenantId) return null;
  const normalized = String(tenantId).trim().toLowerCase();
  if (!normalized) return null;
  if (!/^[a-z0-9][a-z0-9_-]{0,63}$/.test(normalized)) {
    throw new Error("Invalid tenant id format");
  }
  return normalized;
}

function normalizeUsername(username?: string | null): string | null {
  if (!username) return null;
  const normalized = String(username).trim().toLowerCase();
  return normalized || null;
}

function mapBindingRow(row: SaaSRoleBindingRow): SaaSRoleBinding {
  return {
    id: Number(row.id),
    actorId: row.actor_id ?? null,
    username: row.username ?? null,
    tenantId: row.tenant_id ?? null,
    role: normalizeRole(String(row.role)),
    active: Boolean(row.active),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    createdBy: row.created_by ?? null,
    updatedBy: row.updated_by ?? null,
  };
}

export async function ensureSaasRoleTables(): Promise<void> {
  if (tablesReady) return;
  if (tablesReadyPromise) {
    await tablesReadyPromise;
    return;
  }

  tablesReadyPromise = (async () => {
    await withTransaction(async (client) => {
      await assertLibrarySchemaExists(client);

      await client.query(`
        CREATE TABLE IF NOT EXISTS library.saas_role_bindings (
          id BIGSERIAL PRIMARY KEY,
          actor_id INTEGER,
          username TEXT,
          tenant_id TEXT,
          role TEXT NOT NULL,
          active BOOLEAN NOT NULL DEFAULT TRUE,
          created_at TIMESTAMP NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
          created_by INTEGER,
          updated_by INTEGER,
          CONSTRAINT saas_role_bindings_identity_check
            CHECK (actor_id IS NOT NULL OR (username IS NOT NULL AND btrim(username) <> '')),
          CONSTRAINT saas_role_bindings_role_check
            CHECK (role IN ('platform_owner', 'platform_admin', 'tenant_admin', 'tenant_operator', 'tenant_viewer')),
          CONSTRAINT saas_role_bindings_tenant_check
            CHECK (tenant_id IS NULL OR tenant_id ~ '^[a-z0-9][a-z0-9_-]{0,63}$')
        )
      `);

      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_saas_role_bindings_actor
        ON library.saas_role_bindings(actor_id, active, role)
      `);

      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_saas_role_bindings_username
        ON library.saas_role_bindings(lower(username), active, role)
      `);

      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_saas_role_bindings_tenant
        ON library.saas_role_bindings(lower(tenant_id), active, role)
      `);
    });

    tablesReady = true;
    logger.info({ component: "saas-rbac" }, "SaaS role tables ready");
  })().catch((error) => {
    tablesReadyPromise = null;
    throw error;
  });

  await tablesReadyPromise;
}

export async function listSaasRoleBindings(limit = 500): Promise<SaaSRoleBinding[]> {
  await ensureSaasRoleTables();
  const capped = Math.max(1, Math.min(1000, Math.floor(limit)));

  const rows = await query<SaaSRoleBindingRow>(
    `
      SELECT
        id,
        actor_id,
        username,
        tenant_id,
        role,
        active,
        created_at,
        updated_at,
        created_by,
        updated_by
      FROM library.saas_role_bindings
      WHERE active = TRUE
      ORDER BY
        CASE role
          WHEN 'platform_owner' THEN 1
          WHEN 'platform_admin' THEN 2
          WHEN 'tenant_admin' THEN 3
          WHEN 'tenant_operator' THEN 4
          ELSE 5
        END,
        COALESCE(lower(tenant_id), ''),
        id DESC
      LIMIT $1
    `,
    [capped]
  );

  return rows.map(mapBindingRow);
}

export async function getSaasRoleBindingById(id: number): Promise<SaaSRoleBinding | null> {
  await ensureSaasRoleTables();
  const bindingId = Math.trunc(id);
  if (!Number.isFinite(bindingId) || bindingId <= 0) return null;

  const row = await querySingle<SaaSRoleBindingRow>(
    `
      SELECT
        id,
        actor_id,
        username,
        tenant_id,
        role,
        active,
        created_at,
        updated_at,
        created_by,
        updated_by
      FROM library.saas_role_bindings
      WHERE id = $1
      LIMIT 1
    `,
    [bindingId]
  );

  return row ? mapBindingRow(row) : null;
}

export async function listSaasRoleBindingsForActor(args: {
  actorId?: number | null;
  username?: string | null;
}): Promise<SaaSRoleBinding[]> {
  await ensureSaasRoleTables();

  const actorId =
    typeof args.actorId === "number" && Number.isFinite(args.actorId)
      ? Math.trunc(args.actorId)
      : null;
  const username = normalizeUsername(args.username);

  if (!actorId && !username) return [];

  const rows = await query<SaaSRoleBindingRow>(
    `
      SELECT
        id,
        actor_id,
        username,
        tenant_id,
        role,
        active,
        created_at,
        updated_at,
        created_by,
        updated_by
      FROM library.saas_role_bindings
      WHERE active = TRUE
        AND (
          ($1::int IS NOT NULL AND actor_id = $1)
          OR ($2::text IS NOT NULL AND lower(username) = $2)
        )
      ORDER BY
        CASE role
          WHEN 'platform_owner' THEN 1
          WHEN 'platform_admin' THEN 2
          WHEN 'tenant_admin' THEN 3
          WHEN 'tenant_operator' THEN 4
          ELSE 5
        END,
        COALESCE(lower(tenant_id), ''),
        id DESC
    `,
    [actorId, username]
  );

  return rows.map(mapBindingRow);
}

export async function countActivePlatformAdmins(): Promise<number> {
  await ensureSaasRoleTables();
  const row = await querySingle<{ count: number }>(
    `
      SELECT COUNT(*)::int AS count
      FROM library.saas_role_bindings
      WHERE active = TRUE
        AND role IN ('platform_owner', 'platform_admin')
    `
  );
  return Number(row?.count || 0);
}

export async function upsertSaasRoleBinding(args: {
  actorId?: number | null;
  username?: string | null;
  tenantId?: string | null;
  role: SaaSRole;
  updatedBy?: number | null;
}): Promise<SaaSRoleBinding> {
  await ensureSaasRoleTables();

  const role = normalizeRole(args.role);
  const tenantId = normalizeTenantId(args.tenantId);
  const username = normalizeUsername(args.username);
  const actorId =
    typeof args.actorId === "number" && Number.isFinite(args.actorId)
      ? Math.trunc(args.actorId)
      : null;
  const updatedBy =
    typeof args.updatedBy === "number" && Number.isFinite(args.updatedBy)
      ? Math.trunc(args.updatedBy)
      : null;

  if (!actorId && !username) {
    throw new Error("actorId or username is required");
  }

  if (role.startsWith("platform_")) {
    if (tenantId) throw new Error("Platform roles cannot be tenant-scoped");
  } else if (!tenantId) {
    throw new Error("Tenant roles require tenantId");
  }

  const existing = await querySingle<SaaSRoleBindingRow>(
    `
      SELECT
        id,
        actor_id,
        username,
        tenant_id,
        role,
        active,
        created_at,
        updated_at,
        created_by,
        updated_by
      FROM library.saas_role_bindings
      WHERE active = TRUE
        AND role = $4
        AND ($1::int IS NULL OR actor_id = $1)
        AND ($1::int IS NOT NULL OR actor_id IS NULL)
        AND COALESCE(lower(username), '') = COALESCE($2, '')
        AND COALESCE(lower(tenant_id), '') = COALESCE($3, '')
      ORDER BY id DESC
      LIMIT 1
    `,
    [actorId, username, tenantId, role]
  );

  if (existing) return mapBindingRow(existing);

  const reactivated = await querySingle<SaaSRoleBindingRow>(
    `
      UPDATE library.saas_role_bindings
      SET active = TRUE,
          actor_id = $1,
          username = $2,
          tenant_id = $3,
          updated_at = NOW(),
          updated_by = $5
      WHERE id = (
        SELECT id
        FROM library.saas_role_bindings
        WHERE role = $4
          AND ($1::int IS NULL OR actor_id = $1)
          AND ($1::int IS NOT NULL OR actor_id IS NULL)
          AND COALESCE(lower(username), '') = COALESCE($2, '')
          AND COALESCE(lower(tenant_id), '') = COALESCE($3, '')
        ORDER BY id DESC
        LIMIT 1
      )
      RETURNING
        id,
        actor_id,
        username,
        tenant_id,
        role,
        active,
        created_at,
        updated_at,
        created_by,
        updated_by
    `,
    [actorId, username, tenantId, role, updatedBy]
  );

  if (reactivated) return mapBindingRow(reactivated);

  const inserted = await querySingle<SaaSRoleBindingRow>(
    `
      INSERT INTO library.saas_role_bindings (
        actor_id,
        username,
        tenant_id,
        role,
        active,
        created_by,
        updated_by,
        created_at,
        updated_at
      )
      VALUES ($1,$2,$3,$4,TRUE,$5,$5,NOW(),NOW())
      RETURNING
        id,
        actor_id,
        username,
        tenant_id,
        role,
        active,
        created_at,
        updated_at,
        created_by,
        updated_by
    `,
    [actorId, username, tenantId, role, updatedBy]
  );

  if (!inserted) throw new Error("Failed to save SaaS role binding");
  return mapBindingRow(inserted);
}

export async function deactivateSaasRoleBinding(args: {
  id: number;
  updatedBy?: number | null;
}): Promise<SaaSRoleBinding | null> {
  await ensureSaasRoleTables();

  const id = Math.trunc(args.id);
  if (!Number.isFinite(id) || id <= 0) {
    throw new Error("Invalid role binding id");
  }

  const updatedBy =
    typeof args.updatedBy === "number" && Number.isFinite(args.updatedBy)
      ? Math.trunc(args.updatedBy)
      : null;

  const row = await querySingle<SaaSRoleBindingRow>(
    `
      UPDATE library.saas_role_bindings
      SET active = FALSE,
          updated_at = NOW(),
          updated_by = $2
      WHERE id = $1
        AND active = TRUE
      RETURNING
        id,
        actor_id,
        username,
        tenant_id,
        role,
        active,
        created_at,
        updated_at,
        created_by,
        updated_by
    `,
    [id, updatedBy]
  );

  return row ? mapBindingRow(row) : null;
}

export async function bootstrapPlatformOwnerIfEmpty(args: {
  actorId?: number | null;
  username?: string | null;
  createdBy?: number | null;
}): Promise<boolean> {
  await ensureSaasRoleTables();

  const actorId =
    typeof args.actorId === "number" && Number.isFinite(args.actorId)
      ? Math.trunc(args.actorId)
      : null;
  const username = normalizeUsername(args.username);
  const createdBy =
    typeof args.createdBy === "number" && Number.isFinite(args.createdBy)
      ? Math.trunc(args.createdBy)
      : null;

  if (!actorId && !username) return false;

  return await withTransaction(async (client) => {
    const countRes = await client.query<{
      count: number;
    }>(`
      SELECT COUNT(*)::int AS count
      FROM library.saas_role_bindings
      WHERE active = TRUE
        AND role IN ('platform_owner', 'platform_admin')
    `);

    const count = Number(countRes.rows[0]?.count || 0);
    if (count > 0) return false;

    await client.query(
      `
        INSERT INTO library.saas_role_bindings (
          actor_id,
          username,
          tenant_id,
          role,
          active,
          created_by,
          updated_by,
          created_at,
          updated_at
        )
        VALUES ($1, $2, NULL, 'platform_owner', TRUE, $3, $3, NOW(), NOW())
      `,
      [actorId, username, createdBy]
    );

    logger.warn(
      { component: "saas-rbac", actorId, username },
      "Bootstrap: assigned platform_owner because no active platform admin existed"
    );

    return true;
  });
}
