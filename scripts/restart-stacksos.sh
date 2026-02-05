#!/usr/bin/env bash
set -euo pipefail

# Best-effort restart:
# - Prefer systemd when available (avoids "unstyled UI" mismatches during upgrades).
# - Fallback: kill next-server processes.

if command -v systemctl >/dev/null 2>&1; then
  if systemctl cat stacksos.service >/dev/null 2>&1; then
    if sudo -n true >/dev/null 2>&1; then
      echo "Restarting stacksos.service via systemd..."
      sudo -n systemctl restart stacksos.service
      exit 0
    elif [[ -t 0 ]]; then
      echo "Restarting stacksos.service via systemd (sudo password may be required)..."
      sudo systemctl restart stacksos.service
      exit 0
    else
      echo "WARN: stacksos.service exists but sudo is not available (falling back to killing next-server)." >&2
    fi
  fi
fi

PIDS="$(pgrep -f 'next-server' || true)"

if [[ -z "${PIDS}" ]]; then
  echo "No next-server process found."
  exit 0
fi

echo "Killing next-server PIDs: ${PIDS}"
kill -TERM ${PIDS} 2>/dev/null || true
sleep 1
kill -KILL ${PIDS} 2>/dev/null || true

echo "Done. If stacksos.service is running, systemd should restart it."
