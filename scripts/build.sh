#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

dist_dir="${NEXT_DIST_DIR:-.next}"

# Prevent a common "unstyled UI" failure mode:
# running `next build` into `.next` while `next-server` is running.
if [[ "${dist_dir}" == ".next" ]] && pgrep -f 'next-server' >/dev/null 2>&1; then
  echo "ERROR: refusing to run 'next build' into .next while next-server is running." >&2
  echo "This can cause a CSS/JS chunk mismatch (unstyled UI)." >&2
  echo "" >&2
  echo "Fix:" >&2
  echo "  - Use: bash scripts/upgrade-stacksos.sh" >&2
  echo "  - Or stop the server, then re-run this build" >&2
  echo "  - Or set NEXT_DIST_DIR to build into a separate folder" >&2
  exit 1
fi

exec npx next build

