#!/usr/bin/env bash
set -euo pipefail

ts() { date -u +"%Y-%m-%dT%H:%M:%SZ"; }
log() { printf "[%s] %s\n" "$(ts)" "$*"; }

usage() {
  cat <<'USAGE'
Usage: stacksos_harden.sh [options]

This is a root-run hardening helper for the StacksOS host.

Options:
  --ssh-allow-users <csv>     Set AllowUsers (comma-separated, default: skip).
  --apply-updates             Run apt update && apt upgrade -y (default: skip).
  --install-fail2ban          Install + enable fail2ban (default: skip).
  --remove-telnet             Remove inetutils-telnet if present (default: skip).
  -h, --help                  Show this help.

Notes:
- This script intentionally does NOT change user passwords. Do that interactively:
  sudo passwd <user>
USAGE
}

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

SSH_ALLOW_USERS=""
APPLY_UPDATES=0
INSTALL_FAIL2BAN=0
REMOVE_TELNET=0

while [[ $# -gt 0 ]]; do
  case "${1:-}" in
    --ssh-allow-users)
      SSH_ALLOW_USERS="${2:-}"
      shift 2
      ;;
    --apply-updates)
      APPLY_UPDATES=1
      shift
      ;;
    --install-fail2ban)
      INSTALL_FAIL2BAN=1
      shift
      ;;
    --remove-telnet)
      REMOVE_TELNET=1
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

ensure_sshd_hardening() {
  local d="/etc/ssh/sshd_config.d"
  local f="${d}/00-stacksos-hardening.conf"

  mkdir -p "$d"
  backup_file "$f"

  log "Writing SSH hardening config: $f"
  cat >"$f" <<'EOF'
# StacksOS SSH hardening (managed by ops/stacksos/stacksos_harden.sh)
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

ensure_sysctl_hardening() {
  local f="/etc/sysctl.d/99-hardening.conf"
  backup_file "$f"

  log "Writing sysctl hardening: $f"
  cat >"$f" <<'EOF'
# StacksOS sysctl hardening (managed by ops/stacksos/stacksos_harden.sh)
net.ipv4.conf.all.send_redirects = 0
net.ipv4.conf.default.send_redirects = 0
net.ipv4.conf.all.log_martians = 1
net.ipv4.conf.default.log_martians = 1
net.ipv4.icmp_echo_ignore_broadcasts = 1
net.ipv4.icmp_ignore_bogus_error_responses = 1
net.ipv4.tcp_syncookies = 1
net.ipv6.conf.all.accept_redirects = 0
net.ipv6.conf.default.accept_redirects = 0
EOF

  chmod 0644 "$f"
  chown root:root "$f"

  log "Applying sysctl"
  sysctl --system >/dev/null
}

ensure_sudoers_safety() {
  log "Checking sudoers.d for insecure permissions / NOPASSWD grants"
  if [[ -d /etc/sudoers.d ]]; then
    local any=0
    while IFS= read -r -d '' f; do
      any=1
      local mode
      mode="$(stat -c '%a' "$f")"
      if [[ "$mode" != "440" && "$mode" != "400" ]]; then
        log "WARN: fixing sudoers perms: $f ($mode -> 0440)"
        chmod 0440 "$f" || true
      fi
      if rg -n "NOPASSWD" "$f" >/dev/null 2>&1; then
        log "WARN: NOPASSWD found in $f (review manually; not auto-editing)"
      fi
    done < <(find /etc/sudoers.d -maxdepth 1 -type f -print0 2>/dev/null || true)
    if [[ "$any" -eq 0 ]]; then
      log "No sudoers drop-ins found."
    fi
  fi

  if command -v visudo >/dev/null 2>&1; then
    visudo -c >/dev/null
  fi
}

disable_unneeded_services() {
  for svc in ModemManager fwupd; do
    if systemctl list-unit-files --type=service 2>/dev/null | rg -q "^${svc}\\.service"; then
      log "Disabling service: $svc"
      systemctl disable --now "${svc}.service" || true
    fi
  done
}

maybe_apply_updates() {
  if [[ "$APPLY_UPDATES" -ne 1 ]]; then
    return 0
  fi
  log "Applying security updates (apt update/upgrade)"
  apt-get update -y
  DEBIAN_FRONTEND=noninteractive apt-get upgrade -y
}

maybe_install_fail2ban() {
  if [[ "$INSTALL_FAIL2BAN" -ne 1 ]]; then
    return 0
  fi
  log "Installing fail2ban"
  apt-get update -y
  apt-get install -y fail2ban
  systemctl enable --now fail2ban || true
}

maybe_remove_telnet() {
  if [[ "$REMOVE_TELNET" -ne 1 ]]; then
    return 0
  fi
  if dpkg -s inetutils-telnet >/dev/null 2>&1; then
    log "Removing inetutils-telnet"
    apt-get remove -y inetutils-telnet
  fi
}

verify() {
  log "Host kernel: $(uname -r)"
  if [[ -f /var/run/reboot-required ]]; then
    log "WARN: reboot required: $(cat /var/run/reboot-required | tr -d '\\n')"
  fi

  log "sshd effective settings (selected):"
  sshd -T 2>/dev/null | rg -n '^(passwordauthentication|permitrootlogin|permitemptypasswords|x11forwarding|allowagentforwarding|maxauthtries|logingracetime|clientaliveinterval|clientalivecountmax)\\b' || true

  log "sysctl (selected):"
  sysctl -n net.ipv4.conf.all.send_redirects net.ipv4.conf.default.send_redirects 2>/dev/null || true
}

main() {
  require_root
  ensure_sshd_hardening
  ensure_sysctl_hardening
  ensure_sudoers_safety
  disable_unneeded_services
  maybe_remove_telnet
  maybe_install_fail2ban
  maybe_apply_updates
  verify
  log "DONE"
}

main "$@"

