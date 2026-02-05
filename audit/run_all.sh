#!/usr/bin/env bash
set -euo pipefail

# Audit artifacts can include auth cookies and PII (patron names, barcodes, etc.).
# Default to restrictive permissions so the audit folder isn't world-readable on servers.
umask 077

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BASE_URL="${BASE_URL:-http://localhost:3000}"
export ROOT_DIR

banner() {
  printf "\n[run_all] %s\n" "$1"
}

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "ERROR: missing required command: $1" >&2
    exit 1
  fi
}

banner "Preflight"
require_cmd curl
require_cmd python3
require_cmd awk
require_cmd grep

# Server required for API/workflow audits.
if ! curl -fsS "$BASE_URL/api/evergreen/ping" >/dev/null 2>&1; then
  echo "ERROR: StacksOS server not reachable at $BASE_URL" >&2
  echo "Start it (dev): cd $ROOT_DIR && npm run dev -- -H 0.0.0.0 -p 3000" >&2
  echo "Or (prod): cd $ROOT_DIR && npm run build && npm run start -- -H 0.0.0.0 -p 3000" >&2
  exit 1
fi

# Guardrails: mutation mode must only run against disposable Evergreen datasets.
if [[ "${STACKSOS_AUDIT_MUTATE:-0}" == "1" ]]; then
  if [[ "${STACKSOS_AUDIT_CONFIRM_MUTATION:-}" != "I_UNDERSTAND" ]]; then
    echo "ERROR: STACKSOS_AUDIT_MUTATE=1 is destructive." >&2
    echo "Run only against a disposable Evergreen dataset, then re-run with:" >&2
    echo "  STACKSOS_AUDIT_CONFIRM_MUTATION=I_UNDERSTAND STACKSOS_AUDIT_MUTATE=1 $0" >&2
    exit 1
  fi
  if [[ ! -f "$ROOT_DIR/audit/demo_data.json" ]]; then
    echo "ERROR: mutation audit requires $ROOT_DIR/audit/demo_data.json" >&2
    echo "Seed a disposable dataset first:" >&2
    echo "  node $ROOT_DIR/scripts/seed-sandbox-demo-data.mjs" >&2
    exit 1
  fi
fi

banner "Server code hygiene: disallow console.*"
if grep -RInE "console\\.(log|warn|error|debug|info)" "$ROOT_DIR/src" \
  --exclude=client-logger.ts \
  --exclude='*.bak' \
  --exclude='*.backup' \
  --exclude='*.backup2' \
  --exclude='*.backup3' \
  --exclude='*.backup_*' \
  --exclude='*.orig' >/dev/null 2>&1; then
  echo "ERROR: console.* found in src/. Use src/lib/logger.ts instead." >&2
  grep -RInE "console\\.(log|warn|error|debug|info)" "$ROOT_DIR/src" \
    --exclude=client-logger.ts \
    --exclude='*.bak' \
    --exclude='*.backup' \
    --exclude='*.backup2' \
    --exclude='*.backup3' \
    --exclude='*.backup_*' \
    --exclude='*.orig' | head -50 >&2
  exit 1
fi

banner "RBAC audit (mutation endpoints must be permission-gated)"
"$ROOT_DIR/audit/run_rbac_audit.sh"

banner "UI audit (dead UI heuristics)"
"$ROOT_DIR/audit/run_ui_audit.sh"

banner "API audit (adapter surface)"
"$ROOT_DIR/audit/run_api_audit.sh"

# Fail if any endpoint returned non-200.
API_SUMMARY="$ROOT_DIR/audit/api/summary.tsv"
if [[ -f "$API_SUMMARY" ]]; then
  # Some API audit fixtures are intentionally negative (edge-case validation)
  # and should not fail the "all endpoints must be 200" gate.
  NON200=$(awk 'NR>1 && $2 != "200" && $1 !~ /^(circ_checkout_block|circ_checkout_bad_patron)$/ {count++} END {print count+0}' "$API_SUMMARY")
  if [[ "$NON200" -gt 0 ]]; then
    echo "ERROR: API audit had $NON200 non-200 endpoints. See: $API_SUMMARY" >&2
    awk 'NR==1 || ($2 != "200" && $1 !~ /^(circ_checkout_block|circ_checkout_bad_patron)$/)' "$API_SUMMARY" | head -50 >&2
    exit 1
  fi
fi

# Fail if any API JSON returned ok:false (even if 200).
python3 - <<'PY'
import json
import os
import sys
from pathlib import Path

root = Path(os.environ.get('ROOT_DIR', '/home/jake/projects/stacksos'))
api_dir = root / 'audit' / 'api'

allowed_ok_false = {
    "circ_checkout_block.json",
    "circ_checkout_bad_patron.json",
}

bad = []
for p in api_dir.glob('*.json'):
    if p.name in allowed_ok_false:
        continue
    try:
        data = json.loads(p.read_text(encoding='utf-8'))
    except Exception:
        continue
    if isinstance(data, dict) and data.get('ok') is False:
        bad.append((p.name, data.get('error')))

if bad:
    for name, err in bad:
        print(f"ok=false in {name}: {err}")
    sys.exit(1)
sys.exit(0)
PY

banner "Contract tests (adapter invariants)"
bash "$ROOT_DIR/audit/run_contract_tests.sh"

banner "Workflow QA (checkout/checkin/holds/bills smoke)"
if [[ "${STACKSOS_AUDIT_MUTATE:-0}" != "1" ]]; then
  echo "NOTE: STACKSOS_AUDIT_MUTATE!=1; workflow QA will run read-only (no circ/holds/MARC mutations)." >&2
fi
STACKSOS_QA_FULL_RESET_EFFECTIVE="${STACKSOS_QA_FULL_RESET:-}"
if [[ "${STACKSOS_AUDIT_MUTATE:-0}" == "1" && -z "$STACKSOS_QA_FULL_RESET_EFFECTIVE" ]]; then
  # Mutation audits are intended for disposable datasets; default to resetting
  # the demo patron state to reduce flakiness across repeated runs.
  STACKSOS_QA_FULL_RESET_EFFECTIVE="1"
fi
STACKSOS_QA_FULL_RESET="$STACKSOS_QA_FULL_RESET_EFFECTIVE" COOKIE_JAR_SEED="$ROOT_DIR/audit/api/cookies.txt" "$ROOT_DIR/audit/run_workflow_qa.sh"

banner "Performance budgets (p50/p95)"
"$ROOT_DIR/audit/run_perf.sh"

banner "Repo inventory (routes/pages/modules coverage)"
python3 "$ROOT_DIR/audit/repo_inventory.py"

banner "Generate audit report artifacts"
python3 "$ROOT_DIR/audit/generate_audit_report.py"

banner "PASS"

echo "Artifacts:" \
  && echo "- $ROOT_DIR/audit/REPORT.md" \
  && echo "- $ROOT_DIR/audit/FEATURE_MATRIX.md" \
  && echo "- $ROOT_DIR/audit/REPO_INVENTORY.md" \
  && echo "- $ROOT_DIR/audit/api/summary.tsv" \
  && echo "- $ROOT_DIR/audit/workflow/summary.tsv" \
  && echo "- $ROOT_DIR/audit/perf/summary.tsv" \
  && echo "- $ROOT_DIR/audit/perf/report.json"
