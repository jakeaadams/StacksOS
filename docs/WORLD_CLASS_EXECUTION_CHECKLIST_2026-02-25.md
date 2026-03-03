# StacksOS World-Class Execution Checklist

Consolidated tracker for the full multi-message request set (audit + parity + UX + ops hardening).

---

## Current Gate Snapshot (2026-03-03)

- **Local**: lint (quiet) pass, type-check pass, test:run pass (323/323)
- **VM** (192.168.1.233): lint pass, type-check pass, test:run pass (323/323), test:e2e pass (81 passed, 5 skipped), run_all.sh pass
- **UI drift**: latest audit aggregate score `0` (target met)
- **Lint warnings**: `0` warnings on non-quiet lint (`0` errors)
- **Evergreen host** (192.168.1.232): `/openils/bin/eg_config` reports `Open-ILS 3.16.4` (validate against upstream release announcements before upgrade decisions)

---

## Done and Verified

### Code Quality & Auth

- [x] Malformed auth payloads return `400` (not `500`) in staff + OPAC login
- [x] Server-side `console.*` removed from `src/` in favor of structured logging
- [x] E2E tests aligned with cookie-based auth and current contracts
- [x] E2E bypass mode (`STACKSOS_E2E_TEST_MODE`) prevents test lockout
- [x] Zero-error lint gate closure (`eslint --quiet`); warning cleanup remains tracked in Open Items

### OPAC Discovery & UX

- [x] Scope/depth parity: `search_scope`, `scope_org`, `copy_depth` enforced across search/AI/record
- [x] Holdings: reshelving/status 7 contributes to available counts
- [x] Cover fallback: Google Books when Open Library fails; cover picker with best-match
- [x] UI drift closure to zero completed (latest aggregate score `0`)
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

- [x] Dependency wave completed for safe upgrades (`@types/node` 25.3.3, `@types/pg` 8.18.0, `lint-staged` 16.3.1, `lucide-react` 0.576.0, `swagger-ui-dist` 5.32.0, `eslint-config-next` 16.1.6)
- [ ] `eslint` 9→10 blocked by Next ESLint plugin compatibility (react/display-name crash)

---

## Architectural Decisions (Locked)

- StacksOS = product/UX/workflow layer; Evergreen = system-of-record
- No Evergreen source forks; profile-driven behavior (not separate products)
- Isolated demo environment for sales and QA parity

---

## Open Items

- [ ] ESLint v10 upgrade (blocked by Next ESLint plugin compatibility)
- [x] Resolve non-quiet lint warnings while preserving zero-error gate
- [x] Reduce UI drift aggregate score to target (`0`)
- [ ] External comparative user studies (task success/time, SUS, adoption, CSAT)
- [ ] Continuous competitive benchmark program with external evidence

---

## Next Execution Priorities

1. Re-attempt ESLint v10 only after Next plugin chain is verified compatible
2. External comparative UX studies (task success/time, SUS, CSAT) for objective leaderboard proof
3. AI-specific ops alert thresholds (fallback-rate and p95 latency alarms)
4. Migration wizard hardening with preflight diagnostics
5. Profile-specific OPAC polish pass with measured conversion metrics
