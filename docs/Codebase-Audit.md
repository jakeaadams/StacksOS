# StacksOS Codebase Audit

Date: 2026-02-05
Scope: staff app + Evergreen adapter APIs

## Current state (high-level)

- Repo: `~/projects/stacksos`
- App: Next.js (App Router)
- Evergreen adapter APIs: `src/app/api/evergreen/*`
- Shared API client: `src/lib/api/*`
- Shared UI system: `src/components/shared/*`

## Build status

- `npm run build`: PASS (as of this audit)

## Running (dev vs prod)

StacksOS is a single Next.js app; dev and prod use the same login flow.

Dev (hot reload; shows Next.js dev badge):

```bash
cd ~/projects/stacksos
npm run dev -- -H 0.0.0.0 -p 3000
```

Prod (no dev badge; faster; requires restart on changes):

```bash
cd ~/projects/stacksos
npm run build
npm run start -- -H 0.0.0.0 -p 3000
```

Login (dev + prod):
- URL: `http://<stacksos-host>:3000/login`
- Credentials: Evergreen staff username + password

Note: in dev, changes are applied live. In prod, you must rebuild + restart `pnpm start`.


## Automated API audit

Artifacts:
- Report: `audit/REPORT.md`
- Feature-to-API matrix: `audit/FEATURE_MATRIX.md`
- Raw responses: `audit/api/*.json`

How to run:

```bash
cd ~/projects/stacksos
BASE_URL=http://localhost:3000 ./audit/run_api_audit.sh
./audit/generate_audit_report.py
```

Notes:
- If no staff credentials are set and you run in a TTY, `./audit/run_api_audit.sh` will prompt for them.
- The audit writes sensitive artifacts (cookie jar + patron identifiers). Treat the `audit/` folder as confidential.

## Workflow QA (end-to-end)

Purpose:
- Prove StacksOS can complete core staff workflows against real Evergreen state transitions (no fake UI).

How to run:

```bash
cd ~/projects/stacksos
BASE_URL=http://localhost:3000 ./audit/run_workflow_qa.sh
```

Default sandbox records:
- Prefer `audit/demo_data.json` (written by `node scripts/seed-sandbox-demo-data.mjs`) for stable fixtures.
- If you do not have `audit/demo_data.json`, the fallback barcodes are:
  - Patron barcode: `29000000001234` (StacksOS demo patron)
  - Item barcode: `39000000001235` (demo item)

What it validates:
- Auth + workstation auto-register
- Checkout -> renew -> checkin
- Bills retrieval
- Title hold place -> cancel (cleanup-safe)
- Catalog record MARCXML fetch + no-op MARC update

Artifacts:
- Responses: `audit/workflow/*.json`
- Summary: `audit/workflow/summary.tsv`

## "Dead UI" audit (buttons/links)

Policy:
- No dead buttons/links.
- If a feature is not implemented, it must be hidden behind a feature flag or removed from navigation. Disabled buttons are allowed only when they are conditional and explainable (e.g., "Select a patron first").

Quick checks:

```bash
cd ~/projects/stacksos
# Constant disabled buttons (should be none)
grep -R "<Button[^>]*disabled>" -n src/app/staff || true

# Href placeholders (should be none)
grep -R 'href="#"' -n src/app/staff src/components || true
```

## Recent fixes (applied)

- Checkout override + policy explainability: API returns structured `details` (code/desc/overridePerm) and Checkout UI prompts for an audited override reason.
- Patron checkouts endpoint is normalized: `GET /api/evergreen/circulation?patron_id=...` now returns real items with due dates + call numbers (no empty lists).
- Workflow QA now asserts the patron checkouts endpoint reflects checkout/checkin state transitions.


- Fixed invalid interactive nesting (`<Link><Button/></Link>`) by standardizing on `Button asChild` + `Link`.
- Hid unimplemented routes behind feature flags so users never hit 404s from navigation.
- Removed fake sidebar badge counts (alerts/holds/etc.) until wired to real data.
- Made circulation Checkout/Checkin "Quick Actions" real (receipt/slip printing, deep-link to bills, due-dates dialog).
- Rebuilt Reports page to remove sample/fake charts and replace with real dashboard stats + exports.
- Implemented location switching UX (forces re-auth with correct workstation/org context) and added in-app Help page.

- Fixed hold placement adapter: `open-ils.circ.holds.test_and_create.batch` args now match Evergreen EG2 (params + [targetIds]).
- Fixed catalog record MARCXML retrieval for Evergreen 3.16 using SuperCat (`open-ils.supercat.record.marcxml.retrieve`) so MARC editor is no longer blank.
- Command palette @/#// modes now route on Enter (no fake "Press Enter" UI).

## Findings and cleanup candidates

- Empty component folders (safe to remove):
  - `src/components/catalog`
  - `src/components/circulation`
  - `src/components/patrons`

- Console logging in server routes (should be moved to structured logger):
  - `src/app/api/evergreen/*/route.ts`
  - `src/lib/audit.ts` prints to stdout for development

## Recommended next audit passes

### Mutation audits (DISPOSABLE DATASET ONLY)

Purpose:
- Exercise write paths (checkout/checkin loops, holds placement, select admin mutations) to catch regression in real state
  transitions.

Hard rule:
- Run only against a disposable Evergreen dataset (staging/sandbox). Mutation mode is destructive.

How to run (interactive; seeds demo data first):

```bash
cd ~/projects/stacksos
STACKSOS_AUDIT_CONFIRM_MUTATION=I_UNDERSTAND BASE_URL=http://localhost:3000 ./audit/run_mutation_sandbox.sh
```

1) Flow-based audit: manually exercise the top 10 staff workflows end-to-end (checkout/checkin/holds/bills/patron register/catalog search/MARC edit/Z39.50 import/acq receive/serials list/booking create).
2) Permission audit: run each workflow under a restricted Evergreen staff account and ensure StacksOS RBAC matches expected outcomes.
3) Error audit: simulate Evergreen being down / bad TLS / auth expiry and verify UX is predictable and recoverable.


## Automated UI audit (no dead UI)

How to run:

```bash
cd ~/projects/stacksos
./audit/run_ui_audit.sh
```

What it checks:
- No placeholder links (`href="#"`).
- No no-op handlers (`onClick={() => {}}`, `onSubmit={() => {}}`).
- No "Coming soon" / "not implemented" placeholder copy in staff surfaces.

Artifact:
- `audit/ui/REPORT.md`

## Recent workflow UX upgrades

- Catalog Search now supports placing a title hold directly (scan patron barcode + choose pickup lib) via `PlaceHoldDialog`.
- Patron detail page includes a "Place Hold" action that opens Catalog Search in patron-context (`/staff/catalog?patron=...`).
