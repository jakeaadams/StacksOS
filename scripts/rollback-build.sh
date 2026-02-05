#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

target="${1:-}"
if [[ -z "${target}" ]]; then
  if [[ -f "_backups/stacksos-builds/LATEST" ]]; then
    target="$(cat _backups/stacksos-builds/LATEST)"
  else
    echo "Usage: scripts/rollback-build.sh <timestamp>"
    exit 1
  fi
fi

src="_backups/stacksos-builds/${target}/.next"
if [[ ! -d "${src}" ]]; then
  echo "Snapshot not found: ${src}"
  exit 1
fi

echo "Restoring ${src} -> .next"
rm -rf .next
cp -a "${src}" .next

echo "Restarting..."
bash scripts/restart-stacksos.sh

echo "Rollback complete (${target})."

