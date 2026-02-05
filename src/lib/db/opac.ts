import { logger } from "@/lib/logger";
import { querySingle, query } from "./evergreen";
import { ensureLibrarySchemaExists } from "./library-schema";

let opacTablesInitialized = false;

async function ensureOpacTables(): Promise<void> {
  if (opacTablesInitialized) return;

  await ensureLibrarySchemaExists();

  await query(`
    CREATE TABLE IF NOT EXISTS library.opac_privacy_prefs (
      patron_id INTEGER PRIMARY KEY,
      personalized_recommendations BOOLEAN NOT NULL DEFAULT FALSE,
      reading_history_personalization BOOLEAN NOT NULL DEFAULT FALSE,
      updated_at TIMESTAMP DEFAULT NOW()
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS library.opac_patron_prefs (
      patron_id INTEGER PRIMARY KEY,
      default_pickup_location INTEGER,
      default_search_location INTEGER,
      updated_at TIMESTAMP DEFAULT NOW()
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS library.kids_reading_log (
      id BIGSERIAL PRIMARY KEY,
      patron_id INTEGER NOT NULL,
      bib_id INTEGER,
      title TEXT NOT NULL,
      author TEXT,
      isbn TEXT,
      minutes_read INTEGER NOT NULL,
      pages_read INTEGER,
      rating INTEGER,
      notes TEXT,
      read_at DATE NOT NULL DEFAULT CURRENT_DATE,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);

  await query(`
    CREATE INDEX IF NOT EXISTS idx_kids_reading_log_patron_id
    ON library.kids_reading_log(patron_id)
  `);

  await query(`
    CREATE INDEX IF NOT EXISTS idx_kids_reading_log_patron_read_at
    ON library.kids_reading_log(patron_id, read_at DESC)
  `);

  opacTablesInitialized = true;
  logger.info({}, "OPAC tables initialized");
}

export type OpacPrivacyPrefs = {
  personalizedRecommendations: boolean;
  readingHistoryPersonalization: boolean;
};

export type OpacPatronPrefs = {
  defaultPickupLocation: number | null;
  defaultSearchLocation: number | null;
};

export async function getOpacPrivacyPrefs(patronId: number): Promise<OpacPrivacyPrefs> {
  await ensureOpacTables();
  const row = await querySingle<{
    personalized_recommendations: boolean;
    reading_history_personalization: boolean;
  }>(
    `
      SELECT personalized_recommendations, reading_history_personalization
      FROM library.opac_privacy_prefs
      WHERE patron_id = $1
    `,
    [patronId]
  );

  return {
    personalizedRecommendations: Boolean(row?.personalized_recommendations),
    readingHistoryPersonalization: Boolean(row?.reading_history_personalization),
  };
}

export async function upsertOpacPrivacyPrefs(
  patronId: number,
  updates: Partial<OpacPrivacyPrefs>
): Promise<OpacPrivacyPrefs> {
  await ensureOpacTables();

  const personalized =
    updates.personalizedRecommendations !== undefined ? Boolean(updates.personalizedRecommendations) : null;
  const history =
    updates.readingHistoryPersonalization !== undefined ? Boolean(updates.readingHistoryPersonalization) : null;

  await query(
    `
      INSERT INTO library.opac_privacy_prefs (
        patron_id,
        personalized_recommendations,
        reading_history_personalization,
        updated_at
      )
      VALUES ($1, COALESCE($2, FALSE), COALESCE($3, FALSE), NOW())
      ON CONFLICT (patron_id)
      DO UPDATE SET
        personalized_recommendations = COALESCE($2, library.opac_privacy_prefs.personalized_recommendations),
        reading_history_personalization = COALESCE($3, library.opac_privacy_prefs.reading_history_personalization),
        updated_at = NOW()
    `,
    [patronId, personalized, history]
  );

  return getOpacPrivacyPrefs(patronId);
}

export async function getOpacPatronPrefs(patronId: number): Promise<OpacPatronPrefs> {
  await ensureOpacTables();
  const row = await querySingle<{
    default_pickup_location: number | null;
    default_search_location: number | null;
  }>(
    `
      SELECT default_pickup_location, default_search_location
      FROM library.opac_patron_prefs
      WHERE patron_id = $1
    `,
    [patronId]
  );

  return {
    defaultPickupLocation: row?.default_pickup_location ?? null,
    defaultSearchLocation: row?.default_search_location ?? null,
  };
}

export async function upsertOpacPatronPrefs(
  patronId: number,
  updates: Partial<OpacPatronPrefs>
): Promise<OpacPatronPrefs> {
  await ensureOpacTables();

  const pickup =
    updates.defaultPickupLocation !== undefined ? updates.defaultPickupLocation : null;
  const search =
    updates.defaultSearchLocation !== undefined ? updates.defaultSearchLocation : null;

  await query(
    `
      INSERT INTO library.opac_patron_prefs (
        patron_id,
        default_pickup_location,
        default_search_location,
        updated_at
      )
      VALUES ($1, $2, $3, NOW())
      ON CONFLICT (patron_id)
      DO UPDATE SET
        default_pickup_location = COALESCE($2, library.opac_patron_prefs.default_pickup_location),
        default_search_location = COALESCE($3, library.opac_patron_prefs.default_search_location),
        updated_at = NOW()
    `,
    [patronId, pickup, search]
  );

  return getOpacPatronPrefs(patronId);
}

export type KidsReadingLogEntry = {
  id: number;
  bibId: number | null;
  title: string;
  author: string | null;
  isbn: string | null;
  minutesRead: number;
  pagesRead: number | null;
  rating: number | null;
  notes: string | null;
  readAt: string;
  createdAt: string;
};

export async function listKidsReadingLogEntries(
  patronId: number,
  limit = 50,
  offset = 0
): Promise<KidsReadingLogEntry[]> {
  await ensureOpacTables();
  const rows = await query<{
    id: string | number;
    bib_id: number | null;
    title: string;
    author: string | null;
    isbn: string | null;
    minutes_read: number;
    pages_read: number | null;
    rating: number | null;
    notes: string | null;
    read_at: string;
    created_at: string;
  }>(
    `
      SELECT
        id,
        bib_id,
        title,
        author,
        isbn,
        minutes_read,
        pages_read,
        rating,
        notes,
        read_at,
        created_at
      FROM library.kids_reading_log
      WHERE patron_id = $1
      ORDER BY read_at DESC, id DESC
      LIMIT $2 OFFSET $3
    `,
    [patronId, limit, offset]
  );

  return rows.map((r) => ({
    id: typeof r.id === "number" ? r.id : parseInt(String(r.id), 10),
    bibId: r.bib_id ?? null,
    title: r.title,
    author: r.author ?? null,
    isbn: r.isbn ?? null,
    minutesRead: Number(r.minutes_read) || 0,
    pagesRead: r.pages_read ?? null,
    rating: r.rating ?? null,
    notes: r.notes ?? null,
    readAt: r.read_at,
    createdAt: r.created_at,
  }));
}

export async function addKidsReadingLogEntry(
  patronId: number,
  entry: Omit<KidsReadingLogEntry, "id" | "createdAt">
): Promise<KidsReadingLogEntry> {
  await ensureOpacTables();
  const row = await querySingle<{
    id: string | number;
    created_at: string;
  }>(
    `
      INSERT INTO library.kids_reading_log (
        patron_id,
        bib_id,
        title,
        author,
        isbn,
        minutes_read,
        pages_read,
        rating,
        notes,
        read_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING id, created_at
    `,
    [
      patronId,
      entry.bibId ?? null,
      entry.title,
      entry.author ?? null,
      entry.isbn ?? null,
      entry.minutesRead,
      entry.pagesRead ?? null,
      entry.rating ?? null,
      entry.notes ?? null,
      entry.readAt,
    ]
  );

  return {
    ...entry,
    id: typeof row?.id === "number" ? row.id : parseInt(String(row?.id ?? ""), 10),
    createdAt: row?.created_at || new Date().toISOString(),
  };
}

export async function deleteKidsReadingLogEntry(patronId: number, entryId: number): Promise<boolean> {
  await ensureOpacTables();
  const row = await querySingle<{ id: number }>(
    `
      DELETE FROM library.kids_reading_log
      WHERE patron_id = $1 AND id = $2
      RETURNING id
    `,
    [patronId, entryId]
  );
  return typeof row?.id === "number";
}
