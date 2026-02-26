#!/usr/bin/env bash
set -euo pipefail

HOST="192.168.1.232"
PORT="443"
RESTART_STACKSOS="0"
OUTPUT_PATH=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --host)
      HOST="$2"
      shift 2
      ;;
    --port)
      PORT="$2"
      shift 2
      ;;
    --out)
      OUTPUT_PATH="$2"
      shift 2
      ;;
    --restart)
      RESTART_STACKSOS="1"
      shift
      ;;
    *)
      echo "Unknown argument: $1" >&2
      exit 1
      ;;
  esac
done

if [[ -z "$OUTPUT_PATH" ]]; then
  SAFE_HOST="${HOST//[^a-zA-Z0-9._-]/_}"
  OUTPUT_PATH="/usr/local/share/ca-certificates/evergreen-${SAFE_HOST}.crt"
fi

TMP_CERT="$(mktemp)"
trap rm -f  EXIT

openssl s_client -showcerts -servername "$HOST" -connect "${HOST}:${PORT}" < /dev/null 2>/dev/null \
  | awk /BEGIN CERTIFICATE/,/END CERTIFICATE/{ print } \
  > "$TMP_CERT"

if [[ ! -s "$TMP_CERT" ]]; then
  echo "Failed to fetch certificate from ${HOST}:${PORT}" >&2
  exit 1
fi

NEW_FP="$(openssl x509 -in "$TMP_CERT" -noout -fingerprint -sha256 | cut -d= -f2)"
OLD_FP=""
if [[ -f "$OUTPUT_PATH" ]]; then
  OLD_FP="$(openssl x509 -in "$OUTPUT_PATH" -noout -fingerprint -sha256 | cut -d= -f2 || true)"
fi

if [[ "$NEW_FP" == "$OLD_FP" && -n "$OLD_FP" ]]; then
  echo "Certificate unchanged (${NEW_FP})."
  exit 0
fi

echo "Installing updated Evergreen certificate to ${OUTPUT_PATH}"

if [[ $EUID -eq 0 ]]; then
  install -m 0644 "$TMP_CERT" "$OUTPUT_PATH"
  update-ca-certificates >/dev/null
  if [[ "$RESTART_STACKSOS" == "1" ]]; then
    systemctl restart stacksos.service
  fi
else
  sudo install -m 0644 "$TMP_CERT" "$OUTPUT_PATH"
  sudo update-ca-certificates >/dev/null
  if [[ "$RESTART_STACKSOS" == "1" ]]; then
    sudo systemctl restart stacksos.service
  fi
fi

echo "Updated certificate fingerprint: ${NEW_FP}"
echo "Set STACKSOS_EVERGREEN_CA_FILE=${OUTPUT_PATH} in app env if needed."
