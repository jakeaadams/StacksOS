#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/../.."

echo "[audit] scanning for likely demo/placeholder UI data..."
echo

echo "== Keywords (mock/fake/placeholder/lorem/sample) =="
rg -n --hidden --glob '!**/node_modules/**' --glob '!**/.next/**' \
  "(mock|fake|placeholder|lorem|sample data|demo data)" \
  src || true
echo

echo "== Hardcoded state arrays (common demo pattern) =="
rg -n --hidden --glob '!**/node_modules/**' --glob '!**/.next/**' \
  "useState<[^>]+>\\(\\s*\\[" \
  src/app src/components || true
rg -n --hidden --glob '!**/node_modules/**' --glob '!**/.next/**' \
  "useState\\(\\s*\\[\\s*\\{" \
  src/app src/components || true
echo

echo "== Hardcoded object arrays (common demo pattern) =="
rg -n --hidden --glob '!**/node_modules/**' --glob '!**/.next/**' \
  "(const|let)\\s+\\w+\\s*=\\s*\\[\\s*\\{" \
  src/app src/components || true
echo

echo "== Hardcoded future/past dates (often demo fixtures) =="
rg -n --hidden --glob '!**/node_modules/**' --glob '!**/.next/**' \
  "\\b20\\d\\d-\\d\\d-\\d\\dT\\d\\d:\\d\\d:\\d\\d" \
  src/app src/components || true
echo

echo "[audit] done"

