#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-http://127.0.0.1:3000}"
PROJECT_DIR="${PROJECT_DIR:-/home/jake/projects/stacksos}"
OUT_DIR="${OUT_DIR:-$PROJECT_DIR/audit/perf}"

mkdir -p "$OUT_DIR"

COOKIE_JAR_SEED="${COOKIE_JAR_SEED:-$PROJECT_DIR/audit/api/cookies.txt}" \
OUT_DIR="$OUT_DIR" \
BASE_URL="$BASE_URL" \
python3 "$PROJECT_DIR/audit/perf_harness.py"

echo "Perf harness complete. Summary: $OUT_DIR/summary.tsv"
