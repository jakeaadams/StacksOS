#!/usr/bin/env bash
set -euo pipefail

ROOT="${STACKSOS_ROOT:-/home/jake/projects/stacksos}"
OUT_DIR="${STACKSOS_BACKUP_DIR:-/var/backups/stacksos}"
RETENTION_DAYS="${STACKSOS_BACKUP_RETENTION_DAYS:-14}"

ts="$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p "${OUT_DIR}"

tmp="${OUT_DIR}/stacksos-${ts}.tar.gz.tmp"
out="${OUT_DIR}/stacksos-${ts}.tar.gz"

tar -C "${ROOT}" -czf "${tmp}" \
  --warning=no-file-changed \
  .env.local \
  tenants \
  docs \
  .logs/audit.log \
  2>/dev/null || true

mv "${tmp}" "${out}"

find "${OUT_DIR}" -type f -name "stacksos-*.tar.gz" -mtime +"${RETENTION_DAYS}" -delete || true

echo "Wrote ${out}"

