# Audit: StacksOS + Evergreen (fresh eyes) — 2026-02-02

This is a “fresh eyes” audit of the **current** sandbox/pilot setup:

- **StacksOS host:** `stacksos` (serving `http://192.168.1.233:3000`)
- **Evergreen host:** `evergreen` (Evergreen/OpenSRF/Postgres)

Goal: verify this environment is *credible* (no fake/demo data in staff workflows), *secure enough for a pilot*, and has a clear path to *real SaaS readiness*.

---

## 1) Current status (what’s green right now)

### App health
- `GET /api/health`: **healthy** (StacksOS DB + Evergreen latency checks up).

### Automated audits + tests
- `./audit/run_all.sh`: **PASS** (UI/API/workflow/perf inventories generated under `audit/`).
- `npm run test:run`: **PASS**
- `npm run test:e2e`: **PASS** (Playwright)
- `npm run build`: **PASS**

### “Looks fake” UX credibility fixes (shipped)
- **Search pages no longer show misleading “Results: 0” before a search**:
  - `/staff/patrons` and `/staff/catalog` now only show results badges *after* a search runs.
- **Circulation history looks real (patron names / barcodes shown when available)**:
  - Item history tables now display patron name + barcode (fallback to patron id).
- **Pagination UI fixed for empty states**:
  - No more “Page 1 of 0” or “Showing 1-0 of 0 results”.
- **Cover art + patron photos are persistent and Evergreen-compatible**:
  - Patron photo uploads also update `actor.usr.photo_url` so photos show across clients.

---

## 2) Security + hardening (StacksOS host)

### Network exposure (as observed on `stacksos`)
- UFW is enabled with inbound restricted:
  - `22/tcp` allowed (SSH)
  - `3000/tcp` allowed **only** from `192.168.1.0/24` (LAN)
- Evergreen DB is accessed via an SSH tunnel on `127.0.0.1:5433` (not exposed publicly).

### TLS verification
- Removed `NODE_TLS_REJECT_UNAUTHORIZED=0` from `.env.local`.
- Preferred mechanism is now in place: trust Evergreen via `NODE_EXTRA_CA_CERTS` (CA pin).

### Request protection
- CSRF protection is enforced (proxy layer).
- Security headers are applied globally (CSP, HSTS when applicable, nosniff, etc).

---

## 3) Evergreen host (what we can confirm + what still needs hardening)

### Confirmed (non-sudo checks)
- Evergreen internal service ports are **listening** on all interfaces (e.g. `5222/5223`, `4369`, `33905`).
  - This is acceptable **only if** the firewall blocks them (UFW should allow only `22/80/443`).
- `/openils/conf/opensrf.xml` and `/openils/conf/opensrf_core.xml` permissions are **640** (`opensrf:opensrf`), not world-readable.

### Still recommended (requires `sudo` on `evergreen`)
These are the remaining “pilot-hardening” actions I recommend:
- **Confirm UFW rules** (must deny internal ports):
  - `sudo ufw status verbose`
- **Bind internal services to localhost/private interface** (defense-in-depth even if UFW is correct):
  - ejabberd should not listen on `0.0.0.0` unless intentionally exposed.
  - epmd/Erlang distribution ports should not be publicly reachable.
- **Verify backups timer + restore drill**:
  - Confirm `evergreen-backup.timer` is enabled and that you can restore a dump into a scratch DB.

---

## 4) SaaS readiness verdict (honest)

### Pilot-ready (single library / sandbox)
This setup is now **pilotable** for core staff workflows:
- login/session/CSRF reliability is stable
- catalog search → record → item detail works
- Z39.50 import works and links to real record pages
- patron search + cockpit + photos works

### Not yet SaaS-ready (multi-tenant / production)
To call this “Polaris-style SaaS ready”, we still need the Phase 0–3 work in:
- `docs/StacksOS-Implementation-Plan.md`
- `docs/StacksOS-Execution-Backlog.md`

The big SaaS gates still outstanding:
- tenant isolation + provisioning automation
- secrets management + rotation + per-tenant config
- HA/DR strategy (Evergreen is stateful; needs backups + tested restores + failover plan)
- full observability (central logs/metrics/traces; per-tenant dashboards)
- hardened Evergreen exposure model (Evergreen private; StacksOS public only)
- feature flags per tenant (including AI)

---

## 5) Next concrete actions (recommended order)

1. Evergreen: confirm firewall + bind internal ports tighter (sudo-required).
2. StacksOS: remove/hide any remaining incomplete modules from the sidebar (feature-flag) so nothing looks “fake”.
3. Implement P0 “Admin Hub” pages that translate Evergreen configuration into StacksOS UX (statuses, locations, permissions, policies).
4. Start P2-9 AI implementation behind `featureFlags.ai` (no hardcoded demo answers).

