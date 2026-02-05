import crypto from "crypto";

export function promptHash(value: string): string {
  return crypto.createHash("sha256").update(value, "utf8").digest("hex");
}

export type PromptTemplateId =
  | "policy_explain"
  | "cataloging_suggest"
  | "analytics_summary"
  | "semantic_rerank";

export type PromptTemplate = {
  id: PromptTemplateId;
  version: number;
  system: string;
  user: string;
};

export function buildPolicyExplainPrompt(inputRedacted: unknown): PromptTemplate {
  const system = [
    "You are StacksOS Policy Explainer.",
    "Goal: explain Evergreen circulation blocks in plain language for library staff.",
    "Rules:",
    "- Never suggest a mutating action unless staff explicitly confirms outside this response.",
    "- Do not invent policies or permissions.",
    "- If required context is missing, ask for it in nextSteps.",
    "- Output JSON only, matching the schema.",
  ].join("\n");

  const user = JSON.stringify(
    {
      task: "Explain the circulation/policy block",
      input: inputRedacted,
    },
    null,
    2
  );

  return { id: "policy_explain", version: 1, system, user };
}

export function buildCatalogingSuggestPrompt(inputRedacted: unknown): PromptTemplate {
  const system = [
    "You are StacksOS Cataloging Assistant.",
    "Goal: suggest subjects, a short summary, and series normalization ideas for MARC cataloging.",
    "Rules:",
    "- Suggestions are drafts only; never claim changes were applied.",
    "- Provide provenance as plain text (e.g., 'Derived from title/author metadata') when possible.",
    "- Do not include patron data. Do not include barcodes or emails.",
    "- Output JSON only, matching the schema.",
  ].join("\n");

  const user = JSON.stringify(
    {
      task: "Generate cataloging suggestions",
      input: inputRedacted,
    },
    null,
    2
  );

  return { id: "cataloging_suggest", version: 1, system, user };
}

export function buildAnalyticsSummaryPrompt(inputRedacted: unknown): PromptTemplate {
  const system = [
    "You are StacksOS Analytics Narrator.",
    "Goal: write a short, actionable narrative for library staff about aggregate daily metrics.",
    "Rules:",
    "- Use only the provided numbers; do not invent causes or patron-level claims.",
    "- Be explicit about uncertainty; include caveats if data is missing.",
    "- Provide drill-down links (URLs) to relevant StacksOS pages.",
    "- Output JSON only, matching the schema.",
  ].join("\n");

  const user = JSON.stringify(
    {
      task: "Summarize today’s aggregate metrics",
      input: inputRedacted,
      knownPages: [
        { label: "Reports dashboard", url: "/staff/reports" },
        { label: "Holds management", url: "/staff/circulation/holds-management" },
        { label: "Pull list", url: "/staff/circulation/pull-list" },
        { label: "Holds shelf", url: "/staff/circulation/holds-shelf" },
      ],
    },
    null,
    2
  );

  return { id: "analytics_summary", version: 1, system, user };
}

export function buildSemanticRerankPrompt(args: {
  query: string;
  candidates: Array<{ id: number; title: string; author?: string; format?: string; audience?: string; pubdate?: string; publisher?: string; isbn?: string }>;
}): PromptTemplate {
  const system = [
    "You are a library catalog search reranker.",
    "Goal: rerank candidate bibliographic records for a user query.",
    "Rules:",
    "- Output JSON only, matching the schema.",
    "- Do not invent metadata; use only the provided candidates.",
    "- Prefer availability-first and query intent, but do not hallucinate.",
    "- Include a short reason per ranked item (<= 140 chars).",
  ].join("\n");

  const user = JSON.stringify(
    {
      query: args.query,
      candidates: args.candidates,
    },
    null,
    2
  );

  return { id: "semantic_rerank", version: 1, system, user };
}
