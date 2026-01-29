# StacksOS Runbook (Dev + Pilot Ops)

Last updated: 2026-01-25

StacksOS is a Next.js staff client that calls Evergreen (OpenSRF) as the system-of-record.

- StacksOS VM: `stacksos` (code in `/home/jake/projects/stacksos`)
- Evergreen VM: `evergreen` (OpenSRF gateway at `EVERGREEN_BASE_URL`)

---

## URLs

- StacksOS login: `http://<stacksos-ip>:3000/login`
- StacksOS staff shell: `http://<stacksos-ip>:3000/staff`
- Evergreen staff client (reference): `https://<evergreen-ip>/eg/staff/`

Login credentials are Evergreen staff credentials (StacksOS does not maintain its own user DB).

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
npm run start -- -H 0.0.0.0 -p 3000
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
BASE_URL=http://127.0.0.1:3000 ./audit/run_all.sh
```

This validates:
- no dead UI patterns
- adapter endpoints reachable
- core workflow smoke tests
- repo inventory + feature matrix artifacts
- perf budgets (p50/p95) for checkout/checkin/search

---

## Performance Budgets

Run on stacksos:

    cd /home/jake/projects/stacksos
    BASE_URL=http://127.0.0.1:3000 ./audit/run_perf.sh

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
- Idempotency replay cache (safe retries): `/home/jake/projects/stacksos/.logs/idempotency/`
  - OK to delete old entries; they are recreated as needed.

Environment controls:
- `STACKSOS_AUDIT_MODE=file|stdout|off`
- `STACKSOS_AUDIT_LOG_PATH=/path/to/audit.log`
- `STACKSOS_LOG_LEVEL=debug|info|warn|error`
- `STACKSOS_EVERGREEN_TIMEOUT_MS=15000` (OpenSRF gateway fetch timeout)

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
  - `/home/jake/projects/stacksos/docs/*`
  - `/home/jake/projects/stacksos/.logs/audit.log`

StacksOS code can be re-deployed from the filesystem copy; there is no GitHub requirement.

---

## Common Failure Modes

1) **Port 3000 already in use**
- Find PID with `lsof -i :3000` and stop the old process.

2) **Evergreen TLS errors (self-signed cert)**
- Dev uses `NODE_TLS_REJECT_UNAUTHORIZED=0` in `.env.local`.
- For production, prefer installing a proper certificate on Evergreen.

3) **"Permission denied" on a workflow**
- The UI should show the missing Evergreen permission(s).
- Grant the missing permission(s) to the staff user (or adjust which user is used for pilots).

