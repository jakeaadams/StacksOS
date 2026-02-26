import { NextRequest } from "next/server";

import { errorResponse } from "@/lib/api";
import { handleAcquisitionsPost } from "../_handlers/post";
import { z } from "zod";

const ALLOWED_ACTIONS = new Set([
  "receive_lineitem",
  "receive_lineitem_detail",
  "unreceive_lineitem_detail",
  "cancel_lineitem",
  "claim_lineitem",
  "mark_damaged",
]);

const _receivingPostSchema = z
  .object({
    action: z.string().trim().min(1),
  })
  .passthrough();

export async function POST(req: NextRequest) {
  // Guardrail: only allow receiving-related actions on this route.
  const clone = req.clone();
  const body = await clone.json().catch(() => null);
  const action = String((body as Record<string, any>)?.action || "").trim();

  if (!ALLOWED_ACTIONS.has(action)) {
    return errorResponse("Invalid action for receiving route", 400, {
      action: action || null,
      allowed: Array.from(ALLOWED_ACTIONS),
    });
  }

  return handleAcquisitionsPost(req);
}
