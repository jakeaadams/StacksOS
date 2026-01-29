# StacksOS E2E Tests - Quick Start Guide

## Installation Complete

Playwright E2E tests have been successfully configured for StacksOS.

## Quick Test Commands

### Run Stable Tests (Recommended for Quick Verification)
```bash
npx playwright test smoke.spec.ts -g 'homepage|OPAC|staff login page|empty login'
```

### Run All Smoke Tests
```bash
npx playwright test smoke.spec.ts
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

- Username: `jake`
- Password: `jake`

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
