# StacksOS World-Class Execution Checklist

Consolidated tracker for the full multi-message request set (audit + parity + UX + ops hardening).

---

## Current Gate Snapshot (2026-03-03)

- **Local**: lint pass, type-check pass, test:run pass (323/323), audit:ui-drift pass, audit:task-benchmark pass
- **VM** (192.168.1.233): lint pass, type-check pass, test:run pass (323/323), test:e2e pass (81 passed, 5 skipped), run_all.sh pass
- **UI drift**: aggregate score `0` (zero drift files)
- **Lint warnings**: zero warning rules
- **Evergreen**: Open-ILS 3.16.4 (192.168.1.232)

---

## Done and Verified

### Code Quality & Auth

- [x] Malformed auth payloads return `400` (not `500`) in staff + OPAC login
- [x] Server-side `console.*` removed from `src/` in favor of structured logging
- [x] E2E tests aligned with cookie-based auth and current contracts
- [x] E2E bypass mode (`STACKSOS_E2E_TEST_MODE`) prevents test lockout
- [x] Zero-warning lint closure (`@typescript-eslint/no-explicit-any` off for Evergreen boundaries)

### OPAC Discovery & UX

- [x] Scope/depth parity: `search_scope`, `scope_org`, `copy_depth` enforced across search/AI/record
- [x] Holdings: reshelving/status 7 contributes to available counts
- [x] Cover fallback: Google Books when Open Library fails; cover picker with best-match
- [x] UI drift closed to zero (aggregate score `0`, no missing primitives)
- [x] Full OPAC audit gate: 42/42 pages, 21/21 APIs, 4/4 Evergreen bridge

### Staff & Platform

- [x] Tenant/profile onboarding + SaaS role binding UI/APIs
- [x] Demo reset: one-command deterministic (`npm run demo:reset`)
- [x] K-12 deep workflows: reading challenges, overdue dashboard, barcodes, CSV exports
- [x] Events lifecycle: register/cancel/waitlist/reminders/check-in with reliability tests
- [x] AI copilots: cataloging-copilot, admin-copilot with deterministic fallbacks

### Ops Hardening

- [x] Evergreen TLS cert sync: `scripts/sync-evergreen-cert.sh` + systemd timer
- [x] Footprint snapshot: `npm run evergreen:footprint` before/after upgrades
- [x] AI fallback observability: `/api/admin/ops-status` with calls/hour, fallback rates, p95 latency
- [x] Patron photo mirroring opt-in (`STACKSOS_SYNC_PATRON_PHOTO_TO_EVERGREEN`)
- [x] Kimi reliability: model fallback planning, copilot timeout/retry controls, moonshot auto-fallback

### Tooling

- [x] File-by-file UI drift analyzer: `npm run audit:ui-drift`
- [x] Browser task benchmark harness: `npm run audit:task-benchmark`
- [x] OPAC audit gate: `audit/run_opac_audit.sh`
- [x] Lockout-resilient `run_all.sh` with stale limiter auto-clear

---

## Dependencies

- [x] `@types/node` 20→25, `jsdom` 27→28, `lint-staged` 15→16, `lucide-react` 0.562→0.575, `nodemailer` 7→8, `eslint-config-next` 16.1.6, `pg` 8.19.0
- [ ] `eslint` 9→10 blocked by Next ESLint plugin compatibility (react/display-name crash)

---

## Architectural Decisions (Locked)

- StacksOS = product/UX/workflow layer; Evergreen = system-of-record
- No Evergreen source forks; profile-driven behavior (not separate products)
- Isolated demo environment for sales and QA parity

---

## Open Items

- [ ] ESLint v10 upgrade (blocked by Next ESLint plugin compatibility)
- [ ] External comparative user studies (task success/time, SUS, adoption, CSAT)
- [ ] Continuous competitive benchmark program with external evidence

---

## Next Execution Priorities

1. Resolve ESLint v10 when Next ESLint plugin supports it
2. Continue design-system sweep: normalize spacing/typography/color tokens
3. Continue `any` debt reduction on highest-risk Evergreen routes
4. AI-specific ops alert thresholds (fallback-rate and p95 latency alarms)
5. Migration wizard hardening with preflight diagnostics
6. Profile-specific OPAC polish pass
