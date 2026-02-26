# StacksOS

A modern library staff platform and public catalog (OPAC) built on top of the
[Evergreen ILS](https://evergreen-ils.org). StacksOS provides a world-class
staff experience, workflow automation, and analytics layer while Evergreen
remains the system of record for patrons, items, circulation, and policies.

## Product Boundary

- **Evergreen**: canonical system of record (patrons, bibs/items, circulation, policy source).
- **StacksOS**: UX/workflow/product layer (modern UI, automation, analytics, AI copilots, tenant controls).
- **Rule**: avoid Evergreen source forks; keep product innovation in StacksOS adapters, services, and UI.

## Architecture

| Layer       | Technology                                              |
| ----------- | ------------------------------------------------------- |
| Framework   | [Next.js 16](https://nextjs.org/) (App Router)          |
| Language    | TypeScript (strict mode)                                |
| UI          | React 19, Radix UI, Tailwind CSS 4                      |
| ILS Backend | Evergreen ILS via OpenSRF gateway                       |
| Database    | PostgreSQL (Evergreen DB + StacksOS `library.*` schema) |
| Testing     | Vitest (unit), Playwright (E2E)                         |

StacksOS runs as a web application and API gateway. It communicates with
Evergreen over HTTPS (OpenSRF) and optionally connects directly to the
Evergreen PostgreSQL database for read-heavy or StacksOS-specific features.

## Prerequisites

- **Node.js 20+** (see `.nvmrc`)
- **Access to an Evergreen ILS instance** with OpenSRF gateway enabled
- **PostgreSQL** (Evergreen database; a dedicated `stacksos_app` role is recommended)
- **npm** (ships with Node.js)

## Quick Start

```bash
# Clone the repository
git clone <repo-url> stacksos
cd stacksos

# Use the correct Node version
nvm use

# Copy and configure environment variables
cp .env.example .env.local
# Edit .env.local with your Evergreen connection details

# Install dependencies
npm install

# Start the development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to access the application.
Login credentials are your Evergreen staff credentials.

## Available Scripts

| Command                        | Description                                              |
| ------------------------------ | -------------------------------------------------------- |
| `npm run dev`                  | Start the Next.js development server with hot reload     |
| `npm run build`                | Build the production bundle                              |
| `npm run start`                | Start the production server                              |
| `npm run lint`                 | Run ESLint                                               |
| `npm run format`               | Format code with Prettier                                |
| `npm run format:check`         | Check formatting without writing changes                 |
| `npm run test`                 | Run unit tests in watch mode (Vitest)                    |
| `npm run test:run`             | Run unit tests once                                      |
| `npm run test:coverage`        | Run unit tests with coverage report                      |
| `npm run test:e2e`             | Run end-to-end tests (Playwright)                        |
| `npm run test:all`             | Run unit tests then E2E tests                            |
| `npm run demo:reset`           | One-command reset + reseed for **Jake's Demo Library**   |
| `npm run audit:ui-drift`       | Generate file-by-file UI drift report artifacts          |
| `npm run audit:opac`           | Run OPAC route/API/Evergreen-bridge audit matrix         |
| `npm run audit:task-benchmark` | Run browser task benchmark harness (p50/p95 by workflow) |
| `npm run evergreen:footprint`  | Capture Evergreen boundary snapshot for upgrade diffing  |
| `npm run tenant:provision`     | Create/update tenant JSON configuration                  |

## Project Structure

```
src/
  app/                  # Next.js App Router pages and API routes
    api/                # API routes (Evergreen gateway, health, metrics)
    login/              # Authentication pages
    staff/              # Staff application pages
    opac/               # Public catalog (OPAC) pages
    self-checkout/      # Self-checkout kiosk interface
  components/           # React components (shared UI system)
  hooks/                # Custom React hooks
  lib/                  # Shared utilities, Evergreen client, RBAC, email
  config/               # Application configuration
  contexts/             # React context providers
  types/                # TypeScript type definitions
docs/                   # Detailed documentation and planning
audit/                  # Quality gate and performance budget scripts
scripts/                # Build, deploy, and maintenance scripts
tenants/                # Multi-tenant configuration files
ops/                    # Operational tooling (systemd units, backups)
```

## Environment Configuration

Copy `.env.example` to `.env.local` and configure the required variables:

- **`EVERGREEN_BASE_URL`** -- URL of your Evergreen OpenSRF gateway
- **`EVERGREEN_DB_*`** -- PostgreSQL connection details (use a least-privilege role)
- **`STACKSOS_BASE_URL`** -- Public URL of your StacksOS instance
- **`STACKSOS_RBAC_MODE`** -- Permission enforcement mode (`strict`, `warn`, or `off`)
- **`STACKSOS_EMAIL_PROVIDER`** -- Email provider (`console`, `resend`, `sendgrid`, `ses`)
- **`STACKSOS_TENANT_PROFILE`** -- Tenant profile (`public`, `school`, `church`, `academic`, `custom`)
- **`STACKSOS_DISCOVERY_SCOPE`** -- Default OPAC search scope (`local`, `system`, `consortium`)
- **`STACKSOS_DISCOVERY_COPY_DEPTH`** -- Default OPAC depth (`0..99`, Evergreen-style semantics)
- **`STACKSOS_AI_RETRY_*`** -- AI retry/backoff controls for provider latency resilience
- **`STACKSOS_AI_MODEL_FALLBACKS`** -- Comma-separated model fallback chain before deterministic fallback
- **`STACKSOS_AI_COPILOT_*`** -- Copilot/ops-only timeout + retry overrides for high-latency windows

See `.env.example` for the full list of available options including feature
flags, security settings, and optional integrations.

Important shell-safety note:

- If an env value contains spaces, quote it.
  Example: `STACKSOS_EMAIL_FROM_NAME="Your Library Name"`

## OPAC Scope/Depth Controls

StacksOS now exposes first-class OPAC scope controls aligned with Evergreen behavior:

- `search_scope`: `local` | `system` | `consortium`
- `scope_org`: org unit used as the scope root
- `copy_depth`: descendant depth from scope org (0=current only, 1=children, 99=all descendants)

Tenant admins can set defaults in **Staff -> Admin -> Tenant & Onboarding**.

How selection works:

- Tenant sets default scope/depth (`local`, `system`, `consortium` + copy depth).
- Patron search sessions start from those defaults.
- If tenant enables overrides, patrons can switch scope/depth in OPAC search.
- Scope/depth context is preserved from search to record views.

## Golden Demo Library

Use a deterministic demo environment for sales and QA parity.

```bash
# Runs purge + deterministic seed + tenant write for Jake's Demo Library
npm run demo:reset
```

Script path: `scripts/reset-jakes-demo-library.sh`

Recommended demo guardrails:

- Isolated Evergreen/StacksOS environment (not production data)
- Demo banner enabled
- Fake/demo outbound integrations only (email/SMS/webhook sandbox)
- Nightly reseed schedule for repeatable demos

## Evergreen Upgrade Boundary Snapshot

Capture before/after footprint artifacts to detect upgrade drift safely.

```bash
# Before Evergreen upgrade
npm run evergreen:footprint -- --label before-upgrade

# After Evergreen upgrade
npm run evergreen:footprint -- --label after-upgrade
```

Then diff the two generated folders under `audit/evergreen-footprint/`.

## New in This Release

### AI Copilot Expansion + Audit Trail

- **Holds copilot** on holds management page — prioritization advice from queue data
- **Patron copilot** on patron detail page — interaction guidance from patron history
- **Acquisitions copilot** on acquisitions page — budget/fund analysis
- **Cataloging copilot** on cataloging page — MARC record assistance and validation
- **Admin copilot** on admin page — system configuration guidance
- All copilots include deterministic fallbacks, thumbs up/down feedback, and expandable reasoning
- **AI audit trail** admin page at Staff > Admin > AI Audit Trail — filterable DataTable with decision chain, redacted inputs, provider/model detail

### Events Lifecycle

- Full event detail page (`/opac/events/[id]`) with registration, cancel, waitlist, calendar link
- Staff events management page with registrant lists and CSV export
- Cron-callable reminder delivery endpoint with idempotent processing
- Waitlist promotion notifications on cancellation
- Rate limiting on registration (10 req/min per IP)

### K-12 Deep Workflows

- Student-patron linking (map K-12 students to Evergreen patron records)
- CSV roster import with validation and preview
- Class-level reading stats dashboard (checkouts, books/student, avg duration, overdue)
- K-12 asset management — full CRUD, assign/return, barcode scan, status tracking, condition notes
- Reading challenges with leaderboards and progress tracking

### Onboarding Wizard

- Profile-specific onboarding task lists (public/school/church/academic)
- Phase stepper (Foundation > Launch > Optimization) with visual progress
- Readiness probes that run live checks against the system
- Task completion persistence with notes

### Staff UX Competitive Parity

- Due date override on checkout with date picker
- Audio feedback (Web Audio API) on checkout/checkin scan events
- Patron-in-context persistent bar across circulation routes
- Bulk operations toolbar (select + print) on checkout/checkin sessions
- Patron barcode visualization on OPAC account page
- "Did you mean?" spell correction in OPAC search (no results)
- Patron review submission (star rating + text) on record detail page

### Design System

- Semantic design tokens (status colors, typography scale, spacing, motion) for consistent theming across staff and OPAC modules

### Type-Safety Improvements

- Typed fieldmapper index maps for 19 Evergreen classes
- `fieldValue`/`payloadFirst` helpers replace `as any` chains across adapter routes
- Zod discriminated union narrowing in circulation route

## AI Fallback Monitoring

Platform admins can monitor AI reliability from:

- `GET /api/admin/ops-status`

The response includes:

- fallback counts/rates for last hour/day,
- calls/hour,
- p95 latency,
- runtime health classification.

Use this to tune `STACKSOS_AI_TIMEOUT_MS`, `STACKSOS_AI_MODEL_FALLBACKS`, and `STACKSOS_AI_RETRY_*` / `STACKSOS_AI_COPILOT_*` values for Kimi latency conditions.

## UI/UX Drift Governance

Use deterministic UI drift reporting to keep OPAC and staff UX cohesive across the repo:

```bash
npm run audit:ui-drift
```

Generated artifacts:

- `audit/ui-drift/REPORT.md` (human-readable summary + file-by-file table)
- `audit/ui-drift/summary.json` (machine-readable)
- `audit/ui-drift/files.tsv` (sortable spreadsheet format)

This report is also generated automatically by `bash audit/run_ui_audit.sh` and `bash audit/run_all.sh`.

Current baseline (2026-02-26 latest pass):

- aggregate drift score: `0`
- files with non-zero drift score: `0`

## Task Benchmark Harness

Use the browser task benchmark to track measurable UX outcomes (not just visual intent):

```bash
npm run audit:task-benchmark
```

Artifacts:

- `audit/task-benchmark/REPORT.md`
- `audit/task-benchmark/summary.tsv`
- `audit/task-benchmark/report.json`

Notes:

- OPAC tasks run multiple iterations by default (`TASK_BENCH_ITERATIONS=3`).
- Staff login tasks default to one iteration (`TASK_BENCH_STAFF_ITERATIONS=1`) to avoid lockout noise in shared environments.
- Use a dedicated benchmark account with:
  - `TASK_BENCH_STAFF_USER`
  - `TASK_BENCH_STAFF_PASS`
  - optional fallback: `STACKSOS_BENCH_STAFF_USER` / `STACKSOS_BENCH_STAFF_PASS`
- `audit/run_all.sh` now enforces staff benchmark completion automatically when benchmark credentials are provided.
- `audit/run_all.sh` now also clears stale Redis `staff-auth` limiter keys before the enforced staff benchmark by default (`TASK_BENCH_CLEAR_STAFF_AUTH_RATE_LIMIT=1`) to prevent false-red lockout drift from prior auth-heavy runs.
- Set `TASK_BENCH_CLEAR_STAFF_AUTH_RATE_LIMIT=0` to disable this cleanup behavior.
- To enforce benchmark budgets/regression gates outside `run_all.sh`, set `TASK_BENCH_ENFORCE=1`.

## OPAC Audit Harness

Run the dedicated OPAC audit to verify public OPAC route availability, OPAC API contract behavior, and Evergreen-backed catalog linkage:

```bash
npm run audit:opac
```

Artifacts:

- `audit/opac/REPORT.md`
- `audit/opac/pages.tsv`
- `audit/opac/api.tsv`
- `audit/opac/bridge.tsv`

`run_all.sh` now runs this OPAC audit automatically as part of the full gate.

## E2E Requirements

Playwright E2E requires live Evergreen connectivity and valid credentials:

- `E2E_STAFF_USER`
- `E2E_STAFF_PASS`
- Valid Evergreen TLS trust path/CA configuration

If Evergreen/OpenSRF is unreachable, E2E login/setup will fail even if lint/type/unit gates are green.

`run_all.sh` runtime notes:

- For authenticated workflow checks, export `E2E_STAFF_USER` and `E2E_STAFF_PASS` (or `STACKSOS_AUDIT_STAFF_*`).
- Read-only audit mode is default and safe for shared environments.
- Mutation audit mode requires explicit confirmation and dedicated test barcodes:
  - `STACKSOS_AUDIT_MUTATE=1`
  - `STACKSOS_AUDIT_CONFIRM_MUTATION=I_UNDERSTAND`
  - `PATRON_BARCODE=<dedicated test patron>`
  - `ITEM_BARCODE=<dedicated test item>`

## Dependency Compatibility Notes

- Major dependency wave was applied for:
  - `@types/node` 25
  - `jsdom` 28
  - `lint-staged` 16
  - `lucide-react` 0.575
  - `nodemailer` 8
- `eslint` remains on v9 intentionally for now. `eslint@10` currently breaks with the active Next ESLint plugin stack in this project.

## Verification Snapshot (2026-02-26 latest)

Local:

- `npm run lint -- --quiet`: pass
- `npm run type-check`: pass
- `npm run test:run`: pass (`131/131`)
- `npm run audit:ui-drift`: pass
- `npm run audit:opac`: validated in VM runtime (requires live app + Evergreen bridge)
- `npm run audit:task-benchmark`: pass
- lint warnings (JSON run): `0` rule hits

VM (`192.168.1.233`, `/home/jake/projects/stacksos`):

- `npm run lint -- --quiet`: pass
- `npm run type-check`: pass
- `npm run test:run`: pass (`131/131`)
- `E2E_STAFF_USER=jake E2E_STAFF_PASS=jake npm run test:e2e`: pass (`61 passed, 2 skipped`)
- `BASE_URL=http://127.0.0.1:3000 bash audit/run_opac_audit.sh`: pass (`42/42` OPAC pages, `21/21` OPAC API checks, Evergreen bridge `4/4`)
- `TASK_BENCH_STAFF_USER=jake TASK_BENCH_STAFF_PASS=jake TASK_BENCH_REQUIRE_STAFF=1 TASK_BENCH_ENFORCE=1 node scripts/task-benchmark.mjs`: pass (staff metrics fully populated)
- `E2E_STAFF_USER=jake E2E_STAFF_PASS=jake BASE_URL=http://127.0.0.1:3000 bash audit/run_all.sh`: pass
- Forced lockout resilience check:
  - after intentionally poisoning auth limiter with repeated bad logins, `E2E_STAFF_USER=jake E2E_STAFF_PASS=jake BASE_URL=http://127.0.0.1:3000 bash audit/run_all.sh`: pass (auto-clears stale benchmark limiter keys)

## Documentation

Detailed documentation lives in the `docs/` directory:

- [Runbook](docs/StacksOS-Runbook.md) -- Development and pilot operations guide
- [Master PRD](docs/StacksOS-Master-PRD.md) -- Product requirements document
- [Permissions](docs/StacksOS-Permissions.md) -- RBAC and Evergreen permission mapping
- [Observability](docs/OBSERVABILITY.md) -- Metrics, logging, and monitoring
- [Email Notices](docs/EMAIL_NOTICES.md) -- Email notification setup and templates
- [TLS Setup](docs/TLS_INTERNAL_CA.md) -- Internal CA and TLS configuration
- [Tenants](docs/StacksOS-Tenants.md) -- Multi-tenant configuration
- [Cover Storage](docs/COVER_STORAGE_GUIDE.md) -- Book cover image handling
- [World-Class Execution Checklist](docs/WORLD_CLASS_EXECUTION_CHECKLIST_2026-02-25.md) -- Consolidated to-do and status tracker
- [Open-Source ILS Comparison](docs/OPEN_SOURCE_ILS_COMPARISON_2026-02-25.md) -- Evergreen vs Koha vs FOLIO strategy notes
- [Competitive UI/UX Audit](audit/STACKSOS_COMPETITIVE_UIUX_AUDIT_2026-02-26.md) -- Fresh parity benchmark vs modern ILS/discovery products

Additional references:

- [Security Guide](SECURITY.md) -- TLS, database hardening, MFA strategy
- [Contributing](CONTRIBUTING.md) -- Development workflow and code style

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup, code style
guidelines, commit conventions, and the pull request process.

## License

This project is licensed under the [MIT License](LICENSE).
