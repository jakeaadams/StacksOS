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

file_has_require_permissions() {
  local f="$1"
  grep -q "requirePermissions" "$f"
}

normalize_path() {
  local p="$1"
  if command -v realpath >/dev/null 2>&1; then
    realpath -m "$p"
    return 0
  fi

  # Fallback for environments without GNU `realpath` (e.g., some macOS setups).
  python3 -c 'import os,sys; print(os.path.abspath(os.path.normpath(sys.argv[1])))' "$p"
}

extract_relative_imports() {
  local f="$1"
  # Keep it simple: handle common `import ... from "./x"` and `export ... from "./x"` forms.
  # If a mutation route delegates to a handler module, we accept the RBAC check living there.
  grep -E "from ['\"]\\.(\\.|/)?" "$f" \
    | sed -E "s/.*from ['\"]([^'\"]+)['\"].*/\\1/" \
    | sort -u
}

resolve_import_candidates() {
  local base_dir="$1"
  local spec="$2"

  local abs
  abs="$(normalize_path "$base_dir/$spec")"

  local candidates=(
    "$abs"
    "$abs.ts"
    "$abs.tsx"
    "$abs/route.ts"
    "$abs/index.ts"
    "$abs/index.tsx"
  )

  for cand in "${candidates[@]}"; do
    if [[ -f "$cand" ]]; then
      echo "$cand"
    fi
  done
}

delegates_to_require_permissions() {
  local f="$1"
  local base_dir
  base_dir="$(dirname "$f")"

  while IFS= read -r spec; do
    if [[ -z "$spec" ]]; then
      continue
    fi

    while IFS= read -r cand; do
      if file_has_require_permissions "$cand"; then
        return 0
      fi
    done < <(resolve_import_candidates "$base_dir" "$spec")
  done < <(extract_relative_imports "$f")

  return 1
}

while IFS= read -r f; do
  if grep -qE "export async function (POST|PUT|PATCH|DELETE)\b" "$f"; then
    if is_skipped "$f"; then
      echo "SKIP: $f"
      continue
    fi

    if file_has_require_permissions "$f"; then
      continue
    fi

    if ! delegates_to_require_permissions "$f"; then
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
