#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

read_env_value() {
  local key="$1"
  local file="$2"
  if [[ ! -f "$file" ]]; then
    return 1
  fi
  awk -F= -v target="$key" '
    $0 ~ /^[[:space:]]*#/ { next }
    NF < 2 { next }
    {
      k=$1
      gsub(/^[[:space:]]+|[[:space:]]+$/, "", k)
      if (k != target) next
      v=substr($0, index($0, "=") + 1)
      gsub(/^[[:space:]]+|[[:space:]]+$/, "", v)
      if ((substr(v,1,1) == "\"" && substr(v,length(v),1) == "\"") ||
          (substr(v,1,1) == "'"'"'" && substr(v,length(v),1) == "'"'"'")) {
        v=substr(v,2,length(v)-2)
      }
      print v
      exit
    }
  ' "$file"
}

lookup_env() {
  local key="$1"
  local value="${!key-}"
  if [[ -n "${value}" ]]; then
    printf "%s" "$value"
    return 0
  fi

  local local_file="$ROOT_DIR/.env.local"
  local env_file="$ROOT_DIR/.env"

  value="$(read_env_value "$key" "$local_file" 2>/dev/null || true)"
  if [[ -n "$value" ]]; then
    printf "%s" "$value"
    return 0
  fi

  value="$(read_env_value "$key" "$env_file" 2>/dev/null || true)"
  if [[ -n "$value" ]]; then
    printf "%s" "$value"
    return 0
  fi

  return 1
}

DB_HOST="${DB_HOST:-$(lookup_env EVERGREEN_DB_HOST || true)}"
DB_PORT="${DB_PORT:-$(lookup_env EVERGREEN_DB_PORT || true)}"
DB_NAME="${DB_NAME:-$(lookup_env EVERGREEN_DB_NAME || true)}"
DB_USER="${DB_USER:-$(lookup_env EVERGREEN_DB_USER || true)}"
DB_PASSWORD="${DB_PASSWORD:-$(lookup_env EVERGREEN_DB_PASSWORD || true)}"
LABEL="${LABEL:-before-upgrade}"
OUT_DIR="${OUT_DIR:-}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --label)
      LABEL="$2"
      shift 2
      ;;
    --out-dir)
      OUT_DIR="$2"
      shift 2
      ;;
    --db-host)
      DB_HOST="$2"
      shift 2
      ;;
    --db-port)
      DB_PORT="$2"
      shift 2
      ;;
    --db-name)
      DB_NAME="$2"
      shift 2
      ;;
    --db-user)
      DB_USER="$2"
      shift 2
      ;;
    --db-password)
      DB_PASSWORD="$2"
      shift 2
      ;;
    *)
      echo "Unknown argument: $1" >&2
      echo "Usage: $0 [--label before-upgrade|after-upgrade] [--out-dir PATH] [--db-host HOST --db-port PORT --db-name DB --db-user USER --db-password PASS]" >&2
      exit 1
      ;;
  esac
done

DB_PORT="${DB_PORT:-5432}"
if [[ -z "$DB_HOST" || -z "$DB_NAME" || -z "$DB_USER" ]]; then
  echo "Missing DB connection values." >&2
  echo "Required: DB_HOST, DB_NAME, DB_USER (or EVERGREEN_DB_HOST/NAME/USER)." >&2
  exit 1
fi

if ! command -v psql >/dev/null 2>&1; then
  echo "psql is required but was not found in PATH." >&2
  echo "Install PostgreSQL client tools, then re-run this script." >&2
  exit 1
fi

if [[ -z "$OUT_DIR" ]]; then
  TS="$(date -u +"%Y%m%dT%H%M%SZ")"
  OUT_DIR="$ROOT_DIR/audit/evergreen-footprint/${TS}-${LABEL}"
fi

mkdir -p "$OUT_DIR"

if [[ -n "$DB_PASSWORD" ]]; then
  export PGPASSWORD="$DB_PASSWORD"
fi

PSQL=(psql -X -v ON_ERROR_STOP=1 -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME")

echo "[footprint] writing snapshot to $OUT_DIR"

"${PSQL[@]}" -A -F $'\t' -P footer=off -c "
SELECT 'snapshot_label', '${LABEL}'
UNION ALL SELECT 'snapshot_utc', to_char((now() at time zone 'UTC'), 'YYYY-MM-DD\"T\"HH24:MI:SS\"Z\"')
UNION ALL SELECT 'db_host', '${DB_HOST}'
UNION ALL SELECT 'db_port', '${DB_PORT}'
UNION ALL SELECT 'db_name', current_database()
UNION ALL SELECT 'db_user', current_user
UNION ALL SELECT 'postgres_version', current_setting('server_version');
" > "$OUT_DIR/snapshot_meta.tsv"

"${PSQL[@]}" -A -F $'\t' -P footer=off -c "
SELECT
  n.nspname AS schema_name,
  SUM(CASE WHEN c.relkind IN ('r','p') THEN 1 ELSE 0 END)::int AS tables,
  SUM(CASE WHEN c.relkind = 'v' THEN 1 ELSE 0 END)::int AS views,
  SUM(CASE WHEN c.relkind = 'm' THEN 1 ELSE 0 END)::int AS matviews,
  SUM(CASE WHEN c.relkind = 'S' THEN 1 ELSE 0 END)::int AS sequences
FROM pg_namespace n
LEFT JOIN pg_class c ON c.relnamespace = n.oid
WHERE n.nspname NOT LIKE 'pg_%'
  AND n.nspname <> 'information_schema'
GROUP BY n.nspname
ORDER BY n.nspname;
" > "$OUT_DIR/schema_objects.tsv"

HAS_LIBRARY="$("${PSQL[@]}" -At -c "SELECT EXISTS(SELECT 1 FROM pg_namespace WHERE nspname='library')")"
if [[ "$HAS_LIBRARY" == "t" ]]; then
  {
    printf "table_name\trows\n"
    while IFS= read -r table_name; do
      [[ -z "$table_name" ]] && continue
      row_count="$("${PSQL[@]}" -At -c "SELECT COUNT(*)::bigint FROM library.\"${table_name}\"")"
      printf "%s\t%s\n" "$table_name" "$row_count"
    done < <("${PSQL[@]}" -At -c "
      SELECT c.relname
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'library'
        AND c.relkind IN ('r','p')
      ORDER BY c.relname
    ")
  } > "$OUT_DIR/library_table_rows.tsv"
else
  printf "table_name\trows\n" > "$OUT_DIR/library_table_rows.tsv"
fi

"${PSQL[@]}" -A -F $'\t' -P footer=off -c "
SELECT 'actor_workstation_total' AS metric, COUNT(*)::bigint AS value FROM actor.workstation
UNION ALL
SELECT 'actor_workstation_stacksos_prefix', COUNT(*)::bigint FROM actor.workstation WHERE name ILIKE 'STACKSOS-%'
UNION ALL
SELECT 'actor_usr_photo_url_nonempty', COUNT(*)::bigint FROM actor.usr WHERE COALESCE(photo_url, '') <> ''
UNION ALL
SELECT 'actor_hours_of_operation_rows', COUNT(*)::bigint FROM actor.hours_of_operation
UNION ALL
SELECT 'actor_org_unit_closed_rows', COUNT(*)::bigint FROM actor.org_unit_closed;
" > "$OUT_DIR/core_touchpoints.tsv"

"${PSQL[@]}" -A -F $'\t' -P footer=off -c "
SELECT
  rolname,
  has_schema_privilege(rolname, 'library', 'USAGE') AS has_usage,
  has_schema_privilege(rolname, 'library', 'CREATE') AS has_create
FROM pg_roles
WHERE EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'library')
  AND (
    has_schema_privilege(rolname, 'library', 'USAGE')
    OR has_schema_privilege(rolname, 'library', 'CREATE')
  )
ORDER BY rolname;
" > "$OUT_DIR/library_schema_grants.tsv"

"${PSQL[@]}" -A -F $'\t' -P footer=off -c "
SELECT
  grantee,
  privilege_type,
  COUNT(*)::int AS table_count
FROM information_schema.role_table_grants
WHERE table_schema = 'library'
GROUP BY grantee, privilege_type
ORDER BY grantee, privilege_type;
" > "$OUT_DIR/library_table_grants.tsv"

get_metric() {
  local metric="$1"
  awk -F $'\t' -v key="$metric" '$1==key { print $2; exit }' "$OUT_DIR/core_touchpoints.tsv"
}

WORKSTATIONS_TOTAL="$(get_metric actor_workstation_total)"
WORKSTATIONS_STACKSOS="$(get_metric actor_workstation_stacksos_prefix)"
PHOTO_URLS="$(get_metric actor_usr_photo_url_nonempty)"
HOURS_ROWS="$(get_metric actor_hours_of_operation_rows)"
CLOSED_ROWS="$(get_metric actor_org_unit_closed_rows)"

cat > "$OUT_DIR/README.md" <<EOF
# Evergreen Footprint Snapshot

- Label: \`${LABEL}\`
- Generated: \`$(date -u +"%Y-%m-%dT%H:%M:%SZ")\`
- DB: \`${DB_HOST}:${DB_PORT}/${DB_NAME}\`

## Core-touchpoint summary

- \`actor.workstation\` total rows: ${WORKSTATIONS_TOTAL:-0}
- \`actor.workstation\` \`STACKSOS-%\` rows: ${WORKSTATIONS_STACKSOS:-0}
- \`actor.usr.photo_url\` non-empty rows: ${PHOTO_URLS:-0}
- \`actor.hours_of_operation\` rows: ${HOURS_ROWS:-0}
- \`actor.org_unit_closed\` rows: ${CLOSED_ROWS:-0}

## Artifacts

- \`snapshot_meta.tsv\` - snapshot metadata and DB identity
- \`schema_objects.tsv\` - schema object inventory
- \`library_table_rows.tsv\` - exact row counts for all \`library.*\` tables
- \`core_touchpoints.tsv\` - Evergreen core table touchpoint counters
- \`library_schema_grants.tsv\` - roles with \`USAGE/CREATE\` on \`library\` schema
- \`library_table_grants.tsv\` - table-level grants in \`library\` schema

## Upgrade workflow

1. Run once before Evergreen upgrade:

   \`\`\`bash
   bash scripts/evergreen-footprint-snapshot.sh --label before-upgrade
   \`\`\`

2. Run once after Evergreen upgrade:

   \`\`\`bash
   bash scripts/evergreen-footprint-snapshot.sh --label after-upgrade
   \`\`\`

3. Compare outputs:

   \`\`\`bash
   diff -ru audit/evergreen-footprint/<before-dir> audit/evergreen-footprint/<after-dir>
   \`\`\`
EOF

echo "[footprint] done"
echo "[footprint] summary: $OUT_DIR/README.md"
