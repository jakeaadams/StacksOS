#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

banner() {
  printf "\n[rbac_audit] %s\n" "$1"
}

banner "RBAC mode preflight (.env.local)"
if [[ -f "$ROOT_DIR/.env.local" ]]; then
  if ! grep -qE "^STACKSOS_RBAC_MODE=strict\b" "$ROOT_DIR/.env.local"; then
    echo "ERROR: STACKSOS_RBAC_MODE=strict not set in $ROOT_DIR/.env.local" >&2
    echo "Add: STACKSOS_RBAC_MODE=strict (and restart the server)." >&2
    exit 1
  fi
else
  echo "WARN: $ROOT_DIR/.env.local not found; cannot verify RBAC mode from file." >&2
fi

banner "Scan mutation routes for requirePermissions(...)"

FAIL=0
SKIP_PATTERNS=(
  "/auth/route.ts"  # login/logout (cannot require permissions)
  "/catalog/route.ts" # POST is currently a stub (no Evergreen mutation)
)

is_skipped() {
  local f="$1"
  for pat in "${SKIP_PATTERNS[@]}"; do
    if [[ "$f" == *"$pat" ]]; then
      return 0
    fi
  done
  return 1
}

while IFS= read -r f; do
  if grep -qE "export async function (POST|PUT|PATCH|DELETE)\b" "$f"; then
    if is_skipped "$f"; then
      echo "SKIP: $f"
      continue
    fi

    if ! grep -q "requirePermissions" "$f"; then
      echo "ERROR: mutation route missing requirePermissions(): $f" >&2
      FAIL=1
      continue
    fi
  fi
done < <(find "$ROOT_DIR/src/app/api/evergreen" -name route.ts | sort)

if [[ "$FAIL" -ne 0 ]]; then
  exit 1
fi

banner "PASS"
