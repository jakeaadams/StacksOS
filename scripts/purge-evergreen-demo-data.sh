#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-${STACKSOS_BASE_URL:-https://127.0.0.1}}"
STAFF_USER="${STACKSOS_AUDIT_STAFF_USERNAME:-${E2E_STAFF_USER:-jake}}"
STAFF_PASS="${STACKSOS_AUDIT_STAFF_PASSWORD:-${E2E_STAFF_PASS:-jake}}"
WORKSTATION="${STACKSOS_AUDIT_WORKSTATION:-STACKSOS-PURGE}"
APPLY=0

for arg in "$@"; do
  case "$arg" in
    --apply) APPLY=1 ;;
    *) ;;
  esac
done

if ! command -v curl >/dev/null 2>&1; then
  echo "curl is required" >&2
  exit 1
fi

COOKIE_JAR="$(mktemp)"
cleanup() { rm -f "$COOKIE_JAR"; }
trap cleanup EXIT

echo "[purge-demo] Logging in to ${BASE_URL} as ${STAFF_USER}..."
csrf_response="$(curl -sS -k -c "$COOKIE_JAR" -b "$COOKIE_JAR" "${BASE_URL}/api/csrf-token")"
csrf_token="$(printf "%s" "$csrf_response" | jq -r '.token // .csrfToken // empty' 2>/dev/null || true)"
if [ -z "$csrf_token" ]; then
  echo "[purge-demo] failed to fetch CSRF token from ${BASE_URL}/api/csrf-token" >&2
  exit 1
fi

login_payload="$(printf '{"username":"%s","password":"%s","workstation":"%s"}' "$STAFF_USER" "$STAFF_PASS" "$WORKSTATION")"
login_response="$(curl -sS -k -c "$COOKIE_JAR" -b "$COOKIE_JAR" \
  -H "Content-Type: application/json" \
  -H "x-csrf-token: ${csrf_token}" \
  -X POST \
  -d "$login_payload" \
  "${BASE_URL}/api/evergreen/auth")"

if command -v jq >/dev/null 2>&1; then
  login_ok="$(printf "%s" "$login_response" | jq -r '.ok // false')"
  if [ "$login_ok" != "true" ]; then
    echo "[purge-demo] login failed: $login_response" >&2
    exit 1
  fi
fi

echo "[purge-demo] Current demo-data footprint:"
scan_response="$(curl -sS -k -c "$COOKIE_JAR" -b "$COOKIE_JAR" \
  "${BASE_URL}/api/admin/data-hygiene/demo")"
if command -v jq >/dev/null 2>&1; then
  printf "%s" "$scan_response" | jq '{ok, counts, ids}'
else
  printf "%s\n" "$scan_response"
fi

if [ "$APPLY" -ne 1 ]; then
  echo "[purge-demo] Dry run only. Re-run with --apply to delete."
  exit 0
fi

echo "[purge-demo] Applying deletion..."
purge_response="$(curl -sS -k -c "$COOKIE_JAR" -b "$COOKIE_JAR" \
  -H "Content-Type: application/json" \
  -H "x-csrf-token: ${csrf_token}" \
  -X POST \
  -d '{"confirm":"DELETE_DEMO_DATA","dryRun":false}' \
  "${BASE_URL}/api/admin/data-hygiene/demo")"

if command -v jq >/dev/null 2>&1; then
  printf "%s" "$purge_response" | jq '{ok, before, deleted, errors}'
else
  printf "%s\n" "$purge_response"
fi

echo "[purge-demo] Re-scan after deletion:"
after_response="$(curl -sS -k -c "$COOKIE_JAR" -b "$COOKIE_JAR" \
  "${BASE_URL}/api/admin/data-hygiene/demo")"
if command -v jq >/dev/null 2>&1; then
  printf "%s" "$after_response" | jq '{ok, counts, ids}'
else
  printf "%s\n" "$after_response"
fi
