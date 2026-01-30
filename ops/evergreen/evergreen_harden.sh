#!/usr/bin/env bash
set -euo pipefail

ts() { date -u +"%Y-%m-%dT%H:%M:%SZ"; }
log() { printf "[%s] %s\n" "$(ts)" "$*"; }

require_root() {
  if [[ "${EUID:-$(id -u)}" -ne 0 ]]; then
    echo "ERROR: must run as root (use sudo)" >&2
    exit 1
  fi
}

backup_file() {
  local f="$1"
  local stamp
  stamp="$(date -u +%Y%m%dT%H%M%SZ)"
  if [[ -f "$f" ]]; then
    cp -a "$f" "${f}.bak.${stamp}"
  fi
}

configure_ufw() {
  if ! command -v ufw >/dev/null 2>&1; then
    log "Installing ufw"
    apt-get update -y
    apt-get install -y ufw
  fi

  log "Configuring UFW (default deny inbound; allow 22/80/443)"
  ufw default deny incoming
  ufw default allow outgoing

  ufw allow 22/tcp
  ufw allow 80/tcp
  ufw allow 443/tcp

  # Ensure it's on (non-interactive).
  ufw --force enable
}

harden_openils_conf_perms() {
  local core="/openils/conf/opensrf_core.xml"
  local main="/openils/conf/opensrf.xml"

  log "Locking down OpenSRF config readability"

  if [[ -f "$core" ]]; then
    backup_file "$core"
    chown opensrf:opensrf "$core" || true
    chmod 0640 "$core" || true
  else
    log "WARN: missing $core"
  fi

  if [[ -f "$main" ]]; then
    backup_file "$main"
    chown opensrf:opensrf "$main" || true
    chmod 0640 "$main" || true
  else
    log "WARN: missing $main"
  fi
}

harden_apache_security_conf() {
  local security_conf="/etc/apache2/conf-enabled/security.conf"

  if [[ ! -f "$security_conf" ]]; then
    log "WARN: missing $security_conf"
    return 0
  fi

  log "Hardening Apache: ServerTokens/ServerSignature + nosniff"
  backup_file "$security_conf"

  # ServerTokens
  if grep -qE '^[[:space:]]*ServerTokens[[:space:]]+' "$security_conf"; then
    sed -i -E 's/^[[:space:]]*ServerTokens[[:space:]]+.*/ServerTokens Prod/' "$security_conf"
  else
    printf "\nServerTokens Prod\n" >>"$security_conf"
  fi

  # ServerSignature
  if grep -qE '^[[:space:]]*ServerSignature[[:space:]]+' "$security_conf"; then
    sed -i -E 's/^[[:space:]]*ServerSignature[[:space:]]+.*/ServerSignature Off/' "$security_conf"
  else
    printf "\nServerSignature Off\n" >>"$security_conf"
  fi

  # X-Content-Type-Options (uncomment/replace if present, else append)
  # NOTE: A previous version of this script could accidentally write a literal "\1" line.
  if grep -qE '^[[:space:]]*\\1[[:space:]]*$' "$security_conf"; then
    sed -i -E 's/^[[:space:]]*\\1[[:space:]]*$/Header always set X-Content-Type-Options \"nosniff\"/' "$security_conf"
  fi

  if grep -qE '^[[:space:]]*#?[[:space:]]*Header[[:space:]]+(always[[:space:]]+)?set[[:space:]]+X-Content-Type-Options' "$security_conf"; then
    sed -i -E 's/^[[:space:]]*#?[[:space:]]*Header[[:space:]]+(always[[:space:]]+)?set[[:space:]]+X-Content-Type-Options.*$/Header always set X-Content-Type-Options \"nosniff\"/' "$security_conf"
  else
    printf "\nHeader always set X-Content-Type-Options \"nosniff\"\n" >>"$security_conf"
  fi

  # Ensure headers module is enabled.
  a2enmod headers >/dev/null
  apache2ctl configtest
  systemctl reload apache2 || systemctl restart apache2
}

verify() {
  log "UFW status:"
  ufw status verbose || true

  log "Listening sockets (tcp):"
  ss -tulnH | awk '$1 ~ /tcp/ {print $5}' | sort -u | sed -n '1,200p' || true

  log "OpenSRF config perms:"
  stat -c '%a %U:%G %n' /openils/conf/opensrf.xml /openils/conf/opensrf_core.xml 2>/dev/null || true

  log "Apache security.conf highlights:"
  grep -nE '^(ServerTokens|ServerSignature|TraceEnable|Header[[:space:]]+set[[:space:]]+X-Content-Type-Options)' /etc/apache2/conf-enabled/security.conf 2>/dev/null || true
}

main() {
  require_root
  configure_ufw
  harden_openils_conf_perms
  harden_apache_security_conf
  verify
  log "DONE"
}

main "$@"
