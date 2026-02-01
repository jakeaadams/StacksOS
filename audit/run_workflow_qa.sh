#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:3000}"
PROJECT_DIR="${PROJECT_DIR:-/home/jake/projects/stacksos}"
OUT_DIR="${OUT_DIR:-$PROJECT_DIR/audit/workflow}"
COOKIE_JAR="$OUT_DIR/cookies.txt"
COOKIE_JAR_SEED="${COOKIE_JAR_SEED:-}"
LOG="$OUT_DIR/summary.tsv"
CSRF_TOKEN=""

PATRON_BARCODE="${PATRON_BARCODE:-}"
ITEM_BARCODE="${ITEM_BARCODE:-39000000001235}"
WORKSTATION="${WORKSTATION:-STACKSOS-QA}"
ORG_ID="${ORG_ID:-101}"

mkdir -p "$OUT_DIR"
rm -f "$OUT_DIR"/*.json 2>/dev/null || true
if [[ -n "$COOKIE_JAR_SEED" && -f "$COOKIE_JAR_SEED" ]]; then
  cp "$COOKIE_JAR_SEED" "$COOKIE_JAR"
else
  rm -f "$COOKIE_JAR" 2>/dev/null || true
fi

: > "$LOG"
printf "name\tstatus\turl\n" >> "$LOG"

call() {
  local name="$1"; shift
  local url="$1"; shift
  local method="${1:-GET}"; shift || true
  local data="${1:-}"; shift || true

  local resp
  if [[ "$method" == "GET" ]]; then
    resp=$(curl -sS -w '\nHTTP_STATUS:%{http_code}\n' \
      -b "$COOKIE_JAR" -c "$COOKIE_JAR" \
      "$url")
  else
    if [[ -z "$CSRF_TOKEN" ]]; then
      echo "ERROR: CSRF_TOKEN is empty; call /api/csrf-token first" >&2
      exit 1
    fi
    resp=$(curl -sS -w '\nHTTP_STATUS:%{http_code}\n' \
      -b "$COOKIE_JAR" -c "$COOKIE_JAR" \
      -H 'Content-Type: application/json' \
      -H "x-csrf-token: $CSRF_TOKEN" \
      -X "$method" \
      -d "$data" \
      "$url")
  fi

  local status
  status=$(echo "$resp" | awk -F: '/HTTP_STATUS/{print $2}' | tr -d '\r')
  echo "$resp" | sed '/HTTP_STATUS/d' > "$OUT_DIR/$name.json"
  printf "%s\t%s\t%s\n" "$name" "$status" "$url" >> "$LOG"
}

require_ok() {
  local name="$1"; shift
  python3 - <<PY
import json,sys
p=json.load(open("$OUT_DIR/$name.json"))
if isinstance(p, dict) and p.get("ok") is False:
  sys.stderr.write("${name}: ok=false ({})\\n".format(p.get("error")))
  sys.exit(1)
sys.exit(0)
PY
}

HOLD_ID=""
cleanup() {
  if [[ -n "$HOLD_ID" ]]; then
    echo "[cleanup] Attempting to cancel hold $HOLD_ID" >&2
    call "holds_cancel_cleanup" "$BASE_URL/api/evergreen/holds" "POST" "{\"action\":\"cancel_hold\",\"holdId\":$HOLD_ID,\"reason\":4,\"note\":\"QA cleanup\"}"
  fi
}
trap cleanup EXIT

# 0) Ping
call "ping" "$BASE_URL/api/evergreen/ping"
require_ok "ping"

# 0b) CSRF token (required for POST/PUT/PATCH/DELETE)
call "csrf_token" "$BASE_URL/api/csrf-token"
CSRF_TOKEN=$(python3 - <<PY
import json,sys
p=json.load(open("$OUT_DIR/csrf_token.json"))
print(p.get("token") or "")
PY
)
if [[ -z "$CSRF_TOKEN" ]]; then
  echo "ERROR: failed to obtain CSRF token from $OUT_DIR/csrf_token.json" >&2
  exit 1
fi

# 1) Login (and auto-register workstation if needed)
call "auth_session_preflight" "$BASE_URL/api/evergreen/auth"
require_ok "auth_session_preflight"

ALREADY_AUTHED=$(python3 - <<PY
import json
p=json.load(open("$OUT_DIR/auth_session_preflight.json"))
print("1" if p.get("authenticated") else "0")
PY
)

if [[ "$ALREADY_AUTHED" != "1" ]]; then
  AUTH_PAYLOAD=$(cat <<JSON
{"username":"jake","password":"jake","workstation":"$WORKSTATION"}
JSON
)
  call "auth_login" "$BASE_URL/api/evergreen/auth" "POST" "$AUTH_PAYLOAD"
  require_ok "auth_login"

  NEEDS_WS=$(python3 - <<PY
import json
p=json.load(open("$OUT_DIR/auth_login.json"))
print("1" if p.get("needsWorkstation") else "0")
PY
)

  if [[ "$NEEDS_WS" == "1" ]]; then
    REG_PAYLOAD=$(cat <<JSON
{"name":"$WORKSTATION","org_id":$ORG_ID}
JSON
)
    call "workstation_register" "$BASE_URL/api/evergreen/workstations" "POST" "$REG_PAYLOAD"
    require_ok "workstation_register"
    call "auth_login_retry" "$BASE_URL/api/evergreen/auth" "POST" "$AUTH_PAYLOAD"
    require_ok "auth_login_retry"
  fi
fi

call "auth_session" "$BASE_URL/api/evergreen/auth"
require_ok "auth_session"

# 2) Resolve patron from session (prefers logged-in staff user)
PATRON_ID=$(python3 - <<PY
import json
p=json.load(open("$OUT_DIR/auth_session.json"))
user=p.get("user") or {}
print(user.get("id") or "")
PY
)
SESSION_BARCODE=$(python3 - <<PY
import json
p=json.load(open("$OUT_DIR/auth_session.json"))
user=p.get("user") or {}
card=user.get("card") or {}
barcode=None
if isinstance(card, dict):
  barcode=card.get("barcode")
print(barcode or "")
PY
)
if [[ -n "$SESSION_BARCODE" ]]; then
  PATRON_BARCODE="$SESSION_BARCODE"
fi

# Prefer resolving the logged-in user's card barcode via patron-by-id.
call "patron_by_id" "$BASE_URL/api/evergreen/patrons?id=$PATRON_ID"
require_ok "patron_by_id"
BARCODE_FROM_ID=$(python3 - <<PY
import json
p=json.load(open("$OUT_DIR/patron_by_id.json"))
patron=p.get("patron") or {}
barcode=None
if isinstance(patron, dict):
  barcode=patron.get("barcode")
  card=patron.get("card")
  if not barcode and isinstance(card, dict):
    barcode=card.get("barcode")
print(barcode or "")
PY
)
if [[ -n "$BARCODE_FROM_ID" ]]; then
  PATRON_BARCODE="$BARCODE_FROM_ID"
fi

# Verify patron lookup by barcode (if we have one).
if [[ -n "$PATRON_BARCODE" ]]; then
  call "patron_lookup" "$BASE_URL/api/evergreen/patrons?barcode=$PATRON_BARCODE"
  require_ok "patron_lookup"
fi

if [[ -z "$PATRON_ID" ]]; then
  echo "Patron ID missing from patron lookup" >&2
  exit 1
fi

if [[ -z "$PATRON_BARCODE" ]]; then
  echo "Patron barcode missing; cannot run circulation workflows" >&2
  exit 1
fi

call "item_lookup" "$BASE_URL/api/evergreen/items?barcode=$ITEM_BARCODE&include=bib,history"
require_ok "item_lookup"

RECORD_ID=$(python3 - <<PY
import json
p=json.load(open("$OUT_DIR/item_lookup.json"))
item=p.get("item") or {}
print(item.get("recordId") or "")
PY
)

if [[ -z "$RECORD_ID" ]]; then
  echo "Record ID missing from item lookup (needed for title holds + MARC)" >&2
  exit 1
fi

# 3) Circulation core: checkout -> renew -> checkin
# Best-effort: ensure the item is not already checked out.
PRECHECKIN_PAYLOAD=$(cat <<JSON
{"action":"checkin","itemBarcode":"$ITEM_BARCODE"}
JSON
)
call "circ_checkin_prep" "$BASE_URL/api/evergreen/circulation" "POST" "$PRECHECKIN_PAYLOAD"

CHECKOUT_PAYLOAD=$(cat <<JSON
{"action":"checkout","patronBarcode":"$PATRON_BARCODE","itemBarcode":"$ITEM_BARCODE"}
JSON
)
call "circ_checkout" "$BASE_URL/api/evergreen/circulation" "POST" "$CHECKOUT_PAYLOAD"
require_ok "circ_checkout"

call "circ_patron_checkouts_after_checkout" "$BASE_URL/api/evergreen/circulation?patron_id=$PATRON_ID"
require_ok "circ_patron_checkouts_after_checkout"

FOUND_CHECKOUT=$(python3 - <<PY
import json
p=json.load(open("$OUT_DIR/circ_patron_checkouts_after_checkout.json"))
co=((p.get("checkouts") or {}).get("out") or []) + ((p.get("checkouts") or {}).get("overdue") or [])
barcode="$ITEM_BARCODE"
print("1" if any((isinstance(i, dict) and i.get("barcode")==barcode) for i in co) else "0")
PY
)

if [[ "$FOUND_CHECKOUT" != "1" ]]; then
  echo "Checked-out item was not present in patron checkouts after checkout" >&2
  exit 1
fi

RENEW_PAYLOAD=$(cat <<JSON
{"action":"renew","itemBarcode":"$ITEM_BARCODE"}
JSON
)
call "circ_renew" "$BASE_URL/api/evergreen/circulation" "POST" "$RENEW_PAYLOAD"
require_ok "circ_renew"

CHECKIN_PAYLOAD=$(cat <<JSON
{"action":"checkin","itemBarcode":"$ITEM_BARCODE"}
JSON
)
call "circ_checkin" "$BASE_URL/api/evergreen/circulation" "POST" "$CHECKIN_PAYLOAD"
require_ok "circ_checkin"

call "circ_patron_checkouts_after_checkin" "$BASE_URL/api/evergreen/circulation?patron_id=$PATRON_ID"
require_ok "circ_patron_checkouts_after_checkin"

STILL_PRESENT=$(python3 - <<PY
import json
p=json.load(open("$OUT_DIR/circ_patron_checkouts_after_checkin.json"))
co=((p.get("checkouts") or {}).get("out") or []) + ((p.get("checkouts") or {}).get("overdue") or [])
barcode="$ITEM_BARCODE"
print("1" if any((isinstance(i, dict) and i.get("barcode")==barcode) for i in co) else "0")
PY
)

if [[ "$STILL_PRESENT" == "1" ]]; then
  echo "Checked-in item still present in patron checkouts after checkin" >&2
  exit 1
fi

# 4) Bills snapshot
call "bills" "$BASE_URL/api/evergreen/circulation?action=bills&patron_id=$PATRON_ID"
require_ok "bills"

# 5) Holds: place title hold -> verify -> cancel -> verify cancelled
HOLD_PAYLOAD=$(cat <<JSON
{"action":"place_hold","patronId":$PATRON_ID,"targetId":$RECORD_ID,"holdType":"T","pickupLib":$ORG_ID}
JSON
)
call "holds_place" "$BASE_URL/api/evergreen/holds" "POST" "$HOLD_PAYLOAD"
require_ok "holds_place"

HOLD_ID=$(python3 - <<PY
import json
p=json.load(open("$OUT_DIR/holds_place.json"))
print(p.get("holdId") or p.get("hold_id") or "")
PY
)

if [[ -z "$HOLD_ID" ]]; then
  echo "Hold placement did not return holdId" >&2
  exit 1
fi

# Verify hold appears in patron holds (retry a few times)
FOUND="0"
for i in 1 2 3; do
  call "holds_patron_$i" "$BASE_URL/api/evergreen/holds?action=patron_holds&patron_id=$PATRON_ID"
  require_ok "holds_patron_$i"
  FOUND=$(python3 - <<PY
import json
p=json.load(open("$OUT_DIR/holds_patron_$i.json"))
holds=p.get("holds") or []
print("1" if any((h.get("id") == int("$HOLD_ID")) for h in holds if isinstance(h, dict)) else "0")
PY
)
  if [[ "$FOUND" == "1" ]]; then
    break
  fi
  sleep 1
done

if [[ "$FOUND" != "1" ]]; then
  echo "Placed hold $HOLD_ID was not visible in patron holds list" >&2
  exit 1
fi

CANCEL_PAYLOAD=$(cat <<JSON
{"action":"cancel_hold","holdId":$HOLD_ID,"reason":4,"note":"QA cancel"}
JSON
)
call "holds_cancel" "$BASE_URL/api/evergreen/holds" "POST" "$CANCEL_PAYLOAD"
require_ok "holds_cancel"

# Verify cancellation flag via hold_details (best-effort)
call "holds_details" "$BASE_URL/api/evergreen/holds?action=hold_details&hold_id=$HOLD_ID"
require_ok "holds_details"

CANCELLED=$(python3 - <<PY
import json
from collections import deque
p=json.load(open("$OUT_DIR/holds_details.json"))
root=p.get("hold") or p

# Search recursively for cancel_time/cancel_cause fields.
q=deque([root])
found=False
while q:
  cur=q.popleft()
  if isinstance(cur, dict):
    for k,v in cur.items():
      lk=str(k).lower()
      if lk in ("cancel_time","cancel_cause","cancelled") and v:
        found=True
        break
      q.append(v)
    if found:
      break
  elif isinstance(cur, list):
    q.extend(cur)

print("1" if found else "0")
PY
)

if [[ "$CANCELLED" != "1" ]]; then
  echo "WARNING: hold_details did not clearly indicate cancellation fields; cancellation may still have succeeded" >&2
fi

# Clear hold cleanup trap once we've cancelled.
HOLD_ID=""

# 6) Cataloging: fetch MARC XML and perform safe no-op update
call "catalog_record" "$BASE_URL/api/evergreen/catalog?action=record&id=$RECORD_ID"
require_ok "catalog_record"

MARCXML=$(python3 - <<PY
import json
p=json.load(open("$OUT_DIR/catalog_record.json"))
rec=p.get("record") or {}
print(rec.get("marc_xml") or "")
PY
)

if [[ -z "$MARCXML" ]]; then
  echo "MARC XML missing from catalog record; cannot test update" >&2
  exit 1
fi

# Write MARCXML to file for inspection
python3 - <<PY
from pathlib import Path
Path("$OUT_DIR/marcxml.xml").write_text("""$MARCXML""", encoding="utf-8")
PY

# No-op update (same marcxml)
UPDATE_PAYLOAD=$(python3 - <<PY
import json
print(json.dumps({"recordId": int("$RECORD_ID"), "marcxml": open("$OUT_DIR/marcxml.xml", encoding="utf-8").read()}))
PY
)

call "marc_update" "$BASE_URL/api/evergreen/marc" "PUT" "$UPDATE_PAYLOAD"
require_ok "marc_update"

echo "Workflow QA complete. Summary: $LOG"
