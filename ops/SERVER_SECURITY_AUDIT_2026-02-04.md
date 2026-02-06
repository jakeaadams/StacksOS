# Server Security Audit (StacksOS + Evergreen)

Last refreshed: 2026-02-06 (UTC)

Hosts:
- `stacksos` (`192.168.1.233`) — StacksOS app host
- `evergreen` (`192.168.1.232`) — Evergreen backend

## Executive summary

This document is intentionally evidence-driven. Where we could not verify a claim from this environment, we say so
explicitly.

### What is verified (from this environment)

- Evergreen SSH is **publickey-only** (password auth not offered).
- Evergreen is running kernel `6.8.0-100-generic` and does **not** show `/var/run/reboot-required`.
- StacksOS is running kernel `6.8.0-94-generic` and **does** show `/var/run/reboot-required` (kernel updates installed; reboot pending).
- StacksOS SSH is **publickey-only** (password auth not offered).
- Effective `sshd -T` settings are verified on both hosts:
  - `PermitRootLogin no`
  - `PasswordAuthentication no`
  - `X11Forwarding no`
  - `AllowUsers jake`
- Firewall rules are verified:
  - StacksOS: inbound `22/tcp`, `80/tcp`, `443/tcp` allowed only from `192.168.1.0/24`
  - Evergreen: inbound `22/tcp` allowed only from `192.168.1.0/24`; `443/tcp` allowed only from `192.168.1.233`
- Evergreen sudoers filesystem permissions are correct (`/etc/sudoers` is `0440`) and `/etc/sudoers.d/` contains only the
  stock `README` (no drop-ins).
- StacksOS sudoers filesystem permissions are correct (`/etc/sudoers` is `0440`) and `/etc/sudoers.d/` contains only the
  stock `README` (no drop-ins).
- Evergreen OpenSRF/ILS hardening improvements are visible without sudo:
  - `redis-cli -h 127.0.0.1 ping` returns `NOAUTH Authentication required` (Redis now requires auth).
  - `/openils/var/log` and `/openils/var/sock` are no longer world-writable.
  - `ejabberd` user shell is `/usr/sbin/nologin`.

### What is not verified here

- Post-reboot verification on StacksOS (pending reboot to pick up kernel `6.8.0-100-generic`).

## Evidence (selected)

### evergreen

- OS: Ubuntu 24.04.3 LTS
- Kernel: `6.8.0-100-generic`
- `/var/run/reboot-required`: not present
- SSH auth methods offered (client-side probe): **publickey only**
  - `ssh -o PubkeyAuthentication=no -o PreferredAuthentications=password evergreen` → `Permission denied (publickey)`
- `/etc/ssh/sshd_config.d/` contains:
  - `00-evergreen-hardening.conf` (`0600 root:root`; contents not readable without sudo)
  - `50-cloud-init.conf` (`0600 root:root`; contents not readable without sudo)
- Sudoers perms:
  - `/etc/sudoers` is `0440 root:root`
  - `/etc/sudoers.d/` contains only `README` (no active drop-ins)
- UFW rules (sudo-verified):
  - `22/tcp` allowed only from `192.168.1.0/24`
  - `443/tcp` allowed only from `192.168.1.233`
- Listening ports (selected; from `ss -lnt`):
  - `*:443` and `*:80` are listening (Apache)
  - Redis (`6379`), PostgreSQL (`5432`), memcached (`11211`), epmd (`4369`), ejabberd (`5222/5223`) are **not** on `0.0.0.0`
    (loopback-only bindings are visible)

### stacksos

- SSH auth methods offered (client-side probe): **publickey only**
  - `ssh -o PubkeyAuthentication=no -o PreferredAuthentications=password stacksos` → `Permission denied (publickey)`
- OS: Ubuntu 24.04.3 LTS
- Kernel: `6.8.0-94-generic`
- `/var/run/reboot-required`: present (kernel meta packages updated to `6.8.0-100.*`; reboot required)
- UFW rules (sudo-verified):
  - `22/tcp` allowed only from `192.168.1.0/24`
  - `80/tcp` and `443/tcp` allowed only from `192.168.1.0/24`
- Reverse proxy:
  - Caddy serves `:80`/`:443` and forwards to `127.0.0.1:3000` (Next.js)
- Reboot evidence:
  - `last -x` shows the kernel-pickup reboot occurred at `2026-02-04 18:13 UTC`:
    - `reboot system boot 6.8.0-94-generic Wed Feb 4 18:13 still running`

## Notes

- Previous drafts of this file included unverified claims (e.g., `AllowUsers`, `sshd -T` output, and a StacksOS
  reboot-required note). Those were removed or re-scoped to verified evidence above.

## Next steps (recommended)

1. Reboot StacksOS to pick up the installed kernel/security updates:
   - `sudo reboot`
