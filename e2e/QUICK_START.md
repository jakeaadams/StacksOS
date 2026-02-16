# StacksOS E2E Tests - Quick Start Guide

## Installation Complete

Playwright E2E tests have been successfully configured for StacksOS.

## Quick Test Commands

### Run Stable Smoke Tests (Recommended)
```bash
npm run test:e2e:smoke
```

This runs:
- `e2e/smoke-public.spec.ts` (always)
- `e2e/smoke-auth.spec.ts` (auto-skips unless `E2E_STAFF_USER` and `E2E_STAFF_PASS` are set)

### Run All Smoke Tests
```bash
npx playwright test e2e/smoke.spec.ts
```

### Run All Tests
```bash
npx playwright test
```

### Run Tests in Interactive UI Mode
```bash
npx playwright test --ui
```

### Run Tests with Browser Visible
```bash
npx playwright test --headed
```

### Run Specific Test by Name
```bash
npx playwright test -g "homepage"
npx playwright test -g "login"
npx playwright test -g "checkout"
```

## Test Files Located At

- `/home/jake/projects/stacksos/e2e/smoke.spec.ts` - 9 smoke tests
- `/home/jake/projects/stacksos/e2e/circulation.spec.ts` - 11 circulation tests
- `/home/jake/projects/stacksos/e2e/catalog.spec.ts` - 13 catalog tests

## Configuration

- Playwright config: `/home/jake/projects/stacksos/playwright.config.ts`
- Test helpers: `/home/jake/projects/stacksos/e2e/helpers.ts`
- Full documentation: `/home/jake/projects/stacksos/e2e/README.md`

## Test Credentials

E2E tests use Evergreen staff credentials. Provide them via env vars:

```bash
export E2E_STAFF_USER="your_evergreen_username"
export E2E_STAFF_PASS="your_evergreen_password"
```

Optional (mutating OPAC hold workflow):

```bash
export E2E_MUTATE=1
export E2E_PATRON_BARCODE="29000000001234"
export E2E_PATRON_PIN="DEMO1234"
```

## Verified Working Tests

✓ Homepage loads and displays StacksOS branding
✓ OPAC homepage loads with search functionality
✓ Staff login page renders with all required fields
✓ Empty login form shows validation

## Viewing Test Results

After running tests, view the HTML report:
```bash
npx playwright show-report
```

## Test Coverage

- **Smoke Tests**: Basic functionality, login, API health
- **Circulation Tests**: Checkout, checkin, patrons, holds, renewals
- **Catalog Tests**: OPAC search, staff catalog, MARC editor, Z39.50

## Tips

1. Tests run faster against production build
2. Use `--headed` to see browser during test execution
3. Use `--debug` to step through tests line by line
4. Screenshots and videos are captured on failure
