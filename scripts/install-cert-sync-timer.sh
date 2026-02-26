#!/usr/bin/env bash
set -euo pipefail

SERVICE_NAME="stacksos-evergreen-cert-sync.service"
TIMER_NAME="stacksos-evergreen-cert-sync.timer"
DEFAULTS_FILE="/etc/default/stacksos-evergreen-cert-sync"
UNIT_DIR="/etc/systemd/system"

REPO_DIR="/home/jake/projects/stacksos"
HOST="192.168.1.232"
PORT="443"
CA_FILE=""
ON_UNIT_ACTIVE_SEC="6h"
RUN_NOW="1"
RESTART_STACKSOS="1"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --repo-dir)
      REPO_DIR="$2"
      shift 2
      ;;
    --host)
      HOST="$2"
      shift 2
      ;;
    --port)
      PORT="$2"
      shift 2
      ;;
    --ca-file)
      CA_FILE="$2"
      shift 2
      ;;
    --interval)
      ON_UNIT_ACTIVE_SEC="$2"
      shift 2
      ;;
    --no-run-now)
      RUN_NOW="0"
      shift
      ;;
    --no-restart)
      RESTART_STACKSOS="0"
      shift
      ;;
    *)
      echo "Unknown argument: $1" >&2
      exit 1
      ;;
  esac
done

if [[ -z "$CA_FILE" ]]; then
  SAFE_HOST="${HOST//[^a-zA-Z0-9._-]/_}"
  CA_FILE="/usr/local/share/ca-certificates/evergreen-${SAFE_HOST}.crt"
fi

if [[ ! -x "$REPO_DIR/scripts/sync-evergreen-cert.sh" ]]; then
  echo "sync-evergreen-cert.sh not found or not executable under: $REPO_DIR/scripts" >&2
  exit 1
fi

if [[ "$EUID" -eq 0 ]]; then
  SUDO=""
else
  SUDO="sudo"
fi

# Service unit
$SUDO tee "$UNIT_DIR/$SERVICE_NAME" >/dev/null <<UNIT
[Unit]
Description=StacksOS Evergreen TLS certificate sync
After=network-online.target
Wants=network-online.target

[Service]
Type=oneshot
EnvironmentFile=-$DEFAULTS_FILE
ExecStart=/bin/bash -lc '${REPO_DIR}/scripts/sync-evergreen-cert.sh --host "\${STACKSOS_EVERGREEN_HOST}" --port "\${STACKSOS_EVERGREEN_PORT}" --out "\${STACKSOS_EVERGREEN_CA_FILE}" \${STACKSOS_CERT_SYNC_RESTART:+--restart}'
UNIT

# Timer unit
$SUDO tee "$UNIT_DIR/$TIMER_NAME" >/dev/null <<UNIT
[Unit]
Description=Run StacksOS Evergreen cert sync periodically

[Timer]
OnBootSec=5m
OnUnitActiveSec=$ON_UNIT_ACTIVE_SEC
RandomizedDelaySec=5m
Persistent=true

[Install]
WantedBy=timers.target
UNIT

# Defaults file
if [[ "$EUID" -eq 0 ]]; then
  cat > "$DEFAULTS_FILE" <<ENV
# Managed by scripts/install-cert-sync-timer.sh
STACKSOS_EVERGREEN_HOST=$HOST
STACKSOS_EVERGREEN_PORT=$PORT
STACKSOS_EVERGREEN_CA_FILE=$CA_FILE
# Non-empty value enables --restart on sync success
STACKSOS_CERT_SYNC_RESTART=$RESTART_STACKSOS
ENV
else
  $SUDO tee "$DEFAULTS_FILE" >/dev/null <<ENV
# Managed by scripts/install-cert-sync-timer.sh
STACKSOS_EVERGREEN_HOST=$HOST
STACKSOS_EVERGREEN_PORT=$PORT
STACKSOS_EVERGREEN_CA_FILE=$CA_FILE
# Non-empty value enables --restart on sync success
STACKSOS_CERT_SYNC_RESTART=$RESTART_STACKSOS
ENV
fi

$SUDO systemctl daemon-reload
$SUDO systemctl enable --now "$TIMER_NAME"
if [[ "$RUN_NOW" == "1" ]]; then
  $SUDO systemctl start "$SERVICE_NAME"
fi

echo "Installed: $UNIT_DIR/$SERVICE_NAME"
echo "Installed: $UNIT_DIR/$TIMER_NAME"
echo "Configured: $DEFAULTS_FILE"
echo "Timer status:"
$SUDO systemctl status "$TIMER_NAME" --no-pager -n 0 || true
