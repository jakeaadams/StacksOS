# Server Security Audit (StacksOS + Evergreen)

Last refreshed: 2026-02-05 (UTC)

Hosts:
- `stacksos` (`192.168.1.233`) — StacksOS app host
- `evergreen` (`192.168.1.232`) — Evergreen backend

## Executive summary

This document is intentionally evidence-driven. Where we could not verify a claim from this environment, we say so
explicitly.

### What is verified (from this environment)

- Evergreen SSH is **publickey-only** (password auth not offered).
- Evergreen is running kernel `6.8.0-94-generic` and does **not** show `/var/run/reboot-required`.
- StacksOS is running kernel `6.8.0-94-generic` and does **not** show `/var/run/reboot-required`.
- **Security updates are pending** on both hosts (kernel meta packages indicate `6.8.0-100.*` is available).
- StacksOS SSH is **publickey-only** (password auth not offered).
- Evergreen sudoers filesystem permissions are correct (`/etc/sudoers` is `0440`) and `/etc/sudoers.d/` contains only the
  stock `README` (no drop-ins).
- StacksOS sudoers filesystem permissions are correct (`/etc/sudoers` is `0440`) and `/etc/sudoers.d/` contains only the
  stock `README` (no drop-ins).
- Evergreen OpenSRF/ILS hardening improvements are visible without sudo:
  - `redis-cli -h 127.0.0.1 ping` returns `NOAUTH Authentication required` (Redis now requires auth).
  - `/openils/var/log` and `/openils/var/sock` are no longer world-writable.
  - `ejabberd` user shell is `/usr/sbin/nologin`.

### What is not verified here

- Effective `sshd -T` settings for Evergreen/StacksOS (requires sudo because hardening drop-ins are `0600 root:root`).

## Evidence (selected)

### evergreen

- OS: Ubuntu 24.04.3 LTS
- Kernel: `6.8.0-94-generic`
- `/var/run/reboot-required`: not present
- Pending updates (user-visible without sudo):
  - `linux-generic`, `linux-image-generic`, `linux-headers-generic` → `6.8.0-100.100`
- SSH auth methods offered (client-side probe): **publickey only**
  - `ssh -o PubkeyAuthentication=no -o PreferredAuthentications=password evergreen` → `Permission denied (publickey)`
- `/etc/ssh/sshd_config.d/` contains:
  - `00-evergreen-hardening.conf` (`0600 root:root`; contents not readable without sudo)
  - `50-cloud-init.conf` (`0600 root:root`; contents not readable without sudo)
- Sudoers perms:
  - `/etc/sudoers` is `0440 root:root`
  - `/etc/sudoers.d/` contains only `README` (no active drop-ins)
- Listening ports (selected; from `ss -lnt`):
  - `*:443` and `*:80` are listening (Apache)
  - Redis (`6379`), PostgreSQL (`5432`), memcached (`11211`), epmd (`4369`), ejabberd (`5222/5223`) are **not** on `0.0.0.0`
    (loopback-only bindings are visible)

### stacksos

- SSH auth methods offered (client-side probe): **publickey only**
  - `ssh -o PubkeyAuthentication=no -o PreferredAuthentications=password stacksos` → `Permission denied (publickey)`
- OS: Ubuntu 24.04.3 LTS
- Kernel: `6.8.0-94-generic`
- `/var/run/reboot-required`: not present
- Pending updates (user-visible without sudo):
  - Kernel meta packages indicate `6.8.0-100.*` is available
  - Security updates pending for `glib2.0` and `python3.12` packages (noble-security)
- Reboot evidence:
  - `last -x` shows the kernel-pickup reboot occurred at `2026-02-04 18:13 UTC`:
    - `reboot system boot 6.8.0-94-generic Wed Feb 4 18:13 still running`

## Notes

- Previous drafts of this file included unverified claims (e.g., `AllowUsers`, `sshd -T` output, and a StacksOS
  reboot-required note). Those were removed or re-scoped to verified evidence above.

## Next steps (recommended)

1. If you want this doc to assert effective `sshd -T` values (X11 forwarding, AllowUsers, etc.), re-run the probes with
   sudo and capture:
   - `sudo sshd -T | egrep '^(passwordauthentication|kbdinteractiveauthentication|permitrootlogin|x11forwarding|allowagentforwarding|allowtcpforwarding|usedns|allowusers)\\b'`
