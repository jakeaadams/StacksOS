import type { PoolClient } from "pg";
import { querySingle } from "./evergreen";

const LIBRARY_SCHEMA_NAME = "library";

function missingSchemaHelp(): string {
  return [
    `Evergreen database is missing required schema "${LIBRARY_SCHEMA_NAME}".`,
    "Create it and grant StacksOS DB user privileges, e.g.:",
    "",
    `  CREATE SCHEMA ${LIBRARY_SCHEMA_NAME} AUTHORIZATION evergreen;`,
    `  GRANT USAGE, CREATE ON SCHEMA ${LIBRARY_SCHEMA_NAME} TO stacksos_app;`,
    "",
    "Then restart StacksOS.",
  ].join("\n");
}

export async function ensureLibrarySchemaExists(): Promise<void> {
  const row = await querySingle<{ exists: boolean }>(
    `select exists(select 1 from pg_namespace where nspname = $1) as exists`,
    [LIBRARY_SCHEMA_NAME]
  );

  if (!row?.exists) {
    throw new Error(missingSchemaHelp());
  }
}

export async function assertLibrarySchemaExists(client: PoolClient): Promise<void> {
  const res = await client.query(`select 1 from pg_namespace where nspname = $1 limit 1`, [
    LIBRARY_SCHEMA_NAME,
  ]);
  if (res.rowCount === 0) {
    throw new Error(missingSchemaHelp());
  }
}

