# StacksOS E2E Test Suite - Summary

## Test Suite Overview

Comprehensive Playwright E2E tests for StacksOS covering staff workflows, OPAC patron flows, circulation, catalog search, accessibility, and API validation.

### Test Files (14 spec files)

1. **smoke.spec.ts** - Core smoke tests
2. **smoke-auth.spec.ts** - Authentication smoke tests
3. **smoke-public.spec.ts** - Public OPAC smoke tests (no auth required)
4. **circulation.spec.ts** - Circulation workflows (checkout, checkin, renew)
5. **catalog.spec.ts** - Catalog search and browse workflows
6. **item-detail.spec.ts** - Record detail page and holds
7. **opac-holds.spec.ts** - OPAC hold placement and management
8. **opac-kids.spec.ts** - Kids catalog and reading challenges
9. **patrons-ux.spec.ts** - Patron account UX flows
10. **a11y.spec.ts** - Accessibility compliance tests
11. **keyboard.spec.ts** - Keyboard navigation tests
12. **api.spec.ts** - API endpoint validation
13. **activity.spec.ts** - Activity and event workflows
14. **ux-smoke.spec.ts** - UX smoke tests across key pages

### Supporting Files

- **auth.setup.ts** - Authentication setup for shared login state
- **helpers.ts** - Reusable helper functions
- **playwright.config.ts** - Playwright configuration

## Latest Test Results (2026-02-26)

- **61 passed, 2 skipped** across 14 spec files
- Tests run against live Evergreen instance via VM (192.168.1.233)

## Running the Tests

### Prerequisites

- Live Evergreen ILS connectivity
- Valid staff credentials (`E2E_STAFF_USER`, `E2E_STAFF_PASS`)

### Run All Tests

```bash
E2E_STAFF_USER=<user> E2E_STAFF_PASS=<pass> npm run test:e2e
```

### Run Specific Test File

```bash
npx playwright test smoke.spec.ts
```

### Run in UI Mode

```bash
npx playwright test --ui
```

### View Test Report

```bash
npx playwright show-report
```
