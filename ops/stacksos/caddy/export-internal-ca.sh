#!/usr/bin/env bash
set -euo pipefail

if [[ "${EUID:-$(id -u)}" -ne 0 ]]; then
  echo "Run as root: sudo bash ops/stacksos/caddy/export-internal-ca.sh" >&2
  exit 1
fi

src="${1:-/var/lib/caddy/.local/share/caddy/pki/authorities/local/root.crt}"
dest_dir="${2:-/etc/caddy/pki}"
dest="${dest_dir%/}/caddy-internal-root.crt"

if [[ ! -f "$src" ]]; then
  echo "CA certificate not found: $src" >&2
  exit 1
fi

mkdir -p "$dest_dir"
install -m 0644 -o root -g root "$src" "$dest"

echo "Wrote: $dest"

if command -v openssl >/dev/null 2>&1; then
  echo
  openssl x509 -in "$dest" -noout -subject -issuer -dates
  echo
  openssl x509 -in "$dest" -noout -fingerprint -sha256
else
  echo
  sha256sum "$dest"
fi

cat <<'EOF'

Next steps:
- Copy the file to each client machine and trust it as a Root CA.
- Verify the SHA-256 fingerprint out-of-band before trusting the CA.

Client trust commands (examples)

Ubuntu/Debian:
  sudo cp caddy-internal-root.crt /usr/local/share/ca-certificates/stacksos-caddy.crt
  sudo update-ca-certificates

macOS:
  sudo security add-trusted-cert -d -r trustRoot -k /Library/Keychains/System.keychain stacksos-caddy.crt

Windows (PowerShell as Administrator):
  certutil -addstore -f Root stacksos-caddy.crt

Firefox (if it does not use OS trust):
  about:config -> security.enterprise_roots.enabled = true
EOF

