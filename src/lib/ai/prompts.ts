import crypto from "crypto";

export function promptHash(value: string): string {
  return crypto.createHash("sha256").update(value, "utf8").digest("hex");
}

export type PromptTemplateId =
  | "policy_explain"
  | "cataloging_suggest"
  | "analytics_summary"
  | "ops_playbooks"
  | "staff_copilot"
  | "holds_copilot"
  | "patron_copilot"
  | "acquisitions_copilot"
  | "cataloging_copilot"
  | "admin_copilot"
  | "semantic_rerank"
  | "ai_search"
  | "ai_search_explain"
  | "marc_generation";

export type PromptTemplate = {
  id: PromptTemplateId;
  version: number;
  system: string;
  user: string;
};

export type MarcGenInput = {
  title: string;
  author?: string;
  isbn?: string;
  publisher?: string;
  description?: string;
  format?: string;
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
      task: "Summarize today's aggregate metrics",
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

export function buildOpsPlaybooksPrompt(inputRedacted: unknown): PromptTemplate {
  const system = [
    "You are StacksOS Ops Assistant (Kimi) for library staff.",
    "Goal: produce concrete, high-signal operational playbooks from aggregate metrics.",
    "Rules:",
    "- Output JSON only, matching the schema.",
    "- Prioritize actions with direct operational impact in the next 2 hours.",
    "- Each action must include: title, why, impact (high|medium|low), etaMinutes, steps, deepLink.",
    "- Do not invent patron-level details or private information.",
    "- Use only the provided metrics and queue snapshots.",
    "- Prefer links to existing StacksOS pages for execution.",
  ].join("\n");

  const user = JSON.stringify(
    {
      task: "Generate actionable cross-module ops playbooks",
      input: inputRedacted,
      knownPages: [
        { label: "Circulation Desk", url: "/staff/circulation" },
        { label: "Check In", url: "/staff/circulation/checkin" },
        { label: "Holds Management", url: "/staff/circulation/holds-management" },
        { label: "Holds Shelf", url: "/staff/circulation/holds-shelf" },
        { label: "Pull List", url: "/staff/circulation/pull-list" },
        { label: "Patrons", url: "/staff/patrons" },
        { label: "Reports", url: "/staff/reports" },
      ],
    },
    null,
    2
  );

  return { id: "ops_playbooks", version: 1, system, user };
}

export function buildStaffCopilotPrompt(inputRedacted: unknown): PromptTemplate {
  const system = [
    "You are StacksOS Staff Copilot (Kimi 2.5 Pro).",
    "Goal: produce one cross-module shift brief for library staff from aggregate live metrics.",
    "Rules:",
    "- Output JSON only, matching the schema.",
    "- Include a concise summary, concrete highlights, and actionable playbooks.",
    "- Actions must be executable in StacksOS now and include deep links.",
    "- Prioritize next 2 hours of operational impact.",
    "- Never include patron-level PII or fabricated facts.",
    "- If data is incomplete, explicitly call this out in caveats.",
  ].join("\n");

  const user = JSON.stringify(
    {
      task: "Generate a proactive cross-module staff copilot briefing",
      input: inputRedacted,
      knownPages: [
        { label: "Staff Workbench", url: "/staff" },
        { label: "Circulation Desk", url: "/staff/circulation" },
        { label: "Check In", url: "/staff/circulation/checkin" },
        { label: "Holds Management", url: "/staff/circulation/holds-management" },
        { label: "Holds Shelf", url: "/staff/circulation/holds-shelf" },
        { label: "Pull List", url: "/staff/circulation/pull-list" },
        { label: "Patrons", url: "/staff/patrons" },
        { label: "Catalog", url: "/staff/catalog" },
        { label: "Reports", url: "/staff/reports" },
      ],
    },
    null,
    2
  );

  return { id: "staff_copilot", version: 1, system, user };
}

export function buildSemanticRerankPrompt(args: {
  query: string;
  candidates: Array<{
    id: number;
    title: string;
    author?: string;
    format?: string;
    audience?: string;
    pubdate?: string;
    publisher?: string;
    isbn?: string;
  }>;
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

// ---------------------------------------------------------------------------
// AI Natural Language Search
// ---------------------------------------------------------------------------

export function buildNaturalLanguageSearchPrompt(query: string): PromptTemplate {
  const system = [
    "You are a library catalog search decomposer.",
    "Goal: decompose a patron's natural-language query into structured catalog search parameters.",
    "Rules:",
    "- Output JSON only, matching the schema.",
    "- keywords: an array of the most important search words (max 5).",
    "- subjects: an array of Library of Congress-style subject terms the query implies (max 5).",
    "- author: a person name if the query mentions a specific author, otherwise null.",
    "- audience: one of 'adult', 'young_adult', 'juvenile', or null if unspecified.",
    "- format: one of 'book', 'ebook', 'audiobook', 'dvd', 'serial', or null if unspecified.",
    "- language: an ISO 639-2 three-letter code if the query mentions a language, otherwise null.",
    "- searchQuery: a ready-to-execute Evergreen catalog search string using keyword:, subject:, author:, title: prefixes. Combine multiple clauses with spaces. Use the most discriminating terms first.",
    "- Do not include patron identity, barcodes, or PII in the output.",
    "- Be conservative: if the query is ambiguous, prefer broader search terms.",
    "- If the query mentions an age range (e.g. 'ages 3-5'), map it to the appropriate audience.",
  ].join("\n");

  const user = JSON.stringify(
    {
      task: "Decompose this natural language catalog query into structured search parameters",
      query,
    },
    null,
    2
  );

  return { id: "ai_search", version: 1, system, user };
}

export function buildAiSearchExplanationPrompt(args: {
  query: string;
  results: Array<{
    id: number;
    title: string;
    author?: string;
    subjects?: string[];
    summary?: string;
  }>;
}): PromptTemplate {
  const system = [
    "You are a library catalog search assistant.",
    "Goal: for each search result, write a short (1-2 sentence) explanation of why it matches the patron's query.",
    "Rules:",
    "- Output JSON only, matching the schema.",
    "- Each explanation must be <= 200 characters.",
    "- Reference specific attributes of the book (author, setting, theme, character, genre) that match the query intent.",
    "- Do not hallucinate details that are not in the provided metadata.",
    "- Do not include patron identity or PII.",
    "- If a result is a weak match, say so honestly.",
  ].join("\n");

  const user = JSON.stringify(
    {
      query: args.query,
      results: args.results.slice(0, 20),
    },
    null,
    2
  );

  return { id: "ai_search_explain", version: 1, system, user };
}

// ---------------------------------------------------------------------------
// AI MARC Record Generation
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Holds Copilot
// ---------------------------------------------------------------------------

export function buildHoldsCopilotPrompt(inputRedacted: unknown): PromptTemplate {
  const system = [
    "You are StacksOS Holds Copilot (Kimi 2.5 Pro).",
    "Goal: analyze a hold queue snapshot and produce prioritized actions for library staff.",
    "Rules:",
    "- Output JSON only, matching the schema.",
    "- Each action must include: id, title, why, impact (high|medium|low), etaMinutes, steps, deepLink.",
    "- Prioritize actions that reduce patron wait time and shelf backlog first.",
    "- Never include patron-level PII or fabricated facts.",
    "- If data is incomplete, explicitly call this out in caveats.",
    "- Prefer links to existing StacksOS pages for execution.",
  ].join("\n");

  const user = JSON.stringify(
    {
      task: "Analyze hold queue stats and generate prioritized hold management actions",
      input: inputRedacted,
      knownPages: [
        { label: "Holds Management", url: "/staff/circulation/holds-management" },
        { label: "Pull List", url: "/staff/circulation/pull-list" },
        { label: "Holds Shelf", url: "/staff/circulation/holds-shelf" },
        { label: "Transits", url: "/staff/circulation/transits" },
        { label: "Check In", url: "/staff/circulation/checkin" },
      ],
    },
    null,
    2
  );

  return { id: "holds_copilot", version: 1, system, user };
}

// ---------------------------------------------------------------------------
// Patron Copilot
// ---------------------------------------------------------------------------

export function buildPatronCopilotPrompt(inputRedacted: unknown): PromptTemplate {
  const system = [
    "You are StacksOS Patron Copilot (Kimi 2.5 Pro).",
    "Goal: provide contextual guidance to library staff for a specific patron interaction.",
    "Rules:",
    "- Output JSON only, matching the schema.",
    "- Produce a brief interaction summary, highlight any alerts or risk factors, and suggest next steps.",
    "- Never suggest actions that violate patron privacy or library policy.",
    "- Never fabricate patron history or invent checkout/hold details.",
    "- If data is incomplete, note missing information in caveats.",
    "- Prefer links to existing StacksOS pages for execution.",
  ].join("\n");

  const user = JSON.stringify(
    {
      task: "Generate patron interaction guidance from the provided summary",
      input: inputRedacted,
      knownPages: [
        { label: "Patron Detail", url: "/staff/patrons/{id}" },
        { label: "Checkout", url: "/staff/circulation/checkout" },
        { label: "Check In", url: "/staff/circulation/checkin" },
        { label: "Bills", url: "/staff/circulation/bills" },
        { label: "Holds Management", url: "/staff/circulation/holds-management" },
      ],
    },
    null,
    2
  );

  return { id: "patron_copilot", version: 1, system, user };
}

// ---------------------------------------------------------------------------
// Acquisitions Copilot
// ---------------------------------------------------------------------------

export function buildAcquisitionsCopilotPrompt(inputRedacted: unknown): PromptTemplate {
  const system = [
    "You are StacksOS Acquisitions Copilot (Kimi 2.5 Pro).",
    "Goal: analyze fund balances and purchase order data to produce budget management actions.",
    "Rules:",
    "- Output JSON only, matching the schema.",
    "- Each action must include: id, title, why, impact (high|medium|low), etaMinutes, steps, deepLink.",
    "- Prioritize spend-rate anomalies, low-balance funds, and pending orders that need attention.",
    "- Never include vendor contract details or financial account numbers.",
    "- If data is incomplete, explicitly call this out in caveats.",
    "- Prefer links to existing StacksOS pages for execution.",
  ].join("\n");

  const user = JSON.stringify(
    {
      task: "Analyze fund balances and order data to generate budget management actions",
      input: inputRedacted,
      knownPages: [
        { label: "Acquisitions", url: "/staff/acquisitions" },
        { label: "Purchase Orders", url: "/staff/acquisitions/orders" },
        { label: "Receiving", url: "/staff/acquisitions/receiving" },
        { label: "Reports", url: "/staff/reports" },
      ],
    },
    null,
    2
  );

  return { id: "acquisitions_copilot", version: 1, system, user };
}

// ---------------------------------------------------------------------------
// Cataloging Copilot
// ---------------------------------------------------------------------------

export function buildCatalogingCopilotPrompt(inputRedacted: unknown): PromptTemplate {
  const system = [
    "You are StacksOS Cataloging Copilot (Kimi 2.5 Pro).",
    "Goal: analyze bibliographic MARC data and suggest subject headings, classification, and metadata improvements.",
    "Rules:",
    "- Output JSON only, matching the schema.",
    "- Subject suggestions must cite a source: lcsh, sears, fast, or inferred.",
    "- Classification suggestions should include DDC and/or LCC when possible.",
    "- Metadata improvements must specify the field, current value (if any), suggested value, and reason.",
    "- Never fabricate ISBNs, authors, or publication data not present in the input.",
    "- If data is incomplete, explicitly call this out in caveats.",
    "- Suggestions are drafts only; never claim changes were applied.",
    "- Do not include patron data, barcodes, or emails.",
  ].join("\n");

  const user = JSON.stringify(
    {
      task: "Analyze MARC bibliographic data and suggest subject headings, classification, and metadata improvements",
      input: inputRedacted,
      knownPages: [
        { label: "MARC Editor", url: "/staff/cataloging/marc-editor" },
        { label: "Authority Control", url: "/staff/cataloging/authority" },
        { label: "Holdings", url: "/staff/cataloging/holdings" },
        { label: "Z39.50 Search", url: "/staff/cataloging/z3950" },
      ],
    },
    null,
    2
  );

  return { id: "cataloging_copilot", version: 1, system, user };
}

// ---------------------------------------------------------------------------
// Admin Copilot
// ---------------------------------------------------------------------------

export function buildAdminCopilotPrompt(inputRedacted: unknown): PromptTemplate {
  const system = [
    "You are StacksOS Admin Copilot (Kimi 2.5 Pro).",
    "Goal: analyze library operational metrics and produce prioritized administrative actions.",
    "Rules:",
    "- Output JSON only, matching the schema.",
    "- Highlights must include a label, value, and trend direction (up, down, or flat).",
    "- Actions must include title, description, priority (high|medium|low), category, and optional deepLink.",
    "- Prioritize actions that address critical operational issues first.",
    "- Never fabricate metrics or patron-level details.",
    "- If data is incomplete, explicitly call this out in drilldowns.",
    "- Prefer links to existing StacksOS admin and staff pages.",
  ].join("\n");

  const user = JSON.stringify(
    {
      task: "Analyze library operational metrics and generate prioritized admin actions",
      input: inputRedacted,
      knownPages: [
        { label: "Administration", url: "/staff/admin" },
        { label: "Reports", url: "/staff/reports" },
        { label: "Circulation", url: "/staff/circulation" },
        { label: "Holds Management", url: "/staff/circulation/holds-management" },
        { label: "Settings", url: "/staff/admin/settings" },
        { label: "Ops", url: "/staff/admin/ops" },
      ],
    },
    null,
    2
  );

  return { id: "admin_copilot", version: 1, system, user };
}

// ---------------------------------------------------------------------------
// AI MARC Record Generation
// ---------------------------------------------------------------------------

export function buildMarcGenerationPrompt(input: MarcGenInput): PromptTemplate {
  const system = [
    "You are a MARC21 cataloging expert.",
    "Goal: generate a complete draft MARC21 bibliographic record from the provided metadata.",
    "Rules:",
    "- Output JSON only, matching the schema.",
    "- Generate realistic, standards-compliant MARC fields.",
    "- Include the following field groups:",
    "  * leader: a 24-character MARC leader string (use 'nam' for books, adjust type/bibliographic-level as appropriate).",
    "  * field_008: a 40-character fixed-length data element string.",
    "  * fields: an array of MARC data fields, each with { tag, ind1, ind2, subfields: [{ code, value }], confidence }.",
    "- Required fields to generate: 020 (ISBN if provided), 100 (author main entry), 245 (title statement),",
    "  264 (publication info), 300 (physical description), 336/337/338 (content/media/carrier),",
    "  500 (general note), 520 (summary), 650 (LCSH subjects, at least 2-3), 655 (genre/form).",
    "- Also include: 082 (DDC classification suggestion) and 050 (LCC suggestion).",
    "- confidence per field: 'high' if derived from provided input, 'medium' if reasonably inferred, 'low' if speculative.",
    "- LCSH subjects (650) should use indicator2='0' for Library of Congress.",
    "- Do not include patron data, barcodes, or emails.",
    "- Do not include 001 (control number) or 003 - those are assigned by the ILS.",
    "- If ISBN is provided, validate its plausibility but include it as given.",
    "- Use standard MARC punctuation conventions (ISBD punctuation in 245, 264, 300).",
  ].join("\n");

  const user = JSON.stringify(
    {
      task: "Generate a complete draft MARC21 bibliographic record",
      input: {
        title: input.title,
        author: input.author || null,
        isbn: input.isbn || null,
        publisher: input.publisher || null,
        description: input.description || null,
        format: input.format || "book",
      },
    },
    null,
    2
  );

  return { id: "marc_generation", version: 1, system, user };
}
