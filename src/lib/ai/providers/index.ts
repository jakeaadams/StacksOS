import type { AiProviderId } from "../types";
import type { AiProvider } from "./provider";
import { openAiProvider } from "./openai";
import { anthropicProvider } from "./anthropic";
import { mockProvider } from "./mock";

export function getProvider(id: AiProviderId): AiProvider {
  switch (id) {
    case "openai":
      return openAiProvider;
    case "anthropic":
      return anthropicProvider;
    case "mock":
      return mockProvider;
  }

  // Exhaustive check; should be unreachable.
  throw new Error(`Unknown AI provider: ${id}`);
}
