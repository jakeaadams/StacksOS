#!/usr/bin/env bash
set -euo pipefail

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
  NON200=$(awk 'NR>1 && $2 != "200" {count++} END {print count+0}' "$API_SUMMARY")
  if [[ "$NON200" -gt 0 ]]; then
    echo "ERROR: API audit had $NON200 non-200 endpoints. See: $API_SUMMARY" >&2
    awk 'NR==1 || $2 != "200"' "$API_SUMMARY" | head -50 >&2
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

bad = []
for p in api_dir.glob('*.json'):
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

banner "Workflow QA (checkout/checkin/holds/bills smoke)"
COOKIE_JAR_SEED="$ROOT_DIR/audit/api/cookies.txt" "$ROOT_DIR/audit/run_workflow_qa.sh"

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
