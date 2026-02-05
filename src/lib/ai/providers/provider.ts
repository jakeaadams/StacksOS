import { z } from "zod";
import { parseAndValidateJson } from "../json";
import type { AiCompletion, AiConfig, AiProviderId } from "../types";

export type AiJsonRequest<T> = {
  requestId?: string;
  config: AiConfig;
  schema: z.ZodSchema<T>;
  system: string;
  user: string;
};

export interface AiProvider {
  id: AiProviderId;
  completeJson<T>(req: AiJsonRequest<T>): Promise<{ data: T; completion: AiCompletion }>;
}

export async function validateProviderJson<T>(
  completion: AiCompletion,
  schema: z.ZodSchema<T>
): Promise<T> {
  return parseAndValidateJson(completion.text, schema);
}

