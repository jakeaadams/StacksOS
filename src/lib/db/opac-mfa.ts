/**
 * MFA (Multi-Factor Authentication) database operations.
 * Follows the opac-passkeys.ts pattern — lazy table creation, typed rows.
 */

import { createHash } from "node:crypto";
import { logger } from "@/lib/logger";
import { query, querySingle } from "@/lib/db/evergreen";
import { ensureLibrarySchemaExists } from "./library-schema";

let mfaTablesInitialized = false;

// ---------------------------------------------------------------------------
// Row types
// ---------------------------------------------------------------------------

export type MfaMethodRow = {
  id: number | string;
  patron_id: number | string;
  type: string;
  friendly_name: string;
  secret_encrypted: string;
  verified: boolean;
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
};

export type MfaRecoveryCodeRow = {
  id: number | string;
  mfa_method_id: number | string;
  code_hash: string;
  used_at: string | null;
  created_at: string;
};

// ---------------------------------------------------------------------------
// Schema initialization
// ---------------------------------------------------------------------------

export async function ensureMfaTables(): Promise<void> {
  if (mfaTablesInitialized) return;

  await ensureLibrarySchemaExists();

  await query(`
    CREATE TABLE IF NOT EXISTS library.opac_mfa_methods (
      id BIGSERIAL PRIMARY KEY,
      patron_id INTEGER NOT NULL,
      type TEXT NOT NULL CHECK (type IN ('totp')),
      friendly_name TEXT NOT NULL DEFAULT 'Authenticator App',
      secret_encrypted TEXT NOT NULL,
      verified BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      last_used_at TIMESTAMPTZ,
      revoked_at TIMESTAMPTZ
    )
  `);

  await query(`
    CREATE INDEX IF NOT EXISTS idx_opac_mfa_patron_active
    ON library.opac_mfa_methods (patron_id, created_at)
    WHERE revoked_at IS NULL
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS library.opac_mfa_recovery_codes (
      id BIGSERIAL PRIMARY KEY,
      mfa_method_id BIGINT NOT NULL,
      code_hash TEXT NOT NULL,
      used_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  mfaTablesInitialized = true;
  logger.debug({ component: "mfa" }, "MFA tables ensured");
}

// ---------------------------------------------------------------------------
// CRUD operations
// ---------------------------------------------------------------------------

export async function createMfaMethod(params: {
  patronId: number;
  type: "totp";
  friendlyName: string;
  secretEncrypted: string;
}): Promise<number> {
  await ensureMfaTables();

  const row = await querySingle<{ id: number | string }>(
    `INSERT INTO library.opac_mfa_methods (patron_id, type, friendly_name, secret_encrypted, verified)
     VALUES ($1, $2, $3, $4, FALSE)
     RETURNING id`,
    [params.patronId, params.type, params.friendlyName, params.secretEncrypted]
  );

  return Number(row?.id ?? 0);
}

export async function verifyAndActivateMfa(methodId: number): Promise<void> {
  await ensureMfaTables();
  await query(`UPDATE library.opac_mfa_methods SET verified = TRUE WHERE id = $1`, [methodId]);
}

export async function getActiveMfaMethods(patronId: number): Promise<MfaMethodRow[]> {
  await ensureMfaTables();
  const rows = await query<MfaMethodRow>(
    `SELECT * FROM library.opac_mfa_methods
     WHERE patron_id = $1 AND verified = TRUE AND revoked_at IS NULL
     ORDER BY created_at DESC`,
    [patronId]
  );
  return rows || [];
}

export async function getMfaMethodById(methodId: number): Promise<MfaMethodRow | null> {
  await ensureMfaTables();
  return querySingle<MfaMethodRow>(`SELECT * FROM library.opac_mfa_methods WHERE id = $1`, [
    methodId,
  ]);
}

export async function revokeMfaMethod(methodId: number, patronId: number): Promise<boolean> {
  await ensureMfaTables();
  const result = await query(
    `UPDATE library.opac_mfa_methods SET revoked_at = NOW()
     WHERE id = $1 AND patron_id = $2 AND revoked_at IS NULL`,
    [methodId, patronId]
  );
  return (result?.length ?? 0) >= 0;
}

export async function updateMfaLastUsed(methodId: number): Promise<void> {
  await ensureMfaTables();
  await query(`UPDATE library.opac_mfa_methods SET last_used_at = NOW() WHERE id = $1`, [methodId]);
}

// ---------------------------------------------------------------------------
// Recovery codes
// ---------------------------------------------------------------------------

export async function storeRecoveryCodes(mfaMethodId: number, codeHashes: string[]): Promise<void> {
  await ensureMfaTables();

  for (const hash of codeHashes) {
    await query(
      `INSERT INTO library.opac_mfa_recovery_codes (mfa_method_id, code_hash)
       VALUES ($1, $2)`,
      [mfaMethodId, hash]
    );
  }
}

export async function consumeRecoveryCode(mfaMethodId: number, codeHash: string): Promise<boolean> {
  await ensureMfaTables();

  const row = await querySingle<MfaRecoveryCodeRow>(
    `UPDATE library.opac_mfa_recovery_codes
     SET used_at = NOW()
     WHERE mfa_method_id = $1 AND code_hash = $2 AND used_at IS NULL
     RETURNING id`,
    [mfaMethodId, codeHash]
  );

  return row !== null;
}

export function hashRecoveryCode(code: string): string {
  return createHash("sha256").update(code.toLowerCase().trim()).digest("hex");
}
