# Evergreen hardening runbook

This folder contains a **root-run** hardening script for the Evergreen host.

## Why this exists

Some of the highest-risk Evergreen fixes require `sudo` on Evergreen (firewalling internal ports, locking down `/openils/conf`, Apache hardening). If you don’t have passwordless sudo for `jake` on Evergreen, you can still run these steps by SSH’ing to Evergreen and running the script with sudo.

## Run

If the StacksOS repo exists on **evergreen**:

```bash
cd /home/jake/projects/stacksos
sudo bash ops/evergreen/evergreen_harden.sh
```

If the repo does **not** exist on evergreen (common), run the scripts from your home directory after copying them over (example assumes you copied to `~/ops/evergreen`):

```bash
sudo bash ~/ops/evergreen/evergreen_harden.sh
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
- Allows inbound: SSH (22/tcp), HTTP (80/tcp), HTTPS (443/tcp).
  - This implicitly blocks OpenSRF internal messaging ports from the LAN (ejabberd 5222/5223, epmd 4369, Erlang distribution ports, etc.) while still allowing localhost traffic.
- Locks down OpenSRF config readability:
  - `/openils/conf/opensrf.xml`
  - `/openils/conf/opensrf_core.xml`
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
