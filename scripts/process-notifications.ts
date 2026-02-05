import { processPendingDeliveries } from "../src/lib/notifications/delivery-worker";

async function main() {
  const limitRaw = process.argv.find((a) => a.startsWith("--limit="));
  const limit = limitRaw ? parseInt(limitRaw.split("=")[1] || "25", 10) : 25;
  const result = await processPendingDeliveries(Number.isFinite(limit) ? limit : 25);
  console.log(JSON.stringify(result, null, 2));
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
