import fs from "node:fs";
import { Agent } from "undici";
import { logger } from "@/lib/logger";

type UndiciRequestInit = RequestInit & { dispatcher?: unknown };

let evergreenDispatcher: Agent | null | undefined;

function getEvergreenDispatcher(): Agent | null {
  if (evergreenDispatcher !== undefined) return evergreenDispatcher;

  const caPath =
    process.env.STACKSOS_EVERGREEN_CA_FILE ||
    // Note: Node only reads NODE_EXTRA_CA_CERTS at process startup. We support
    // reading it at runtime to keep local `.env.local` workflows working.
    process.env.NODE_EXTRA_CA_CERTS;

  if (!caPath) {
    evergreenDispatcher = null;
    return evergreenDispatcher;
  }

  try {
    const ca = fs.readFileSync(caPath);
    evergreenDispatcher = new Agent({ connect: { ca } });
    return evergreenDispatcher;
  } catch (error) {
    logger.warn({ err: String(error), caPath }, "Failed to load Evergreen CA bundle; using default TLS");
    evergreenDispatcher = null;
    return evergreenDispatcher;
  }
}

export async function fetchEvergreen(input: string, init: RequestInit = {}): Promise<Response> {
  const dispatcher = getEvergreenDispatcher();
  const requestInit: UndiciRequestInit = dispatcher ? { ...init, dispatcher } : init;
  return fetch(input, requestInit);
}

