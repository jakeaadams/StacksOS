#!/usr/bin/env bash
set -euo pipefail

# Run destructive audits only after seeding disposable demo data.
#
# This script:
# - prompts for staff creds (no echo)
# - seeds demo fixtures via StacksOS API (writes audit/demo_data.json)
# - runs ./audit/run_all.sh with STACKSOS_AUDIT_MUTATE=1

umask 077

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BASE_URL="${BASE_URL:-http://127.0.0.1:3000}"

if [[ "${STACKSOS_AUDIT_CONFIRM_MUTATION:-}" != "I_UNDERSTAND" ]]; then
  echo "ERROR: mutation audits are destructive." >&2
  echo "Run ONLY against a disposable Evergreen dataset." >&2
  echo "" >&2
  echo "Then re-run with:" >&2
  echo "  STACKSOS_AUDIT_CONFIRM_MUTATION=I_UNDERSTAND $0" >&2
  exit 1
fi

if [[ -z "${STACKSOS_AUDIT_STAFF_USERNAME:-}" ]]; then
  read -r -p "StacksOS staff username: " STACKSOS_AUDIT_STAFF_USERNAME
  export STACKSOS_AUDIT_STAFF_USERNAME
fi

if [[ -z "${STACKSOS_AUDIT_STAFF_PASSWORD:-}" ]]; then
  read -r -s -p "StacksOS staff password: " STACKSOS_AUDIT_STAFF_PASSWORD
  echo ""
  export STACKSOS_AUDIT_STAFF_PASSWORD
fi

echo "[mutation_sandbox] Seeding demo data (writes audit/demo_data.json)"
node "$ROOT_DIR/scripts/seed-sandbox-demo-data.mjs"

echo "[mutation_sandbox] Running full audit suite (mutation mode)"
STACKSOS_AUDIT_MUTATE=1 BASE_URL="$BASE_URL" "$ROOT_DIR/audit/run_all.sh"

