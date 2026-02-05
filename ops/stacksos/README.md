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
