#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-http://127.0.0.1:3000}"
PROJECT_DIR="${PROJECT_DIR:-/home/jake/projects/stacksos}"
OUT_DIR="${OUT_DIR:-$PROJECT_DIR/audit/perf}"
STACKSOS_AUDIT_MUTATE="${STACKSOS_AUDIT_MUTATE:-0}"

mkdir -p "$OUT_DIR"

if [[ "$STACKSOS_AUDIT_MUTATE" != "1" ]]; then
  echo "NOTE: STACKSOS_AUDIT_MUTATE!=1; perf harness will run read-only (skipping checkout/checkin timings)." >&2
fi

COOKIE_JAR_SEED="${COOKIE_JAR_SEED:-$PROJECT_DIR/audit/api/cookies.txt}" \
OUT_DIR="$OUT_DIR" \
BASE_URL="$BASE_URL" \
STACKSOS_AUDIT_MUTATE="$STACKSOS_AUDIT_MUTATE" \
python3 "$PROJECT_DIR/audit/perf_harness.py"

echo "Perf harness complete. Summary: $OUT_DIR/summary.tsv"
