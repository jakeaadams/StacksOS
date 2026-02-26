import { beforeEach, describe, expect, it, vi } from "vitest";

const requirePermissionsMock = vi.fn();
const listBindingsMock = vi.fn();
const bootstrapPlatformOwnerIfEmptyMock = vi.fn();

vi.mock("@/lib/permissions", () => ({
  PermissionError: class PermissionError extends Error {
    missing: string[];

    constructor(message: string, missing: string[] = []) {
      super(message);
      this.name = "PermissionError";
      this.missing = missing;
    }
  },
  requirePermissions: requirePermissionsMock,
}));

vi.mock("@/lib/db/saas-rbac", () => ({
  SAAS_ROLE_VALUES: [
    "platform_owner",
    "platform_admin",
    "tenant_admin",
    "tenant_operator",
    "tenant_viewer",
  ],
  listSaasRoleBindingsForActor: listBindingsMock,
  bootstrapPlatformOwnerIfEmpty: bootstrapPlatformOwnerIfEmptyMock,
}));

vi.mock("@/lib/tenant/config", () => ({
  getTenantId: () => "default",
}));

vi.mock("@/lib/logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

function mockBinding(role: string, tenantId: string | null) {
  return {
    id: 1,
    actorId: 11,
    username: "jake",
    tenantId,
    role,
    active: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    createdBy: null,
    updatedBy: null,
  };
}

describe("saas-rbac", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    process.env = { ...originalEnv };

    requirePermissionsMock.mockResolvedValue({
      authtoken: "test-token",
      actor: { id: 11, username: "jake" },
      result: { ok: true, missing: [], perms: {} },
    });
    listBindingsMock.mockResolvedValue([]);
    bootstrapPlatformOwnerIfEmptyMock.mockResolvedValue(false);
  });

  it("grants platform admin access from bootstrap env", async () => {
    process.env.STACKSOS_SAAS_PLATFORM_ADMINS = "jake";
    const { resolveSaaSContextForIdentity } = await import("@/lib/saas-rbac");

    const context = await resolveSaaSContextForIdentity({ actorId: 11, username: "jake" });

    expect(context.isPlatformAdmin).toBe(true);
    expect(context.platformRole).toBe("platform_admin");
  });

  it("denies tenant access when no matching role exists", async () => {
    const { requireSaaSAccess } = await import("@/lib/saas-rbac");

    await expect(
      requireSaaSAccess({
        target: "tenant",
        minRole: "tenant_admin",
        tenantId: "north",
        evergreenPerms: ["ADMIN_CONFIG"],
      })
    ).rejects.toHaveProperty("name", "PermissionError");
  });

  it("allows tenant access when tenant role meets requirement", async () => {
    listBindingsMock.mockResolvedValue([mockBinding("tenant_admin", "north")]);
    const { requireSaaSAccess } = await import("@/lib/saas-rbac");

    const result = await requireSaaSAccess({
      target: "tenant",
      minRole: "tenant_admin",
      tenantId: "north",
      evergreenPerms: ["ADMIN_CONFIG"],
    });

    expect(result.saas.tenantRoles.north).toBe("tenant_admin");
    expect(result.tenantId).toBe("north");
  });

  it("allows platform access for platform roles", async () => {
    listBindingsMock.mockResolvedValue([mockBinding("platform_admin", null)]);
    const { requireSaaSAccess } = await import("@/lib/saas-rbac");

    const result = await requireSaaSAccess({
      target: "platform",
      minRole: "platform_admin",
      evergreenPerms: ["ADMIN_CONFIG"],
      autoBootstrapPlatformOwner: true,
    });

    expect(result.saas.isPlatformAdmin).toBe(true);
    expect(result.saas.platformRole).toBe("platform_admin");
    expect(bootstrapPlatformOwnerIfEmptyMock).toHaveBeenCalled();
  });
});
