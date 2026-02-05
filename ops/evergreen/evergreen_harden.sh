#!/usr/bin/env bash
set -euo pipefail

ts() { date -u +"%Y-%m-%dT%H:%M:%SZ"; }
log() { printf "[%s] %s\n" "$(ts)" "$*"; }

usage() {
  cat <<'USAGE'
Usage: evergreen_harden.sh [options]

Options:
  --stacksos-ip <IP>   Restrict Evergreen HTTPS (443) to the StacksOS host IP (recommended for SaaS).
  --allow-http         If used with --stacksos-ip, also allow HTTP (80) from that IP (usually not needed).
  --public-web         Allow HTTP/HTTPS (80/443) from anywhere (use only if Evergreen must be publicly reachable).
  --ssh-from <CIDR>    Restrict SSH (22) to a CIDR (e.g. 192.168.1.0/24). Default: allow from anywhere.
  --ssh-allow-users <csv>  Set AllowUsers (comma-separated, default: skip).
  --apply-updates      Run apt update && apt upgrade -y (default: skip).
  -h, --help           Show this help.
USAGE
}

STACKSOS_IP=""
ALLOW_HTTP=0
PUBLIC_WEB=0
SSH_FROM=""
SSH_ALLOW_USERS=""
APPLY_UPDATES=0

while [[ $# -gt 0 ]]; do
  case "${1:-}" in
    --stacksos-ip)
      STACKSOS_IP="${2:-}"
      shift 2
      ;;
    --allow-http)
      ALLOW_HTTP=1
      shift
      ;;
    --public-web)
      PUBLIC_WEB=1
      shift
      ;;
    --ssh-from)
      SSH_FROM="${2:-}"
      shift 2
      ;;
    --ssh-allow-users)
      SSH_ALLOW_USERS="${2:-}"
      shift 2
      ;;
    --apply-updates)
      APPLY_UPDATES=1
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "ERROR: unknown argument: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

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

ensure_sshd_hardening() {
  local d="/etc/ssh/sshd_config.d"
  local f="${d}/00-evergreen-hardening.conf"

  mkdir -p "$d"
  backup_file "$f"

  log "Writing SSH hardening config: $f"
  cat >"$f" <<'EOF'
# Evergreen SSH hardening (managed by ops/evergreen/evergreen_harden.sh)
PasswordAuthentication no
PermitRootLogin no
PermitEmptyPasswords no
X11Forwarding no
AllowAgentForwarding no
MaxAuthTries 3
LoginGraceTime 30
ClientAliveInterval 300
ClientAliveCountMax 2
EOF

  chmod 0600 "$f"
  chown root:root "$f"

  if [[ -n "$SSH_ALLOW_USERS" ]]; then
    log "Setting AllowUsers in /etc/ssh/sshd_config"
    backup_file /etc/ssh/sshd_config
    if grep -qE '^[[:space:]]*AllowUsers[[:space:]]' /etc/ssh/sshd_config; then
      sed -i -E 's/^[[:space:]]*AllowUsers[[:space:]]+.*/AllowUsers '"${SSH_ALLOW_USERS//,/ }"'/' /etc/ssh/sshd_config
    else
      printf "\nAllowUsers %s\n" "${SSH_ALLOW_USERS//,/ }" >>/etc/ssh/sshd_config
    fi
  fi

  log "Validating sshd config"
  if ! sshd -t; then
    echo "ERROR: sshd config validation failed; refusing to reload sshd" >&2
    exit 1
  fi

  log "Reloading sshd"
  systemctl reload sshd 2>/dev/null || systemctl reload ssh 2>/dev/null || systemctl restart sshd || systemctl restart ssh
}

configure_ufw() {
  if ! command -v ufw >/dev/null 2>&1; then
    log "Installing ufw"
    apt-get update -y
    apt-get install -y ufw
  fi

  if [[ "$PUBLIC_WEB" -eq 1 && -n "$STACKSOS_IP" ]]; then
    echo "ERROR: choose only one of --public-web or --stacksos-ip" >&2
    exit 2
  fi

  if [[ -n "$STACKSOS_IP" ]]; then
    log "Configuring UFW (default deny inbound; allow ssh; allow https from stacksos only)"
  else
    log "Configuring UFW (default deny inbound; allow ssh; allow web)"
  fi

  ufw default deny incoming
  ufw default allow outgoing

  if [[ -n "$SSH_FROM" ]]; then
    ufw allow from "$SSH_FROM" to any port 22 proto tcp
  else
    ufw allow 22/tcp
  fi

  if [[ "$PUBLIC_WEB" -eq 1 ]]; then
    ufw allow 80/tcp
    ufw allow 443/tcp
  elif [[ -n "$STACKSOS_IP" ]]; then
    ufw allow from "$STACKSOS_IP" to any port 443 proto tcp
    if [[ "$ALLOW_HTTP" -eq 1 ]]; then
      ufw allow from "$STACKSOS_IP" to any port 80 proto tcp
    fi
  else
    # Backward-compatible default: allow web from anywhere.
    # For SaaS, re-run with: --stacksos-ip <STACKSOS_HOST_IP>
    log "WARN: no --stacksos-ip provided; leaving 80/443 open to the world. For SaaS, restrict Evergreen to StacksOS."
    ufw allow 80/tcp
    ufw allow 443/tcp
  fi

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

  log "OpenSRF backup perms:"
  stat -c '%a %U:%G %n' /openils/conf/*.bak.* 2>/dev/null | sed -n '1,200p' || true

  log "sshd effective settings (selected):"
  sshd -T 2>/dev/null | grep -E '^(passwordauthentication|permitrootlogin|permitemptypasswords|x11forwarding|allowagentforwarding|maxauthtries|logingracetime|clientaliveinterval|clientalivecountmax)\\b' || true

  log "Apache security.conf highlights:"
  grep -nE '^(ServerTokens|ServerSignature|TraceEnable|Header[[:space:]]+set[[:space:]]+X-Content-Type-Options)' /etc/apache2/conf-enabled/security.conf 2>/dev/null || true

  if [[ -f /etc/apache2/ssl/evergreen.crt ]] && command -v openssl >/dev/null 2>&1; then
    log "Evergreen TLS cert expiration (/etc/apache2/ssl/evergreen.crt):"
    openssl x509 -noout -enddate -in /etc/apache2/ssl/evergreen.crt 2>/dev/null || true
  fi
}

maybe_apply_updates() {
  if [[ "$APPLY_UPDATES" -ne 1 ]]; then
    return 0
  fi
  log "Applying security updates (apt update/upgrade)"
  apt-get update -y
  DEBIAN_FRONTEND=noninteractive apt-get upgrade -y
}

lock_down_openils_backups() {
  log "Locking down OpenSRF backup config files (/openils/conf/*.bak.*)"
  if compgen -G "/openils/conf/*.bak.*" >/dev/null; then
    chown opensrf:opensrf /openils/conf/*.bak.* 2>/dev/null || true
    chmod 0640 /openils/conf/*.bak.* 2>/dev/null || true
  else
    log "No OpenSRF backup config files found."
  fi
}

main() {
  require_root
  ensure_sshd_hardening
  configure_ufw
  harden_openils_conf_perms
  lock_down_openils_backups
  harden_apache_security_conf
  maybe_apply_updates
  verify
  log "DONE"
}

main "$@"
