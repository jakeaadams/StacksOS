#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

ts="$(date -u +%Y%m%dT%H%M%SZ)"
out="_backups/stacksos-builds/${ts}"
mkdir -p "${out}"

if [[ ! -d ".next" ]]; then
  echo "Missing .next build output. Run: npm run build"
  exit 1
fi

echo "Snapshotting .next -> ${out}/.next"
cp -a .next "${out}/.next"
echo "${ts}" > _backups/stacksos-builds/LATEST

echo "Saved snapshot ${ts}"

