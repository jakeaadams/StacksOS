#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:3000}"
PROJECT_DIR="${PROJECT_DIR:-/home/jake/projects/stacksos}"
OUT_DIR="${OUT_DIR:-$PROJECT_DIR/audit/workflow}"
COOKIE_JAR="$OUT_DIR/cookies.txt"
COOKIE_JAR_SEED="${COOKIE_JAR_SEED:-}"
LOG="$OUT_DIR/summary.tsv"
CSRF_TOKEN=""

STACKSOS_AUDIT_MUTATE="${STACKSOS_AUDIT_MUTATE:-0}"
STACKSOS_QA_FULL_RESET="${STACKSOS_QA_FULL_RESET:-0}"

PATRON_BARCODE="${PATRON_BARCODE:-}"

DEFAULT_ITEM_BARCODE="39000000001235"
ITEM_BARCODE_SET="1"
if [[ -z "${ITEM_BARCODE:-}" ]]; then
  ITEM_BARCODE_SET="0"
  ITEM_BARCODE="$DEFAULT_ITEM_BARCODE"
else
  ITEM_BARCODE="$ITEM_BARCODE"
fi

WORKSTATION="${WORKSTATION:-STACKSOS-QA}"
ORG_ID="${ORG_ID:-101}"

# Staff credentials (for Evergreen-backed staff auth).
# Prefer STACKSOS_AUDIT_*; fall back to E2E_* if you already set those.
STAFF_USERNAME="${STACKSOS_AUDIT_STAFF_USERNAME:-${E2E_STAFF_USER:-}}"
STAFF_PASSWORD="${STACKSOS_AUDIT_STAFF_PASSWORD:-${E2E_STAFF_PASS:-}}"

if [[ "$STACKSOS_AUDIT_MUTATE" == "1" ]]; then
  DEMO_DATA="${DEMO_DATA:-$PROJECT_DIR/audit/demo_data.json}"
  if [[ -f "$DEMO_DATA" ]]; then
    if [[ -z "$PATRON_BARCODE" ]]; then
      PATRON_BARCODE="$(python3 -c "import json; print(json.load(open('${DEMO_DATA}')).get('demoPatronBarcode',''))" 2>/dev/null)" || true
    fi
    if [[ "$ITEM_BARCODE_SET" != "1" ]]; then
      ITEM_BARCODE="$(python3 -c "import json; print(json.load(open('${DEMO_DATA}')).get('demoItemBarcode',''))" 2>/dev/null)" || true
      ITEM_BARCODE_SET="1"
    fi
    if [[ "${ORG_ID:-}" == "101" ]]; then
      ORG_ID="$(python3 -c "import json; print(json.load(open('${DEMO_DATA}')).get('orgId', 101))" 2>/dev/null)" || true
    fi
    if [[ "${WORKSTATION:-STACKSOS-QA}" == "STACKSOS-QA" ]]; then
      WORKSTATION="$(python3 -c "import json; print(json.load(open('${DEMO_DATA}')).get('workstation', 'STACKSOS-QA'))" 2>/dev/null)" || true
    fi
  fi
fi

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
      --data-binary @- \
      "$url" <<<"$data")
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
CLAIMS_RESTORE_PAYLOAD=""
cleanup() {
  if [[ -n "$HOLD_ID" ]]; then
    echo "[cleanup] Attempting to cancel hold $HOLD_ID" >&2
    call "holds_cancel_cleanup" "$BASE_URL/api/evergreen/holds" "POST" "{\"action\":\"cancel_hold\",\"holdId\":$HOLD_ID,\"reason\":4,\"note\":\"QA cleanup\"}"
  fi
  if [[ -n "$CLAIMS_RESTORE_PAYLOAD" ]]; then
    echo "[cleanup] Restoring patron claim counts" >&2
    call "claims_restore_cleanup" "$BASE_URL/api/evergreen/claims" "PUT" "$CLAIMS_RESTORE_PAYLOAD"
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
  if [[ -z "${STAFF_USERNAME:-}" || -z "${STAFF_PASSWORD:-}" ]]; then
    echo "ERROR: not authenticated and no staff credentials provided." >&2
    echo "Set STACKSOS_AUDIT_STAFF_USERNAME/STACKSOS_AUDIT_STAFF_PASSWORD (or E2E_STAFF_USER/E2E_STAFF_PASS)," >&2
    echo "or provide COOKIE_JAR_SEED to reuse a prior session." >&2
    exit 1
  fi
  AUTH_PAYLOAD=$(cat <<JSON
{"username":"$STAFF_USERNAME","password":"$STAFF_PASSWORD","workstation":"$WORKSTATION"}
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

if [[ "$STACKSOS_AUDIT_MUTATE" == "1" ]]; then
  if [[ "$ITEM_BARCODE_SET" != "1" ]]; then
    echo "ERROR: STACKSOS_AUDIT_MUTATE=1 requires setting ITEM_BARCODE explicitly (use a dedicated test copy barcode)." >&2
    exit 1
  fi
  if [[ -z "$PATRON_BARCODE" ]]; then
    echo "ERROR: STACKSOS_AUDIT_MUTATE=1 requires setting PATRON_BARCODE explicitly (use a dedicated test patron)." >&2
    exit 1
  fi

  # Resolve patron id from the provided barcode (do not mutate the logged-in staff account).
  call "patron_lookup" "$BASE_URL/api/evergreen/patrons?barcode=$PATRON_BARCODE"
  require_ok "patron_lookup"
  PATRON_ID=$(python3 - <<PY
import json
p=json.load(open("$OUT_DIR/patron_lookup.json"))
patron=p.get("patron") or {}
print(patron.get("id") or "")
PY
)
else
  # 2) Resolve patron from session (read-only mode can use logged-in staff user)
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

if [[ "$STACKSOS_AUDIT_MUTATE" != "1" ]]; then
  echo "[workflow_qa] STACKSOS_AUDIT_MUTATE != 1; skipping mutation steps (circ, holds, marc update)" >&2
  echo "Workflow QA complete. Summary: $LOG"
  exit 0
fi

# Optional: reset the demo patron to a clean baseline before mutating.
#
# This is useful when running `STACKSOS_AUDIT_MUTATE=1` repeatedly against a
# disposable Evergreen dataset. It reduces flakiness from leftover holds,
# checkouts, or claims-returned states from prior runs.
if [[ "$STACKSOS_QA_FULL_RESET" == "1" ]]; then
  echo "[workflow_qa] STACKSOS_QA_FULL_RESET=1: pre-cleaning patron state (holds/checkouts/claims)..." >&2

  # Cancel any existing holds for this patron (best-effort).
  call "precleanup_holds_list" "$BASE_URL/api/evergreen/holds?action=patron_holds&patron_id=$PATRON_ID"
  HOLD_IDS=$(python3 - <<PY
import json
try:
  p=json.load(open("$OUT_DIR/precleanup_holds_list.json"))
except Exception:
  p={}
holds=p.get("holds") or []
for h in holds:
  if not isinstance(h, dict): continue
  hid=h.get("id")
  if hid is None: continue
  cancel=h.get("cancelTime") or h.get("cancel_time")
  if cancel: continue
  print(hid)
PY
)
  if [[ -n "$HOLD_IDS" ]]; then
    while IFS= read -r hold_id; do
      [[ -z "$hold_id" ]] && continue
      call "precleanup_hold_cancel_${hold_id}" "$BASE_URL/api/evergreen/holds" "POST" "{\"action\":\"cancel_hold\",\"holdId\":$hold_id,\"reason\":4,\"note\":\"QA precleanup\"}"
    done <<<"$HOLD_IDS"
  fi

  # Check in any existing checkouts for this patron (best-effort).
  call "precleanup_checkouts" "$BASE_URL/api/evergreen/circulation?patron_id=$PATRON_ID"
  CHECKOUT_BARCODES=$(python3 - <<PY
import json
try:
  p=json.load(open("$OUT_DIR/precleanup_checkouts.json"))
except Exception:
  p={}
co=(p.get("checkouts") or {})
barcodes=set()
for key in ("out","overdue","claims_returned","long_overdue","lost"):
  for item in (co.get(key) or []):
    if isinstance(item, dict) and item.get("barcode"):
      barcodes.add(str(item.get("barcode")).strip())
for bc in sorted([b for b in barcodes if b]):
  print(bc)
PY
)
  if [[ -n "$CHECKOUT_BARCODES" ]]; then
    while IFS= read -r bc; do
      [[ -z "$bc" ]] && continue
      call "precleanup_checkin_${bc}" "$BASE_URL/api/evergreen/circulation" "POST" "{\"action\":\"checkin\",\"itemBarcode\":\"$bc\"}"
    done <<<"$CHECKOUT_BARCODES"
  fi

  # Resolve any existing claims-returned items for this patron (best-effort).
  call "precleanup_claims_list" "$BASE_URL/api/evergreen/claims?patron_id=$PATRON_ID"
  CLAIM_BARCODES=$(python3 - <<PY
import json
try:
  p=json.load(open("$OUT_DIR/precleanup_claims_list.json"))
except Exception:
  p={}
claims=p.get("claims") or {}
returned=claims.get("returned") or []
barcodes=set()
for item in returned:
  if isinstance(item, dict) and item.get("barcode"):
    barcodes.add(str(item.get("barcode")).strip())
for bc in sorted([b for b in barcodes if b]):
  print(bc)
PY
)
  if [[ -n "$CLAIM_BARCODES" ]]; then
    idx=0
    while IFS= read -r bc; do
      [[ -z "$bc" ]] && continue
      idx=$((idx + 1))
      call "precleanup_claims_resolve_${idx}" "$BASE_URL/api/evergreen/claims" "POST" "{\"action\":\"resolve_claim\",\"copyBarcode\":\"$bc\",\"resolution\":\"Workflow QA precleanup: item returned\",\"voidFines\":false,\"note\":\"QA precleanup\"}"
    done <<<"$CLAIM_BARCODES"
  fi

  # Keep claim counts stable for deterministic audits (best-effort; requires UPDATE_USER).
  call "precleanup_claims_reset_counts" "$BASE_URL/api/evergreen/claims" "PUT" "{\"patronId\":$PATRON_ID,\"claimsReturnedCount\":0,\"claimsNeverCheckedOutCount\":0}"
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

CIRC_ID=$(python3 - <<PY
import json
p=json.load(open("$OUT_DIR/circ_checkout.json"))
c=p.get("circulation") or {}
print(c.get("id") or c.get("circId") or "")
PY
)

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

# Renew can return a new circ id (some Evergreen installs close+recreate).
RENEWED_CIRC_ID=$(python3 - <<PY
import json
p=json.load(open("$OUT_DIR/circ_renew.json"))
c=p.get("circulation") or {}
print(c.get("id") or c.get("circId") or "")
PY
)
if [[ -n "$RENEWED_CIRC_ID" ]]; then
  CIRC_ID="$RENEWED_CIRC_ID"
fi

# 3b) Claims: mark claims returned (coverage) + restore counts at end
CLAIMS_RETURNED_DONE="0"
if [[ -n "$CIRC_ID" ]]; then
  call "claims_patron_before" "$BASE_URL/api/evergreen/claims?patron_id=$PATRON_ID"
  require_ok "claims_patron_before"

  CLAIMS_RETURNED_BEFORE=$(python3 - <<PY
import json
p=json.load(open("$OUT_DIR/claims_patron_before.json"))
print(((p.get("counts") or {}).get("claimsReturned")) or 0)
PY
)
  CLAIMS_NCO_BEFORE=$(python3 - <<PY
import json
p=json.load(open("$OUT_DIR/claims_patron_before.json"))
print(((p.get("counts") or {}).get("claimsNeverCheckedOut")) or 0)
PY
)

  CLAIMS_RESTORE_PAYLOAD=$(cat <<JSON
{"patronId":$PATRON_ID,"claimsReturnedCount":$CLAIMS_RETURNED_BEFORE,"claimsNeverCheckedOutCount":$CLAIMS_NCO_BEFORE}
JSON
)

	  CLAIMS_PAYLOAD=$(cat <<JSON
	{"action":"claims_returned","circId":$CIRC_ID,"copyBarcode":"$ITEM_BARCODE","note":"StacksOS workflow QA"}
JSON
)
  call "claims_returned" "$BASE_URL/api/evergreen/claims" "POST" "$CLAIMS_PAYLOAD"
  require_ok "claims_returned"
  CLAIMS_RETURNED_DONE="1"

  # Some paths (e.g. renewals) can cause circId drift. Prefer the effective circ id
  # returned by the API when present.
  EFFECTIVE_CIRC_ID=$(python3 - <<PY
import json
p=json.load(open("$OUT_DIR/claims_returned.json"))
print(p.get("effectiveCircId") or "")
PY
)
  if [[ -n "$EFFECTIVE_CIRC_ID" ]]; then
    CIRC_ID="$EFFECTIVE_CIRC_ID"
  fi

  # Verify the circulation was actually marked claims-returned (some installs behave differently).
  call "claims_circ_after" "$BASE_URL/api/evergreen/claims?circ_id=$CIRC_ID"
  require_ok "claims_circ_after"
  CIRC_IS_CLAIMS=$(python3 - <<PY
import json
p=json.load(open("$OUT_DIR/claims_circ_after.json"))
c=p.get("circulation") or {}
print("1" if c.get("isClaimsReturned") else "0")
PY
)
  if [[ "$CIRC_IS_CLAIMS" != "1" ]]; then
    echo "WARNING: claims_returned did not report isClaimsReturned=true on circ; verify Evergreen claims-returned behavior" >&2
  fi

  call "claims_patron_after" "$BASE_URL/api/evergreen/claims?patron_id=$PATRON_ID"
  require_ok "claims_patron_after"

  CLAIMS_RETURNED_AFTER=$(python3 - <<PY
import json
p=json.load(open("$OUT_DIR/claims_patron_after.json"))
print(((p.get("counts") or {}).get("claimsReturned")) or 0)
PY
)
  EXPECTED=$((CLAIMS_RETURNED_BEFORE + 1))
  if [[ "$CLAIMS_RETURNED_AFTER" -lt "$EXPECTED" ]]; then
    echo "WARNING: claims_returned count did not increase (before=$CLAIMS_RETURNED_BEFORE after=$CLAIMS_RETURNED_AFTER expected>=$EXPECTED)" >&2
  fi

  DELTA=$((CLAIMS_RETURNED_AFTER - CLAIMS_RETURNED_BEFORE))
  if [[ "$DELTA" -gt 1 ]]; then
    echo "NOTE: Evergreen claimsReturned count changed by $DELTA (expected 1). Check Evergreen DB triggers for double-increment." >&2
  fi
else
  echo "WARNING: circId missing from checkout response; skipping claims mutation coverage" >&2
fi

if [[ "$CLAIMS_RETURNED_DONE" == "1" ]]; then
  RESOLVE_PAYLOAD=$(cat <<JSON
{"action":"resolve_claim","copyBarcode":"$ITEM_BARCODE","resolution":"Workflow QA: item returned","voidFines":false,"note":"StacksOS workflow QA"}
JSON
)
  call "claims_resolve" "$BASE_URL/api/evergreen/claims" "POST" "$RESOLVE_PAYLOAD"
  require_ok "claims_resolve"
else
  CHECKIN_PAYLOAD=$(cat <<JSON
{"action":"checkin","itemBarcode":"$ITEM_BARCODE"}
JSON
)
  call "circ_checkin" "$BASE_URL/api/evergreen/circulation" "POST" "$CHECKIN_PAYLOAD"
  require_ok "circ_checkin"
fi

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

# Restore patron claim counts (best-effort)
if [[ -n "$CLAIMS_RESTORE_PAYLOAD" ]]; then
  call "claims_restore" "$BASE_URL/api/evergreen/claims" "PUT" "$CLAIMS_RESTORE_PAYLOAD"
  # Even if this fails, don't fail the whole QA run — some installs restrict UPDATE_USER.
  CLAIMS_RESTORE_PAYLOAD=""
fi

echo "Workflow QA complete. Summary: $LOG"
