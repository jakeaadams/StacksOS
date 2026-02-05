#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

timestamp="$(date +%Y%m%d%H%M%S)"
build_dir=".next.build"
prev_dir=".next.prev.${timestamp}"

echo "Building into ${build_dir} (safe while service is running)..."
rm -rf "${build_dir}" || true
NEXT_DIST_DIR="${build_dir}" npm run -s build

if [[ ! -d "${build_dir}" ]]; then
  echo "ERROR: build failed to produce ${build_dir}" >&2
  exit 1
fi

BASE_URL="${BASE_URL:-http://127.0.0.1:3000}"

echo "Stopping StacksOS to prevent CSS/JS chunk mismatch during swap..."
USED_SYSTEMD=0
START_REQUIRED=0
PROMPT_SUDO="${STACKSOS_UPGRADE_PROMPT_SUDO:-0}"
if command -v systemctl >/dev/null 2>&1; then
  if systemctl cat stacksos.service >/dev/null 2>&1; then
    USED_SYSTEMD=1
    if sudo -n true >/dev/null 2>&1; then
      START_REQUIRED=1
      sudo -n systemctl stop stacksos.service || true
    elif [[ "$PROMPT_SUDO" == "1" && -t 0 ]]; then
      START_REQUIRED=1
      sudo systemctl stop stacksos.service || true
    else
      # No sudo: kill the service's MainPID and let systemd restart it after RestartSec.
      # This avoids prompting (automation-friendly) and still prevents the unstyled-UI
      # chunk mismatch: we swap `.next` during the restart backoff window.
      mainpid="$(systemctl show -p MainPID --value stacksos.service 2>/dev/null || echo 0)"
      if [[ "$mainpid" =~ ^[0-9]+$ ]] && [[ "$mainpid" -gt 0 ]]; then
        echo "WARN: sudo not available; stopping stacksos.service by killing MainPID=${mainpid}." >&2
        kill -TERM "$mainpid" 2>/dev/null || true
        for _ in {1..30}; do
          if ! kill -0 "$mainpid" 2>/dev/null; then
            break
          fi
          sleep 0.2
        done
        if kill -0 "$mainpid" 2>/dev/null; then
          kill -KILL "$mainpid" 2>/dev/null || true
        fi
      else
        echo "WARN: stacksos.service exists but MainPID could not be determined; falling back to killing next-server." >&2
        USED_SYSTEMD=0
      fi
    fi
  fi
fi

if [[ "$USED_SYSTEMD" -eq 0 ]]; then
  # Fallback for non-systemd environments: kill next-server. This prevents the
  # "unstyled UI" failure mode where the server uses an in-memory build that
  # no longer matches the on-disk `.next/static` chunks.
  bash scripts/restart-stacksos.sh || true
fi

echo "Switching live build (atomic swap)..."
if [[ -d ".next" ]]; then
  mv ".next" "${prev_dir}"
fi
mv "${build_dir}" ".next"

if [[ "$USED_SYSTEMD" -eq 1 && "$START_REQUIRED" -eq 1 ]]; then
  echo "Starting stacksos.service..."
  if sudo -n true >/dev/null 2>&1; then
    sudo -n systemctl start stacksos.service
  elif [[ "$PROMPT_SUDO" == "1" && -t 0 ]]; then
    sudo systemctl start stacksos.service
  else
    echo "WARN: stacksos.service was stopped, but sudo is not available to start it. Start it manually:" >&2
    echo "  sudo systemctl start stacksos.service" >&2
  fi
elif [[ "$USED_SYSTEMD" -eq 0 ]]; then
  echo "NOTE: systemd is not available; start StacksOS manually (e.g. npm run start)."
fi

echo "Waiting for health check..."
for i in {1..30}; do
  if curl -fsS "${BASE_URL}/api/health" >/dev/null 2>&1; then
    echo "Healthy."
    break
  fi
  sleep 1
  if [[ "$i" -eq 30 ]]; then
    echo "ERROR: server did not become healthy at ${BASE_URL}/api/health" >&2
    exit 1
  fi
done

echo "Running audit gate..."
set +e
BASE_URL="${BASE_URL}" ./audit/run_all.sh
audit_status=$?
set -e

if [[ "$audit_status" -ne 0 ]]; then
  echo "ERROR: audit gate failed (exit $audit_status)" >&2
  if [[ -d "${prev_dir}" ]]; then
    failed_dir=".next.failed.${timestamp}"
    echo "Rolling back: moving .next -> ${failed_dir} and ${prev_dir} -> .next" >&2
    mv ".next" "${failed_dir}" || true
    mv "${prev_dir}" ".next" || true
    bash scripts/restart-stacksos.sh || true
    echo "Rollback complete. Investigate ${failed_dir}." >&2
  fi
  exit "$audit_status"
fi

echo "Upgrade complete."

# Housekeeping: keep the rollback history bounded so disk usage doesn't grow forever.
# These directories are created by this script on each upgrade attempt.
KEEP_BUILDS="${STACKSOS_BUILD_RETENTION:-8}"
prune_build_dirs() {
  local prefix="$1"
  local keep="$2"

  mapfile -t dirs < <(ls -1d "${prefix}".* 2>/dev/null | sort || true)
  local count="${#dirs[@]}"
  if [[ "$count" -le "$keep" ]]; then
    return 0
  fi

  local remove_count=$((count - keep))
  for ((i = 0; i < remove_count; i++)); do
    rm -rf "${dirs[$i]}" || true
  done
}

if [[ "$KEEP_BUILDS" =~ ^[0-9]+$ ]] && [[ "$KEEP_BUILDS" -ge 1 ]]; then
  echo "Pruning old build swap directories (keeping last $KEEP_BUILDS)..."
  prune_build_dirs ".next.prev" "$KEEP_BUILDS"
  prune_build_dirs ".next.failed" "$KEEP_BUILDS"
fi
