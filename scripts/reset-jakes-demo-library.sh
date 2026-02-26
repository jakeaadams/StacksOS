#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

BASE_URL="${BASE_URL:-${STACKSOS_BASE_URL:-https://127.0.0.1}}"
EVERGREEN_BASE_URL="${DEMO_EVERGREEN_BASE_URL:-${EVERGREEN_BASE_URL:-}}"
DEMO_TENANT_ID="${DEMO_TENANT_ID:-jakes-demo-library}"
DEMO_TENANT_NAME="${DEMO_TENANT_NAME:-Jake's Demo Library}"
DEMO_TENANT_PROFILE="${DEMO_TENANT_PROFILE:-public}"
STAFF_USER="${DEMO_STAFF_USER:-${STACKSOS_AUDIT_STAFF_USERNAME:-${E2E_STAFF_USER:-jake}}}"
STAFF_PASS="${DEMO_STAFF_PASS:-${STACKSOS_AUDIT_STAFF_PASSWORD:-${E2E_STAFF_PASS:-jake}}}"
WORKSTATION="${DEMO_WORKSTATION:-STACKSOS-DEMO-RESET}"
DEMO_BIB_COUNT="${DEMO_BIB_COUNT:-120}"
DEMO_PATRON_COUNT="${DEMO_PATRON_COUNT:-24}"

SKIP_PURGE=0
SKIP_TENANT=0

for arg in "$@"; do
  case "$arg" in
    --skip-purge) SKIP_PURGE=1 ;;
    --skip-tenant) SKIP_TENANT=1 ;;
    *) ;;
  esac
done

echo "[demo-reset] base url: ${BASE_URL}"
echo "[demo-reset] tenant: ${DEMO_TENANT_ID} (${DEMO_TENANT_NAME})"

if [ "$SKIP_PURGE" -ne 1 ]; then
  echo "[demo-reset] purging prior demo footprint..."
  BASE_URL="$BASE_URL" \
    STACKSOS_AUDIT_STAFF_USERNAME="$STAFF_USER" \
    STACKSOS_AUDIT_STAFF_PASSWORD="$STAFF_PASS" \
    STACKSOS_AUDIT_WORKSTATION="$WORKSTATION" \
    bash "$ROOT_DIR/scripts/purge-evergreen-demo-data.sh" --apply
else
  echo "[demo-reset] skipping purge (requested)"
fi

echo "[demo-reset] seeding deterministic demo dataset..."
(
  cd "$ROOT_DIR"
  STACKSOS_BASE_URL="$BASE_URL" \
  SEED_STAFF_USERNAME="$STAFF_USER" \
  SEED_STAFF_PASSWORD="$STAFF_PASS" \
  SEED_WORKSTATION="$WORKSTATION" \
  DEMO_BIB_COUNT="$DEMO_BIB_COUNT" \
  DEMO_PATRON_COUNT="$DEMO_PATRON_COUNT" \
  node scripts/seed-sandbox-demo-data.mjs
)

if [ "$SKIP_TENANT" -ne 1 ]; then
  if [ -z "$EVERGREEN_BASE_URL" ]; then
    echo "[demo-reset] DEMO_EVERGREEN_BASE_URL / EVERGREEN_BASE_URL not set; skipping tenant provision"
  else
    echo "[demo-reset] writing tenant profile for ${DEMO_TENANT_ID}..."
    (
      cd "$ROOT_DIR"
      npx tsx scripts/provision-tenant.ts \
        --tenant-id "$DEMO_TENANT_ID" \
        --display-name "$DEMO_TENANT_NAME" \
        --evergreen-base-url "$EVERGREEN_BASE_URL" \
        --profile "$DEMO_TENANT_PROFILE"
    )
  fi
else
  echo "[demo-reset] skipping tenant provision (requested)"
fi

echo "[demo-reset] complete"
echo "[demo-reset] next: set STACKSOS_TENANT_ID=${DEMO_TENANT_ID} and restart StacksOS"
