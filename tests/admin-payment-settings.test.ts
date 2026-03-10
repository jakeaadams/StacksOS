import { beforeEach, describe, expect, it, vi } from "vitest";

const requireSaaSAccess = vi.fn();
const checkRateLimit = vi.fn();
const logAuditEvent = vi.fn();
const getPaymentSettings = vi.fn();
const getTenantConfig = vi.fn();
const getTenantId = vi.fn();
const clearTenantConfigCache = vi.fn();
const loadTenantConfigFromDisk = vi.fn();
const saveTenantConfigToDisk = vi.fn();
const applyTenantProfileDefaults = vi.fn((value) => value);

vi.mock("@/lib/saas-rbac", () => ({ requireSaaSAccess }));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit }));
vi.mock("@/lib/audit", () => ({ logAuditEvent }));
vi.mock("@/lib/payments/types", () => ({ getPaymentSettings }));
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

describe("admin payment settings route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireSaaSAccess.mockResolvedValue({ actor: { id: 7 } });
    checkRateLimit.mockResolvedValue({ allowed: true, resetIn: 0 });
    logAuditEvent.mockResolvedValue(undefined);
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
        mfa: { enabled: false, required: false, issuer: "StacksOS" },
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
        provider: "stripe",
        currency: "usd",
        minimumAmount: 100,
        allowPartialPayment: true,
        customization: {
          statementDescriptor: "Library Payment",
          supportEmail: "",
          receiptMessage: "",
        },
        stripe: { publicKey: "pk_test_existing" },
        square: { applicationId: "sandbox-sq0idb-existing", environment: "sandbox" },
        paypal: { environment: "sandbox" },
      },
      integrations: { paymentProvider: "stripe" },
    });
    loadTenantConfigFromDisk.mockReturnValue(null);
    getPaymentSettings.mockReturnValue({
      provider: "paypal",
      publicKey: "",
      secretKeyConfigured: true,
      secretKeyLast4: "1234",
      webhookSecretConfigured: false,
      mode: "test",
      currency: "usd",
      minimumAmount: 250,
      allowPartialPayment: false,
      customization: {
        statementDescriptor: "Demo Library",
        supportEmail: "billing@example.org",
        receiptMessage: "Thanks",
      },
      squareApplicationId: "sandbox-sq0idb-existing",
      squareLocationId: "",
      squareEnvironment: "sandbox",
      paypalClientId: "paypal-client-id",
      paypalEnvironment: "live",
    });
  });

  it("returns provider-specific persisted settings on GET", async () => {
    const { GET } = await import("@/app/api/admin/payment-settings/route");
    const response = await GET(new Request("http://localhost/api/admin/payment-settings") as any);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.provider).toBe("paypal");
    expect(data.squareApplicationId).toBe("sandbox-sq0idb-existing");
    expect(data.paypalClientId).toBe("paypal-client-id");
    expect(data.paypalEnvironment).toBe("live");
  });

  it("persists tenant-backed payment settings on POST", async () => {
    const { POST } = await import("@/app/api/admin/payment-settings/route");
    const response = await POST(
      new Request("http://localhost/api/admin/payment-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: "paypal",
          currency: "usd",
          minimumAmount: 250,
          allowPartialPayment: false,
          paypal: {
            clientId: "paypal-client-id",
            environment: "live",
          },
          customization: {
            statementDescriptor: "Demo Library",
            supportEmail: "billing@example.org",
            receiptMessage: "Thanks",
          },
        }),
      }) as any
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(saveTenantConfigToDisk).toHaveBeenCalledTimes(1);
    const savedConfig = saveTenantConfigToDisk.mock.calls[0]![0];
    expect(savedConfig.payment.provider).toBe("paypal");
    expect(savedConfig.payment.paypal.clientId).toBe("paypal-client-id");
    expect(savedConfig.payment.paypal.environment).toBe("live");
    expect(savedConfig.payment.minimumAmount).toBe(250);
    expect(savedConfig.integrations.paymentProvider).toBe("paypal");
    expect(clearTenantConfigCache).toHaveBeenCalledTimes(1);
    expect(data.saved).toBe(true);
    expect(data.settings.provider).toBe("paypal");
  });

  it("persists Square application and location IDs in tenant config", async () => {
    getPaymentSettings.mockReturnValue({
      provider: "square",
      publicKey: "",
      secretKeyConfigured: true,
      secretKeyLast4: "5678",
      webhookSecretConfigured: false,
      mode: "test",
      currency: "usd",
      minimumAmount: 100,
      allowPartialPayment: true,
      customization: {
        statementDescriptor: "Library Payment",
        supportEmail: "",
        receiptMessage: "",
      },
      squareApplicationId: "sandbox-sq0idb-new",
      squareLocationId: "L-NEW",
      squareEnvironment: "sandbox",
      paypalClientId: "",
      paypalEnvironment: "sandbox",
    });

    const { POST } = await import("@/app/api/admin/payment-settings/route");
    const response = await POST(
      new Request("http://localhost/api/admin/payment-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: "square",
          square: {
            applicationId: "sandbox-sq0idb-new",
            locationId: "L-NEW",
            environment: "sandbox",
          },
        }),
      }) as any
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    const savedConfig = saveTenantConfigToDisk.mock.calls[0]![0];
    expect(savedConfig.payment.provider).toBe("square");
    expect(savedConfig.payment.square.applicationId).toBe("sandbox-sq0idb-new");
    expect(savedConfig.payment.square.locationId).toBe("L-NEW");
    expect(data.settings.squareApplicationId).toBe("sandbox-sq0idb-new");
  });
});
