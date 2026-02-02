#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:3000}"
PROJECT_DIR="${PROJECT_DIR:-/home/jake/projects/stacksos}"
OUT_DIR="${OUT_DIR:-$PROJECT_DIR/audit/api}"
COOKIE_JAR="$OUT_DIR/cookies.txt"
COOKIE_JAR_SEED="${COOKIE_JAR_SEED:-}"
LOG="$OUT_DIR/summary.tsv"
CSRF_TOKEN=""

PATRON_QUERY="${PATRON_QUERY:-Adams}"
STAFF_QUERY="${STAFF_QUERY:-jake}"
PATRON_BARCODE="${PATRON_BARCODE:-}"
ITEM_BARCODE="${ITEM_BARCODE:-39000000001235}"
WORKSTATION="${WORKSTATION:-STACKSOS-AUDIT}"
ORG_ID="${ORG_ID:-101}"

mkdir -p "$OUT_DIR"
rm -f "$OUT_DIR"/*.json 2>/dev/null || true
if [[ -n "$COOKIE_JAR_SEED" && -f "$COOKIE_JAR_SEED" ]]; then
  cp "$COOKIE_JAR_SEED" "$COOKIE_JAR"
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

# 1) Ping + orgs
call "ping" "$BASE_URL/api/evergreen/ping"
call "orgs" "$BASE_URL/api/evergreen/orgs"

# 1b) CSRF token (required for all state-changing ops like auth login)
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

# 2) Auth preflight (avoid rate-limit during iteration if we already have a valid cookie jar)
call "auth_session_preflight" "$BASE_URL/api/evergreen/auth"

ALREADY_AUTHED=$(python3 - <<PY
import json
p=json.load(open("$OUT_DIR/auth_session_preflight.json"))
print("1" if p.get("authenticated") else "0")
PY
)

if [[ "$ALREADY_AUTHED" != "1" ]]; then
  # Login
  AUTH_PAYLOAD=$(cat <<JSON
{"username":"jake","password":"jake","workstation":"$WORKSTATION"}
JSON
)
  call "auth_login" "$BASE_URL/api/evergreen/auth" "POST" "$AUTH_PAYLOAD"

  # Detect if workstation registration is needed
  if python3 - <<PY
import json,sys
p=json.load(open("$OUT_DIR/auth_login.json"))
sys.exit(0 if p.get("needsWorkstation") else 1)
PY
  then
    REG_PAYLOAD=$(cat <<JSON
{"name":"$WORKSTATION","org_id":$ORG_ID}
JSON
)
    call "workstation_register" "$BASE_URL/api/evergreen/workstations" "POST" "$REG_PAYLOAD"
    # Retry login
    call "auth_login_retry" "$BASE_URL/api/evergreen/auth" "POST" "$AUTH_PAYLOAD"
  fi
fi

# 3) Session check
call "auth_session" "$BASE_URL/api/evergreen/auth"

# 4) Workstation list
call "workstations_list" "$BASE_URL/api/evergreen/workstations?org_id=$ORG_ID"

# 4b) Staff user search (admin UX)
call "staff_users_search" "$BASE_URL/api/evergreen/staff-users?q=${STAFF_QUERY}&limit=10"

# 5) Patron search (discover a real barcode/id to avoid brittle fixtures)
call "patron_search" "$BASE_URL/api/evergreen/patrons?q=${PATRON_QUERY}&type=name"

read -r DISCOVERED_BARCODE DISCOVERED_ID < <(python3 - <<PY
import json
from pathlib import Path

p=json.load(open("$OUT_DIR/patron_search.json"))
rows=p.get("patrons") or []

def pick_barcode(row):
  # Common shapes: barcode, card.barcode, card[0] etc.
  if isinstance(row, dict):
    if row.get("barcode"): return row.get("barcode")
    card=row.get("card")
    if isinstance(card, dict) and card.get("barcode"): return card.get("barcode")
    if isinstance(card, (list, tuple)) and len(card) > 0:
      # Some fieldmapper payloads.
      for v in card:
        if isinstance(v, str) and v.strip(): return v.strip()
  return None

barcode=None
pid=None
for row in rows:
  if barcode is None:
    barcode=pick_barcode(row)
  if pid is None and isinstance(row, dict):
    pid=row.get("id") or row.get("usr") or row.get("userId")
  if barcode and pid:
    break

print(f"{barcode or ''}\t{pid or ''}")
PY
)

if [[ -n "$DISCOVERED_BARCODE" ]]; then
  PATRON_BARCODE="$DISCOVERED_BARCODE"
fi
if [[ -n "$DISCOVERED_ID" ]]; then
  PATRON_ID="$DISCOVERED_ID"
else
  PATRON_ID=""
fi

# 6) Patron lookup (if we have a barcode)
if [[ -n "$PATRON_BARCODE" ]]; then
  call "patron_barcode" "$BASE_URL/api/evergreen/patrons?barcode=$PATRON_BARCODE"
fi

# 7) Catalog search (find a record)
call "catalog_search" "$BASE_URL/api/evergreen/catalog?q=harry"

RECORD_ID=$(python3 - <<PY
import json
p=json.load(open("$OUT_DIR/catalog_search.json"))
recs=p.get("records") or []
print(recs[0]["id"] if recs else "")
PY
)

# 8) Catalog record + holdings (if record found)
if [[ -n "$RECORD_ID" ]]; then
  call "catalog_record" "$BASE_URL/api/evergreen/catalog?action=record&id=$RECORD_ID"
  call "catalog_holdings" "$BASE_URL/api/evergreen/catalog?action=holdings&id=$RECORD_ID"
fi

# 9) Items lookup (canonical)
call "items_lookup" "$BASE_URL/api/evergreen/items?barcode=$ITEM_BARCODE"

# 9) Circulation: item status by barcode
call "circ_item_status" "$BASE_URL/api/evergreen/circulation?itemBarcode=$ITEM_BARCODE"

# 10) Circulation: checkout -> renew -> checkin (if patron id present)
if [[ -n "$PATRON_ID" ]]; then
  # Best-effort: ensure the test item is not already checked out.
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

  RENEW_PAYLOAD=$(cat <<JSON
{"action":"renew","itemBarcode":"$ITEM_BARCODE"}
JSON
)
  call "circ_renew" "$BASE_URL/api/evergreen/circulation" "POST" "$RENEW_PAYLOAD"

  CHECKIN_PAYLOAD=$(cat <<JSON
{"action":"checkin","itemBarcode":"$ITEM_BARCODE"}
JSON
)
  call "circ_checkin" "$BASE_URL/api/evergreen/circulation" "POST" "$CHECKIN_PAYLOAD"

  call "circ_patron_checkouts" "$BASE_URL/api/evergreen/circulation?patron_id=$PATRON_ID"
  call "circ_patron_holds" "$BASE_URL/api/evergreen/circulation?action=holds&patron_id=$PATRON_ID"
  call "circ_patron_bills" "$BASE_URL/api/evergreen/circulation?action=bills&patron_id=$PATRON_ID"
fi

# 11) Holds endpoints (limited without record)
if [[ -n "$PATRON_ID" ]]; then
  call "holds_patron" "$BASE_URL/api/evergreen/holds?action=patron_holds&patron_id=$PATRON_ID"
fi
call "holds_shelf" "$BASE_URL/api/evergreen/holds?action=holds_shelf&org_id=$ORG_ID"
call "holds_expired" "$BASE_URL/api/evergreen/holds?action=expired_holds&org_id=$ORG_ID"
call "holds_pull_list" "$BASE_URL/api/evergreen/holds?action=pull_list&org_id=$ORG_ID&limit=10"
if [[ -n "$RECORD_ID" && -n "$PATRON_ID" ]]; then
  call "holds_title" "$BASE_URL/api/evergreen/holds?action=title_holds&title_id=$RECORD_ID"
  call "holds_check_possible" "$BASE_URL/api/evergreen/holds?action=check_possible&title_id=$RECORD_ID&patron_id=$PATRON_ID"
fi

# 12) Claims + Lost
if [[ -n "$PATRON_ID" ]]; then
  call "claims_patron" "$BASE_URL/api/evergreen/claims?patron_id=$PATRON_ID"
fi
call "claims_item" "$BASE_URL/api/evergreen/claims?item_barcode=$ITEM_BARCODE"

if [[ -n "$PATRON_ID" ]]; then
  call "lost_patron" "$BASE_URL/api/evergreen/lost?patron_id=$PATRON_ID"
fi
call "lost_item" "$BASE_URL/api/evergreen/lost?item_barcode=$ITEM_BARCODE"

# 13) Offline (read-only)
call "offline_status" "$BASE_URL/api/evergreen/offline?type=status"
call "offline_policies" "$BASE_URL/api/evergreen/offline?type=policies"
call "offline_blocks" "$BASE_URL/api/evergreen/offline?type=blocks"

# 14) Reports
call "reports_dashboard" "$BASE_URL/api/evergreen/reports?action=dashboard"
call "reports_holds" "$BASE_URL/api/evergreen/reports?action=holds"
call "reports_patrons" "$BASE_URL/api/evergreen/reports?action=patrons"

# 15) Acquisitions
call "acq_funds" "$BASE_URL/api/evergreen/acquisitions?action=funds"
call "acq_vendors" "$BASE_URL/api/evergreen/acquisitions?action=providers"
call "acq_orders" "$BASE_URL/api/evergreen/acquisitions?action=purchase_orders"
call "acq_invoices" "$BASE_URL/api/evergreen/acquisitions?action=invoices"

# 16) Serials
call "serials_subscriptions" "$BASE_URL/api/evergreen/serials?action=subscriptions"
call "serials_routing" "$BASE_URL/api/evergreen/serials?action=routing"

# 17) Booking
call "booking_resources" "$BASE_URL/api/evergreen/booking?action=resources"
call "booking_types" "$BASE_URL/api/evergreen/booking?action=resource_types"
call "booking_reservations" "$BASE_URL/api/evergreen/booking?action=reservations"

# 18) Authority search
call "authority_search" "$BASE_URL/api/evergreen/authority?q=smith&limit=10"

echo "Audit complete. Summary: $LOG"
