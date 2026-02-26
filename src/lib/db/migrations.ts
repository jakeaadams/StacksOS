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
        severity TEXT NOT NULL DEFAULT 'info',
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
        category TEXT NOT NULL DEFAULT 'general',
        priority TEXT NOT NULL DEFAULT 'normal',
        subject TEXT NOT NULL,
        body TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'open'
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
        status TEXT NOT NULL DEFAULT 'inactive'
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
        status TEXT NOT NULL DEFAULT 'pending',
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
        status TEXT NOT NULL DEFAULT 'open',
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

/**
 * Migration #3 – SaaS role bindings for platform and tenant-scoped RBAC.
 */
const migration3SaasRoleBindings: Migration = {
  version: 3,
  description: "Create library.saas_role_bindings for SaaS RBAC",
  up: async (client: PoolClient) => {
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
  },
};

/**
 * Migration #4 - K-12 class circulation + developer platform webhooks/extensions.
 */
const migration4K12AndDeveloperPlatform: Migration = {
  version: 4,
  description: "Create K-12 class circulation and developer webhook/extension tables",
  up: async (client: PoolClient) => {
    await client.query(`
      CREATE TABLE IF NOT EXISTS library.k12_classes (
        id BIGSERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        teacher_name TEXT NOT NULL DEFAULT '',
        grade_level TEXT,
        home_ou INTEGER NOT NULL,
        active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
        created_by INTEGER,
        updated_by INTEGER
      )
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_k12_classes_home_ou
      ON library.k12_classes(home_ou, active, id DESC)
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS library.k12_students (
        id BIGSERIAL PRIMARY KEY,
        class_id BIGINT NOT NULL REFERENCES library.k12_classes(id) ON DELETE CASCADE,
        first_name TEXT NOT NULL,
        last_name TEXT NOT NULL,
        student_identifier TEXT,
        active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
        created_by INTEGER,
        updated_by INTEGER
      )
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_k12_students_class
      ON library.k12_students(class_id, active, id DESC)
    `);

    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_k12_students_identifier_unique
      ON library.k12_students(class_id, lower(student_identifier))
      WHERE student_identifier IS NOT NULL AND btrim(student_identifier) <> ''
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS library.k12_class_checkouts (
        id BIGSERIAL PRIMARY KEY,
        class_id BIGINT NOT NULL REFERENCES library.k12_classes(id) ON DELETE CASCADE,
        student_id BIGINT REFERENCES library.k12_students(id) ON DELETE SET NULL,
        copy_barcode TEXT NOT NULL,
        copy_id INTEGER,
        title TEXT,
        checkout_ts TIMESTAMP NOT NULL DEFAULT NOW(),
        due_ts TIMESTAMP,
        returned_ts TIMESTAMP,
        created_by INTEGER,
        notes TEXT
      )
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_k12_class_checkouts_active
      ON library.k12_class_checkouts(class_id, returned_ts, checkout_ts DESC)
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_k12_class_checkouts_student
      ON library.k12_class_checkouts(student_id, returned_ts, checkout_ts DESC)
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS library.webhook_subscriptions (
        id BIGSERIAL PRIMARY KEY,
        tenant_id TEXT NOT NULL DEFAULT 'default',
        name TEXT NOT NULL,
        endpoint_url TEXT NOT NULL,
        secret TEXT NOT NULL,
        events TEXT[] NOT NULL DEFAULT '{}',
        active BOOLEAN NOT NULL DEFAULT TRUE,
        last_tested_at TIMESTAMP,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
        created_by INTEGER,
        updated_by INTEGER,
        CONSTRAINT webhook_subscriptions_tenant_check
          CHECK (tenant_id ~ '^[a-z0-9][a-z0-9_-]{0,63}$'),
        CONSTRAINT webhook_subscriptions_endpoint_check
          CHECK (endpoint_url ~ '^https?://')
      )
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_webhook_subscriptions_tenant_active
      ON library.webhook_subscriptions(lower(tenant_id), active, id DESC)
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS library.webhook_deliveries (
        id BIGSERIAL PRIMARY KEY,
        subscription_id BIGINT NOT NULL REFERENCES library.webhook_subscriptions(id) ON DELETE CASCADE,
        event_type TEXT NOT NULL,
        delivery_id TEXT NOT NULL UNIQUE,
        status TEXT NOT NULL,
        status_code INTEGER,
        latency_ms INTEGER,
        request_body JSONB,
        response_body TEXT,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        delivered_at TIMESTAMP
      )
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_subscription
      ON library.webhook_deliveries(subscription_id, created_at DESC)
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_event
      ON library.webhook_deliveries(event_type, created_at DESC)
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS library.extension_registrations (
        id BIGSERIAL PRIMARY KEY,
        tenant_id TEXT NOT NULL DEFAULT 'default',
        extension_key TEXT NOT NULL,
        display_name TEXT NOT NULL,
        version TEXT,
        status TEXT NOT NULL DEFAULT 'active',
        capabilities TEXT[] NOT NULL DEFAULT '{}',
        webhook_subscription_id BIGINT REFERENCES library.webhook_subscriptions(id) ON DELETE SET NULL,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
        created_by INTEGER,
        updated_by INTEGER,
        CONSTRAINT extension_registrations_tenant_check
          CHECK (tenant_id ~ '^[a-z0-9][a-z0-9_-]{0,63}$')
      )
    `);

    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_extension_registrations_unique
      ON library.extension_registrations(lower(tenant_id), lower(extension_key))
    `);
  },
};

/**
 * Migration #5 – Add patron_id column to k12_students for patron linking.
 */
const migration5StudentPatronLinking: Migration = {
  version: 5,
  description: "Add patron_id column to k12_students for Evergreen patron linking",
  up: async (client: PoolClient) => {
    await client.query(
      `ALTER TABLE library.k12_students ADD COLUMN IF NOT EXISTS patron_id INTEGER`
    );
  },
};

/**
 * Migration #6 – K-12 asset management tables.
 */
const migration6K12Assets: Migration = {
  version: 6,
  description: "Create K-12 asset management and assignment tables",
  up: async (client: PoolClient) => {
    await client.query(`
      CREATE TABLE IF NOT EXISTS library.k12_assets (
        id SERIAL PRIMARY KEY,
        tenant_id TEXT NOT NULL DEFAULT 'default',
        asset_tag TEXT NOT NULL,
        name TEXT NOT NULL,
        category TEXT NOT NULL DEFAULT 'device',
        model TEXT,
        serial_number TEXT,
        status TEXT NOT NULL DEFAULT 'available',
        condition TEXT DEFAULT 'good',
        condition_notes TEXT,
        purchase_date DATE,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(tenant_id, asset_tag)
      )
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_k12_assets_tenant_status
      ON library.k12_assets(tenant_id, status, id DESC)
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_k12_assets_category
      ON library.k12_assets(tenant_id, category, id DESC)
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS library.k12_asset_assignments (
        id SERIAL PRIMARY KEY,
        asset_id INTEGER NOT NULL REFERENCES library.k12_assets(id),
        student_id INTEGER NOT NULL REFERENCES library.k12_students(id),
        assigned_at TIMESTAMP DEFAULT NOW(),
        returned_at TIMESTAMP,
        assigned_by INTEGER,
        condition_on_return TEXT,
        notes TEXT
      )
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_k12_asset_assignments_asset
      ON library.k12_asset_assignments(asset_id, returned_at, assigned_at DESC)
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_k12_asset_assignments_student
      ON library.k12_asset_assignments(student_id, returned_at, assigned_at DESC)
    `);
  },
};

/**
 * Migration #7 – Onboarding task completion persistence.
 */
const migration7OnboardingTaskCompletions: Migration = {
  version: 7,
  description: "Create library.onboarding_task_completions for onboarding wizard state",
  up: async (client: PoolClient) => {
    await client.query(`
      CREATE TABLE IF NOT EXISTS library.onboarding_task_completions (
        id SERIAL PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        task_id TEXT NOT NULL,
        completed_at TIMESTAMP DEFAULT NOW(),
        completed_by INTEGER,
        notes TEXT,
        UNIQUE(tenant_id, task_id)
      )
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_onboarding_task_completions_tenant
      ON library.onboarding_task_completions(tenant_id, task_id)
    `);
  },
};

/**
 * Migration #8 – K-12 reading challenges and progress tracking.
 */
const migration8K12ReadingChallenges: Migration = {
  version: 8,
  description: "Create K-12 reading challenges and challenge progress tables",
  up: async (client: PoolClient) => {
    await client.query(`
      CREATE TABLE IF NOT EXISTS library.k12_reading_challenges (
        id BIGSERIAL PRIMARY KEY,
        class_id BIGINT NOT NULL REFERENCES library.k12_classes(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        description TEXT,
        goal_type TEXT NOT NULL DEFAULT 'books',
        goal_value INT NOT NULL DEFAULT 10,
        start_date DATE NOT NULL,
        end_date DATE NOT NULL,
        created_by INT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_k12_reading_challenges_class
      ON library.k12_reading_challenges(class_id, start_date, end_date)
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS library.k12_challenge_progress (
        id BIGSERIAL PRIMARY KEY,
        challenge_id BIGINT NOT NULL REFERENCES library.k12_reading_challenges(id) ON DELETE CASCADE,
        student_id BIGINT NOT NULL REFERENCES library.k12_students(id) ON DELETE CASCADE,
        progress_value INT NOT NULL DEFAULT 0,
        completed_at TIMESTAMPTZ,
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE (challenge_id, student_id)
      )
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_k12_challenge_progress_challenge
      ON library.k12_challenge_progress(challenge_id, progress_value DESC)
    `);
  },
};

/**
 * Migration #9 – Summer reading config, missing CHECK constraints, and
 * created_at column for challenge progress.
 */
const migration9SummerReadingAndConstraints: Migration = {
  version: 9,
  description:
    "Create summer_reading_config, add CHECK constraints to reading challenges, add created_at to challenge progress",
  up: async (client: PoolClient) => {
    // -- summer_reading_config ------------------------------------------------
    await client.query(`
      CREATE TABLE IF NOT EXISTS library.summer_reading_config (
        id BIGSERIAL PRIMARY KEY,
        org_unit INT NOT NULL,
        program_name TEXT NOT NULL DEFAULT 'Summer Reading Program',
        start_date DATE NOT NULL,
        end_date DATE NOT NULL,
        goal_type TEXT NOT NULL DEFAULT 'books' CHECK (goal_type IN ('books', 'pages', 'minutes')),
        goal_value INT NOT NULL DEFAULT 10,
        badge_enabled BOOLEAN NOT NULL DEFAULT FALSE,
        active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_summer_reading_config_org
      ON library.summer_reading_config (org_unit, active)
    `);

    // -- Add CHECK constraints missing from migration 8 ----------------------
    await client.query(`
      DO $$ BEGIN
        ALTER TABLE library.k12_reading_challenges
          ADD CONSTRAINT chk_goal_type CHECK (goal_type IN ('books', 'pages', 'minutes'));
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$
    `);

    await client.query(`
      DO $$ BEGIN
        ALTER TABLE library.k12_reading_challenges
          ADD CONSTRAINT chk_dates CHECK (end_date >= start_date);
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$
    `);

    // -- Add created_at column to k12_challenge_progress ---------------------
    await client.query(`
      DO $$ BEGIN
        ALTER TABLE library.k12_challenge_progress ADD COLUMN created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$
    `);
  },
};

// ---------------------------------------------------------------------------
// Ordered list of all migrations.  Append new migrations at the end.
// ---------------------------------------------------------------------------

const ALL_MIGRATIONS: Migration[] = [
  migration1BaselineDDL,
  migration2AddUpdatedAt,
  migration3SaasRoleBindings,
  migration4K12AndDeveloperPlatform,
  migration5StudentPatronLinking,
  migration6K12Assets,
  migration7OnboardingTaskCompletions,
  migration8K12ReadingChallenges,
  migration9SummerReadingAndConstraints,
];

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
      description TEXT NOT NULL DEFAULT ''
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
