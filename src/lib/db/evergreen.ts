import "server-only";

import { Pool, PoolClient } from "pg";
import { logger } from "@/lib/logger";
import { ensureLibrarySchemaExists } from "./library-schema";

let pool: Pool | null = null;

export function getEvergreenPool(): Pool {
  if (!pool) {
    const host = String(process.env.EVERGREEN_DB_HOST || "").trim() || "127.0.0.1";
    const portRaw = String(process.env.EVERGREEN_DB_PORT || "").trim();
    const port = Number.isFinite(Number(portRaw)) ? parseInt(portRaw, 10) : 5432;
    const database = String(process.env.EVERGREEN_DB_NAME || "").trim() || "evergreen";
    const user = String(process.env.EVERGREEN_DB_USER || "").trim() || "stacksos_app";

    if (process.env.NODE_ENV === "production") {
      const missing: string[] = [];
      if (!String(process.env.EVERGREEN_DB_HOST || "").trim()) missing.push("EVERGREEN_DB_HOST");
      if (!String(process.env.EVERGREEN_DB_USER || "").trim()) missing.push("EVERGREEN_DB_USER");
      if (missing.length) {
        logger.warn(
          { component: "db", missing },
          "Evergreen DB env vars missing; using safe defaults"
        );
      }
    }

    pool = new Pool({
      host,
      port,
      database,
      user,
      password: process.env.EVERGREEN_DB_PASSWORD,
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
    });

    pool.on("error", (err) => {
      logger.error({ error: String(err) }, "Unexpected error on idle Evergreen database client");
    });
  }

  return pool;
}

export async function query<T = any>(text: string, params?: any[]): Promise<T[]> {
  const pool = getEvergreenPool();
  const result = await pool.query(text, params);
  return result.rows;
}

export async function querySingle<T = any>(text: string, params?: any[]): Promise<T | null> {
  const rows = await query<T>(text, params);
  return rows.length > 0 ? rows[0]! : null;
}

export async function withTransaction<T>(callback: (client: PoolClient) => Promise<T>): Promise<T> {
  const pool = getEvergreenPool();
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    const result = await callback(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

// Initialize custom tables on first use
let tablesInitialized = false;

export async function ensureCustomTables(): Promise<void> {
  if (tablesInitialized) return;

  try {
    await ensureLibrarySchemaExists();

    await query(`
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

    await query(`
      CREATE INDEX IF NOT EXISTS idx_custom_covers_record_id
      ON library.custom_covers(record_id)
    `);

    tablesInitialized = true;
    logger.info({}, "Custom tables initialized successfully");
  } catch (error) {
    logger.error({ error: String(error) }, "Error initializing custom tables");
    throw error;
  }
}

// Patron photos custom table
let patronPhotosTableInitialized = false;

export async function ensurePatronPhotosTable(): Promise<void> {
  if (patronPhotosTableInitialized) return;

  try {
    await ensureLibrarySchemaExists();

    await query(`
      CREATE TABLE IF NOT EXISTS library.patron_photos (
        id SERIAL PRIMARY KEY,
        patron_id INTEGER NOT NULL UNIQUE,
        photo_url TEXT NOT NULL,
        uploaded_by INTEGER,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);

    await query(`
      CREATE INDEX IF NOT EXISTS idx_patron_photos_patron_id
      ON library.patron_photos(patron_id)
    `);

    patronPhotosTableInitialized = true;
    logger.info({}, "Patron photos table initialized successfully");
  } catch (error) {
    logger.error({ error: String(error) }, "Error initializing patron photos table");
    // Don't throw - table might already exist
  }
}

export async function savePatronPhotoUrl(
  patronId: number,
  photoUrl: string,
  uploadedBy?: number
): Promise<void> {
  await ensurePatronPhotosTable();

  await query(
    `
    INSERT INTO library.patron_photos (patron_id, photo_url, uploaded_by, updated_at)
    VALUES ($1, $2, $3, NOW())
    ON CONFLICT (patron_id)
    DO UPDATE SET photo_url = $2, uploaded_by = $3, updated_at = NOW()
  `,
    [patronId, photoUrl, uploadedBy || null]
  );

  // Best-effort: also persist to Evergreen core so other clients can display it.
  try {
    await query(
      `
        UPDATE actor.usr
        SET photo_url = $2
        WHERE id = $1
      `,
      [patronId, photoUrl]
    );
  } catch (error) {
    logger.warn({ error: String(error), patronId }, "Failed to update actor.usr.photo_url");
  }
}

export async function getPatronPhotoUrl(patronId: number): Promise<string | null> {
  await ensurePatronPhotosTable();

  const result = await querySingle<{ photo_url: string }>(
    `
    SELECT photo_url FROM library.patron_photos WHERE patron_id = $1
  `,
    [patronId]
  );

  if (result?.photo_url) return result.photo_url;

  // Fallback: Evergreen core field (supports photos uploaded outside StacksOS).
  const evergreen = await querySingle<{ photo_url: string | null }>(
    `
      SELECT photo_url
      FROM actor.usr
      WHERE id = $1
    `,
    [patronId]
  );

  return evergreen?.photo_url || null;
}

export async function clearPatronPhotoUrl(patronId: number, _clearedBy?: number): Promise<void> {
  await ensurePatronPhotosTable();

  await query(`DELETE FROM library.patron_photos WHERE patron_id = $1`, [patronId]);

  // Best-effort: also clear Evergreen core so other clients stop displaying it.
  try {
    await query(
      `
        UPDATE actor.usr
        SET photo_url = NULL
        WHERE id = $1
      `,
      [patronId]
    );
  } catch (error) {
    logger.warn({ error: String(error), patronId }, "Failed to clear actor.usr.photo_url");
  }
}
