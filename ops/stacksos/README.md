# StacksOS backups (local-first pilots)

StacksOS is mostly stateless. For pilots, back up:

- `.env.local` (deployment configuration)
- `tenants/*.json` (tenant configuration)
- `docs/*` (runbooks and operational docs)
- `.logs/audit.log` (append-only audit log)

This folder includes optional `systemd` units to take periodic backups on the StacksOS host.

## Hardening (recommended)

This repo includes a **root-run** hardening helper for the StacksOS host:

```bash
sudo bash ops/stacksos/stacksos_harden.sh
```

Optional flags:
- `--apply-updates` (apt update/upgrade)
- `--install-fail2ban`
- `--remove-telnet`
- `--ssh-allow-users jake` (restrict SSH users; be careful)

This script does **not** change passwords (run `sudo passwd <user>` interactively).

## TLS reverse proxy (recommended)

For production/pilots, terminate TLS in front of Next.js and set secure cookies:
- `STACKSOS_BASE_URL=https://...`
- `STACKSOS_COOKIE_SECURE=true`

This repo includes a Caddy config:
- `ops/stacksos/caddy/Caddyfile`

Install + configure (on stacksos host):

```bash
# Install Caddy (example: Ubuntu package)
# sudo apt-get update && sudo apt-get install -y caddy
sudo cp ops/stacksos/caddy/Caddyfile /etc/caddy/Caddyfile

# Optional: set the hostname/IP the cert should cover (LAN)
# Example: STACKSOS_HOST=192.168.1.233
# Note: the packaged `caddy.service` does not reliably read `/etc/default/caddy`,
# so use a systemd drop-in for the environment variable.
sudo mkdir -p /etc/systemd/system/caddy.service.d
sudo tee /etc/systemd/system/caddy.service.d/10-stacksos.conf >/dev/null <<'EOF'
[Service]
Environment=STACKSOS_HOST=stacksos.lan
EOF
sudo systemctl daemon-reload

sudo systemctl restart caddy
```

Notes:
- Caddy `tls internal` uses its own CA. Clients may need to trust the CA cert for a clean lock icon.
- After Caddy is serving HTTPS, you should disable `stacksos-proxy.service` (socat on port 3000):

```bash
sudo systemctl disable --now stacksos-proxy.service
sudo systemctl reset-failed stacksos-proxy.service
```

### Trusting the internal CA (removing browser warnings)

For LAN pilots, the fastest way to remove browser TLS warnings is to trust Caddy's internal Root CA on each client.

Docs:
- `docs/TLS_INTERNAL_CA.md`
  - Tip: once exported, it can be downloaded at `https://<STACKSOS_HOST>/caddy-internal-root.crt`.

On the StacksOS host, export the Root CA for distribution:

```bash
sudo bash ops/stacksos/caddy/export-internal-ca.sh
```

## Install (on stacksos host)

Copy the units into `/etc/systemd/system/` and enable the timer:

```bash
sudo cp ops/stacksos/stacksos-backup.* /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now stacksos-backup.timer
```

Backups write to `/var/backups/stacksos` by default.

## DB tunnel hardening (recommended)

This VM uses `evergreen-db-tunnel.service` to forward:
- `127.0.0.1:5433` → `evergreen:5432`

Recommended: run the tunnel as a dedicated user with a restricted SSH key. A hardened unit template is included:
- `ops/stacksos/evergreen-db-tunnel.service`

Install (on stacksos host):

```bash
sudo cp ops/stacksos/evergreen-db-tunnel.service /etc/systemd/system/evergreen-db-tunnel.service
sudo systemctl daemon-reload
sudo systemctl restart evergreen-db-tunnel.service
```

See `SECURITY.md` for recommended `authorized_keys` restrictions on the Evergreen side.

## Scheduled reports runner (optional, recommended)

Scheduled reports are delivered by a timer that calls the internal runner endpoint.

1) Add these env vars to your deployment (example: `/etc/stacksos/stacksos.env`):

```bash
STACKSOS_PUBLIC_BASE_URL=https://stacks.example.org
STACKSOS_SCHEDULED_REPORTS_SECRET=<long-random-string>
```

2) Install + enable the timer:

```bash
sudo cp ops/stacksos/stacksos-scheduled-reports.* /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now stacksos-scheduled-reports.timer
```
