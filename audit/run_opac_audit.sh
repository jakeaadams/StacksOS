#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BASE_URL="${BASE_URL:-http://127.0.0.1:3000}"
OUT_DIR="$ROOT_DIR/audit/opac"
PAGES_TSV="$OUT_DIR/pages.tsv"
API_TSV="$OUT_DIR/api.tsv"
BRIDGE_TSV="$OUT_DIR/bridge.tsv"
REPORT_MD="$OUT_DIR/REPORT.md"

mkdir -p "$OUT_DIR"

tmp_body="$(mktemp)"
trap 'rm -f "$tmp_body"' EXIT

if ! curl -ksSf "$BASE_URL/api/health" >/dev/null 2>&1; then
  echo "ERROR: StacksOS server not reachable at $BASE_URL" >&2
  exit 1
fi

fail=0

page_routes=(
  "/opac"
  "/opac/search?q=harry+potter"
  "/opac/record/2"
  "/opac/advanced-search"
  "/opac/browse"
  "/opac/new-titles"
  "/opac/recommendations"
  "/opac/events"
  "/opac/digital"
  "/opac/locations"
  "/opac/help"
  "/opac/accessibility"
  "/opac/privacy"
  "/opac/terms"
  "/opac/login"
  "/opac/register"
  "/opac/forgot-pin"
  "/opac/mobile"
  "/opac/account"
  "/opac/account/checkouts"
  "/opac/account/events"
  "/opac/account/fines"
  "/opac/account/history"
  "/opac/account/holds"
  "/opac/account/lists"
  "/opac/account/messages"
  "/opac/account/settings"
  "/opac/lists"
  "/opac/lists/1"
  "/opac/kids"
  "/opac/kids/search?q=harry+potter"
  "/opac/kids/record/2"
  "/opac/kids/browse"
  "/opac/kids/challenges"
  "/opac/kids/help"
  "/opac/kids/parents"
  "/opac/kids/account"
  "/opac/kids/account/checkouts"
  "/opac/kids/account/holds"
  "/opac/kids/account/reading-log"
  "/opac/teens"
  "/opac/teens/search?q=harry+potter"
)

printf "route\tstatus\n" > "$PAGES_TSV"
for route in "${page_routes[@]}"; do
  code="$(curl -ksS -o "$tmp_body" -w "%{http_code}" "$BASE_URL$route" || echo "000")"
  printf "%s\t%s\n" "$route" "$code" >> "$PAGES_TSV"
  if [[ "$code" == "000" || "$code" =~ ^5 ]]; then
    fail=1
  fi
done

api_checks=(
  "opac_session|GET|/api/opac/session||200"
  "opac_discovery_config|GET|/api/opac/discovery-config||200"
  "opac_recommendations|GET|/api/opac/recommendations||200"
  "opac_staff_picks|GET|/api/opac/staff-picks||200"
  "opac_public_lists|GET|/api/opac/public-lists||200"
  "opac_events|GET|/api/opac/events||200"
  "opac_reviews_missing_record|GET|/api/opac/reviews||400"
  "opac_checkouts_unauth|GET|/api/opac/checkouts||401"
  "opac_holds_unauth|GET|/api/opac/holds||401"
  "opac_fines_unauth|GET|/api/opac/fines||401"
  "opac_history_unauth|GET|/api/opac/history||401"
  "opac_messages_unauth|GET|/api/opac/messages||401"
  "opac_settings_unauth|GET|/api/opac/settings||401"
  "opac_lists_unauth|GET|/api/opac/lists||401"
  "opac_login_no_csrf|POST|/api/opac/login|{}|403"
  "opac_logout_no_csrf|POST|/api/opac/logout||403"
  "opac_renew_no_csrf|POST|/api/opac/renew|{\"circId\":123}|403"
  "opac_renew_all_no_csrf|POST|/api/opac/renew-all|{}|403"
  "opac_self_checkout_no_csrf|POST|/api/opac/self-checkout|{\"barcode\":\"39000000001235\"}|403"
  "opac_kids_reading_log_unauth|GET|/api/opac/kids/reading-log||401"
  "opac_events_registration_no_csrf|POST|/api/opac/events/registrations|{\"eventId\":\"evt-demo\"}|403"
)

printf "name\tmethod\tpath\tstatus\texpected\tpass\n" > "$API_TSV"
for check in "${api_checks[@]}"; do
  IFS="|" read -r name method path payload expected <<< "$check"
  if [[ -n "$payload" ]]; then
    code="$(curl -ksS -o "$tmp_body" -w "%{http_code}" -X "$method" -H "content-type: application/json" --data "$payload" "$BASE_URL$path" || echo "000")"
  else
    code="$(curl -ksS -o "$tmp_body" -w "%{http_code}" -X "$method" "$BASE_URL$path" || echo "000")"
  fi
  pass="yes"
  if [[ "$code" != "$expected" ]]; then
    pass="no"
    fail=1
  fi
  printf "%s\t%s\t%s\t%s\t%s\t%s\n" "$name" "$method" "$path" "$code" "$expected" "$pass" >> "$API_TSV"
done

python3 - <<'PY' "$BASE_URL" "$BRIDGE_TSV" || fail=1
import json
import sys
from urllib.request import urlopen

base = sys.argv[1]
out_path = sys.argv[2]

checks = [
    ("evergreen_ping", "/api/evergreen/ping"),
    ("catalog_search", "/api/evergreen/catalog?q=harry"),
    ("catalog_record", "/api/evergreen/catalog?action=record&id=2"),
    ("catalog_holdings", "/api/evergreen/catalog?action=holdings&id=2"),
]

rows = [("name", "status", "ok", "detail", "pass")]
failed = False

for name, path in checks:
    status = "000"
    ok = "false"
    detail = ""
    passed = "no"
    try:
        with urlopen(base + path, timeout=20) as resp:
            status = str(resp.status)
            payload = json.loads(resp.read().decode("utf-8"))
    except Exception as exc:
        payload = {}
        detail = f"request_error:{exc}"
    else:
        ok_value = payload.get("ok")
        ok = "true" if ok_value is True else str(ok_value).lower()
        if name == "catalog_search":
            records = payload.get("records")
            count = len(records) if isinstance(records, list) else int(payload.get("count") or 0)
            detail = f"count={count}"
            passed = "yes" if ok_value is True and count > 0 else "no"
        elif name == "catalog_record":
            record = payload.get("record")
            title = record.get("title") if isinstance(record, dict) else None
            detail = f"title={'present' if title else 'missing'}"
            passed = "yes" if ok_value is True and bool(title) else "no"
        elif name == "catalog_holdings":
            copies = payload.get("copies")
            copy_count = len(copies) if isinstance(copies, list) else 0
            detail = f"copies={copy_count}"
            passed = "yes" if ok_value is True and copy_count > 0 else "no"
        else:
            detail = "ok=true required"
            passed = "yes" if ok_value is True else "no"

    if passed != "yes":
        failed = True
    rows.append((name, status, ok, detail, passed))

with open(out_path, "w", encoding="utf-8") as f:
    for row in rows:
        f.write("\t".join(row) + "\n")

if failed:
    sys.exit(1)
PY

page_total="$(awk -F '\t' 'NR>1 {count++} END {print count+0}' "$PAGES_TSV")"
page_bad="$(awk -F '\t' 'NR>1 && ($2=="000" || $2 ~ /^5/) {count++} END {print count+0}' "$PAGES_TSV")"
api_total="$(awk -F '\t' 'NR>1 {count++} END {print count+0}' "$API_TSV")"
api_bad="$(awk -F '\t' 'NR>1 && $6!="yes" {count++} END {print count+0}' "$API_TSV")"
bridge_total="$(awk -F '\t' 'NR>1 {count++} END {print count+0}' "$BRIDGE_TSV")"
bridge_bad="$(awk -F '\t' 'NR>1 && $5!="yes" {count++} END {print count+0}' "$BRIDGE_TSV")"

{
  echo "# OPAC Audit Report"
  echo
  echo "Generated: $(date -u +"%Y-%m-%dT%H:%M:%SZ")"
  echo
  echo "Base URL: \`$BASE_URL\`"
  echo
  echo "## Summary"
  echo
  echo "| Section | Total | Failed | Result |"
  echo "| --- | ---: | ---: | --- |"
  echo "| OPAC pages | $page_total | $page_bad | $([[ "$page_bad" -eq 0 ]] && echo PASS || echo FAIL) |"
  echo "| OPAC APIs | $api_total | $api_bad | $([[ "$api_bad" -eq 0 ]] && echo PASS || echo FAIL) |"
  echo "| Evergreen bridge | $bridge_total | $bridge_bad | $([[ "$bridge_bad" -eq 0 ]] && echo PASS || echo FAIL) |"
  echo
  echo "## Artifacts"
  echo
  echo "- \`$PAGES_TSV\`"
  echo "- \`$API_TSV\`"
  echo "- \`$BRIDGE_TSV\`"
} > "$REPORT_MD"

echo "OPAC audit: $([[ "$fail" -eq 0 ]] && echo PASS || echo FAIL) ($REPORT_MD)"
exit "$fail"
