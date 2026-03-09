import { beforeEach, describe, expect, it, vi } from "vitest";

const requireSaaSAccess = vi.fn();
const checkRateLimit = vi.fn();
const logAuditEvent = vi.fn();
const isMfaConfigured = vi.fn();
const getMfaIssuer = vi.fn();
const getTenantConfig = vi.fn();
const getTenantId = vi.fn();
const clearTenantConfigCache = vi.fn();
const loadTenantConfigFromDisk = vi.fn();
const saveTenantConfigToDisk = vi.fn();
const applyTenantProfileDefaults = vi.fn((value) => value);

vi.mock("@/lib/saas-rbac", () => ({ requireSaaSAccess }));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit }));
vi.mock("@/lib/audit", () => ({ logAuditEvent }));
vi.mock("@/lib/mfa", () => ({ isMfaConfigured, getMfaIssuer }));
vi.mock("@/lib/tenant/config", () => ({
  getTenantConfig,
  getTenantId,
  clearTenantConfigCache,
}));
vi.mock("@/lib/tenant/store", () => ({
  loadTenantConfigFromDisk,
  saveTenantConfigToDisk,
}));
vi.mock("@/lib/tenant/profiles", () => ({
  applyTenantProfileDefaults,
}));

describe("admin security settings route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireSaaSAccess.mockResolvedValue({ actor: { id: 11 } });
    checkRateLimit.mockResolvedValue({ allowed: true, resetIn: 0 });
    logAuditEvent.mockResolvedValue(undefined);
    isMfaConfigured.mockReturnValue(true);
    getMfaIssuer.mockReturnValue("StacksOS Library");
    getTenantId.mockReturnValue("demo");
    getTenantConfig.mockReturnValue({
      tenantId: "demo",
      displayName: "Demo Library",
      profile: { type: "public" },
      evergreenBaseUrl: "https://evergreen.example.org",
      branding: {},
      featureFlags: {},
      security: {
        ipAllowlist: [],
        idleTimeoutMinutes: 30,
        mfa: { enabled: true, required: true, issuer: "StacksOS Library" },
      },
      ai: {
        enabled: false,
        fallbackModels: [],
        maxTokens: 1024,
        temperature: 0.2,
        safetyMode: "balanced",
        budgets: { maxCallsPerHour: 2000, maxUsdPerDay: 0 },
      },
      discovery: {
        defaultSearchScope: "local",
        defaultCopyDepth: 1,
        allowPatronScopeOverride: true,
      },
      opac: {
        styleVariant: "classic",
        sections: {
          showQuickChips: true,
          showBrowseByFormat: true,
          showEvents: true,
          showRecommended: true,
          showNewArrivals: true,
          showPopular: true,
          showStaffPicks: true,
          showLibraryInfo: true,
        },
      },
      payment: {
        provider: "none",
        currency: "usd",
        minimumAmount: 100,
        allowPartialPayment: true,
        customization: {
          statementDescriptor: "Library Payment",
          supportEmail: "",
          receiptMessage: "",
        },
        stripe: {},
        square: { environment: "sandbox" },
        paypal: { environment: "sandbox" },
      },
      integrations: {},
    });
    loadTenantConfigFromDisk.mockReturnValue(null);
  });

  it("returns tenant-backed MFA settings on GET", async () => {
    const { GET } = await import("@/app/api/admin/security-settings/route");
    const response = await GET(new Request("http://localhost/api/admin/security-settings") as any);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.mfa.enabled).toBe(true);
    expect(data.mfa.required).toBe(true);
    expect(data.mfa.issuer).toBe("StacksOS Library");
  });

  it("persists MFA toggles and clears required when MFA is disabled", async () => {
    const { POST } = await import("@/app/api/admin/security-settings/route");
    const response = await POST(
      new Request("http://localhost/api/admin/security-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mfaEnabled: false, mfaRequired: true }),
      }) as any
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(saveTenantConfigToDisk).toHaveBeenCalledTimes(1);
    const savedConfig = saveTenantConfigToDisk.mock.calls[0]![0];
    expect(savedConfig.security.mfa.enabled).toBe(false);
    expect(savedConfig.security.mfa.required).toBe(false);
    expect(clearTenantConfigCache).toHaveBeenCalledTimes(1);
    expect(data.settings.mfa.enabled).toBe(false);
    expect(data.settings.mfa.required).toBe(false);
  });
});
