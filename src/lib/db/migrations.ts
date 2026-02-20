/**
 * Database Migration Tracking System
 *
 * Provides ordered, trackable migrations for the library schema.
 * Replaces scattered CREATE TABLE IF NOT EXISTS patterns with a single
 * versioned migration framework.
 *
 * Usage:
 *   import { runMigrations } from "@/lib/db/migrations";
 *   await runMigrations();          // runs all pending migrations in order
 *   await runMigrations(client);    // runs inside an existing PoolClient
 */

import type { PoolClient } from "pg";
import { querySingle, withTransaction } from "./evergreen";
import { assertLibrarySchemaExists } from "./library-schema";
import { logger } from "@/lib/logger";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Migration {
  version: number;
  description: string;
  up: (client: PoolClient) => Promise<void>;
}

// ---------------------------------------------------------------------------
// Migration registry
// ---------------------------------------------------------------------------

/**
 * Migration #1 – baseline DDL.
 *
 * This consolidates the original ensureCustomTables / ensureSupportTables /
 * ensureNotificationTables / ensureCollaborationTables / ensureAiTables DDL
 * into a single tracked migration.  Each statement uses IF NOT EXISTS so it
 * is safe to run on databases that already have the tables.
 */
const migration1BaselineDDL: Migration = {
  version: 1,
  description: "Baseline: create all library.* tables (idempotent)",
  up: async (client: PoolClient) => {
    // -- custom_covers -------------------------------------------------------
    await client.query(`
      CREATE TABLE IF NOT EXISTS library.custom_covers (
        id SERIAL PRIMARY KEY,
        record_id INTEGER NOT NULL,
        cover_url TEXT NOT NULL,
        source TEXT,
        uploaded_by INTEGER,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(record_id)
      )
    `);
    await client.query(
      `CREATE INDEX IF NOT EXISTS idx_custom_covers_record_id ON library.custom_covers(record_id)`
    );

    // -- patron_photos -------------------------------------------------------
    await client.query(`
      CREATE TABLE IF NOT EXISTS library.patron_photos (
        id SERIAL PRIMARY KEY,
        patron_id INTEGER NOT NULL UNIQUE,
        photo_url TEXT NOT NULL,
        uploaded_by INTEGER,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);
    await client.query(
      `CREATE INDEX IF NOT EXISTS idx_patron_photos_patron_id ON library.patron_photos(patron_id)`
    );

    // -- incident_banners ----------------------------------------------------
    await client.query(`
      CREATE TABLE IF NOT EXISTS library.incident_banners (
        id SERIAL PRIMARY KEY,
        message TEXT NOT NULL,
        severity TEXT NOT NULL DEFAULT info,
        active BOOLEAN NOT NULL DEFAULT true,
        starts_at TIMESTAMP DEFAULT NOW(),
        ends_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT NOW(),
        created_by INTEGER
      )
    `);
    await client.query(
      `CREATE INDEX IF NOT EXISTS idx_incident_banners_active ON library.incident_banners(active, id)`
    );

    // -- support_tickets -----------------------------------------------------
    await client.query(`
      CREATE TABLE IF NOT EXISTS library.support_tickets (
        id SERIAL PRIMARY KEY,
        created_at TIMESTAMP DEFAULT NOW(),
        created_by INTEGER,
        requester_email TEXT,
        requester_name TEXT,
        category TEXT NOT NULL DEFAULT general,
        priority TEXT NOT NULL DEFAULT normal,
        subject TEXT NOT NULL,
        body TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT open
      )
    `);
    await client.query(
      `CREATE INDEX IF NOT EXISTS idx_support_tickets_status ON library.support_tickets(status, id)`
    );

    // -- release_notes -------------------------------------------------------
    await client.query(`
      CREATE TABLE IF NOT EXISTS library.release_notes (
        id SERIAL PRIMARY KEY,
        created_at TIMESTAMP DEFAULT NOW(),
        created_by INTEGER,
        version TEXT,
        title TEXT NOT NULL,
        body TEXT NOT NULL
      )
    `);
    await client.query(
      `CREATE INDEX IF NOT EXISTS idx_release_notes_created_at ON library.release_notes(created_at)`
    );

    // -- notification_templates ----------------------------------------------
    await client.query(`
      CREATE TABLE IF NOT EXISTS library.notification_templates (
        id SERIAL PRIMARY KEY,
        channel TEXT NOT NULL,
        notice_type TEXT NOT NULL,
        subject_template TEXT,
        body_template TEXT NOT NULL,
        body_text_template TEXT,
        created_at TIMESTAMP DEFAULT NOW(),
        created_by INTEGER,
        status TEXT NOT NULL DEFAULT inactive
      )
    `);
    await client.query(
      `CREATE INDEX IF NOT EXISTS idx_notification_templates_lookup ON library.notification_templates(channel, notice_type, status, id)`
    );

    // -- notification_events -------------------------------------------------
    await client.query(`
      CREATE TABLE IF NOT EXISTS library.notification_events (
        id TEXT PRIMARY KEY,
        channel TEXT NOT NULL,
        notice_type TEXT NOT NULL,
        patron_id INTEGER,
        recipient TEXT,
        created_at TIMESTAMP DEFAULT NOW(),
        created_by INTEGER,
        context JSONB
      )
    `);
    await client.query(
      `CREATE INDEX IF NOT EXISTS idx_notification_events_created_at ON library.notification_events(created_at)`
    );

    // -- notification_deliveries ---------------------------------------------
    await client.query(`
      CREATE TABLE IF NOT EXISTS library.notification_deliveries (
        id SERIAL PRIMARY KEY,
        event_id TEXT NOT NULL references library.notification_events(id) on delete cascade,
        provider TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT pending,
        attempts INTEGER NOT NULL DEFAULT 0,
        last_error TEXT,
        created_at TIMESTAMP DEFAULT NOW(),
        last_attempt_at TIMESTAMP,
        sent_at TIMESTAMP
      )
    `);
    await client.query(
      `CREATE INDEX IF NOT EXISTS idx_notification_deliveries_status ON library.notification_deliveries(status, id)`
    );

    // -- record_presence (collaboration) -------------------------------------
    await client.query(`
      CREATE TABLE IF NOT EXISTS library.record_presence (
        id SERIAL PRIMARY KEY,
        session_id TEXT NOT NULL,
        actor_id INTEGER,
        record_type TEXT NOT NULL,
        record_id INTEGER NOT NULL,
        activity TEXT NOT NULL,
        user_agent TEXT,
        ip TEXT,
        created_at TIMESTAMP DEFAULT NOW(),
        last_seen_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(session_id, record_type, record_id)
      )
    `);
    await client.query(
      `CREATE INDEX IF NOT EXISTS idx_record_presence_record ON library.record_presence(record_type, record_id, last_seen_at DESC)`
    );

    // -- record_tasks (collaboration) ----------------------------------------
    await client.query(`
      CREATE TABLE IF NOT EXISTS library.record_tasks (
        id SERIAL PRIMARY KEY,
        record_type TEXT NOT NULL,
        record_id INTEGER NOT NULL,
        title TEXT NOT NULL,
        body TEXT,
        status TEXT NOT NULL DEFAULT open,
        assigned_to INTEGER,
        created_by INTEGER,
        updated_by INTEGER,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);
    await client.query(
      `CREATE INDEX IF NOT EXISTS idx_record_tasks_record ON library.record_tasks(record_type, record_id, created_at DESC)`
    );

    // -- ai_drafts -----------------------------------------------------------
    await client.query(`
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
        user_agent TEXT
      )
    `);
    await client.query(
      `ALTER TABLE library.ai_drafts ADD COLUMN IF NOT EXISTS decision_reason TEXT`
    );
    await client.query(
      `ALTER TABLE library.ai_drafts ADD COLUMN IF NOT EXISTS prompt_template TEXT`
    );
    await client.query(
      `ALTER TABLE library.ai_drafts ADD COLUMN IF NOT EXISTS prompt_version INTEGER`
    );
    await client.query(
      `CREATE INDEX IF NOT EXISTS idx_ai_drafts_type_created ON library.ai_drafts(type, created_at DESC)`
    );

    // -- ai_draft_decisions --------------------------------------------------
    await client.query(`
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
  },
};

/**
 * Migration #2 – add updated_at columns where missing.
 * (see FIX 6)
 */
const migration2AddUpdatedAt: Migration = {
  version: 2,
  description:
    "Add updated_at columns to incident_banners, support_tickets, release_notes, ai_drafts",
  up: async (client: PoolClient) => {
    await client.query(
      `ALTER TABLE library.incident_banners  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW()`
    );
    await client.query(
      `ALTER TABLE library.support_tickets   ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW()`
    );
    await client.query(
      `ALTER TABLE library.release_notes     ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW()`
    );
    await client.query(
      `ALTER TABLE library.ai_drafts         ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW()`
    );
  },
};

// ---------------------------------------------------------------------------
// Ordered list of all migrations.  Append new migrations at the end.
// ---------------------------------------------------------------------------

const ALL_MIGRATIONS: Migration[] = [migration1BaselineDDL, migration2AddUpdatedAt];

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

let migrationsRun = false;

async function ensureMigrationsTable(client: PoolClient): Promise<void> {
  await assertLibrarySchemaExists(client);

  await client.query(`
    CREATE TABLE IF NOT EXISTS library.schema_migrations (
      version INTEGER PRIMARY KEY,
      applied_at TIMESTAMP NOT NULL DEFAULT NOW(),
      description TEXT NOT NULL DEFAULT 
    )
  `);
}

async function getCurrentVersion(client: PoolClient): Promise<number> {
  const row = await client.query(
    `SELECT COALESCE(MAX(version), 0) AS current_version FROM library.schema_migrations`
  );
  return row.rows[0]?.current_version ?? 0;
}

async function recordMigration(
  client: PoolClient,
  version: number,
  description: string
): Promise<void> {
  await client.query(
    `INSERT INTO library.schema_migrations (version, applied_at, description) VALUES ($1, NOW(), $2) ON CONFLICT (version) DO NOTHING`,
    [version, description]
  );
}

/**
 * Run all pending migrations in order inside a single transaction.
 *
 * If an external PoolClient is provided, the caller is responsible for
 * transaction management.  Otherwise a new transaction is started.
 */
export async function runMigrations(externalClient?: PoolClient): Promise<{ applied: number[] }> {
  if (migrationsRun) return { applied: [] };

  const run = async (client: PoolClient): Promise<number[]> => {
    await ensureMigrationsTable(client);
    const currentVersion = await getCurrentVersion(client);

    const pending = ALL_MIGRATIONS.filter((m) => m.version > currentVersion).sort(
      (a, b) => a.version - b.version
    );

    if (pending.length === 0) {
      logger.info({ currentVersion }, "Database schema is up to date");
      return [];
    }

    const applied: number[] = [];
    for (const migration of pending) {
      logger.info(
        { version: migration.version, description: migration.description },
        "Running migration"
      );
      await migration.up(client);
      await recordMigration(client, migration.version, migration.description);
      applied.push(migration.version);
      logger.info({ version: migration.version }, "Migration applied");
    }

    return applied;
  };

  let applied: number[];
  if (externalClient) {
    applied = await run(externalClient);
  } else {
    applied = await withTransaction(run);
  }

  migrationsRun = true;
  return { applied };
}

/**
 * Return the current schema version (useful for health/status endpoints).
 */
export async function getSchemaVersion(): Promise<number> {
  try {
    const row = await querySingle<{ current_version: number }>(
      `SELECT COALESCE(MAX(version), 0) AS current_version FROM library.schema_migrations`
    );
    return row?.current_version ?? 0;
  } catch {
    return 0;
  }
}
