#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT_DIR="$ROOT_DIR/audit/ui"

mkdir -p "$OUT_DIR"

SUMMARY_TSV="$OUT_DIR/summary.tsv"
REPORT_MD="$OUT_DIR/REPORT.md"

scan() {
  local name="$1"
  local pattern="$2"

  # shellcheck disable=SC2034
  local matches
  matches=$(grep -RIn --exclude-dir=node_modules --exclude-dir=.next --exclude-dir=audit \
    --exclude='*.bak' \
    --exclude='*.backup' \
    --exclude='*.backup2' \
    --exclude='*.backup3' \
    --exclude='*.backup_*' \
    --exclude='*.orig' \
    -E "$pattern" \
    "$ROOT_DIR/src/app/staff" "$ROOT_DIR/src/components" 2>/dev/null || true)

  local count
  count=$(printf "%s" "$matches" | grep -c . || true)

  printf "%s\t%s\n" "$name" "$count" >> "$SUMMARY_TSV"

  if [[ "$count" -gt 0 ]]; then
    printf "%s\n" "$matches" > "$OUT_DIR/${name}.txt"
  else
    rm -f "$OUT_DIR/${name}.txt"
  fi
}

{
  printf "check\tcount\n"
} > "$SUMMARY_TSV"

# Heuristics for dead-UI indicators.
# Keep this list intentionally small to avoid false positives.
scan "href_hash" 'href="#"'
scan "onclick_noop" 'onClick=\{\(\) => \{[[:space:]]*(/\*.*\*/)?[[:space:]]*\}\}'
scan "onsubmit_noop" 'onSubmit=\{\(\) => \{[[:space:]]*(/\*.*\*/)?[[:space:]]*\}\}'
scan "coming_soon" '(COMING SOON|Coming soon|Not implemented|not implemented|Placeholder UI|placeholder ui)'
# Documentation links are allowed
# scan "external_evergreen_site" "evergreen-ils.org"

# Build a human-friendly report.
{
  echo "# StacksOS UI Audit"
  echo
  echo "Generated: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo
  echo "Policy: no dead UI (no placeholder links, no no-op handlers)."
  echo
  echo "## Summary"
  echo
  column -t -s $'\t' "$SUMMARY_TSV" || cat "$SUMMARY_TSV"
  echo
  echo "## Details"
  echo
  for f in "$OUT_DIR"/*.txt; do
    [[ -e "$f" ]] || continue
    echo "### $(basename "$f")"
    echo
    echo '```'
    sed -n '1,200p' "$f"
    echo '```'
    echo
  done
} > "$REPORT_MD"

# Fail the audit if we have any matches.
if awk 'NR>1 {sum += $2} END {exit(sum>0)}' "$SUMMARY_TSV"; then
  echo "UI audit: PASS ($REPORT_MD)"
else
  echo "UI audit: FAIL ($REPORT_MD)"
  exit 1
fi
