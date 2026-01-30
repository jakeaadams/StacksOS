#!/usr/bin/env bash
set -euo pipefail

ts() { date -u +"%Y-%m-%dT%H:%M:%SZ"; }
log() { printf "[%s] %s\n" "$(ts)" "$*"; }

require_root() {
  if [[ "${EUID:-$(id -u)}" -ne 0 ]]; then
    echo "ERROR: must run as root (use sudo)" >&2
    exit 1
  fi
}

usage() {
  cat <<'EOF'
Usage: evergreen_backup.sh [options]

Creates local backups of:
  - PostgreSQL DB (as postgres user, no password prompts)
  - Evergreen/Apache config (contains secrets; root-only)

Options:
  --dest PATH        Backup directory (default: /var/backups/evergreen)
  --keep-days N      Retention in days (default: 14)
  --db-name NAME     DB name (default: evergreen)
  --skip-db          Skip database backup
  --skip-config      Skip config backup
  -h, --help         Show help

Notes:
  - Config archives include credentials from /openils/conf. Keep backups root-only.
EOF
}

DEST="/var/backups/evergreen"
KEEP_DAYS="14"
DB_NAME="evergreen"
SKIP_DB="0"
SKIP_CONFIG="0"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dest)
      DEST="${2:-}"
      shift 2
      ;;
    --keep-days)
      KEEP_DAYS="${2:-}"
      shift 2
      ;;
    --db-name)
      DB_NAME="${2:-}"
      shift 2
      ;;
    --skip-db)
      SKIP_DB="1"
      shift
      ;;
    --skip-config)
      SKIP_CONFIG="1"
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "ERROR: unknown option: $1" >&2
      usage
      exit 2
      ;;
  esac
done

stamp="$(date -u +%Y%m%dT%H%M%SZ)"

mkdir -p "$DEST"/{db,config}
chmod 0700 "$DEST" "$DEST/db" "$DEST/config" || true

backup_db() {
  if [[ "$SKIP_DB" == "1" ]]; then
    log "Skipping DB backup"
    return 0
  fi

  if ! command -v pg_dump >/dev/null 2>&1; then
    log "Installing PostgreSQL client tools"
    apt-get update -y
    apt-get install -y postgresql-client
  fi

  log "Backing up PostgreSQL database: ${DB_NAME}"
  local dump_file="$DEST/db/${DB_NAME}.${stamp}.dump"
  local globals_file="$DEST/db/globals.${stamp}.sql"

  sudo -u postgres pg_dump -Fc "$DB_NAME" >"$dump_file"
  chmod 0600 "$dump_file" || true

  sudo -u postgres pg_dumpall --globals-only >"$globals_file"
  chmod 0600 "$globals_file" || true
}

backup_config() {
  if [[ "$SKIP_CONFIG" == "1" ]]; then
    log "Skipping config backup"
    return 0
  fi

  log "Backing up Evergreen + Apache config (root-only archive)"
  local out="$DEST/config/config.${stamp}.tar.gz"

  local paths=()
  [[ -d /openils/conf ]] && paths+=("/openils/conf")
  [[ -d /etc/apache2 ]] && paths+=("/etc/apache2")
  [[ -d /etc/ufw ]] && paths+=("/etc/ufw")
  [[ -f /etc/ssh/sshd_config ]] && paths+=("/etc/ssh/sshd_config")
  [[ -d /etc/ssh/sshd_config.d ]] && paths+=("/etc/ssh/sshd_config.d")

  if [[ "${#paths[@]}" -eq 0 ]]; then
    log "WARN: no config paths found to back up"
    return 0
  fi

  tar -czf "$out" "${paths[@]}"
  chmod 0600 "$out" || true
}

prune_old() {
  local days="$KEEP_DAYS"
  if ! [[ "$days" =~ ^[0-9]+$ ]]; then
    log "WARN: invalid --keep-days value: $KEEP_DAYS (skipping prune)"
    return 0
  fi

  log "Pruning backups older than ${days} day(s)"
  find "$DEST/db" -type f -mtime +"$days" -name '*.dump' -delete 2>/dev/null || true
  find "$DEST/db" -type f -mtime +"$days" -name 'globals.*.sql' -delete 2>/dev/null || true
  find "$DEST/config" -type f -mtime +"$days" -name 'config.*.tar.gz' -delete 2>/dev/null || true
}

main() {
  require_root
  backup_db
  backup_config
  prune_old

  log "Backup output:"
  ls -lh "$DEST/db" "$DEST/config" | sed -n '1,200p' || true
  log "DONE"
}

main

