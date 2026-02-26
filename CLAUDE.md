# CLAUDE.md (StacksOS)

## Product Boundary

- Evergreen is the system-of-record.
- StacksOS is the product layer (UX, workflows, AI, SaaS controls).
- Avoid Evergreen source forks; keep integration logic in StacksOS.

## Quality Standard

Run before merge:

1. `npm run lint -- --quiet`
2. `npm run type-check`
3. `npm run test:run`
4. `E2E_STAFF_USER=<user> E2E_STAFF_PASS=<pass> npm run test:e2e` (with live Evergreen connectivity)
5. `npm run audit:ui-drift` (file-by-file UI/UX drift artifact generation)
6. `npm run audit:opac` (OPAC routes/APIs/Evergreen bridge matrix)
7. `npm run audit:task-benchmark` (browser task p50/p95 benchmark harness)
8. `E2E_STAFF_USER=<user> E2E_STAFF_PASS=<pass> BASE_URL=http://127.0.0.1:3000 bash audit/run_all.sh` (in VM/runtime env)

Mutation audit mode is sandbox-only and requires explicit destructive confirmation plus dedicated test barcodes.

Task benchmark enforcement note:

- `audit/run_all.sh` enforces staff benchmark completion when benchmark creds are provided.
- It now auto-clears stale Redis `staff-auth` limiter keys before the enforced staff benchmark by default (`TASK_BENCH_CLEAR_STAFF_AUTH_RATE_LIMIT=1`) to prevent false lockout failures from earlier auth-heavy runs.
- Set `TASK_BENCH_CLEAR_STAFF_AUTH_RATE_LIMIT=0` to disable the cleanup behavior.

Lint policy note:

- `@typescript-eslint/no-explicit-any` is intentionally off for Evergreen/OpenSRF dynamic payload boundaries.
- Safety is enforced through runtime validation, adapter audits, and end-to-end gates.

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

## World-Class UX Rules

- Keep discovery fast and clear: scope/depth controls, visible availability, low-friction holds.
- Reuse shared design tokens/components for consistency.
- Avoid ad-hoc visual styling drift across staff and OPAC routes.
- Use shared control primitives (`Button`, `Input`, `Textarea`) before introducing custom controls.
- Keep `audit/ui-drift/REPORT.md` current during UX-focused work.
- Keep `audit/task-benchmark/REPORT.md` current for measurable UX outcomes.
- Latest measured baseline (2026-02-26): aggregate drift score `0` (no drift files).

## AI Reliability Rules (Kimi/Moonshot)

- AI output must degrade safely when provider latency spikes.
- Measure and tune fallback behavior via `/api/admin/ops-status`:
  - `fallbackRateLastHour`
  - `fallbackRateLastDay`
  - `p95LatencyMsLastHour`
- Tune runtime controls as needed:
  - `STACKSOS_AI_TIMEOUT_MS`
  - `STACKSOS_AI_MODEL_FALLBACKS`
  - `STACKSOS_AI_RETRY_ATTEMPTS`
  - `STACKSOS_AI_RETRY_BACKOFF_MS`
  - `STACKSOS_AI_RETRY_TIMEOUT_MS`
  - `STACKSOS_AI_COPILOT_TIMEOUT_MS`
  - `STACKSOS_AI_COPILOT_RETRY_ATTEMPTS`
  - `STACKSOS_AI_COPILOT_RETRY_TIMEOUT_MS`
  - `STACKSOS_AI_FALLBACK_MODEL_ATTEMPTS`
- Treat optional AI probes as degraded/non-blocking when upstream fails; keep Evergreen core adapter checks hard-blocking.
- AI copilots (`holds_copilot`, `patron_copilot`, `acquisitions_copilot`) follow the `staff-copilot` pattern — rate limiting, Zod schemas, `createAiDraft`, deterministic fallback, audit logging.
- AI audit trail viewable at Staff > Admin > AI Audit Trail; query via `GET /api/ai/audit`.
- AI cost estimation uses `STACKSOS_AI_PRICING_MAP` env var (JSON) for per-model pricing.

## Route Patterns

- Copilot routes use extracted fallback modules (`fallback.ts`) for testability.
- K-12 routes follow the canonical security pattern: rate limit -> IDOR -> Zod validation -> audit log.
- CSV exports use `escapeCsvValue` from `@/lib/k12/export-helpers` with formula injection defense.

## Evergreen Ops Rules

- Keep Evergreen TLS trust synchronized:
  - `scripts/sync-evergreen-cert.sh`
  - `scripts/install-cert-sync-timer.sh`
- Run footprint snapshots before/after Evergreen upgrades:
  - `npm run evergreen:footprint -- --label before-upgrade`
  - `npm run evergreen:footprint -- --label after-upgrade`

## Demo Rules

- Use isolated demo data only.
- Use deterministic reset for sales/QA parity:
  - `npm run demo:reset`
- Never run demo purge/reset workflows against production data.
