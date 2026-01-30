#!/usr/bin/env bash
set -euo pipefail

ts() { date -u +"%Y-%m-%dT%H:%M:%SZ"; }
log() { printf "[%s] %s\n" "$(ts)" "$*"; }

usage() {
  cat <<'USAGE'
Usage: sudo bash ops/evergreen/evergreen_rotate_secrets.sh [options]

Rotates high-risk Evergreen secrets in-place:
  - OpenSRF <-> ejabberd (XMPP) passwords in /openils/conf/opensrf_core.xml
  - PostgreSQL role password for the "evergreen" DB user + /openils/conf/opensrf.xml <pw> entries

Defaults:
  - Only rotates values that appear to be defaults ("password" for XMPP, "jake" for DB).
  - Use --force / --force-xmpp / --force-db to rotate regardless of current values.
  - Use --xmpp-only or --db-only to rotate one side only.
  - Secrets are written to a root-only file under /root. Use --print to also print them.

Optional environment overrides:
  EVERGREEN_XMPP_PASSWORD=...  (if unset, a random hex password is generated)
  EVERGREEN_DB_PASSWORD=...    (if unset, a random hex password is generated)

Options:
  --force        Rotate both XMPP + DB regardless of current values
  --force-xmpp   Rotate XMPP regardless of current values
  --force-db     Rotate DB regardless of current values
  --xmpp-only    Only rotate XMPP (even if --force-db is also present)
  --db-only      Only rotate DB (even if --force-xmpp is also present)
  --print        Print the rotated secrets to stdout (also saved under /root)
USAGE
}

require_root() {
  if [[ "${EUID:-$(id -u)}" -ne 0 ]]; then
    echo "ERROR: must run as root (use sudo)" >&2
    exit 1
  fi
}

require_cmd() {
  local cmd="$1"
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "ERROR: missing required command: $cmd" >&2
    exit 1
  fi
}

set_ejabberd_password() {
  local user="$1"
  local host="$2"
  local pass="$3"

  local out=""
  if out="$(ejabberdctl change_password "$user" "$host" "$pass" 2>&1)"; then
    return 0
  fi

  if echo "$out" | grep -qi "unknown command 'change_password'"; then
    log "ejabberdctl change_password is unavailable; recreating ${user}@${host}"
  else
    log "ejabberdctl change_password failed for ${user}@${host}; recreating account"
  fi

  # Best-effort delete + recreate. These are internal service accounts.
  ejabberdctl unregister "$user" "$host" >/dev/null 2>&1 || true
  ejabberdctl register "$user" "$host" "$pass"
}

run_as_postgres() {
  local sql="$1"

  if command -v sudo >/dev/null 2>&1; then
    sudo -u postgres psql -v ON_ERROR_STOP=1 -c "$sql"
    return 0
  fi

  if command -v runuser >/dev/null 2>&1; then
    runuser -u postgres -- psql -v ON_ERROR_STOP=1 -c "$sql"
    return 0
  fi

  if command -v su >/dev/null 2>&1; then
    su - postgres -c "psql -v ON_ERROR_STOP=1 -c \"$sql\""
    return 0
  fi

  echo "ERROR: can't run as postgres (need sudo, runuser, or su)" >&2
  exit 1
}

backup_file() {
  local f="$1"
  local stamp
  stamp="$(date -u +%Y%m%dT%H%M%SZ)"
  if [[ -f "$f" ]]; then
    cp -a "$f" "${f}.bak.${stamp}"
  fi
}

gen_hex_password() {
  # Hex is easy to safely embed into XML + SQL without escaping.
  local bytes="${1:-16}"
  openssl rand -hex "$bytes"
}

PRINT="false"
FORCE_XMPP="false"
FORCE_DB="false"
ONLY_XMPP="false"
ONLY_DB="false"

while [[ "${1:-}" != "" ]]; do
  case "$1" in
    --force) FORCE_XMPP="true"; FORCE_DB="true" ;;
    --force-xmpp) FORCE_XMPP="true" ;;
    --force-db) FORCE_DB="true" ;;
    --xmpp-only) ONLY_XMPP="true" ;;
    --db-only) ONLY_DB="true" ;;
    --print) PRINT="true" ;;
    -h|--help) usage; exit 0 ;;
    *) echo "ERROR: unknown argument: $1" >&2; usage; exit 2 ;;
  esac
  shift
done

main() {
  require_root
  require_cmd openssl
  require_cmd sed
  require_cmd grep
  require_cmd systemctl

  local opensrf_core="/openils/conf/opensrf_core.xml"
  local opensrf_xml="/openils/conf/opensrf.xml"

  if [[ ! -f "$opensrf_core" ]]; then
    echo "ERROR: missing $opensrf_core" >&2
    exit 1
  fi
  if [[ ! -f "$opensrf_xml" ]]; then
    echo "ERROR: missing $opensrf_xml" >&2
    exit 1
  fi

  local secrets_file="/root/evergreen-rotated-secrets.$(date -u +%Y%m%dT%H%M%SZ).txt"
  install -m 0600 /dev/null "$secrets_file"

  local rotated_any="false"

  if [[ "$ONLY_XMPP" == "true" && "$ONLY_DB" == "true" ]]; then
    echo "ERROR: can't use --xmpp-only and --db-only together" >&2
    exit 2
  fi

  # ---------------------------------------------------------------------------
  # Rotate OpenSRF <-> ejabberd credentials (XMPP)
  # ---------------------------------------------------------------------------
  if [[ "$ONLY_DB" != "true" ]] && { [[ "$FORCE_XMPP" == "true" ]] || grep -q '<passwd>password</passwd>' "$opensrf_core" || grep -q '<password>password</password>' "$opensrf_core"; }; then
    require_cmd ejabberdctl

    local xmpp_pass="${EVERGREEN_XMPP_PASSWORD:-}"
    if [[ -z "$xmpp_pass" ]]; then
      # Keep this reasonably short; some C modules have historically had small buffers.
      xmpp_pass="$(gen_hex_password 16)"
    fi

    log "Rotating OpenSRF XMPP password in $opensrf_core"
    backup_file "$opensrf_core"

    if [[ "$FORCE_XMPP" == "true" ]]; then
      # Replace only non-empty <passwd> and <password> values.
      sed -i -E 's/<passwd>[^<]+<\/passwd>/<passwd>'"$xmpp_pass"'<\/passwd>/g' "$opensrf_core"
      sed -i -E 's/<password>[^<]+<\/password>/<password>'"$xmpp_pass"'<\/password>/g' "$opensrf_core"
    else
      sed -i -E 's/<passwd>password<\/passwd>/<passwd>'"$xmpp_pass"'<\/passwd>/g' "$opensrf_core"
      sed -i -E 's/<password>password<\/password>/<password>'"$xmpp_pass"'<\/password>/g' "$opensrf_core"
    fi

    log "Updating ejabberd accounts for OpenSRF (opensrf/router on public.localhost/private.localhost)"
    set_ejabberd_password opensrf private.localhost "$xmpp_pass"
    set_ejabberd_password opensrf public.localhost "$xmpp_pass"
    set_ejabberd_password router private.localhost "$xmpp_pass"
    set_ejabberd_password router public.localhost "$xmpp_pass"

    printf "EVERGREEN_XMPP_PASSWORD=%s\n" "$xmpp_pass" >>"$secrets_file"
    rotated_any="true"
  else
    log "Skipping XMPP rotation (no default values found). Use --force to rotate anyway."
  fi

  # ---------------------------------------------------------------------------
  # Rotate Evergreen PostgreSQL role password used by OpenSRF (DB)
  # ---------------------------------------------------------------------------
  if [[ "$ONLY_XMPP" != "true" ]] && { [[ "$FORCE_DB" == "true" ]] || grep -q '<pw>jake</pw>' "$opensrf_xml"; }; then
    require_cmd psql

    local db_pass="${EVERGREEN_DB_PASSWORD:-}"
    if [[ -z "$db_pass" ]]; then
      db_pass="$(gen_hex_password 16)"
    fi

    log "Rotating Evergreen DB password for role 'evergreen' + updating $opensrf_xml"
    backup_file "$opensrf_xml"

    if [[ "$FORCE_DB" == "true" ]]; then
      sed -i -E 's/<pw>[^<]+<\/pw>/<pw>'"$db_pass"'<\/pw>/g' "$opensrf_xml"
    else
      sed -i -E 's/<pw>jake<\/pw>/<pw>'"$db_pass"'<\/pw>/g' "$opensrf_xml"
    fi

    run_as_postgres "ALTER ROLE evergreen PASSWORD '${db_pass}';"

    printf "EVERGREEN_DB_PASSWORD=%s\n" "$db_pass" >>"$secrets_file"
    rotated_any="true"
  else
    log "Skipping DB rotation (no default '<pw>jake</pw>' found). Use --force to rotate anyway."
  fi

  if [[ "$rotated_any" != "true" ]]; then
    log "No changes made."
    rm -f "$secrets_file"
    exit 0
  fi

  log "Restarting OpenSRF to pick up changes"
  systemctl restart opensrf

  log "Wrote rotated secrets to: $secrets_file (0600 root-only)"
  if [[ "$PRINT" == "true" ]]; then
    echo "---"
    cat "$secrets_file"
    echo "---"
  fi

  log "DONE"
}

main
