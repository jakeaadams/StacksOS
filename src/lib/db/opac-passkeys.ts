import { logger } from "@/lib/logger";
import { query, querySingle } from "@/lib/db/evergreen";
import { ensureLibrarySchemaExists } from "./library-schema";

let passkeyTablesInitialized = false;

type OpacPasskeyRow = {
  id: number | string;
  patron_id: number | string;
  credential_id: string;
  public_key: string;
  counter: number | string | null;
  transports: string[] | null;
  device_type: string | null;
  backed_up: boolean | null;
  friendly_name: string | null;
  auth_identifier: string;
  pin_digest_encrypted: string;
  created_at: string;
  updated_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
};

type PasskeyChallengeRow = {
  id: number | string;
  purpose: string;
  challenge: string;
  patron_id: number | string | null;
  rp_id: string;
  origin: string;
  auth_identifier: string | null;
  pin_digest_encrypted: string | null;
  expires_at: string;
  created_at: string;
  used_at: string | null;
};

async function ensureOpacPasskeyTables(): Promise<void> {
  if (passkeyTablesInitialized) return;

  await ensureLibrarySchemaExists();

  await query(`
    CREATE TABLE IF NOT EXISTS library.opac_passkeys (
      id BIGSERIAL PRIMARY KEY,
      patron_id INTEGER NOT NULL,
      credential_id TEXT NOT NULL UNIQUE,
      public_key TEXT NOT NULL,
      counter BIGINT NOT NULL DEFAULT 0,
      transports TEXT[],
      device_type TEXT,
      backed_up BOOLEAN NOT NULL DEFAULT FALSE,
      friendly_name TEXT,
      auth_identifier TEXT NOT NULL,
      pin_digest_encrypted TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW(),
      last_used_at TIMESTAMP,
      revoked_at TIMESTAMP
    )
  `);

  await query(`
    CREATE INDEX IF NOT EXISTS idx_opac_passkeys_patron_active
    ON library.opac_passkeys(patron_id, created_at DESC)
    WHERE revoked_at IS NULL
  `);

  await query(`
    CREATE INDEX IF NOT EXISTS idx_opac_passkeys_auth_identifier_active
    ON library.opac_passkeys(auth_identifier, created_at DESC)
    WHERE revoked_at IS NULL
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS library.opac_passkey_challenges (
      id BIGSERIAL PRIMARY KEY,
      purpose TEXT NOT NULL CHECK (purpose IN ('registration', 'authentication')),
      challenge TEXT NOT NULL UNIQUE,
      patron_id INTEGER,
      rp_id TEXT NOT NULL,
      origin TEXT NOT NULL,
      auth_identifier TEXT,
      pin_digest_encrypted TEXT,
      expires_at TIMESTAMP NOT NULL,
      created_at TIMESTAMP DEFAULT NOW(),
      used_at TIMESTAMP
    )
  `);

  // Backward-compatible schema upgrades for existing environments.
  await query(`
    ALTER TABLE library.opac_passkey_challenges
    ADD COLUMN IF NOT EXISTS auth_identifier TEXT
  `);
  await query(`
    ALTER TABLE library.opac_passkey_challenges
    ADD COLUMN IF NOT EXISTS pin_digest_encrypted TEXT
  `);

  await query(`
    CREATE INDEX IF NOT EXISTS idx_opac_passkey_challenges_lookup
    ON library.opac_passkey_challenges(challenge, purpose, used_at, expires_at)
  `);

  await query(`
    DELETE FROM library.opac_passkey_challenges
    WHERE (expires_at <= NOW() - INTERVAL '1 day')
       OR (used_at IS NOT NULL AND used_at <= NOW() - INTERVAL '1 day')
  `);

  passkeyTablesInitialized = true;
  logger.info({}, "OPAC passkey tables initialized");
}

export type StoredOpacPasskey = {
  id: number;
  patronId: number;
  credentialId: string;
  publicKey: string;
  counter: number;
  transports: string[];
  deviceType: string | null;
  backedUp: boolean;
  friendlyName: string | null;
  authIdentifier: string;
  pinDigestEncrypted: string;
  createdAt: string;
  updatedAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
};

export type OpacPasskeyListItem = {
  id: number;
  credentialId: string;
  friendlyName: string | null;
  deviceType: string | null;
  backedUp: boolean;
  createdAt: string;
  lastUsedAt: string | null;
};

export type StoredPasskeyChallenge = {
  id: number;
  purpose: "registration" | "authentication";
  challenge: string;
  patronId: number | null;
  rpId: string;
  origin: string;
  authIdentifier: string | null;
  pinDigestEncrypted: string | null;
  expiresAt: string;
  createdAt: string;
  usedAt: string | null;
};

function mapPasskeyRow(row: OpacPasskeyRow): StoredOpacPasskey {
  return {
    id: Number(row.id),
    patronId: Number(row.patron_id),
    credentialId: String(row.credential_id),
    publicKey: String(row.public_key),
    counter: Number(row.counter) || 0,
    transports: Array.isArray(row.transports) ? row.transports.map(String) : [],
    deviceType: row.device_type ? String(row.device_type) : null,
    backedUp: Boolean(row.backed_up),
    friendlyName: row.friendly_name ? String(row.friendly_name) : null,
    authIdentifier: String(row.auth_identifier),
    pinDigestEncrypted: String(row.pin_digest_encrypted),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    lastUsedAt: row.last_used_at ? String(row.last_used_at) : null,
    revokedAt: row.revoked_at ? String(row.revoked_at) : null,
  };
}

function mapChallengeRow(row: PasskeyChallengeRow): StoredPasskeyChallenge {
  return {
    id: Number(row.id),
    purpose: row.purpose === "registration" ? "registration" : "authentication",
    challenge: String(row.challenge),
    patronId: row.patron_id == null ? null : Number(row.patron_id),
    rpId: String(row.rp_id),
    origin: String(row.origin),
    authIdentifier: row.auth_identifier ? String(row.auth_identifier) : null,
    pinDigestEncrypted: row.pin_digest_encrypted ? String(row.pin_digest_encrypted) : null,
    expiresAt: String(row.expires_at),
    createdAt: String(row.created_at),
    usedAt: row.used_at ? String(row.used_at) : null,
  };
}

export async function createPasskeyChallenge(args: {
  purpose: "registration" | "authentication";
  challenge: string;
  patronId?: number;
  rpId: string;
  origin: string;
  authIdentifier?: string;
  pinDigestEncrypted?: string;
  expiresAt: Date;
}): Promise<void> {
  await ensureOpacPasskeyTables();
  await query(
    `
      INSERT INTO library.opac_passkey_challenges (
        purpose,
        challenge,
        patron_id,
        rp_id,
        origin,
        auth_identifier,
        pin_digest_encrypted,
        expires_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      ON CONFLICT (challenge)
      DO UPDATE SET
        purpose = EXCLUDED.purpose,
        patron_id = EXCLUDED.patron_id,
        rp_id = EXCLUDED.rp_id,
        origin = EXCLUDED.origin,
        auth_identifier = EXCLUDED.auth_identifier,
        pin_digest_encrypted = EXCLUDED.pin_digest_encrypted,
        expires_at = EXCLUDED.expires_at,
        created_at = NOW(),
        used_at = NULL
    `,
    [
      args.purpose,
      args.challenge,
      args.patronId ?? null,
      args.rpId,
      args.origin,
      args.authIdentifier ?? null,
      args.pinDigestEncrypted ?? null,
      args.expiresAt.toISOString(),
    ]
  );
}

export async function consumePasskeyChallenge(args: {
  challenge: string;
  purpose: "registration" | "authentication";
}): Promise<StoredPasskeyChallenge | null> {
  await ensureOpacPasskeyTables();
  const row = await querySingle<PasskeyChallengeRow>(
    `
      WITH selected AS (
        SELECT id
        FROM library.opac_passkey_challenges
        WHERE challenge = $1
          AND purpose = $2
          AND used_at IS NULL
          AND expires_at > NOW()
        ORDER BY id DESC
        LIMIT 1
        FOR UPDATE SKIP LOCKED
      )
      UPDATE library.opac_passkey_challenges c
      SET used_at = NOW()
      FROM selected
      WHERE c.id = selected.id
      RETURNING c.*
    `,
    [args.challenge, args.purpose]
  );
  return row ? mapChallengeRow(row) : null;
}

export async function savePatronPasskey(args: {
  patronId: number;
  credentialId: string;
  publicKey: string;
  counter: number;
  transports?: string[];
  deviceType?: string | null;
  backedUp?: boolean;
  friendlyName?: string | null;
  authIdentifier: string;
  pinDigestEncrypted: string;
}): Promise<StoredOpacPasskey> {
  await ensureOpacPasskeyTables();

  const row = await querySingle<OpacPasskeyRow>(
    `
      INSERT INTO library.opac_passkeys (
        patron_id,
        credential_id,
        public_key,
        counter,
        transports,
        device_type,
        backed_up,
        friendly_name,
        auth_identifier,
        pin_digest_encrypted,
        created_at,
        updated_at,
        revoked_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, NULLIF($8, ''), $9, $10, NOW(), NOW(), NULL)
      ON CONFLICT (credential_id)
      DO UPDATE SET
        patron_id = EXCLUDED.patron_id,
        public_key = EXCLUDED.public_key,
        counter = EXCLUDED.counter,
        transports = EXCLUDED.transports,
        device_type = EXCLUDED.device_type,
        backed_up = EXCLUDED.backed_up,
        friendly_name = EXCLUDED.friendly_name,
        auth_identifier = EXCLUDED.auth_identifier,
        pin_digest_encrypted = EXCLUDED.pin_digest_encrypted,
        updated_at = NOW()
      -- Do NOT reset revoked_at: a revoked passkey cannot be silently re-enrolled.
      -- The patron must have staff delete the old credential first.
      WHERE library.opac_passkeys.revoked_at IS NULL
      RETURNING *
    `,
    [
      args.patronId,
      args.credentialId,
      args.publicKey,
      args.counter,
      args.transports ?? [],
      args.deviceType ?? null,
      Boolean(args.backedUp),
      args.friendlyName ?? "",
      args.authIdentifier,
      args.pinDigestEncrypted,
    ]
  );

  if (!row) {
    throw new Error(
      "Failed to save passkey — the credential may have been previously revoked. " +
        "Please contact library staff to remove the old credential before re-enrolling."
    );
  }

  return mapPasskeyRow(row);
}

export async function listPatronPasskeys(patronId: number): Promise<OpacPasskeyListItem[]> {
  await ensureOpacPasskeyTables();
  const rows = await query<
    Pick<
      OpacPasskeyRow,
      | "id"
      | "credential_id"
      | "friendly_name"
      | "device_type"
      | "backed_up"
      | "created_at"
      | "last_used_at"
    >
  >(
    `
      SELECT
        id,
        credential_id,
        friendly_name,
        device_type,
        backed_up,
        created_at,
        last_used_at
      FROM library.opac_passkeys
      WHERE patron_id = $1
        AND revoked_at IS NULL
      ORDER BY created_at DESC
    `,
    [patronId]
  );

  return rows.map((row) => ({
    id: Number(row.id),
    credentialId: String(row.credential_id),
    friendlyName: row.friendly_name ? String(row.friendly_name) : null,
    deviceType: row.device_type ? String(row.device_type) : null,
    backedUp: Boolean(row.backed_up),
    createdAt: String(row.created_at),
    lastUsedAt: row.last_used_at ? String(row.last_used_at) : null,
  }));
}

export async function listActivePasskeysByAuthIdentifier(
  authIdentifier: string
): Promise<StoredOpacPasskey[]> {
  await ensureOpacPasskeyTables();
  const rows = await query<OpacPasskeyRow>(
    `
      SELECT *
      FROM library.opac_passkeys
      WHERE auth_identifier = $1
        AND revoked_at IS NULL
      ORDER BY created_at DESC
    `,
    [authIdentifier]
  );
  return rows.map(mapPasskeyRow);
}

export async function getPasskeyByCredentialId(
  credentialId: string
): Promise<StoredOpacPasskey | null> {
  await ensureOpacPasskeyTables();
  const row = await querySingle<OpacPasskeyRow>(
    `
      SELECT *
      FROM library.opac_passkeys
      WHERE credential_id = $1
        AND revoked_at IS NULL
      LIMIT 1
    `,
    [credentialId]
  );
  return row ? mapPasskeyRow(row) : null;
}

export async function updatePasskeyCounter(args: { id: number; counter: number }): Promise<void> {
  await ensureOpacPasskeyTables();
  await query(
    `
      UPDATE library.opac_passkeys
      SET
        counter = $2,
        last_used_at = NOW(),
        updated_at = NOW()
      WHERE id = $1
    `,
    [args.id, args.counter]
  );
}

export async function revokePatronPasskey(args: {
  passkeyId: number;
  patronId: number;
}): Promise<boolean> {
  await ensureOpacPasskeyTables();
  const row = await querySingle<{ id: number }>(
    `
      UPDATE library.opac_passkeys
      SET
        revoked_at = NOW(),
        updated_at = NOW()
      WHERE id = $1
        AND patron_id = $2
        AND revoked_at IS NULL
      RETURNING id
    `,
    [args.passkeyId, args.patronId]
  );
  return Boolean(row);
}
