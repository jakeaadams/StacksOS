import fs from "node:fs";
import path from "node:path";
import { TenantConfigSchema } from "../src/lib/tenant/schema";

type Args = Record<string, string | boolean>;

function parseArgs(argv: string[]): Args {
  const args: Args = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a!.startsWith("--")) continue;
    const key = a!.slice(2);
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

async function headOk(url: string): Promise<{ ok: boolean; status: number | null; error?: string }> {
  try {
    const res = await fetch(url, { method: "HEAD", redirect: "manual" });
    return { ok: res.ok || res.status === 302 || res.status === 301, status: res.status };
  } catch (e) {
    return { ok: false, status: null, error: e instanceof Error ? e.message : String(e) };
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  const tenantId = requiredString(args, "tenant-id");
  const displayName = requiredString(args, "display-name");
  const evergreenBaseUrl = requiredString(args, "evergreen-base-url");
  const region = typeof args["region"] === "string" ? String(args["region"]).trim() : undefined;
  const primaryColor =
    typeof args["primary-color"] === "string" ? String(args["primary-color"]).trim() : undefined;
  const logoUrl = typeof args["logo-url"] === "string" ? String(args["logo-url"]).trim() : undefined;

  const dryRun = args["dry-run"] === true;

  const config = TenantConfigSchema.parse({
    tenantId,
    displayName,
    region,
    evergreenBaseUrl,
    branding: { primaryColor, logoUrl },
  });

  const egHead = await headOk(`${config.evergreenBaseUrl.replace(/\/+$/, "")}/eg2/`);
  const osrfHead = await headOk(`${config.evergreenBaseUrl.replace(/\/+$/, "")}/osrf-gateway-v1`);

  const outDir = path.join(process.cwd(), "tenants");
  const outPath = path.join(outDir, `${tenantId}.json`);

  const summary = {
    tenantId,
    outPath,
    evergreen: {
      eg2: egHead,
      osrfGateway: osrfHead,
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
