#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-http://127.0.0.1:3000}"
PROJECT_DIR="${PROJECT_DIR:-/home/jake/projects/stacksos}"
OUT_DIR="${OUT_DIR:-$PROJECT_DIR/audit/perf}"
STACKSOS_AUDIT_MUTATE="${STACKSOS_AUDIT_MUTATE:-0}"

mkdir -p "$OUT_DIR"

read_demo_value() {
  local demo_file="$1"
  local key="$2"
  local fallback="${3:-}"
  python3 - "$demo_file" "$key" "$fallback" <<'PY'
import json
import sys
from pathlib import Path

demo_file, key, fallback = sys.argv[1], sys.argv[2], sys.argv[3]
try:
    path = Path(demo_file)
    if not path.exists():
        print(fallback)
        raise SystemExit
    data = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(data, dict):
        print(fallback)
        raise SystemExit
    value = data.get(key, fallback)
    if value is None:
        print(fallback)
    else:
        text = str(value).strip()
        print(text if text else fallback)
except Exception:
    print(fallback)
PY
}

if [[ "$STACKSOS_AUDIT_MUTATE" != "1" ]]; then
  echo "NOTE: STACKSOS_AUDIT_MUTATE!=1; perf harness will run read-only (skipping checkout/checkin timings)." >&2
else
  DEMO_DATA="${DEMO_DATA:-$PROJECT_DIR/audit/demo_data.json}"
  if [[ -f "$DEMO_DATA" ]]; then
    if [[ -z "${PATRON_BARCODE:-}" ]]; then
      DEMO_PATRON_BARCODE="$(read_demo_value "$DEMO_DATA" "demoPatronBarcode" "")"
      if [[ -n "$DEMO_PATRON_BARCODE" ]]; then
        PATRON_BARCODE="$DEMO_PATRON_BARCODE"
        export PATRON_BARCODE
      fi
    fi
    if [[ -z "${ITEM_BARCODE:-}" ]]; then
      DEMO_ITEM_BARCODE="$(read_demo_value "$DEMO_DATA" "demoItemBarcode" "")"
      if [[ -n "$DEMO_ITEM_BARCODE" ]]; then
        ITEM_BARCODE="$DEMO_ITEM_BARCODE"
        export ITEM_BARCODE
      fi
    fi
  fi
fi

COOKIE_JAR_SEED="${COOKIE_JAR_SEED:-$PROJECT_DIR/audit/api/cookies.txt}" \
OUT_DIR="$OUT_DIR" \
BASE_URL="$BASE_URL" \
STACKSOS_AUDIT_MUTATE="$STACKSOS_AUDIT_MUTATE" \
python3 "$PROJECT_DIR/audit/perf_harness.py"

echo "Perf harness complete. Summary: $OUT_DIR/summary.tsv"
