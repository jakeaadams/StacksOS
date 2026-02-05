# End-to-End Audit (StacksOS repo + Evergreen) — Fresh Pass

Date: 2026-02-05 (UTC)

Scope:
- StacksOS repo quality gates (lint/tests/audits/e2e)
- StacksOS host (`192.168.1.233`) and Evergreen host (`192.168.1.232`) surface-level security posture (non-destructive)

Important:
- This audit is intentionally evidence-driven and avoids logging secrets (cookies, tokens, patron PII).
- Some server-level checks require sudo (effective `sshd -T`, `ufw status verbose`). Those are marked as **blocked** if sudo
  is not available in this environment.

---

## Repo audit (StacksOS)

### Quality gates executed

- `npm audit --omit=dev`: **0 vulnerabilities**
- `npm run lint`: **PASS**
- `npm run test:run`: **PASS**
- `BASE_URL=http://127.0.0.1:3000 ./audit/run_all.sh`: **PASS**
  - API audit: **68 endpoints** checked; only expected negative fixtures returned non-200 (409)
  - Repo inventory: sidebar coverage OK; no unconnected pages; no unused adapters
  - Perf budgets (p95): **PASS**
    - `patron_search`: p95 ~55ms (budget 200ms)
    - `catalog_search`: p95 ~76ms (budget 200ms)
    - `catalog_search_facet`: p95 ~89ms (budget 250ms)
    - `holds_patron`: p95 ~46ms (budget 250ms)
    - `bills`: p95 ~24ms (budget 400ms)

### End-to-end UI checks (Playwright)

- `E2E_STAFF_USER=… E2E_STAFF_PASS=… npm run test:e2e`: **56 passed / 1 skipped**
  - The skipped test is intentionally **mutating** (OPAC holds flow) and requires `E2E_MUTATE=1`.
  - Staff Activity Log route is validated to load without the global “Something went wrong” error boundary.

Artifacts:
- `audit/REPORT.md`
- `audit/FEATURE_MATRIX.md`
- `audit/REPO_INVENTORY.md`

### Repo findings (code-level) and fixes applied

1) Client bundles importing the server logger (runtime crash risk)
- Fixed: swapped `@/lib/logger` imports to `@/lib/client-logger` in client components:
  - `src/components/opac/OPACHeader.tsx`
  - `src/components/shared/inline-edit.tsx`
  - `src/components/shared/patron-photo-upload.tsx`
  - `src/app/staff/settings/page.tsx`

2) File upload hardening (path traversal + error leakage)
- Fixed `recordId`/`patronId` validation and extension derivation to prevent path traversal.
- Removed unconditional error detail leakage in upload endpoints by using `serverErrorResponse()` (details only in non-prod / debug).
- Added unit coverage: `tests/upload-utils.test.ts`.
- Updated endpoints:
  - `src/app/api/upload-cover/route.ts`
  - `src/app/api/save-cover/route.ts`
  - `src/app/api/patron-photos/route.ts` (canonical)
  - `src/app/api/upload-patron-photo/route.ts` (deprecated shim; forwards to `/api/patron-photos`)

3) Cron runner compatibility with CSRF middleware
- Fixed `ops/stacksos/stacksos_scheduled_reports.sh` to fetch `/api/csrf-token` and include `x-csrf-token` + cookie jar for the POST.

4) Test/ops noise + safety improvements
- Suppressed structured logger output during Vitest runs by default (`src/lib/logger.ts`), while still allowing override via `STACKSOS_LOG_LEVEL`.
- Made rate-limit storage/cleanup a global singleton to avoid duplicate cleanup intervals during dev HMR (`src/lib/rate-limit.ts`).
- Default RBAC mode now resolves to `strict` in production unless explicitly overridden (`src/lib/permissions.ts`).
- Evergreen DB client defaults are now safe/local (`127.0.0.1`, `stacksos_app`) instead of targeting a LAN IP/user (`src/lib/db/evergreen.ts`).

5) CI gate (GitHub Actions)
- Added `.github/workflows/ci.yml` to run:
  - `npm audit`
  - `npm run lint`
  - `npm run test:run`
  - `NEXT_DIST_DIR=.next.build npm run build`
  - `bash audit/run_ui_audit.sh`
  - `bash audit/run_rbac_audit.sh`

6) Patron photo endpoint consolidation
- Canonical endpoint is now `GET/POST/DELETE /api/patron-photos`.
- `/api/upload-patron-photo` is kept as a deprecated compatibility shim (adds `Deprecation`/`Sunset` headers and forwards to canonical).
- Shared implementation lives in `src/lib/patron-photos-api.ts` and persists photo URLs via `savePatronPhotoUrl()` (Evergreen + custom table).

7) CSP hardening (nonce path, safe baseline preserved)
- Middleware now generates a per-request nonce and includes it in `script-src` and `style-src`.
- `unsafe-inline` remains for now (baseline compatibility), but the nonce makes it feasible to remove later once remaining inline sources are nonced/hashed.

8) Multi-instance readiness (shared stores)
- Added Redis support (when `STACKSOS_REDIS_URL` is set):
  - Rate limiting is backed by Redis (shared across instances).
  - Idempotency storage is backed by Redis + a best-effort distributed lock.
- Fallback behavior: if Redis is not configured or unavailable, both features degrade gracefully to the previous local/file-backed implementations.

---

## Server audit (StacksOS host)

### Verified

- Kernel: `6.8.0-94-generic`
- `/var/run/reboot-required`: not present
- `unattended-upgrades`: active + enabled
- `ufw`: active + enabled (rules not readable without sudo)
- `fail2ban`: active + enabled
- SSH password auth probe: **publickey only**
  - `ssh -o PubkeyAuthentication=no -o PreferredAuthentications=password stackos` → `Permission denied (publickey)`
- `net.ipv4.conf.{all,default}.send_redirects = 0`
- `/etc/sudoers.d/` contains only `README` (no custom drop-ins)
- SSH drop-ins exist and are root-only:
  - `/etc/ssh/sshd_config.d/00-stacksos-hardening.conf` (`0600 root:root`)

### Listening ports (non-root `ss -lnt` sample)

- `0.0.0.0:22` (SSH)
- `127.0.0.1:3000` (Next server, systemd shows `-H 127.0.0.1 -p 3000`)
- `192.168.1.233:3000` (LAN forwarder/proxy)
- `127.0.0.1:5433` (Evergreen DB tunnel; loopback-only)

### Findings

- **Pending OS updates (12 upgradable packages)**, including:
  - `linux-*` meta packages → `6.8.0-100.*`
  - `glib2.0` and `python3.12` security updates

Blocked (needs sudo):
- `sshd -T` effective config (drop-ins are root-only).
- `ufw status verbose` (rule review).

---

## Server audit (Evergreen host)

### Verified

- Kernel: `6.8.0-94-generic`
- `/var/run/reboot-required`: not present
- `unattended-upgrades`: active + enabled
- `ufw`: active + enabled (rules not readable without sudo)
- `fail2ban`: active + enabled
- SSH password auth probe: **publickey only**
  - `ssh -o PubkeyAuthentication=no -o PreferredAuthentications=password evergreenils` → `Permission denied (publickey)`
- SSH drop-ins exist and are root-only:
  - `/etc/ssh/sshd_config.d/00-evergreen-hardening.conf` (`0600 root:root`)
- OpenSRF/ILS hardening improvements (visible without sudo):
  - Redis requires auth: `redis-cli -h 127.0.0.1 ping` → `NOAUTH Authentication required`
  - `/openils/var/log` and `/openils/var/sock` are not world-writable
  - `ejabberd` login shell is `/usr/sbin/nologin`
- `net.ipv4.conf.{all,default}.send_redirects = 0`

### Listening ports (non-root `ss -lnt` sample)

- `0.0.0.0:22` / `[::]:22` (SSH)
- `*:443` and `*:80` (Apache)
- Loopback-only (not on `0.0.0.0`): Redis `6379`, PostgreSQL `5432`, memcached `11211`, epmd `4369`, ejabberd `5222/5223`

### Network exposure probe (from StacksOS → Evergreen)

`nc -zvw2 192.168.1.232 22 80 443 5222 5223 4369 5432 33905`:
- **Open**: `22`, `443`
- **Timed out (firewalled / dropped)**: `80`, `5222`, `5223`, `4369`, `5432`, `33905`

### Findings

- **Pending OS updates (3 upgradable packages)**:
  - kernel meta packages → `6.8.0-100.*`
- Service account shells still interactive (review carefully before changing):
  - `opensrf:/bin/bash`
  - `postgres:/bin/bash`

Blocked (needs sudo):
- `sshd -T` effective config (drop-ins are root-only).
- `ufw status verbose` (rule review).

---

## Recommended next actions

1) Apply OS updates on both hosts and reboot in a maintenance window:
- `sudo apt update && sudo apt full-upgrade`
- `sudo reboot`

2) Re-verify security posture with sudo (optional but recommended):
- `sudo sshd -T | egrep '^(passwordauthentication|kbdinteractiveauthentication|permitrootlogin|x11forwarding|allowagentforwarding|allowtcpforwarding|usedns|allowusers)\\b'`
- `sudo ufw status verbose`

3) Evergreen user shells:
- Only if operationally safe, consider `usermod -s /usr/sbin/nologin opensrf` and `usermod -s /usr/sbin/nologin postgres`
  (verify Evergreen/OpenSRF maintenance scripts first).
