import { PermissionError, requirePermissions } from "@/lib/permissions";
import { getTenantId } from "@/lib/tenant/config";
import { logger } from "@/lib/logger";
import {
  bootstrapPlatformOwnerIfEmpty,
  listSaasRoleBindingsForActor,
  SAAS_ROLE_VALUES,
  type SaaSRole,
  type SaaSRoleBinding,
} from "@/lib/db/saas-rbac";

const SAAS_ROLE_RANK: Record<SaaSRole, number> = {
  platform_owner: 500,
  platform_admin: 400,
  tenant_admin: 300,
  tenant_operator: 200,
  tenant_viewer: 100,
};

const PLATFORM_ROLE_SET = new Set<SaaSRole>(["platform_owner", "platform_admin"]);

export interface SaaSContext {
  actorId: number | null;
  username: string | null;
  platformRole: SaaSRole | null;
  tenantRoles: Record<string, SaaSRole>;
  tenantIds: string[];
  isPlatformAdmin: boolean;
  bindings: SaaSRoleBinding[];
}

export interface SaaSSessionPayload {
  platformRole: SaaSRole | null;
  tenantRoles: Record<string, SaaSRole>;
  tenantIds: string[];
  isPlatformAdmin: boolean;
}

function normalizeTenantId(tenantId?: string | null): string {
  const normalized = String(tenantId || "")
    .trim()
    .toLowerCase();
  return (
    normalized ||
    String(getTenantId() || "default")
      .trim()
      .toLowerCase() ||
    "default"
  );
}

function parseActorId(actor: any): number | null {
  const raw = actor?.id ?? actor?.usr;
  const parsed = typeof raw === "number" ? raw : parseInt(String(raw ?? ""), 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseUsername(actor: any): string | null {
  const raw = actor?.username ?? actor?.usrname ?? actor?.usr_name;
  if (!raw) return null;
  const normalized = String(raw).trim().toLowerCase();
  return normalized || null;
}

function parseBootstrapPlatformAdmins(): {
  actorIds: Set<number>;
  usernames: Set<string>;
} {
  const raw = String(process.env.STACKSOS_SAAS_PLATFORM_ADMINS || "").trim();
  const actorIds = new Set<number>();
  const usernames = new Set<string>();

  if (!raw) return { actorIds, usernames };

  for (const tokenRaw of raw.split(",")) {
    const token = tokenRaw.trim();
    if (!token) continue;

    if (token.startsWith("id:")) {
      const parsed = parseInt(token.slice(3), 10);
      if (Number.isFinite(parsed)) actorIds.add(parsed);
      continue;
    }

    const numeric = parseInt(token, 10);
    if (Number.isFinite(numeric) && String(numeric) === token) {
      actorIds.add(numeric);
      continue;
    }

    usernames.add(token.toLowerCase());
  }

  return { actorIds, usernames };
}

function maxRole(current: SaaSRole | null, candidate: SaaSRole): SaaSRole {
  if (!current) return candidate;
  return SAAS_ROLE_RANK[candidate] > SAAS_ROLE_RANK[current] ? candidate : current;
}

function roleAtLeast(role: SaaSRole | null, expected: SaaSRole): boolean {
  if (!role) return false;
  return SAAS_ROLE_RANK[role] >= SAAS_ROLE_RANK[expected];
}

function contextToSessionPayload(context: SaaSContext | null): SaaSSessionPayload {
  return {
    platformRole: context?.platformRole || null,
    tenantRoles: context?.tenantRoles || {},
    tenantIds: context?.tenantIds || [],
    isPlatformAdmin: Boolean(context?.isPlatformAdmin),
  };
}

export function toSaaSSessionPayload(context: SaaSContext | null): SaaSSessionPayload {
  return contextToSessionPayload(context);
}

export async function resolveSaaSContextForIdentity(args: {
  actorId?: number | null;
  username?: string | null;
}): Promise<SaaSContext> {
  const actorId =
    typeof args.actorId === "number" && Number.isFinite(args.actorId)
      ? Math.trunc(args.actorId)
      : null;
  const username = args.username ? String(args.username).trim().toLowerCase() : null;

  const bindings = await listSaasRoleBindingsForActor({ actorId, username });

  let platformRole: SaaSRole | null = null;
  const tenantRoles: Record<string, SaaSRole> = {};

  for (const binding of bindings) {
    if (PLATFORM_ROLE_SET.has(binding.role)) {
      platformRole = maxRole(platformRole, binding.role);
      continue;
    }

    const tenantId = normalizeTenantId(binding.tenantId);
    const existing = tenantRoles[tenantId] || null;
    tenantRoles[tenantId] = maxRole(existing, binding.role);
  }

  const bootstrap = parseBootstrapPlatformAdmins();
  if (!platformRole) {
    const bootstrapMatched =
      (actorId !== null && bootstrap.actorIds.has(actorId)) ||
      (username !== null && bootstrap.usernames.has(username));

    if (bootstrapMatched) {
      platformRole = "platform_admin";
    }
  }

  return {
    actorId,
    username,
    platformRole,
    tenantRoles,
    tenantIds: Object.keys(tenantRoles).sort(),
    isPlatformAdmin: roleAtLeast(platformRole, "platform_admin"),
    bindings,
  };
}

export async function tryResolveSaaSContextFromActor(actor: any): Promise<SaaSContext | null> {
  const actorId = parseActorId(actor);
  const username = parseUsername(actor);
  if (!actorId && !username) return null;

  try {
    return await resolveSaaSContextForIdentity({ actorId, username });
  } catch (error) {
    logger.warn(
      { component: "saas-rbac", actorId, username, err: String(error) },
      "Failed to resolve SaaS context"
    );
    return null;
  }
}

export async function getSaaSSessionPayloadFromActor(actor: any): Promise<SaaSSessionPayload> {
  const context = await tryResolveSaaSContextFromActor(actor);
  return contextToSessionPayload(context);
}

export async function requireSaaSAccess(args: {
  evergreenPerms?: string[];
  target: "platform" | "tenant";
  tenantId?: string;
  minRole?: SaaSRole;
  autoBootstrapPlatformOwner?: boolean;
}): Promise<{
  authtoken: string;
  actor: any;
  saas: SaaSContext;
  tenantId: string;
}> {
  const evergreenPerms = args.evergreenPerms?.length ? args.evergreenPerms : ["STAFF_LOGIN"];
  const { authtoken, actor } = await requirePermissions(evergreenPerms);

  const actorId = parseActorId(actor);
  const username = parseUsername(actor);
  if (!actorId && !username) {
    throw new PermissionError("Unable to resolve actor identity for SaaS authorization");
  }

  if (args.autoBootstrapPlatformOwner === true) {
    await bootstrapPlatformOwnerIfEmpty({
      actorId,
      username,
      createdBy: actorId,
    });
  }

  const saas = await resolveSaaSContextForIdentity({ actorId, username });
  const tenantId = normalizeTenantId(args.tenantId);

  if (args.target === "platform") {
    const expected = args.minRole || "platform_admin";
    if (!roleAtLeast(saas.platformRole, expected)) {
      throw new PermissionError("SaaS platform permission denied", [`saas:${expected}`]);
    }
    return { authtoken, actor, saas, tenantId };
  }

  const expected = args.minRole || "tenant_admin";
  if (saas.isPlatformAdmin) {
    return { authtoken, actor, saas, tenantId };
  }

  const tenantRole = saas.tenantRoles[tenantId] || null;
  if (!roleAtLeast(tenantRole, expected)) {
    throw new PermissionError("SaaS tenant permission denied", [
      `saas:${expected}`,
      `tenant:${tenantId}`,
    ]);
  }

  return { authtoken, actor, saas, tenantId };
}

export function getHighestSaaSRole(
  context: SaaSContext | null,
  tenantId?: string
): SaaSRole | null {
  if (!context) return null;
  if (context.platformRole) return context.platformRole;

  const effectiveTenant = normalizeTenantId(tenantId);
  return context.tenantRoles[effectiveTenant] || null;
}

export function listSaaSRoles(): readonly SaaSRole[] {
  return SAAS_ROLE_VALUES;
}
