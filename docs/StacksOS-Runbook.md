# StacksOS Runbook (Dev + Pilot Ops)

Last updated: 2026-02-06

StacksOS is a Next.js staff client that calls Evergreen (OpenSRF) as the system-of-record.

- StacksOS VM: `stacksos` (code in `/home/jake/projects/stacksos`)
- Evergreen VM: `evergreenils` (OpenSRF gateway at `EVERGREEN_BASE_URL`)

---

## URLs

- StacksOS login (recommended): `https://<stacksos-ip>/login`
- StacksOS staff shell: `https://<stacksos-ip>/staff`
- Evergreen staff client (reference): `https://<evergreen-ip>/eg/staff/`

Login credentials are Evergreen staff credentials (StacksOS does not maintain its own user DB).

Notes:
- On the StacksOS host, Next.js listens on `http://127.0.0.1:3000` and is not exposed to the LAN.
- LAN access is served by Caddy on `:443` (TLS) and `:80` (redirect).

---

## Environments: Dev vs Prod

Both environments use the same codebase and the same Evergreen backend.

Difference:
- **Dev** (`next dev`) enables hot reload and shows the Next dev indicator.
- **Prod** (`next start`) runs the optimized build with no dev indicator and faster performance.

The login flow is identical in both.

---

## Start / Stop (Dev)

On `stacksos`:

```bash
cd /home/jake/projects/stacksos
npm run dev -- -H 0.0.0.0 -p 3000
```

If port 3000 is already in use:

```bash
lsof -i :3000
# then kill the PID, e.g.
kill -9 <pid>
```

Notes:
- `.env.local` is read at startup. If you change env vars, restart `npm run dev`.

---

## Start / Stop (Prod)

On `stacksos`:

```bash
cd /home/jake/projects/stacksos
npm run build
npm run start -- -H 127.0.0.1 -p 3000
```

Notes:
- For pilots, bind the app to localhost and expose it via a reverse proxy (recommended) or a hardened TCP forwarder.
- This VM is configured with Caddy (`caddy.service`) to terminate TLS and expose:
  - `https://192.168.1.233` → `http://127.0.0.1:3000`
- `stacksos-proxy.service` (socat on port 3000) is deprecated and is disabled in this environment.

### Production via systemd (recommended for pilots)

This VM is already configured with `stacksos.service`.
It expects:
- `evergreen-db-tunnel.service` (localhost DB tunnel) and
- `caddy.service` (HTTPS reverse proxy), if you want LAN access.
- `redis-server.service` (optional; when `STACKSOS_REDIS_URL` is set, rate limiting + idempotency are shared across instances).

Deploy + restart (recommended):

```bash
cd /home/jake/projects/stacksos
bash scripts/upgrade-stacksos.sh
```

Why: the upgrade script builds into `.next.build`, stops the service, swaps the build, then restarts. This prevents a common "unstyled UI" failure mode caused by CSS/JS chunk mismatches during upgrades.

Manual deploy (no audit gate):

```bash
sudo systemctl stop stacksos.service
cd /home/jake/projects/stacksos
npm run build
sudo systemctl start stacksos.service
curl -sS http://127.0.0.1:3000/api/health
```

Rollback helper (restores a previous `.next` snapshot):

```bash
cd /home/jake/projects/stacksos
bash scripts/snapshot-build.sh
bash scripts/rollback-build.sh <timestamp>
```

Operational commands:

```bash
sudo systemctl status stacksos.service --no-pager
sudo journalctl -u stacksos.service --no-pager -n 200
```

If you want the process to survive SSH disconnects, use a process manager (example):

```bash
# Example using pm2 (optional)
npm i -g pm2
pm2 start npm --name stacksos -- start -- -H 0.0.0.0 -p 3000
pm2 save
pm2 startup
```

---

## Health Checks

On `stacksos`:

```bash
curl -s http://127.0.0.1:3000/api/evergreen/ping
```

If Evergreen is down/unreachable, the staff UI should show an ILS offline banner.

---

## One-Command Quality Gate

Run on `stacksos`:

```bash
cd /home/jake/projects/stacksos
export STACKSOS_AUDIT_STAFF_USERNAME="your_evergreen_username"
export STACKSOS_AUDIT_STAFF_PASSWORD="your_evergreen_password"
BASE_URL=http://127.0.0.1:3000 ./audit/run_all.sh
```

This validates:
- no dead UI patterns
- adapter endpoints reachable
- core workflow smoke tests
- repo inventory + feature matrix artifacts
- perf budgets (p50/p95) for search/holds/bills (and for checkout/checkin when `STACKSOS_AUDIT_MUTATE=1`)

---

## Performance Budgets

Run on stacksos:

    cd /home/jake/projects/stacksos
    export STACKSOS_AUDIT_STAFF_USERNAME="your_evergreen_username"
    export STACKSOS_AUDIT_STAFF_PASSWORD="your_evergreen_password"
    BASE_URL=http://127.0.0.1:3000 ./audit/run_perf.sh

By default, the perf harness runs **read-only** (to avoid polluting the Evergreen sandbox with synthetic circulation).
To include checkout/checkin timings, run:

    STACKSOS_AUDIT_MUTATE=1 BASE_URL=http://127.0.0.1:3000 ./audit/run_perf.sh

Budgets (defaults are tuned for LAN pilots; override as needed):
- PERF_CHECKOUT_P95_MS (default 350)
- PERF_CHECKIN_P95_MS (default 350)
- PERF_PATRON_SEARCH_P95_MS (default 200)
- PERF_CATALOG_SEARCH_P95_MS (default 200)
- PERF_HOLDS_PATRON_P95_MS (default 250)
- PERF_BILLS_P95_MS (default 400)

Artifacts:
- /home/jake/projects/stacksos/audit/perf/summary.tsv
- /home/jake/projects/stacksos/audit/perf/report.json

## Logs

StacksOS is mostly stateless; the key logs are:

- Audit log (append-only): `/home/jake/projects/stacksos/.logs/audit.log`
- Dev server log (if you redirect output): `/home/jake/projects/stacksos/.logs/dev.log`
- Idempotency replay cache (safe retries):
  - Redis when `STACKSOS_REDIS_URL` is set (recommended for multi-instance)
  - Otherwise: `/home/jake/projects/stacksos/.logs/idempotency/` (OK to delete old entries; they are recreated as needed)

Environment controls:
- `STACKSOS_AUDIT_MODE=file|stdout|off`
- `STACKSOS_AUDIT_LOG_PATH=/path/to/audit.log`
- `STACKSOS_LOG_LEVEL=debug|info|warn|error`
- `STACKSOS_EVERGREEN_TIMEOUT_MS=15000` (OpenSRF gateway fetch timeout)
- `STACKSOS_REDIS_URL=redis://...` (enables shared rate limiting + idempotency in multi-instance deployments)
- `STACKSOS_REDIS_PREFIX=stacksos` (namespaces Redis keys by environment/tenant)
- `STACKSOS_METRICS_SECRET=<long-random-value>` (protects `/api/metrics` in production)
- `STACKSOS_PATRON_BARCODE_MODE=generate|require` (default: `generate`)
- `STACKSOS_PATRON_BARCODE_PREFIX=29` (used when mode is `generate`)

---

## Metrics (Prometheus)

If configured, StacksOS exposes Prometheus-style metrics at:

- `GET /api/metrics`

Production protection:
- Set `STACKSOS_METRICS_SECRET` and pass it as `x-stacksos-metrics-secret`.
- If `STACKSOS_METRICS_SECRET` is missing in production, `/api/metrics` returns HTTP 501 (not configured).

Docs:
- `docs/OBSERVABILITY.md`

---

## RBAC (Pilot Mode)

StacksOS RBAC checks map to Evergreen work permissions.

- Set strict mode:

```bash
STACKSOS_RBAC_MODE=strict
```

Behavior:
- API mutations call `requirePermissions([...])`.
- Missing permissions return HTTP 403 with a staff-friendly payload:
  `{ ok:false, error:"Permission denied", details:{ missing:[...], requestId } }`

---

## AI Ops (P2 Governance)

StacksOS AI features are **draft-only** and are designed to be instantly disable-able per tenant.

### Enable/Disable Quickly

AI is considered enabled only when **both** conditions are true:
- `NEXT_PUBLIC_STACKSOS_EXPERIMENTAL=1` (feature gate)
- Tenant AI config has `ai.enabled=true` (or `STACKSOS_AI_ENABLED=true`)

Fast-disable procedure for an incident:
1) Set tenant `ai.enabled=false` in `tenants/<tenantId>.json` (or set `STACKSOS_AI_ENABLED=false` in env)
2) Restart StacksOS (`sudo systemctl restart stacksos.service`)
3) Verify `/api/status` and a staff AI action returns “AI is disabled for this tenant”

### Logs + Telemetry

AI-related events:
- Audit log: `/home/jake/projects/stacksos/.logs/audit.log` (look for `ai.suggestion.*`)
- DB telemetry: `library.ai_calls` (latency/usage/cost best-effort)
- Draft storage: `library.ai_drafts` (redacted inputs + outputs; prompt hashes + template/version)

### Prompt Provenance

StacksOS records:
- `prompt_hash` (hash of system+user prompt hashes)
- `prompt_template` and `prompt_version` (template identifiers for repeatable evaluations)

### Key Rotation / Provider Outage

If the model provider is down or credentials are compromised:
- Rotate/replace provider keys (env vars or secret store)
- Disable AI immediately as above
- Re-enable only after verifying budgets, rate limits, and redaction behavior


## Workstations

Evergreen requires a workstation for staff circulation flows.

StacksOS uses **auto-register per device + branch**:
- First login on a new device may prompt to register a workstation.
- Workstation identity is stored client-side per device.

If you need to reset workstation state on a browser:
- Clear site storage for the StacksOS origin (localStorage keys `stacksos_workstation*`).

---

## Backups

For pilots:
- Back up Evergreen database + config (system-of-record).
- Back up StacksOS:
  - `/home/jake/projects/stacksos/.env.local`
  - `/home/jake/projects/stacksos/tenants/*.json`
  - `/home/jake/projects/stacksos/docs/*`
  - `/home/jake/projects/stacksos/.logs/audit.log`

StacksOS code can be re-deployed from the filesystem copy; there is no GitHub requirement.

### Optional: automated StacksOS backups (systemd timer)

Repo includes `ops/stacksos/stacksos-backup.*` which can be installed on the StacksOS host:

```bash
sudo cp ops/stacksos/stacksos-backup.* /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now stacksos-backup.timer
```

Backups default to `/var/backups/stacksos` with retention controlled by `STACKSOS_BACKUP_RETENTION_DAYS`.

### Restore drill (pilot cadence)

Quarterly (recommended for pilots):
1) Restore Evergreen DB/config on a staging host (verify login + circulation).
2) Restore StacksOS config/docs/audit log (verify `/api/health` and staff login).
3) Run `BASE_URL=http://127.0.0.1:3000 ./audit/run_all.sh` and record time-to-restore (RTO/RPO).

---

## Common Failure Modes

1) **Port 3000 already in use**
- Find PID with `lsof -i :3000` and stop the old process.

2) **Evergreen TLS errors (self-signed cert)**
- Prefer trusting the Evergreen CA from StacksOS:
  - `NODE_EXTRA_CA_CERTS=/path/to/evergreen-ca.crt` (recommended), or
  - `STACKSOS_EVERGREEN_CA_FILE=/path/to/evergreen-ca.crt`
- Avoid `NODE_TLS_REJECT_UNAUTHORIZED=0` (MITM risk), especially outside a disposable sandbox.

3) **"Permission denied" on a workflow**
- The UI should show the missing Evergreen permission(s).
- Grant the missing permission(s) to the staff user (or adjust which user is used for pilots).
