# StacksOS E2E Tests

Comprehensive Playwright end-to-end tests for StacksOS.

## Test Structure

### Test Files

- **smoke.spec.ts** - Basic smoke tests covering:
  - Homepage loading
  - Login page rendering
  - Authentication with Evergreen staff credentials (via env vars)
  - Staff dashboard access
  - API health checks
  - Login validation

- **circulation.spec.ts** - Circulation workflow tests:
  - Checkout page functionality
  - Checkin page functionality
  - Patron lookup and search
  - Holds management
  - Renewal workflows
  - In-house use tracking
  - Claims returned processing

- **catalog.spec.ts** - Catalog workflow tests:
  - OPAC search functionality
  - Staff catalog search
  - Record details display
  - Cataloging interface
  - MARC editor access
  - Z39.50 import
  - Holdings display

### Helper Files

- **auth.setup.ts** - Authentication setup for tests
- **helpers.ts** - Reusable test helper functions

## Running Tests

### Run smoke tests (fast confidence check)
```bash
npm run test:e2e:smoke
```

- `e2e/smoke-public.spec.ts` always runs (no credentials required).
- `e2e/smoke-auth.spec.ts` runs only when `E2E_STAFF_USER` and `E2E_STAFF_PASS` are set; otherwise those tests are skipped.

### Run all tests
```bash
npx playwright test
```

### Run specific test file
```bash
npx playwright test e2e/smoke.spec.ts
npx playwright test e2e/circulation.spec.ts
npx playwright test e2e/catalog.spec.ts
```

### Run with UI mode (interactive)
```bash
npx playwright test --ui
```

### Run in headed mode (see browser)
```bash
npx playwright test --headed
```

### Run specific test by name
```bash
npx playwright test -g "login"
```

### Debug tests
```bash
npx playwright test --debug
```

### View test report
```bash
npx playwright show-report
```

## Test Patterns

### Authentication
Tests use a beforeEach hook to login before each test:

```typescript
test.beforeEach(async ({ page }) => {
  await loginAsStaff(page);
});
```

### Assertions
Tests include proper assertions:
- Page URL verification
- Element visibility checks
- Content validation
- Error handling

### Async Operations
All async operations use proper await:
- Page navigation
- Element interactions
- API calls
- Waiting for network requests

## Environment

- Base URL: http://localhost:3001 by default (override with `BASE_URL` or `E2E_PORT`)
- Staff credentials (required):
  - `E2E_STAFF_USER`
  - `E2E_STAFF_PASS`
- Timeout: 30s per test
- Retries: 2 (in CI only)

## CI/CD

Tests are configured for CI environments:
- Automatic retries on failure
- Single worker for consistency
- Video recording on failure
- Screenshot capture on failure

## Troubleshooting

### Tests failing due to timeout
Increase timeout in playwright.config.ts:
```typescript
timeout: 60000, // 60 seconds
```

### Authentication issues
Check that the dev server is running and credentials are correct.

### Port conflicts
Change BASE_URL environment variable:
```bash
BASE_URL=http://localhost:3001 npx playwright test
```
