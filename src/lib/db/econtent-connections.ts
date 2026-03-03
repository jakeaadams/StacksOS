import "server-only";

import { ensureLibrarySchemaExists } from "@/lib/db/library-schema";
import { query, querySingle } from "@/lib/db/evergreen";
import type { EContentConnectionMode, EContentProviderId } from "@/lib/econtent-providers";
import { logger } from "@/lib/logger";

type EContentConnectionRow = {
  id: number;
  tenant_id: string;
  provider_id: EContentProviderId;
  enabled: boolean;
  mode: EContentConnectionMode;
  browse_url: string | null;
  app_url: string | null;
  credential_ref: string | null;
  supports_checkout: boolean;
  supports_hold: boolean;
  notes: string | null;
  updated_by: number | null;
  updated_at: string;
  created_at: string;
};

export interface EContentConnection {
  id: number;
  tenantId: string;
  providerId: EContentProviderId;
  enabled: boolean;
  mode: EContentConnectionMode;
  browseUrl: string | null;
  appUrl: string | null;
  credentialRef: string | null;
  supportsCheckout: boolean;
  supportsHold: boolean;
  notes: string | null;
  updatedBy: number | null;
  updatedAt: string;
  createdAt: string;
}

let tableInitialized = false;

function mapRow(row: EContentConnectionRow): EContentConnection {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    providerId: row.provider_id,
    enabled: row.enabled,
    mode: row.mode,
    browseUrl: row.browse_url,
    appUrl: row.app_url,
    credentialRef: row.credential_ref,
    supportsCheckout: row.supports_checkout,
    supportsHold: row.supports_hold,
    notes: row.notes,
    updatedBy: row.updated_by,
    updatedAt: row.updated_at,
    createdAt: row.created_at,
  };
}

export async function ensureEcontentConnectionsTable(): Promise<void> {
  if (tableInitialized) return;

  await ensureLibrarySchemaExists();
  await query(`
    CREATE TABLE IF NOT EXISTS library.econtent_connections (
      id SERIAL PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      provider_id TEXT NOT NULL,
      enabled BOOLEAN NOT NULL DEFAULT FALSE,
      mode TEXT NOT NULL DEFAULT 'linkout'
        CHECK (mode IN ('linkout', 'oauth_passthrough', 'api')),
      browse_url TEXT,
      app_url TEXT,
      credential_ref TEXT,
      supports_checkout BOOLEAN NOT NULL DEFAULT FALSE,
      supports_hold BOOLEAN NOT NULL DEFAULT FALSE,
      notes TEXT,
      updated_by INTEGER,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (tenant_id, provider_id)
    )
  `);
  await query(`
    CREATE INDEX IF NOT EXISTS idx_econtent_connections_tenant
    ON library.econtent_connections (tenant_id, enabled)
  `);

  tableInitialized = true;
  logger.info({}, "eContent connections table initialized");
}

export async function listEcontentConnections(tenantId: string): Promise<EContentConnection[]> {
  await ensureEcontentConnectionsTable();
  const rows = await query<EContentConnectionRow>(
    `
      SELECT id, tenant_id, provider_id, enabled, mode, browse_url, app_url, credential_ref,
             supports_checkout, supports_hold, notes, updated_by, updated_at, created_at
      FROM library.econtent_connections
      WHERE tenant_id = $1
      ORDER BY provider_id ASC
    `,
    [tenantId]
  );
  return rows.map(mapRow);
}

export async function upsertEcontentConnection(args: {
  tenantId: string;
  providerId: EContentProviderId;
  enabled: boolean;
  mode: EContentConnectionMode;
  browseUrl?: string | null;
  appUrl?: string | null;
  credentialRef?: string | null;
  supportsCheckout?: boolean;
  supportsHold?: boolean;
  notes?: string | null;
  updatedBy?: number | null;
}): Promise<EContentConnection> {
  await ensureEcontentConnectionsTable();
  const row = await querySingle<EContentConnectionRow>(
    `
      INSERT INTO library.econtent_connections (
        tenant_id, provider_id, enabled, mode, browse_url, app_url, credential_ref,
        supports_checkout, supports_hold, notes, updated_by, updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())
      ON CONFLICT (tenant_id, provider_id)
      DO UPDATE SET
        enabled = EXCLUDED.enabled,
        mode = EXCLUDED.mode,
        browse_url = EXCLUDED.browse_url,
        app_url = EXCLUDED.app_url,
        credential_ref = EXCLUDED.credential_ref,
        supports_checkout = EXCLUDED.supports_checkout,
        supports_hold = EXCLUDED.supports_hold,
        notes = EXCLUDED.notes,
        updated_by = EXCLUDED.updated_by,
        updated_at = NOW()
      RETURNING id, tenant_id, provider_id, enabled, mode, browse_url, app_url, credential_ref,
                supports_checkout, supports_hold, notes, updated_by, updated_at, created_at
    `,
    [
      args.tenantId,
      args.providerId,
      args.enabled,
      args.mode,
      args.browseUrl || null,
      args.appUrl || null,
      args.credentialRef || null,
      Boolean(args.supportsCheckout),
      Boolean(args.supportsHold),
      args.notes || null,
      args.updatedBy || null,
    ]
  );
  if (!row) {
    throw new Error("Failed to persist eContent connection");
  }
  return mapRow(row);
}
