# Evergreen follow-ups (no key rotation)

This is a practical checklist you can run on the **evergreen** host after the initial hardening.

Assumptions:
- You can `ssh evergreen` as `jake`
- You can run `sudo` interactively on evergreen

## 1) Verify firewall + exposed ports

```bash
sudo ufw status verbose
sudo ss -ltnp
```

Expected:
- Inbound allowed: `22/tcp`, `80/tcp`, `443/tcp`
- No LAN exposure for OpenSRF internals (e.g. `5222/5223`, `4369`, Erlang distribution ports)
- PostgreSQL should remain localhost-only unless you *explicitly* decide to expose it

## 2) Verify core services are healthy

```bash
sudo systemctl status apache2 --no-pager
sudo systemctl status postgresql --no-pager
sudo systemctl status memcached --no-pager
sudo systemctl status ejabberd --no-pager || true
```

## 3) Verify Evergreen config permissions (should not be world-readable)

```bash
sudo stat -c '%a %U:%G %n' /openils/conf/opensrf.xml /openils/conf/opensrf_core.xml
```

Expected: `0640 opensrf:opensrf` (or stricter).

## 4) Install backups (DB + config)

### One-shot run

Copy the backup script to evergreen (from `stacksos`):

```bash
scp ops/evergreen/evergreen_backup.sh evergreen:/tmp/evergreen_backup.sh
ssh evergreen 'sudo install -m 0750 -o root -g root /tmp/evergreen_backup.sh /usr/local/sbin/evergreen_backup.sh'
```

Run it:

```bash
ssh evergreen 'sudo /usr/local/sbin/evergreen_backup.sh'
```

Backups land in:
- `/var/backups/evergreen/db/`
- `/var/backups/evergreen/config/`

### Automatic daily backups (systemd timer)

```bash
scp ops/evergreen/evergreen-backup.service ops/evergreen/evergreen-backup.timer evergreen:/tmp/
ssh evergreen 'sudo install -m 0644 -o root -g root /tmp/evergreen-backup.service /etc/systemd/system/evergreen-backup.service'
ssh evergreen 'sudo install -m 0644 -o root -g root /tmp/evergreen-backup.timer /etc/systemd/system/evergreen-backup.timer'
ssh evergreen 'sudo systemctl daemon-reload'
ssh evergreen 'sudo systemctl enable --now evergreen-backup.timer'
ssh evergreen 'sudo systemctl list-timers --all | rg evergreen-backup || true'
```

## 5) Patch cadence (schedule reboots)

```bash
sudo apt update
apt list --upgradable
sudo apt upgrade
sudo reboot
```

## 6) Log hygiene (recommended)

Goals:
- Ensure `/openils/var/log/` doesn’t fill the disk
- Ensure Apache logs rotate and retain useful history

Checks:

```bash
sudo ls -lh /openils/var/log | head
sudo logrotate -d /etc/logrotate.conf | head
```

If you want, I can add a `logrotate` snippet under `ops/evergreen/` tailored to your log paths and whether OpenSRF reopens logs cleanly on `HUP`.

## 7) Postgres safety (recommended)

If StacksOS accesses Postgres via SSH tunnel, keep Postgres on loopback:

```bash
sudo ss -ltnp | rg ':5432'
sudo -u postgres psql -c "show listen_addresses;"
```

## 8) Validate from stacksos

On `stacksos`:

```bash
curl -sS http://127.0.0.1:3000/api/health
```

Expected: `"status":"healthy"` and Evergreen checks `"up"`.
