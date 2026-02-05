#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-http://127.0.0.1:3000}"
SECRET="${STACKSOS_SCHEDULED_REPORTS_SECRET:-}"

if [[ -z "${SECRET}" ]]; then
  echo "ERROR: STACKSOS_SCHEDULED_REPORTS_SECRET is not set" >&2
  exit 1
fi

COOKIE_JAR="$(mktemp)"
cleanup() {
  rm -f "$COOKIE_JAR" 2>/dev/null || true
}
trap cleanup EXIT

# Fetch CSRF token (middleware enforces CSRF on all mutations, including cron calls).
CSRF_JSON="$(curl -fsS -c "$COOKIE_JAR" "${BASE_URL}/api/csrf-token")"
CSRF_TOKEN="$(python3 - <<PY
import json,sys
try:
  p=json.loads(sys.stdin.read())
  print(p.get("token") or "")
except Exception:
  print("")
PY
<<<"$CSRF_JSON"
)"
if [[ -z "$CSRF_TOKEN" ]]; then
  echo "ERROR: failed to obtain CSRF token from ${BASE_URL}/api/csrf-token" >&2
  exit 1
fi

curl -fsS -X POST \
  -b "$COOKIE_JAR" -c "$COOKIE_JAR" \
  -H "x-csrf-token: ${CSRF_TOKEN}" \
  -H "x-stacksos-cron-secret: ${SECRET}" \
  "${BASE_URL}/api/reports/scheduled/run-due?limit=10" >/dev/null

echo "Scheduled reports runner: OK"
