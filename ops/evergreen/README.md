# Evergreen hardening runbook

This folder contains a **root-run** hardening script for the Evergreen host.

## Why this exists

Some of the highest-risk Evergreen fixes require `sudo` on Evergreen (firewalling internal ports, locking down `/openils/conf`, Apache hardening). If you don’t have passwordless sudo for `jake` on Evergreen, you can still run these steps by SSH’ing to Evergreen and running the script with sudo.

## Run

If the StacksOS repo exists on **evergreen**:

```bash
cd /home/jake/projects/stacksos
sudo bash ops/evergreen/evergreen_harden.sh --stacksos-ip 192.168.1.233
```

Recommended add-ons:
- Restrict SSH to LAN only: `--ssh-from 192.168.1.0/24`
- Restrict SSH users: `--ssh-allow-users jake`
- Apply pending security updates: `--apply-updates` (may require reboot)

If the repo does **not** exist on evergreen (common), run the scripts from your home directory after copying them over (example assumes you copied to `~/ops/evergreen`):

```bash
sudo bash ~/ops/evergreen/evergreen_harden.sh --stacksos-ip 192.168.1.233
```

If Evergreen must be publicly reachable (not recommended for SaaS), run:

```bash
sudo bash ~/ops/evergreen/evergreen_harden.sh --public-web
```

## Rotate default secrets (high impact)

If your Evergreen install still has default secrets (e.g. XMPP/OpenSRF password is literally `password`, DB password is weak), rotate them in a short maintenance window:

On **evergreen** (repo checkout):

```bash
cd /home/jake/projects/stacksos
sudo bash ops/evergreen/evergreen_rotate_secrets.sh --print
```

Or (copied scripts):

```bash
sudo bash ~/ops/evergreen/evergreen_rotate_secrets.sh --print
```

Security note: `--print` will display secrets on your terminal. If you’re screen-sharing or pasting output into chat/logs, omit `--print` and read the secrets file it writes under `/root/` directly on the server.

Then on **stacksos**, update `.env.local` with the new `EVERGREEN_DB_PASSWORD` value (if it changed) and restart:

```bash
sudo systemctl restart stacksos.service
```

## What it does (high level)

- Enables UFW with a default deny inbound policy.
- Allows inbound: SSH (22/tcp) by default.
- Adds an `sshd_config.d` hardening drop-in:
  - `PasswordAuthentication no`
  - `X11Forwarding no`
  - safer defaults for auth/session limits
- For web:
  - **Recommended for SaaS:** allow HTTPS (443/tcp) **only** from the StacksOS host (`--stacksos-ip ...`).
  - Optional/legacy: allow HTTP/HTTPS from anywhere (`--public-web`).
  - This implicitly blocks OpenSRF internal messaging ports from the LAN (ejabberd 5222/5223, epmd 4369, Erlang distribution ports, etc.) while still allowing localhost traffic.
- Locks down OpenSRF config readability:
  - `/openils/conf/opensrf.xml`
  - `/openils/conf/opensrf_core.xml`
  - `/openils/conf/*.bak.*` (backup files can contain secrets)
- Applies basic Apache info-leak hardening:
  - `ServerTokens Prod`
  - `ServerSignature Off`
  - Enables `X-Content-Type-Options: nosniff`

## Follow-ups (manual, high impact)

These are intentionally not fully automated because they can be disruptive and require coordination:

- Rotate database and OpenSRF credentials (current defaults are not acceptable).
- Confirm Apache TLS profile (protocols/ciphers) matches your client requirements.
- Confirm ejabberd / Erlang distribution ports are not externally reachable after firewalling.
- Add backups + test restores (PostgreSQL + `/openils/conf` + `/etc/apache2`).

## Follow-up checklist (no rotations)

See: `ops/evergreen/FOLLOW_UP.md`

## Backups (optional, recommended)

This repo includes a root-run backup script and systemd timer units:

- `ops/evergreen/evergreen_backup.sh`
- `ops/evergreen/evergreen-backup.service`
- `ops/evergreen/evergreen-backup.timer`

Install instructions are in `ops/evergreen/FOLLOW_UP.md`.

## Remote Access (no port forwarding): Tailscale Serve (recommended)

If you want to reach Evergreen off-LAN without opening your router, and without browser TLS warnings, use Tailscale
Serve. This publishes a tailnet-only HTTPS URL (`https://evergreen.<tailnet>.ts.net/`) with a publicly trusted
certificate.

High-level steps (on the Evergreen host):

1. Install + login:

```bash
sudo apt-get update
sudo apt-get install -y tailscale
sudo tailscale up
```

2. Avoid port conflicts:

- Tailscale Serve uses `:443` on the node's Tailscale IP.
- Ensure Apache is not bound to `0.0.0.0:443` (which includes the `tailscale0` interface).
- A safe pattern is to listen on LAN + localhost only:
  - `Listen 127.0.0.1:443`
  - `Listen <LAN_IP>:443` (example: `192.168.1.232:443`)

3. Allow inbound HTTPS on the `tailscale0` interface (UFW):

```bash
sudo ufw allow in on tailscale0 to any port 443 proto tcp
```

4. Enable Serve (proxy to Apache):

```bash
sudo tailscale serve --bg --yes https+insecure://127.0.0.1:443
sudo tailscale serve status
```

Notes:
- `https+insecure://` is used because Apache's existing cert may be self-signed; the public-facing cert is provided by
  Tailscale Serve.
- This does not make Evergreen publicly reachable. It's accessible only from devices logged into your tailnet.
