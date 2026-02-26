import fs from "node:fs";
import path from "node:path";
import { Agent } from "undici";
import { TenantConfigSchema } from "../src/lib/tenant/schema";
import { applyTenantProfileDefaults } from "../src/lib/tenant/profiles";

type Args = Record<string, string | boolean>;

function parseArgs(argv: string[]): Args {
  const args: Args = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a || !a.startsWith("--")) continue;
    const key = a.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) {
      args[key] = true;
    } else {
      args[key] = next;
      i++;
    }
  }
  return args;
}

function requiredString(args: Args, key: string): string {
  const v = args[key];
  if (typeof v !== "string" || !v.trim()) throw new Error(`Missing --${key}`);
  return v.trim();
}

function optionalString(args: Args, key: string): string | undefined {
  const v = args[key];
  if (typeof v !== "string") return undefined;
  const trimmed = v.trim();
  return trimmed || undefined;
}

function buildDispatcher(args: Args): Agent | null {
  const insecure = args.insecure === true;
  const caPath = optionalString(args, "ca-file");

  if (insecure) {
    return new Agent({ connect: { rejectUnauthorized: false } });
  }

  if (!caPath) return null;

  const ca = fs.readFileSync(caPath);
  return new Agent({ connect: { ca } });
}

type ProbeResult = { ok: boolean; status: number | null; error?: string; method?: string };

async function probeUrl(url: string, dispatcher: Agent | null): Promise<ProbeResult> {
  const requestInit = dispatcher ? ({ dispatcher } as const) : ({} as const);

  for (const method of ["HEAD", "GET"] as const) {
    try {
      const res = await fetch(url, {
        method,
        redirect: "manual",
        ...requestInit,
      });
      // Treat 2xx/3xx/4xx as reachable. 404 is common for osrf-gateway HEAD probes.
      return {
        ok: res.status >= 200 && res.status < 500,
        status: res.status,
        method,
      };
    } catch (error) {
      if (method === "GET") {
        return {
          ok: false,
          status: null,
          error: error instanceof Error ? error.message : String(error),
          method,
        };
      }
    }
  }

  return { ok: false, status: null, error: "probe failed" };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  const tenantId = requiredString(args, "tenant-id");
  const displayName = requiredString(args, "display-name");
  const evergreenBaseUrl = requiredString(args, "evergreen-base-url");
  const profile = optionalString(args, "profile") || "public";
  const region = optionalString(args, "region");
  const primaryColor = optionalString(args, "primary-color");
  const logoUrl = optionalString(args, "logo-url");
  const profileNotes = optionalString(args, "profile-notes");
  const discoveryScopeRaw = optionalString(args, "default-search-scope");
  const discoveryScope =
    discoveryScopeRaw === "local" ||
    discoveryScopeRaw === "system" ||
    discoveryScopeRaw === "consortium"
      ? discoveryScopeRaw
      : undefined;
  const copyDepthRaw = optionalString(args, "default-copy-depth");
  const copyDepthParsed = copyDepthRaw ? parseInt(copyDepthRaw, 10) : NaN;
  const defaultCopyDepth = Number.isFinite(copyDepthParsed)
    ? Math.min(99, Math.max(0, copyDepthParsed))
    : undefined;
  const allowScopeOverrideRaw = optionalString(args, "allow-scope-override");
  const allowPatronScopeOverride =
    allowScopeOverrideRaw === "1" || allowScopeOverrideRaw === "true"
      ? true
      : allowScopeOverrideRaw === "0" || allowScopeOverrideRaw === "false"
        ? false
        : undefined;

  const dryRun = args["dry-run"] === true;

  const config = applyTenantProfileDefaults(
    TenantConfigSchema.parse({
      tenantId,
      displayName,
      profile: { type: profile, notes: profileNotes },
      region,
      evergreenBaseUrl,
      branding: { primaryColor, logoUrl },
      discovery: {
        defaultSearchScope: discoveryScope,
        defaultCopyDepth,
        allowPatronScopeOverride,
      },
    })
  );

  const dispatcher = buildDispatcher(args);

  const eg2 = await probeUrl(`${config.evergreenBaseUrl.replace(/\/+$/, "")}/eg2/`, dispatcher);
  const osrfGateway = await probeUrl(
    `${config.evergreenBaseUrl.replace(/\/+$/, "")}/osrf-gateway-v1`,
    dispatcher
  );

  const outDir = path.join(process.cwd(), "tenants");
  const outPath = path.join(outDir, `${tenantId}.json`);

  const summary = {
    tenantId,
    outPath,
    profile: config.profile?.type || "public",
    evergreen: {
      eg2,
      osrfGateway,
    },
  };

  console.log(JSON.stringify(summary, null, 2));

  if (dryRun) {
    console.log("Dry-run: no files written.");
    return;
  }

  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(config, null, 2) + "\n", "utf8");
  console.log(`Wrote ${outPath}`);
  console.log(`Next: set STACKSOS_TENANT_ID=${tenantId} and restart StacksOS`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
