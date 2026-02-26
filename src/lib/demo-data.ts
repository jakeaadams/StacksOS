function envEnabled(value: string | undefined): boolean {
  const raw = String(value || "")
    .trim()
    .toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
}

function isProductionRuntime(): boolean {
  return process.env.NODE_ENV === "production";
}

/**
 * Demo-data mutation is disabled by default.
 * Enable only for disposable sandbox environments.
 */
export function isDemoDataEnabled(): boolean {
  if (isProductionRuntime()) return false;
  if (envEnabled(process.env.STACKSOS_ALLOW_DEMO_DATA)) return true;
  if (process.env.NODE_ENV === "test") return true;
  if (envEnabled(process.env.STACKSOS_E2E_TEST_MODE)) return true;
  return false;
}

/**
 * Mock events are disabled by default so OPAC never fabricates event listings.
 */
export function areMockEventsEnabled(): boolean {
  if (isProductionRuntime()) return false;
  if (envEnabled(process.env.STACKSOS_ALLOW_MOCK_EVENTS)) return true;
  if (process.env.NODE_ENV === "test") return true;
  if (envEnabled(process.env.STACKSOS_E2E_TEST_MODE)) return true;
  return false;
}
