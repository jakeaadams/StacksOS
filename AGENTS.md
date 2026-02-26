# AGENTS.md (StacksOS)

## Core Principle

StacksOS is the product layer; Evergreen is the system-of-record.

## Required Engineering Rules

- Keep Evergreen source customization minimal and explicitly documented.
- Prefer StacksOS-owned persistence (`library.*`) for product features.
- Treat OPAC/staff UX quality as first-class behavior, not cosmetic polish.
- Keep tenant behavior profile-driven (not hardcoded forks).

## Quality Gate

Run before merge:

1. `npm run lint -- --quiet`
2. `npm run type-check`
3. `npm run test:run`
4. `npm run test:e2e` (when Evergreen connectivity + E2E creds are available)
5. `npm run audit:ui-drift` (file-by-file UI/UX drift inventory)
6. `npm run audit:opac` (OPAC routes/APIs/Evergreen bridge matrix)
7. `npm run audit:task-benchmark` (browser task p50/p95 outcome harness)
8. `BASE_URL=http://127.0.0.1:3000 bash audit/run_all.sh` (in VM/runtime env)

If E2E is blocked, record exact blocker (tunnel/TLS/OpenSRF/credentials) in the audit artifact.

Task benchmark enforcement note:

- When staff benchmark creds are present, `audit/run_all.sh` enforces staff benchmark completion and auto-clears stale Redis `staff-auth` limiter keys by default (`TASK_BENCH_CLEAR_STAFF_AUTH_RATE_LIMIT=1`) to avoid false lockout failures.
- Set `TASK_BENCH_CLEAR_STAFF_AUTH_RATE_LIMIT=0` to disable that cleanup.

UI drift policy:

- Keep control primitives standardized (`Button`, `Input`, `Textarea`) on high-traffic staff/OPAC pages.
- Treat `audit/ui-drift/REPORT.md` as required evidence when running UX polish passes.
- Use `audit/task-benchmark/REPORT.md` as measurable UX outcome evidence.
- Latest measured baseline (2026-02-26): aggregate drift score `0` (no drift files).

For mutation validation in disposable sandbox only:

- `STACKSOS_AUDIT_MUTATE=1`
- `STACKSOS_AUDIT_CONFIRM_MUTATION=I_UNDERSTAND`
- `PATRON_BARCODE=<dedicated test patron>`
- `ITEM_BARCODE=<dedicated test item>`

Dependency rule:

- Prefer safe compatibility upgrades first; do not keep breaking major upgrades if gates fail (example: hold ESLint on v9 until Next plugin compatibility for v10 is available).
- Keep `@typescript-eslint/no-explicit-any` disabled in this codebase until typed Evergreen adapter coverage reaches parity; enforce quality through runtime validation + gate coverage.

## Latest Verification Snapshot (2026-02-26)

- Local:
  - `npm run lint -- --quiet`: pass
  - `npm run type-check`: pass
  - `npm run test:run`: pass (`270/270`)
  - `npm run audit:ui-drift`: pass
  - `npm run audit:opac`: validate in VM/runtime env (requires live app + Evergreen bridge)
  - `npm run audit:task-benchmark`: pass
  - lint warning inventory (JSON): zero warning rules
- VM (`192.168.1.233`):
  - `npm run lint -- --quiet`: pass
  - `npm run type-check`: pass
  - `npm run test:run`: pass (`270/270`)
  - `E2E_STAFF_USER=jake E2E_STAFF_PASS=jake npm run test:e2e`: pass (`70 passed, 5 skipped`)
  - `BASE_URL=http://127.0.0.1:3000 bash audit/run_opac_audit.sh`: pass (`42/42` OPAC pages, `21/21` OPAC APIs, Evergreen bridge `4/4`)
  - `TASK_BENCH_STAFF_USER=jake TASK_BENCH_STAFF_PASS=jake TASK_BENCH_REQUIRE_STAFF=1 TASK_BENCH_ENFORCE=1 node scripts/task-benchmark.mjs`: pass (staff metrics fully populated)
  - `E2E_STAFF_USER=jake E2E_STAFF_PASS=jake BASE_URL=http://127.0.0.1:3000 bash audit/run_all.sh`: pass
  - Forced lockout resilience check (poisoned limiter + rerun): pass (`run_all.sh` auto-clears stale benchmark limiter keys)

## Key File Patterns (New)

### AI Copilots

- Prompt templates: `src/lib/ai/prompts.ts` (IDs: `holds_copilot`, `patron_copilot`, `acquisitions_copilot`)
- Copilot routes: `src/app/api/ai/{holds,patron,acquisitions}-copilot/route.ts` (follow `staff-copilot` pattern)
- AI audit trail: `src/app/api/ai/audit/route.ts`, `src/app/staff/admin/ai-audit/page.tsx`
- AI DB functions: `src/lib/db/ai.ts` (`listAiDrafts`, `getAiDraftWithDecisions`)
- Cataloging copilot fallback: `src/app/api/ai/cataloging-copilot/fallback.ts`
- Admin copilot fallback: `src/app/api/ai/admin-copilot/fallback.ts`

### Events Lifecycle

- Core DB: `src/lib/db/opac-events.ts` (registration, cancel, waitlist, promotion, reminders)
- Event detail: `src/app/opac/events/[id]/page.tsx`
- Staff events: `src/app/staff/events/page.tsx`
- Cron reminders: `src/app/api/cron/event-reminders/route.ts`

### K-12 Workflows

- Class circulation DB: `src/lib/db/k12-class-circulation.ts`
- Asset management DB: `src/lib/db/k12-assets.ts`
- Roster import: `src/app/api/staff/k12/roster-import/route.ts`
- Stats: `src/app/api/staff/k12/stats/route.ts`
- Asset UI: `src/app/staff/circulation/k12-assets/page.tsx`
- Export helpers: `src/lib/k12/export-helpers.ts` (CSV export and overdue grouping)
- Challenges API: `src/app/api/staff/k12/challenges/route.ts`
- Overdue dashboard API: `src/app/api/staff/k12/overdue-dashboard/route.ts`
- Data export API: `src/app/api/staff/k12/export/route.ts`
- Barcode generation API: `src/app/api/staff/k12/barcodes/route.ts`

### Onboarding

- Playbooks: `src/lib/tenant/onboarding-playbooks.ts`
- Task persistence: `src/app/api/admin/onboarding/tasks/route.ts`
- Wizard page: `src/app/staff/admin/onboarding/page.tsx`

### Fieldmapper Type-Safety

- Index maps: `src/lib/api/fieldmapper-maps.ts` (19 Evergreen classes)
- Payload helpers: `src/lib/api/extract-payload.ts` (`fieldValue`, `payloadFirst`, etc.)
- Re-exported from: `src/lib/api/index.ts`

### Circulation UX

- Sound hook: `src/hooks/use-circulation-sound.ts` (Web Audio API tones)
- Patron context: `src/contexts/patron-context.tsx`, `src/components/circulation/patron-context-bar.tsx`

## Demo Ops

- Use `npm run demo:reset` for deterministic sales/demo state.
- Never run demo reset in production environments.
- Keep all demo/seed integrations in safe mode (fake outbound sends only).

## Scope/Depth Discovery

- Preserve OPAC scope context (`search_scope`, `scope_org`, `copy_depth`) across search -> record navigation.
- Tenant defaults control initial discovery behavior; patron override is tenant-configurable.

## Evergreen Boundary Ops

- Capture DB footprint snapshots around Evergreen upgrades:
  - `npm run evergreen:footprint -- --label before-upgrade`
  - `npm run evergreen:footprint -- --label after-upgrade`
- Keep cert trust synchronized (`scripts/sync-evergreen-cert.sh`) and use the timer installer in pilot/prod.

## AI Reliability

- AI degradation must be measurable.
- Use `/api/admin/ops-status` AI metrics (fallback rates + latency) to tune:
  - `STACKSOS_AI_TIMEOUT_MS`
  - `STACKSOS_AI_MODEL_FALLBACKS`
  - `STACKSOS_AI_RETRY_ATTEMPTS`
  - `STACKSOS_AI_RETRY_BACKOFF_MS`
  - `STACKSOS_AI_RETRY_TIMEOUT_MS`
  - `STACKSOS_AI_COPILOT_TIMEOUT_MS`
  - `STACKSOS_AI_COPILOT_RETRY_ATTEMPTS`
  - `STACKSOS_AI_COPILOT_RETRY_TIMEOUT_MS`
  - `STACKSOS_AI_FALLBACK_MODEL_ATTEMPTS`
- Keep API audit coverage for AI probes (`ai-search`, `ai-marc`) plus fallback-supporting modules (`spellcheck`, `floating-groups`).
- Keep optional AI probes non-blocking when upstream is degraded; core Evergreen adapters remain strict gate blockers.
