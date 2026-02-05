#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-http://127.0.0.1:3000}"
PROJECT_DIR="${PROJECT_DIR:-/home/jake/projects/stacksos}"
OUT_DIR="${OUT_DIR:-$PROJECT_DIR/audit/perf}"
STACKSOS_AUDIT_MUTATE="${STACKSOS_AUDIT_MUTATE:-0}"

mkdir -p "$OUT_DIR"

if [[ "$STACKSOS_AUDIT_MUTATE" != "1" ]]; then
  echo "NOTE: STACKSOS_AUDIT_MUTATE!=1; perf harness will run read-only (skipping checkout/checkin timings)." >&2
else
  DEMO_DATA="${DEMO_DATA:-$PROJECT_DIR/audit/demo_data.json}"
  if [[ -f "$DEMO_DATA" ]]; then
    if [[ -z "${PATRON_BARCODE:-}" ]]; then
      PATRON_BARCODE="$(python3 -c "import json; print(json.load(open('${DEMO_DATA}')).get('demoPatronBarcode',''))" 2>/dev/null)" || true
      export PATRON_BARCODE
    fi
    if [[ -z "${ITEM_BARCODE:-}" ]]; then
      ITEM_BARCODE="$(python3 -c "import json; print(json.load(open('${DEMO_DATA}')).get('demoItemBarcode',''))" 2>/dev/null)" || true
      export ITEM_BARCODE
    fi
  fi
fi

COOKIE_JAR_SEED="${COOKIE_JAR_SEED:-$PROJECT_DIR/audit/api/cookies.txt}" \
OUT_DIR="$OUT_DIR" \
BASE_URL="$BASE_URL" \
STACKSOS_AUDIT_MUTATE="$STACKSOS_AUDIT_MUTATE" \
python3 "$PROJECT_DIR/audit/perf_harness.py"

echo "Perf harness complete. Summary: $OUT_DIR/summary.tsv"
