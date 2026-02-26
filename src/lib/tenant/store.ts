import fs from "node:fs";
import path from "node:path";
import { logger } from "@/lib/logger";
import { TenantConfigSchema, type TenantConfig } from "@/lib/tenant/schema";

function isTenantConfigFilename(filename: string): boolean {
  return /^[a-z0-9][a-z0-9_-]{0,63}\.json$/i.test(filename);
}

export function resolveTenantsDir(repoRoot: string = process.cwd()): string {
  return path.join(repoRoot, "tenants");
}

export function resolveTenantConfigPath(
  tenantId: string,
  repoRoot: string = process.cwd()
): string {
  return path.join(resolveTenantsDir(repoRoot), `${tenantId}.json`);
}

export function loadTenantConfigFromDisk(tenantId: string): TenantConfig | null {
  const p = resolveTenantConfigPath(tenantId);
  try {
    if (!fs.existsSync(p)) return null;
    const raw = fs.readFileSync(p, "utf8");
    const parsed = JSON.parse(raw);
    return TenantConfigSchema.parse(parsed);
  } catch (error) {
    logger.error({ tenantId, err: String(error) }, "Failed to parse tenant config from disk");
    return null;
  }
}

export type TenantListItem = {
  tenantId: string;
  displayName: string;
  profile: string;
  region: string | null;
  evergreenBaseUrl: string;
  modifiedAt: string | null;
};

export function listTenantConfigsFromDisk(): TenantListItem[] {
  const tenantsDir = resolveTenantsDir();
  if (!fs.existsSync(tenantsDir)) return [];

  const files = fs.readdirSync(tenantsDir).filter(isTenantConfigFilename).sort();
  const out: TenantListItem[] = [];

  for (const file of files) {
    const p = path.join(tenantsDir, file);
    try {
      const raw = fs.readFileSync(p, "utf8");
      const json = JSON.parse(raw);
      const tenant = TenantConfigSchema.parse(json);
      const stats = fs.statSync(p);
      out.push({
        tenantId: tenant.tenantId,
        displayName: tenant.displayName,
        profile: tenant.profile?.type || "public",
        region: tenant.region || null,
        evergreenBaseUrl: tenant.evergreenBaseUrl,
        modifiedAt: Number.isFinite(stats.mtimeMs) ? new Date(stats.mtimeMs).toISOString() : null,
      });
    } catch (error) {
      logger.warn({ file, err: String(error) }, "Skipping invalid tenant config file");
    }
  }

  return out;
}

export function saveTenantConfigToDisk(config: TenantConfig): string {
  const tenantsDir = resolveTenantsDir();
  const outPath = resolveTenantConfigPath(config.tenantId);
  fs.mkdirSync(tenantsDir, { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(config, null, 2) + "\n", "utf8");
  return outPath;
}

export function deleteTenantConfigFromDisk(tenantId: string): boolean {
  const p = resolveTenantConfigPath(tenantId);
  if (!fs.existsSync(p)) return false;
  fs.unlinkSync(p);
  return true;
}
