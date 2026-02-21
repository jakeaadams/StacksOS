import { createClient, type RedisClientType } from "redis";
import { logger } from "@/lib/logger";

const GLOBAL_CLIENT_KEY = "__stacksos_redis_client";
const GLOBAL_CONNECTING_KEY = "__stacksos_redis_connecting";

type Client = RedisClientType;

function redisUrl(): string | null {
  const raw = String(process.env.STACKSOS_REDIS_URL || "").trim();
  return raw ? raw : null;
}

export function redisEnabled(): boolean {
  return !!redisUrl();
}

export function redisKey(suffix: string): string {
  const prefixRaw = String(process.env.STACKSOS_REDIS_PREFIX || "stacksos").trim();
  const prefix = prefixRaw || "stacksos";
  return `${prefix}:${suffix}`;
}

export async function getRedisClient(): Promise<Client | null> {
  const url = redisUrl();
  if (!url) return null;

  const g = globalThis as Record<string, unknown>;

  let client = g[GLOBAL_CLIENT_KEY] as Client | undefined;
  if (!client) {
    client = createClient({ url });
    client.on("error", (err) => {
      logger.error({ error: String(err) }, "Redis client error");
    });
    g[GLOBAL_CLIENT_KEY] = client;
  }

  if (client.isOpen) return client;

  let connecting = g[GLOBAL_CONNECTING_KEY] as Promise<void> | undefined;
  if (!connecting) {
    connecting = client
      .connect()
      .then(() => undefined)
      .catch((err) => {
        // Allow retries on subsequent calls.
        g[GLOBAL_CONNECTING_KEY] = undefined;
        throw err;
      });
    g[GLOBAL_CONNECTING_KEY] = connecting;
  }

  try {
    await connecting;
    g[GLOBAL_CONNECTING_KEY] = undefined;
    return client;
  } catch (err: any) {
    logger.error({ error: String(err) }, "Failed to connect to Redis; continuing without it");
    return null;
  }
}
