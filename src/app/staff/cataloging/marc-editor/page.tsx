"use client";

import { fetchWithAuth } from "@/lib/client-fetch";

import { useCallback, useEffect, useMemo, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { clientLogger } from "@/lib/client-logger";

import { PageContainer, PageHeader, PageContent } from "@/components/shared";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import {
  Save,
  Check,
  AlertTriangle,
  Plus,
  Trash2,
  HelpCircle,
  Loader2,
  Columns2,
  X,
  Sparkles,
  ThumbsDown,
  ThumbsUp,
  ClipboardList,
  Users,
} from "lucide-react";
import { featureFlags } from "@/lib/feature-flags";

interface MarcField {
  tag: string;
  ind1: string;
  ind2: string;
  subfields: { code: string; value: string }[];
}

interface MarcRecord {
  leader: string;
  fields: MarcField[];
}

type AiCatalogingSuggestion = {
  id: string;
  type: "subject" | "summary" | "series";
  confidence: number;
  message: string;
  suggestedValue: string;
  provenance?: string[];
};

type RecordPresence = {
  actorName: string | null;
  activity: "viewing" | "editing";
  lastSeenAt: string;
};

type RecordTask = {
  id: number;
  title: string;
  body: string | null;
  status: "open" | "done" | "canceled";
  createdAt: string;
};

type FixedFieldOption = {
  value: string;
  label: string;
};

const marcFieldDescriptions: Record<string, string> = {
  "001": "Control Number",
  "003": "Control Number Identifier",
  "005": "Date/Time of Latest Transaction",
  "008": "Fixed-Length Data Elements",
  "010": "Library of Congress Control Number",
  "020": "ISBN",
  "022": "ISSN",
  "040": "Cataloging Source",
  "041": "Language Code",
  "050": "LC Call Number",
  "082": "Dewey Decimal Number",
  "100": "Main Entry - Personal Name",
  "110": "Main Entry - Corporate Name",
  "245": "Title Statement",
  "246": "Varying Form of Title",
  "250": "Edition Statement",
  "264": "Production/Publication",
  "300": "Physical Description",
  "336": "Content Type",
  "337": "Media Type",
  "338": "Carrier Type",
  "490": "Series Statement",
  "500": "General Note",
  "504": "Bibliography Note",
  "505": "Contents Note",
  "520": "Summary",
  "600": "Subject - Personal Name",
  "650": "Subject - Topical Term",
  "651": "Subject - Geographic",
  "700": "Added Entry - Personal Name",
  "856": "Electronic Location",
};

const marcTagSuggestions = Object.entries(marcFieldDescriptions)
  .sort((a, b) => Number.parseInt(a[0], 10) - Number.parseInt(b[0], 10))
  .map(([tag, label]) => ({ tag, label }));

type IndicatorRule = {
  ind1: string[];
  ind2: string[];
};

const indicatorRules: Record<string, IndicatorRule> = {
  "020": { ind1: [" "], ind2: [" "] },
  "022": { ind1: [" "], ind2: [" "] },
  "040": { ind1: [" "], ind2: [" "] },
  "041": { ind1: ["0", "1", " "], ind2: [" "] },
  "050": { ind1: ["0", "1", "2", "3", "4", " "], ind2: ["0", "4", " "] },
  "082": { ind1: ["0", "1", "7", " "], ind2: ["0", "4", " "] },
  "100": { ind1: ["0", "1", "3"], ind2: [" "] },
  "110": { ind1: ["0", "1", "2"], ind2: [" "] },
  "111": { ind1: ["0", "1", "2"], ind2: [" "] },
  "130": { ind1: ["0", "1", "2", "3", "9"], ind2: [" "] },
  "245": { ind1: ["0", "1"], ind2: ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"] },
  "246": { ind1: ["0", "1", "2", "3"], ind2: ["0", "1", "2", "3", "4", "5", "6", "7", "8"] },
  "250": { ind1: [" "], ind2: [" "] },
  "264": { ind1: [" ", "2", "3"], ind2: ["0", "1", "2", "3", "4"] },
  "300": { ind1: [" "], ind2: [" "] },
  "336": { ind1: [" "], ind2: [" "] },
  "337": { ind1: [" "], ind2: [" "] },
  "338": { ind1: [" "], ind2: [" "] },
  "490": { ind1: ["0", "1"], ind2: [" "] },
  "500": { ind1: [" "], ind2: [" "] },
  "504": { ind1: [" "], ind2: [" "] },
  "505": { ind1: ["0", "1", "2", "8"], ind2: [" "] },
  "520": { ind1: [" ", "0", "1", "2", "3", "4", "8"], ind2: [" "] },
  "600": { ind1: ["0", "1", "3"], ind2: ["0", "1", "2", "3", "4", "5", "6", "7"] },
  "610": { ind1: ["0", "1", "2"], ind2: ["0", "1", "2", "3", "4", "5", "6", "7"] },
  "611": { ind1: ["0", "1", "2"], ind2: ["0", "1", "2", "3", "4", "5", "6", "7"] },
  "630": {
    ind1: ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"],
    ind2: ["0", "1", "2", "3", "4", "5", "6", "7"],
  },
  "650": { ind1: [" ", "0", "1", "2", "3"], ind2: ["0", "1", "2", "3", "4", "5", "6", "7"] },
  "651": { ind1: [" ", "0", "1", "2", "3"], ind2: ["0", "1", "2", "3", "4", "5", "6", "7"] },
  "655": {
    ind1: [" ", "0", "1", "2", "3", "4", "5", "6", "7"],
    ind2: ["0", "1", "2", "3", "4", "5", "6", "7"],
  },
  "700": { ind1: ["0", "1", "3"], ind2: [" "] },
  "710": { ind1: ["0", "1", "2"], ind2: [" "] },
  "711": { ind1: ["0", "1", "2"], ind2: [" "] },
  "730": { ind1: ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"], ind2: [" "] },
  "740": { ind1: ["0", "1", "2", "3"], ind2: [" "] },
  "800": { ind1: ["0", "1", "3"], ind2: [" "] },
  "810": { ind1: ["0", "1", "2"], ind2: [" "] },
  "830": { ind1: [" ", "0", "1"], ind2: [" "] },
  "856": { ind1: [" ", "0", "1", "2", "3", "4", "7", "8"], ind2: [" ", "0", "1", "2", "8"] },
};

function indicatorLabel(value: string): string {
  return value === " " ? "blank" : value;
}

const defaultMarcRecord: MarcRecord = {
  leader: "00000nam a22000007i 4500",
  fields: [
    { tag: "001", ind1: " ", ind2: " ", subfields: [{ code: "", value: "" }] },
    { tag: "003", ind1: " ", ind2: " ", subfields: [{ code: "", value: "StacksOS" }] },
    {
      tag: "008",
      ind1: " ",
      ind2: " ",
      subfields: [{ code: "", value: "240120s2024    xxu           000 0 eng d" }],
    },
    { tag: "020", ind1: " ", ind2: " ", subfields: [{ code: "a", value: "" }] },
    { tag: "100", ind1: "1", ind2: " ", subfields: [{ code: "a", value: "" }] },
    {
      tag: "245",
      ind1: "1",
      ind2: "0",
      subfields: [
        { code: "a", value: "" },
        { code: "c", value: "" },
      ],
    },
    {
      tag: "264",
      ind1: " ",
      ind2: "1",
      subfields: [
        { code: "a", value: "" },
        { code: "b", value: "" },
        { code: "c", value: "" },
      ],
    },
    { tag: "300", ind1: " ", ind2: " ", subfields: [{ code: "a", value: "" }] },
    { tag: "650", ind1: " ", ind2: "0", subfields: [{ code: "a", value: "" }] },
  ],
};

const leaderRecordStatusOptions: FixedFieldOption[] = [
  { value: "n", label: "New (n)" },
  { value: "c", label: "Corrected/Revised (c)" },
  { value: "a", label: "Encoding level increase (a)" },
  { value: "d", label: "Deleted (d)" },
  { value: "p", label: "Prepublication level increase (p)" },
];

const leaderTypeOptions: FixedFieldOption[] = [
  { value: "a", label: "Language material (a)" },
  { value: "c", label: "Notated music (c)" },
  { value: "g", label: "Projected medium (g)" },
  { value: "i", label: "Nonmusical sound recording (i)" },
  { value: "j", label: "Musical sound recording (j)" },
  { value: "k", label: "Graphic (k)" },
  { value: "m", label: "Computer file (m)" },
];

const leaderBibLevelOptions: FixedFieldOption[] = [
  { value: "m", label: "Monograph/item (m)" },
  { value: "s", label: "Serial (s)" },
  { value: "a", label: "Monographic component part (a)" },
  { value: "c", label: "Collection (c)" },
  { value: "i", label: "Integrating resource (i)" },
];

const leaderEncodingOptions: FixedFieldOption[] = [
  { value: " ", label: "Full level (blank)" },
  { value: "1", label: "Full, material not examined (1)" },
  { value: "3", label: "Abbreviated level (3)" },
  { value: "4", label: "Core level (4)" },
  { value: "5", label: "Partial level (5)" },
  { value: "7", label: "Minimal level (7)" },
  { value: "8", label: "Prepublication level (8)" },
];

const leaderCatalogingFormOptions: FixedFieldOption[] = [
  { value: " ", label: "Non-ISBD (blank)" },
  { value: "a", label: "AACR2 (a)" },
  { value: "i", label: "ISBD punctuation included (i)" },
  { value: "n", label: "Non-ISBD punctuation omitted (n)" },
];

const fixed008DateTypeOptions: FixedFieldOption[] = [
  { value: "s", label: "Single known/probable date (s)" },
  { value: "m", label: "Multiple dates (m)" },
  { value: "r", label: "Reprint/reissue and original date (r)" },
  { value: "t", label: "Publication date + copyright date (t)" },
  { value: "c", label: "Continuing resource currently published (c)" },
  { value: "d", label: "Continuing resource ceased (d)" },
  { value: "n", label: "Dates unknown (n)" },
  { value: "q", label: "Questionable date (q)" },
];

const fixed008AudienceOptions: FixedFieldOption[] = [
  { value: " ", label: "Unknown/unspecified (blank)" },
  { value: "a", label: "Preschool (a)" },
  { value: "b", label: "Primary (b)" },
  { value: "c", label: "Pre-adolescent (c)" },
  { value: "d", label: "Adolescent (d)" },
  { value: "e", label: "Adult (e)" },
  { value: "g", label: "General (g)" },
  { value: "j", label: "Juvenile (j)" },
];

const fixed008FormOptions: FixedFieldOption[] = [
  { value: " ", label: "None of the following (blank)" },
  { value: "a", label: "Microfilm (a)" },
  { value: "b", label: "Microfiche (b)" },
  { value: "d", label: "Large print (d)" },
  { value: "f", label: "Braille (f)" },
  { value: "o", label: "Online (o)" },
  { value: "q", label: "Direct electronic (q)" },
  { value: "s", label: "Electronic (s)" },
];

const fixed008CatalogingSourceOptions: FixedFieldOption[] = [
  { value: " ", label: "National bibliographic agency (blank)" },
  { value: "c", label: "Cooperative cataloging program (c)" },
  { value: "d", label: "Other (d)" },
  { value: "u", label: "Unknown (u)" },
];

const fixed008LanguageOptions: FixedFieldOption[] = [
  { value: "eng", label: "English (eng)" },
  { value: "spa", label: "Spanish (spa)" },
  { value: "fre", label: "French (fre)" },
  { value: "ger", label: "German (ger)" },
  { value: "ita", label: "Italian (ita)" },
  { value: "por", label: "Portuguese (por)" },
  { value: "chi", label: "Chinese (chi)" },
  { value: "jpn", label: "Japanese (jpn)" },
  { value: "kor", label: "Korean (kor)" },
  { value: "ara", label: "Arabic (ara)" },
  { value: "rus", label: "Russian (rus)" },
];

function controlTagSort(a: string, b: string) {
  return Number.parseInt(a || "0", 10) - Number.parseInt(b || "0", 10);
}

function escapeXml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function parseMarcXml(marcXml: string): MarcRecord | null {
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(marcXml, "text/xml");
    const record = doc.querySelector("record");

    if (!record) return null;

    const leaderEl = record.querySelector("leader");
    const leader = leaderEl?.textContent || "00000nam a22000007i 4500";

    const fields: MarcField[] = [];

    // Control fields
    record.querySelectorAll("controlfield").forEach((cf) => {
      const tag = cf.getAttribute("tag") || "";
      fields.push({
        tag,
        ind1: " ",
        ind2: " ",
        subfields: [{ code: "", value: cf.textContent || "" }],
      });
    });

    // Data fields
    record.querySelectorAll("datafield").forEach((df) => {
      const tag = df.getAttribute("tag") || "";
      const ind1 = df.getAttribute("ind1") || " ";
      const ind2 = df.getAttribute("ind2") || " ";

      const subfields: { code: string; value: string }[] = [];
      df.querySelectorAll("subfield").forEach((sf) => {
        subfields.push({
          code: sf.getAttribute("code") || "",
          value: sf.textContent || "",
        });
      });

      fields.push({ tag, ind1, ind2, subfields });
    });

    fields.sort((a, b) => a.tag.localeCompare(b.tag));

    return { leader, fields };
  } catch (error) {
    clientLogger.error("Error parsing MARC XML:", error);
    return null;
  }
}

function buildMarcXml(record: MarcRecord): string {
  const parts: string[] = [];

  parts.push('<?xml version="1.0" encoding="UTF-8"?>');
  parts.push('<record xmlns="http://www.loc.gov/MARC21/slim">');
  parts.push(`<leader>${escapeXml(record.leader || "00000nam a22000007i 4500")}</leader>`);

  for (const field of record.fields) {
    const tag = (field.tag || "").trim();
    if (!tag) continue;

    const tagNum = Number.parseInt(tag, 10);

    if (!Number.isNaN(tagNum) && tagNum < 10) {
      const value = escapeXml(field.subfields?.[0]?.value || "");
      parts.push(`<controlfield tag="${escapeXml(tag)}">${value}</controlfield>`);
      continue;
    }

    const ind1 = (field.ind1 || " ").slice(0, 1);
    const ind2 = (field.ind2 || " ").slice(0, 1);

    const subfields = (field.subfields || [])
      .filter((sf) => sf.code && sf.code.trim())
      .map((sf) => {
        const code = escapeXml(sf.code.trim().slice(0, 1));
        const value = escapeXml(sf.value || "");
        return `<subfield code="${code}">${value}</subfield>`;
      })
      .join("");

    parts.push(
      `<datafield tag="${escapeXml(tag)}" ind1="${escapeXml(ind1)}" ind2="${escapeXml(ind2)}">${subfields}</datafield>`
    );
  }

  parts.push("</record>");

  return parts.join("");
}

function recordToLines(record: MarcRecord): string[] {
  const lines: string[] = [];

  const leader = String(record.leader || "").trim();
  if (leader) lines.push(`LDR ${leader}`);

  for (const field of record.fields || []) {
    const tag = String(field.tag || "").trim();
    if (!tag) continue;

    const tagNum = Number.parseInt(tag, 10);
    if (!Number.isNaN(tagNum) && tagNum < 10) {
      const value = String(field.subfields?.[0]?.value || "").trim();
      lines.push(`${tag} ${value}`.trim());
      continue;
    }

    const ind1 = String(field.ind1 || " ").slice(0, 1);
    const ind2 = String(field.ind2 || " ").slice(0, 1);
    const subs = (field.subfields || [])
      .filter((sf) => String(sf.code || "").trim())
      .map((sf) =>
        `$${String(sf.code || "")
          .trim()
          .slice(0, 1)} ${String(sf.value || "").trim()}`.trim()
      )
      .join(" ");

    lines.push(`${tag} ${ind1}${ind2} ${subs}`.trim());
  }

  return lines;
}

function toCounts(lines: string[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const line of lines) {
    map.set(line, (map.get(line) || 0) + 1);
  }
  return map;
}

function MarcEditorContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const recordId = searchParams.get("id");
  const compareIdParam = searchParams.get("compare");

  const [record, setRecord] = useState<MarcRecord>(defaultMarcRecord);
  const [bibInfo, setBibInfo] = useState<{ title: string; author: string } | null>(null);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [hasChanges, setHasChanges] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [loading, setLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [comparePanelOpen, setComparePanelOpen] = useState(false);
  const [compareDraft, setCompareDraft] = useState("");
  const [compareRecord, setCompareRecord] = useState<MarcRecord | null>(null);
  const [compareBibInfo, setCompareBibInfo] = useState<{ title: string; author: string } | null>(
    null
  );
  const [compareLoading, setCompareLoading] = useState(false);
  const [compareError, setCompareError] = useState<string | null>(null);
  const [diffOnly, setDiffOnly] = useState(false);

  const canAi = featureFlags.ai;
  const [aiPanelOpen, setAiPanelOpen] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiDraftId, setAiDraftId] = useState<string | null>(null);
  const [aiSuggestions, setAiSuggestions] = useState<AiCatalogingSuggestion[]>([]);
  const [aiDecisions, setAiDecisions] = useState<Record<string, "accepted" | "rejected">>({});
  const [aiExpandedDiffs, setAiExpandedDiffs] = useState<Record<string, boolean>>({});

  const [tasksPanelOpen, setTasksPanelOpen] = useState(false);
  const [tasksLoading, setTasksLoading] = useState(false);
  const [tasksError, setTasksError] = useState<string | null>(null);
  const [tasks, setTasks] = useState<RecordTask[]>([]);
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [newTaskBody, setNewTaskBody] = useState("");

  const [presence, setPresence] = useState<RecordPresence[]>([]);

  const baseLines = useMemo(() => recordToLines(record), [record]);
  const compareLines = useMemo(
    () => (compareRecord ? recordToLines(compareRecord) : []),
    [compareRecord]
  );
  const diff = useMemo(() => {
    const baseCounts = toCounts(baseLines);
    const compareCounts = toCounts(compareLines);
    const keys = new Set<string>([...baseCounts.keys(), ...compareCounts.keys()]);

    const order = new Map<string, number>();
    for (let i = 0; i < baseLines.length; i += 1) {
      const line = baseLines[i];
      if (!order.has(line!)) order.set(line!, i);
    }

    let nextOrder = baseLines.length;
    for (const line of compareLines) {
      if (!order.has(line)) order.set(line, nextOrder++);
    }

    const rows = [...keys]
      .sort((a, b) => (order.get(a) ?? 0) - (order.get(b) ?? 0))
      .map((line) => {
        const baseCount = baseCounts.get(line) || 0;
        const compareCount = compareCounts.get(line) || 0;
        if (baseCount === compareCount) {
          return { line, kind: "same" as const, baseCount, compareCount, delta: 0 };
        }
        if (compareCount > baseCount) {
          return {
            line,
            kind: "added" as const,
            baseCount,
            compareCount,
            delta: compareCount - baseCount,
          };
        }
        return {
          line,
          kind: "removed" as const,
          baseCount,
          compareCount,
          delta: baseCount - compareCount,
        };
      });

    const added = rows.filter((r) => r.kind === "added").reduce((sum, r) => sum + r.delta, 0);
    const removed = rows.filter((r) => r.kind === "removed").reduce((sum, r) => sum + r.delta, 0);

    return {
      rows,
      added,
      removed,
      hasCompare: Boolean(compareRecord),
    };
  }, [baseLines, compareLines, compareRecord]);

  const extractFirst = (tag: string, code: string): string | null => {
    const f = record.fields.find((x) => String(x.tag || "").trim() === tag);
    if (!f) return null;
    const sub = (f.subfields || []).find((s) => String(s.code || "").trim() === code);
    const v = sub ? String(sub.value || "").trim() : "";
    return v ? v : null;
  };

  const applySuggestionToRecord = (base: MarcRecord, s: AiCatalogingSuggestion): MarcRecord => {
    const suggestedValue = String(s?.suggestedValue || "").trim();
    if (!suggestedValue) return base;

    const next: MarcRecord = {
      ...base,
      fields: base.fields.map((f) => ({ ...f, subfields: [...f.subfields] })),
    };

    const addFieldSorted = (field: MarcField) => {
      next.fields = [...next.fields, field].sort((a, b) => a.tag.localeCompare(b.tag));
    };

    if (s.type === "subject") {
      addFieldSorted({
        tag: "650",
        ind1: " ",
        ind2: "0",
        subfields: [{ code: "a", value: suggestedValue }],
      });
    } else if (s.type === "summary") {
      const idx = next.fields.findIndex((f) => f.tag === "520");
      if (idx >= 0) {
        const f = next.fields[idx];
        const sfIdx = f!.subfields.findIndex((sf) => sf.code === "a");
        if (sfIdx >= 0) f!.subfields[sfIdx] = { code: "a", value: suggestedValue };
        else f!.subfields.push({ code: "a", value: suggestedValue });
      } else {
        addFieldSorted({
          tag: "520",
          ind1: " ",
          ind2: " ",
          subfields: [{ code: "a", value: suggestedValue }],
        });
      }
    } else if (s.type === "series") {
      const idx = next.fields.findIndex((f) => f.tag === "490");
      if (idx >= 0) {
        const f = next.fields[idx];
        const sfIdx = f!.subfields.findIndex((sf) => sf.code === "a");
        if (sfIdx >= 0) f!.subfields[sfIdx] = { code: "a", value: suggestedValue };
        else f!.subfields.push({ code: "a", value: suggestedValue });
      } else {
        addFieldSorted({
          tag: "490",
          ind1: "1",
          ind2: " ",
          subfields: [{ code: "a", value: suggestedValue }],
        });
      }
    }

    return next;
  };

  const applySuggestion = (s: AiCatalogingSuggestion) => {
    const suggestedValue = String(s?.suggestedValue || "").trim();
    if (!suggestedValue) return;
    setRecord((prev) => applySuggestionToRecord(prev, s));
    setHasChanges(true);
  };

  const decideSuggestion = async (
    decision: "accepted" | "rejected",
    suggestionId: string,
    reason?: string
  ) => {
    if (!aiDraftId) return;
    try {
      await fetchWithAuth(`/api/ai/drafts/${aiDraftId}/decision`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision, suggestionId, reason: reason || undefined }),
      });
    } catch (e) {
      // Best-effort; do not block cataloging on audit decision.
      clientLogger.warn("AI draft decision failed", e);
    }
  };

  const runAi = async () => {
    if (!canAi) return;
    setAiPanelOpen(true);
    setAiLoading(true);
    setAiError(null);
    try {
      const marcXml = buildMarcXml(record);
      const title = extractFirst("245", "a") || undefined;
      const author = extractFirst("100", "a") || extractFirst("110", "a") || undefined;
      const isbn = extractFirst("020", "a") || undefined;
      const recordIdNum = recordId && /^\d+$/.test(recordId) ? parseInt(recordId, 10) : undefined;

      const res = await fetchWithAuth("/api/ai/cataloging-suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recordId: recordIdNum,
          title,
          author,
          isbn,
          marcXml,
          allowExternalLookups: false,
        }),
      });
      const json = await res.json();
      if (!res.ok || json.ok === false) throw new Error(json.error || "AI request failed");
      setAiDraftId(json.draftId || null);
      setAiSuggestions(Array.isArray(json.response?.suggestions) ? json.response.suggestions : []);
      setAiDecisions({});
      setAiExpandedDiffs({});
    } catch (e) {
      setAiError(e instanceof Error ? e.message : String(e));
      setAiDraftId(null);
      setAiSuggestions([]);
      setAiDecisions({});
      setAiExpandedDiffs({});
    } finally {
      setAiLoading(false);
    }
  };

  const recordIdNum = recordId && /^\d+$/.test(recordId) ? parseInt(recordId, 10) : 0;

  const loadPresence = useCallback(async () => {
    if (!recordIdNum) return;
    try {
      const res = await fetchWithAuth(
        `/api/collaboration/presence?recordType=bib&recordId=${recordIdNum}`
      );
      const json = await res.json();
      if (!res.ok || json.ok === false) return;
      setPresence(Array.isArray(json.presence) ? json.presence : []);
    } catch {
      // Best-effort.
    }
  }, [recordIdNum]);

  const heartbeatPresence = useCallback(
    async (activity: "viewing" | "editing") => {
      if (!recordIdNum) return;
      try {
        await fetchWithAuth("/api/collaboration/presence", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ recordType: "bib", recordId: recordIdNum, activity }),
        });
      } catch {
        // Best-effort.
      }
    },
    [recordIdNum]
  );

  const loadTasks = async () => {
    if (!recordIdNum) return;
    setTasksLoading(true);
    setTasksError(null);
    try {
      const res = await fetchWithAuth(
        `/api/collaboration/tasks?recordType=bib&recordId=${recordIdNum}`
      );
      const json = await res.json();
      if (!res.ok || json.ok === false) throw new Error(json.error || "Failed to load tasks");
      setTasks(Array.isArray(json.tasks) ? json.tasks : []);
    } catch (e) {
      setTasksError(e instanceof Error ? e.message : String(e));
      setTasks([]);
    } finally {
      setTasksLoading(false);
    }
  };

  const createTask = async () => {
    if (!recordIdNum) return;
    const title = newTaskTitle.trim();
    if (!title) return;
    try {
      const res = await fetchWithAuth("/api/collaboration/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recordType: "bib",
          recordId: recordIdNum,
          title,
          body: newTaskBody.trim() || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok || json.ok === false) throw new Error(json.error || "Failed to create task");
      setNewTaskTitle("");
      setNewTaskBody("");
      await loadTasks();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    }
  };

  const setTaskStatus = async (taskId: number, status: "open" | "done" | "canceled") => {
    try {
      const res = await fetchWithAuth("/api/collaboration/tasks", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: taskId, status }),
      });
      const json = await res.json();
      if (!res.ok || json.ok === false) throw new Error(json.error || "Failed to update task");
      await loadTasks();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    }
  };

  useEffect(() => {
    if (!recordId) return;
    void loadRecord(recordId);
  }, [recordId]);

  useEffect(() => {
    if (!recordIdNum) return;
    void heartbeatPresence("editing");
    void loadPresence();
    const t = window.setInterval(() => {
      void heartbeatPresence("editing");
      void loadPresence();
    }, 20000);
    return () => window.clearInterval(t);
  }, [heartbeatPresence, loadPresence, recordIdNum]);

  useEffect(() => {
    const id = compareIdParam && /^\d+$/.test(compareIdParam) ? compareIdParam : "";
    if (id) {
      setComparePanelOpen(true);
      setCompareDraft(id);
      void loadCompareRecord(id);
      return;
    }

    setCompareRecord(null);
    setCompareBibInfo(null);
    setCompareError(null);
  }, [compareIdParam]);

  const loadRecord = async (id: string) => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetchWithAuth(`/api/evergreen/catalog?action=record&id=${id}`);
      const data = await response.json();

      if (data.ok && data.record) {
        setBibInfo({ title: data.record.title, author: data.record.author });

        if (data.record.marc_xml) {
          const parsed = parseMarcXml(data.record.marc_xml);
          if (parsed) {
            setRecord(parsed);
            setHasChanges(false);
            setValidationErrors([]);
          } else {
            setError("Failed to parse MARC record");
          }
        } else {
          setError("No MARC data available for this record");
        }
      } else {
        setError(data.error || "Failed to load record");
      }
    } catch {
      setError("Failed to connect to catalog service");
    } finally {
      setLoading(false);
    }
  };

  const loadCompareRecord = async (id: string) => {
    setCompareLoading(true);
    setCompareError(null);
    setCompareRecord(null);
    setCompareBibInfo(null);

    try {
      const response = await fetchWithAuth(
        `/api/evergreen/catalog?action=record&id=${encodeURIComponent(id)}`
      );
      const data = await response.json();

      if (!data.ok || !data.record) {
        throw new Error(data.error || "Failed to load compare record");
      }

      setCompareBibInfo({ title: data.record.title, author: data.record.author });

      if (!data.record.marc_xml) {
        throw new Error("No MARC data available for compare record");
      }

      const parsed = parseMarcXml(data.record.marc_xml);
      if (!parsed) {
        throw new Error("Failed to parse compare MARC record");
      }

      setCompareRecord(parsed);
    } catch (e) {
      setCompareError(e instanceof Error ? e.message : String(e));
    } finally {
      setCompareLoading(false);
    }
  };

  const updateCompareInUrl = (nextCompare: string | null) => {
    const params = new URLSearchParams(searchParams.toString());
    if (nextCompare && nextCompare.trim()) {
      params.set("compare", nextCompare.trim());
    } else {
      params.delete("compare");
    }
    router.replace(`/staff/cataloging/marc-editor?${params.toString()}`);
  };

  const closeCompare = () => {
    setComparePanelOpen(false);
    setCompareDraft("");
    setCompareRecord(null);
    setCompareBibInfo(null);
    setCompareError(null);
    updateCompareInUrl(null);
  };

  const clearCompare = () => {
    setCompareDraft("");
    setCompareRecord(null);
    setCompareBibInfo(null);
    setCompareError(null);
    updateCompareInUrl(null);
  };

  const canLoadCompare =
    Boolean(recordId) && /^\d+$/.test(compareDraft.trim()) && compareDraft.trim() !== recordId;

  const getControlFieldValue = useCallback(
    (tag: string) => {
      const field = record.fields.find((f) => f.tag === tag);
      return field?.subfields?.[0]?.value || "";
    },
    [record.fields]
  );

  const updateControlField = useCallback(
    (tag: string, value: string) => {
      const nextFields = [...record.fields];
      const index = nextFields.findIndex((f) => f.tag === tag);
      if (index >= 0) {
        nextFields[index] = {
          ...nextFields[index],
          tag,
          ind1: " ",
          ind2: " ",
          subfields: [{ code: "", value }],
        };
      } else {
        nextFields.push({
          tag,
          ind1: " ",
          ind2: " ",
          subfields: [{ code: "", value }],
        });
      }

      nextFields.sort((a, b) => controlTagSort(a.tag, b.tag));
      setRecord({ ...record, fields: nextFields });
      setHasChanges(true);
    },
    [record, setRecord]
  );

  const currentLeader = String(record.leader || "")
    .padEnd(24, " ")
    .slice(0, 24);
  const field008 = String(getControlFieldValue("008") || "")
    .padEnd(40, " ")
    .slice(0, 40);

  const updateLeaderPos = (position: number, value: string) => {
    const next = currentLeader.split("");
    next[position] = (value || " ").slice(0, 1);
    setRecord({ ...record, leader: next.join("") });
    setHasChanges(true);
  };

  const update008Pos = (position: number, value: string) => {
    const next = field008.split("");
    next[position] = (value || " ").slice(0, 1);
    updateControlField("008", next.join(""));
  };

  const update008Range = (start: number, endExclusive: number, value: string) => {
    const next = field008.split("");
    const width = endExclusive - start;
    const normalized = String(value || "")
      .slice(0, width)
      .padEnd(width, " ");
    for (let i = 0; i < width; i += 1) {
      next[start + i] = normalized[i]!;
    }
    updateControlField("008", next.join(""));
  };

  const getLeaderPos = (position: number) => currentLeader.charAt(position) || " ";
  const get008Pos = (position: number) => field008.charAt(position) || " ";
  const get008Range = (start: number, endExclusive: number) =>
    field008.slice(start, endExclusive).trimEnd();

  const updateField = (index: number, updates: Partial<MarcField>) => {
    const newFields = [...record.fields];
    newFields[index] = { ...newFields[index], ...updates }! as MarcField;
    setRecord({ ...record, fields: newFields });
    setHasChanges(true);
  };

  const updateSubfield = (
    fieldIndex: number,
    subfieldIndex: number,
    code: string,
    value: string
  ) => {
    const newFields = [...record.fields];
    const newSubfields = [...newFields[fieldIndex]!.subfields];
    newSubfields[subfieldIndex] = { code, value };
    newFields[fieldIndex] = { ...newFields[fieldIndex], subfields: newSubfields }! as MarcField;
    setRecord({ ...record, fields: newFields });
    setHasChanges(true);
  };

  const addSubfield = (fieldIndex: number) => {
    const newFields = [...record.fields];
    newFields[fieldIndex]!.subfields.push({ code: "", value: "" });
    setRecord({ ...record, fields: newFields });
    setHasChanges(true);
  };

  const addField = (tag: string = "") => {
    const newField: MarcField = {
      tag,
      ind1: " ",
      ind2: " ",
      subfields: [{ code: "a", value: "" }],
    };
    setRecord({
      ...record,
      fields: [...record.fields, newField].sort((a, b) => a.tag.localeCompare(b.tag)),
    });
    setHasChanges(true);
  };

  const removeField = (index: number) => {
    const newFields = [...record.fields];
    newFields.splice(index, 1);
    setRecord({ ...record, fields: newFields });
    setHasChanges(true);
  };

  const validateRecord = () => {
    const errors: string[] = [];
    const has245 = record.fields.some(
      (f) => f.tag === "245" && f.subfields.some((s) => s.code === "a" && s.value.trim())
    );
    if (!has245) errors.push("Field 245 (Title) is required");

    const normalizedLeader = String(record.leader || "");
    if (normalizedLeader.length !== 24) {
      errors.push(`Leader must be 24 characters (currently ${normalizedLeader.length})`);
    }

    const fixed008 = getControlFieldValue("008");
    if (fixed008 && fixed008.length !== 40) {
      errors.push(`Field 008 must be 40 characters when present (currently ${fixed008.length})`);
    }

    for (const field of record.fields) {
      if (!/^\d{3}$/.test(String(field.tag || ""))) {
        errors.push(`Field tag "${field.tag || "blank"}" must be a 3-digit numeric tag`);
        continue;
      }

      const tagNum = Number.parseInt(field.tag, 10);
      if (tagNum >= 10) {
        if (String(field.ind1 || "").length !== 1 || String(field.ind2 || "").length !== 1) {
          errors.push(`Field ${field.tag} indicators must be exactly 1 character each`);
        }

        const rule = indicatorRules[field.tag];
        if (rule) {
          const ind1 = String(field.ind1 || " ").slice(0, 1) || " ";
          const ind2 = String(field.ind2 || " ").slice(0, 1) || " ";
          if (!rule.ind1.includes(ind1)) {
            errors.push(
              `Field ${field.tag} ind1 "${indicatorLabel(ind1)}" is invalid (allowed: ${rule.ind1
                .map(indicatorLabel)
                .join(", ")})`
            );
          }
          if (!rule.ind2.includes(ind2)) {
            errors.push(
              `Field ${field.tag} ind2 "${indicatorLabel(ind2)}" is invalid (allowed: ${rule.ind2
                .map(indicatorLabel)
                .join(", ")})`
            );
          }
        }
      }
    }

    setValidationErrors(errors);
    return errors.length === 0;
  };

  const saveRecord = async () => {
    if (!validateRecord()) return;

    setIsSaving(true);
    setError(null);

    try {
      const marcxml = buildMarcXml(record);

      if (recordId) {
        const res = await fetchWithAuth("/api/evergreen/marc", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ recordId: Number(recordId), marcxml }),
        });
        const data = await res.json();
        if (!res.ok || data.ok === false) {
          throw new Error(data.error || "Save failed");
        }
        toast.success("Record saved");
        setHasChanges(false);
        return;
      }

      const res = await fetchWithAuth("/api/evergreen/marc", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ marcxml, source: "System Local" }),
      });
      const data = await res.json();
      if (!res.ok || data.ok === false) {
        throw new Error(data.error || "Create failed");
      }
      const newId = data.record?.id;
      toast.success("Record created", { description: newId ? `Record ${newId}` : undefined });
      if (newId) {
        router.push(`/staff/cataloging/marc-editor?id=${newId}`);
      }
      setHasChanges(false);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Save failed";
      toast.error(message);
      setError(message);
    } finally {
      setIsSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <PageContainer>
      <PageHeader
        title="MARC Editor"
        subtitle="Edit bibliographic records with real Evergreen saves."
        breadcrumbs={[{ label: "Cataloging", href: "/staff/cataloging" }, { label: "MARC Editor" }]}
      />
      <PageContent className="p-0">
        <div className="h-full flex flex-col -m-6">
          <div className="bg-muted/50 border-b px-4 py-2 flex items-center gap-2">
            <Button size="sm" onClick={saveRecord} disabled={!hasChanges || isSaving}>
              {isSaving ? (
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
              ) : (
                <Save className="h-4 w-4 mr-1" />
              )}
              Save Record
            </Button>
            <Button size="sm" variant="outline" onClick={validateRecord}>
              <Check className="h-4 w-4 mr-1" />
              Validate
            </Button>
            <div className="border-l h-6 mx-2" />
            <Button size="sm" variant="outline" onClick={() => addField()}>
              <Plus className="h-4 w-4 mr-1" />
              Add Field
            </Button>
            <div className="flex-1" />
            {presence.length > 0 && (
              <Badge variant="secondary" className="hidden sm:inline-flex items-center gap-2">
                <Users className="h-3.5 w-3.5" />
                {(() => {
                  const names = presence
                    .map((p) => p.actorName || "Staff")
                    .slice(0, 2)
                    .join(", ");
                  const extra = presence.length > 2 ? ` +${presence.length - 2}` : "";
                  const verb = presence.some((p) => p.activity === "editing")
                    ? "editing"
                    : "viewing";
                  return `${names}${extra} ${verb}`;
                })()}
              </Badge>
            )}
            <Button
              size="sm"
              variant={comparePanelOpen ? "default" : "outline"}
              onClick={() => {
                if (!recordId) return;
                if (comparePanelOpen) {
                  closeCompare();
                  return;
                }
                setComparePanelOpen(true);
                setCompareDraft(
                  compareIdParam && /^\d+$/.test(compareIdParam) ? compareIdParam : ""
                );
              }}
              title="Split-screen compare"
              disabled={!recordId}
            >
              <Columns2 className="h-4 w-4 mr-1" />
              Compare
            </Button>
            {canAi && (
              <Button
                size="sm"
                variant={aiPanelOpen ? "default" : "outline"}
                onClick={() => {
                  if (aiPanelOpen) {
                    setAiPanelOpen(false);
                    return;
                  }
                  void runAi();
                }}
                title="AI cataloging suggestions (draft-only)"
              >
                <Sparkles className="h-4 w-4 mr-1" />
                AI
              </Button>
            )}
            <Button
              size="sm"
              variant={tasksPanelOpen ? "default" : "outline"}
              onClick={() => {
                if (tasksPanelOpen) {
                  setTasksPanelOpen(false);
                  return;
                }
                setTasksPanelOpen(true);
                void loadTasks();
              }}
              title="Record tasks/notes (draft-only)"
              disabled={!recordIdNum}
            >
              <ClipboardList className="h-4 w-4 mr-1" />
              Tasks
            </Button>
            {comparePanelOpen && (
              <Button
                size="sm"
                variant={diffOnly ? "default" : "outline"}
                onClick={() => setDiffOnly((v) => !v)}
                title="Toggle differences only"
              >
                Diff only
              </Button>
            )}
            <Button size="sm" variant="ghost" onClick={() => setShowHelp(!showHelp)}>
              <HelpCircle className="h-4 w-4" />
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link href="/staff/cataloging">Close</Link>
            </Button>
          </div>

          {error && (
            <div className="px-4 py-2 bg-red-50 border-b">
              <div className="flex items-center gap-2 text-sm text-red-600">
                <AlertTriangle className="h-4 w-4" />
                {error}
              </div>
            </div>
          )}

          {validationErrors.length > 0 && (
            <div className="px-4 py-2 bg-red-50 border-b">
              {validationErrors.map((err, idx) => (
                <div key={idx} className="flex items-center gap-2 text-sm text-red-600">
                  <AlertTriangle className="h-4 w-4" />
                  {err}
                </div>
              ))}
            </div>
          )}

          {presence.some((p) => p.activity === "editing") && (
            <div className="px-4 py-2 border-b bg-background">
              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  {(() => {
                    const editing = presence.filter((p) => p.activity === "editing");
                    const names = editing
                      .map((p) => p.actorName || "Staff")
                      .slice(0, 2)
                      .join(", ");
                    const extra = editing.length > 2 ? ` +${editing.length - 2}` : "";
                    return `${names}${extra} is editing this record. Changes are not locked; review diffs before saving to avoid overwrites.`;
                  })()}
                </AlertDescription>
              </Alert>
            </div>
          )}

          <div className="flex-1 overflow-auto p-4">
            <div className="flex flex-col lg:flex-row gap-4">
              <Card className="flex-1 min-w-0">
                <CardHeader className="py-3">
                  <CardTitle className="text-base flex items-center justify-between">
                    <span>
                      {recordId ? (
                        <div>
                          <div>Editing Record #{recordId}</div>
                          {bibInfo && (
                            <div className="text-sm font-normal text-muted-foreground">
                              {bibInfo.title}
                            </div>
                          )}
                        </div>
                      ) : (
                        "New Bibliographic Record"
                      )}
                    </span>
                    {hasChanges && <Badge variant="outline">Unsaved Changes</Badge>}
                  </CardTitle>
                </CardHeader>

                <CardContent className="space-y-4">
                  <div className="space-y-3 rounded-lg border bg-muted/20 p-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">Fixed Fields</span>
                      <Badge variant="outline">Leader + 008</Badge>
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-muted-foreground">
                          Leader (LDR)
                        </span>
                        <Badge variant="outline">24 chars</Badge>
                      </div>
                      <Input
                        value={currentLeader}
                        onChange={(e) => {
                          const next = e.target.value.slice(0, 24).padEnd(24, " ");
                          setRecord({ ...record, leader: next });
                          setHasChanges(true);
                        }}
                        className="font-mono text-sm"
                        maxLength={24}
                      />

                      <div className="grid gap-2 md:grid-cols-2">
                        <div className="space-y-1">
                          <div className="text-xs text-muted-foreground">05 Record Status</div>
                          <Select
                            value={getLeaderPos(5) || " "}
                            onValueChange={(value) => updateLeaderPos(5, value)}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {leaderRecordStatusOptions.map((option) => (
                                <SelectItem key={`ldr-05-${option.value}`} value={option.value}>
                                  {option.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1">
                          <div className="text-xs text-muted-foreground">06 Type of Record</div>
                          <Select
                            value={getLeaderPos(6) || "a"}
                            onValueChange={(value) => updateLeaderPos(6, value)}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {leaderTypeOptions.map((option) => (
                                <SelectItem key={`ldr-06-${option.value}`} value={option.value}>
                                  {option.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1">
                          <div className="text-xs text-muted-foreground">
                            07 Bibliographic Level
                          </div>
                          <Select
                            value={getLeaderPos(7) || "m"}
                            onValueChange={(value) => updateLeaderPos(7, value)}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {leaderBibLevelOptions.map((option) => (
                                <SelectItem key={`ldr-07-${option.value}`} value={option.value}>
                                  {option.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1">
                          <div className="text-xs text-muted-foreground">17 Encoding Level</div>
                          <Select
                            value={getLeaderPos(17) || " "}
                            onValueChange={(value) => updateLeaderPos(17, value)}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {leaderEncodingOptions.map((option) => (
                                <SelectItem key={`ldr-17-${option.value}`} value={option.value}>
                                  {option.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1 md:col-span-2">
                          <div className="text-xs text-muted-foreground">
                            18 Descriptive Cataloging Form
                          </div>
                          <Select
                            value={getLeaderPos(18) || " "}
                            onValueChange={(value) => updateLeaderPos(18, value)}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {leaderCatalogingFormOptions.map((option) => (
                                <SelectItem key={`ldr-18-${option.value}`} value={option.value}>
                                  {option.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-2 border-t pt-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-muted-foreground">
                          008 Fixed-Length Data
                        </span>
                        <Badge variant="outline">40 chars</Badge>
                      </div>
                      <Input
                        value={field008}
                        onChange={(e) => {
                          updateControlField("008", e.target.value.slice(0, 40).padEnd(40, " "));
                        }}
                        className="font-mono text-sm"
                        maxLength={40}
                      />

                      <div className="grid gap-2 md:grid-cols-2">
                        <div className="space-y-1">
                          <div className="text-xs text-muted-foreground">
                            00-05 Date Entered (YYMMDD)
                          </div>
                          <Input
                            value={get008Range(0, 6)}
                            onChange={(e) =>
                              update008Range(0, 6, e.target.value.replace(/[^0-9]/g, ""))
                            }
                            className="font-mono text-sm"
                            maxLength={6}
                            placeholder="YYMMDD"
                          />
                        </div>
                        <div className="space-y-1">
                          <div className="text-xs text-muted-foreground">06 Date Type</div>
                          <Select
                            value={get008Pos(6) || "s"}
                            onValueChange={(value) => update008Pos(6, value)}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {fixed008DateTypeOptions.map((option) => (
                                <SelectItem key={`008-06-${option.value}`} value={option.value}>
                                  {option.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1">
                          <div className="text-xs text-muted-foreground">07-10 Date 1</div>
                          <Input
                            value={get008Range(7, 11)}
                            onChange={(e) =>
                              update008Range(7, 11, e.target.value.replace(/[^0-9]/g, ""))
                            }
                            className="font-mono text-sm"
                            maxLength={4}
                            placeholder="YYYY"
                          />
                        </div>
                        <div className="space-y-1">
                          <div className="text-xs text-muted-foreground">11-14 Date 2</div>
                          <Input
                            value={get008Range(11, 15)}
                            onChange={(e) =>
                              update008Range(11, 15, e.target.value.replace(/[^0-9]/g, ""))
                            }
                            className="font-mono text-sm"
                            maxLength={4}
                            placeholder="YYYY"
                          />
                        </div>
                        <div className="space-y-1">
                          <div className="text-xs text-muted-foreground">15-17 Place</div>
                          <Input
                            value={get008Range(15, 18)}
                            onChange={(e) =>
                              update008Range(
                                15,
                                18,
                                e.target.value.toLowerCase().replace(/[^a-z#]/g, "")
                              )
                            }
                            className="font-mono text-sm"
                            maxLength={3}
                            placeholder="xxu"
                          />
                        </div>
                        <div className="space-y-1">
                          <div className="text-xs text-muted-foreground">22 Target Audience</div>
                          <Select
                            value={get008Pos(22) || " "}
                            onValueChange={(value) => update008Pos(22, value)}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {fixed008AudienceOptions.map((option) => (
                                <SelectItem
                                  key={`008-22-${option.value || "blank"}`}
                                  value={option.value}
                                >
                                  {option.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1">
                          <div className="text-xs text-muted-foreground">23 Form of Item</div>
                          <Select
                            value={get008Pos(23) || " "}
                            onValueChange={(value) => update008Pos(23, value)}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {fixed008FormOptions.map((option) => (
                                <SelectItem
                                  key={`008-23-${option.value || "blank"}`}
                                  value={option.value}
                                >
                                  {option.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1">
                          <div className="text-xs text-muted-foreground">35-37 Language</div>
                          <Select
                            value={get008Range(35, 38) || "eng"}
                            onValueChange={(value) => update008Range(35, 38, value.toLowerCase())}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {fixed008LanguageOptions.map((option) => (
                                <SelectItem key={`008-lang-${option.value}`} value={option.value}>
                                  {option.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1">
                          <div className="text-xs text-muted-foreground">39 Cataloging Source</div>
                          <Select
                            value={get008Pos(39) || "d"}
                            onValueChange={(value) => update008Pos(39, value)}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {fixed008CatalogingSourceOptions.map((option) => (
                                <SelectItem
                                  key={`008-39-${option.value || "blank"}`}
                                  value={option.value}
                                >
                                  {option.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    {record.fields.map((field, fieldIndex) => (
                      <div key={fieldIndex} className="border rounded-lg p-3">
                        <div className="flex items-center gap-2 mb-2">
                          <Input
                            value={field.tag}
                            onChange={(e) => updateField(fieldIndex, { tag: e.target.value })}
                            className="w-16 font-mono text-sm font-bold"
                            maxLength={3}
                            placeholder="Tag"
                            list="marc-tag-suggestions"
                          />

                          {Number.parseInt(field.tag) >= 10 && (
                            <>
                              <Input
                                value={field.ind1}
                                onChange={(e) =>
                                  updateField(fieldIndex, { ind1: e.target.value || " " })
                                }
                                className="w-10 font-mono text-sm text-center"
                                maxLength={1}
                                placeholder="_"
                              />
                              <Input
                                value={field.ind2}
                                onChange={(e) =>
                                  updateField(fieldIndex, { ind2: e.target.value || " " })
                                }
                                className="w-10 font-mono text-sm text-center"
                                maxLength={1}
                                placeholder="_"
                              />
                            </>
                          )}

                          <span className="flex-1 text-sm text-muted-foreground truncate">
                            {marcFieldDescriptions[field.tag] || "Unknown field"}
                          </span>

                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-8 w-8 p-0 text-red-600"
                            onClick={() => removeField(fieldIndex)}
                            title="Delete field"
                          >
                            <Trash2 className="h-4 w-4" />
                            <span className="sr-only">Delete field</span>
                          </Button>
                        </div>
                        {(() => {
                          const rule = indicatorRules[field.tag];
                          if (!rule || Number.parseInt(field.tag, 10) < 10) return null;
                          return (
                            <div className="mb-2 text-[11px] text-muted-foreground">
                              Allowed indicators: ind1 [{rule.ind1.map(indicatorLabel).join(", ")}], ind2 [{" "}
                              {rule.ind2.map(indicatorLabel).join(", ")}]
                            </div>
                          );
                        })()}

                        {Number.parseInt(field.tag) < 10 ? (
                          <Input
                            value={field.subfields[0]?.value || ""}
                            onChange={(e) => updateSubfield(fieldIndex, 0, "", e.target.value)}
                            className="font-mono text-sm"
                            placeholder="Field value"
                          />
                        ) : (
                          <div className="space-y-1 ml-4">
                            {field.subfields.map((subfield, subfieldIndex) => (
                              <div key={subfieldIndex} className="flex items-center gap-2">
                                <span className="text-muted-foreground">$</span>
                                <Input
                                  value={subfield.code}
                                  onChange={(e) =>
                                    updateSubfield(
                                      fieldIndex,
                                      subfieldIndex,
                                      e.target.value,
                                      subfield.value
                                    )
                                  }
                                  className="w-10 font-mono text-sm"
                                  maxLength={1}
                                  placeholder="a"
                                />
                                <Input
                                  value={subfield.value}
                                  onChange={(e) =>
                                    updateSubfield(
                                      fieldIndex,
                                      subfieldIndex,
                                      subfield.code,
                                      e.target.value
                                    )
                                  }
                                  className="flex-1 font-mono text-sm"
                                  placeholder="Subfield value"
                                />
                              </div>
                            ))}
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => addSubfield(fieldIndex)}
                              className="text-xs"
                            >
                              <Plus className="h-3 w-3 mr-1" />
                              Add Subfield
                            </Button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>

                  <div className="flex flex-wrap gap-2 pt-4 border-t">
                    <span className="text-sm text-muted-foreground mr-2">Quick Add:</span>
                    {[
                      "020",
                      "050",
                      "082",
                      "100",
                      "245",
                      "264",
                      "300",
                      "500",
                      "650",
                      "700",
                      "856",
                    ].map((tag) => (
                      <Button key={tag} size="sm" variant="outline" onClick={() => addField(tag)}>
                        {tag}
                      </Button>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {(comparePanelOpen || showHelp || aiPanelOpen || tasksPanelOpen) && (
                <div className="w-full lg:w-[420px] shrink-0 space-y-4">
                  {aiPanelOpen && (
                    <Card>
                      <CardHeader className="py-3">
                        <CardTitle className="text-base flex items-center justify-between">
                          <span className="inline-flex items-center gap-2">
                            <Sparkles className="h-4 w-4" />
                            AI suggestions
                          </span>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8"
                            onClick={() => setAiPanelOpen(false)}
                            title="Close AI panel" aria-label="Close AI panel"
                          >
                            <X className="h-4 w-4" />
                            <span className="sr-only">Close AI panel</span>
                          </Button>
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        <div className="text-sm text-muted-foreground">
                          Draft-only suggestions. Nothing is applied until you accept a suggestion,
                          and nothing is saved until you click Save Record.
                        </div>

                        <div className="flex items-center gap-2">
                          <Button size="sm" onClick={() => void runAi()} disabled={aiLoading}>
                            {aiLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                            Generate suggestions
                          </Button>
                          {aiDraftId ? (
                            <Badge variant="outline">Draft {aiDraftId.slice(0, 8)}</Badge>
                          ) : null}
                        </div>

                        {aiError && (
                          <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                            {aiError}
                          </div>
                        )}

                        {!aiLoading && aiSuggestions.length === 0 && !aiError ? (
                          <div className="rounded-lg border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
                            No suggestions yet.
                          </div>
                        ) : null}

                        <div className="space-y-3">
                          {aiSuggestions.map((s) => {
                            const decision = aiDecisions[s.id];
                            const preview = applySuggestionToRecord(record, s);
                            const previewDiff = (() => {
                              const before = toCounts(recordToLines(record));
                              const after = toCounts(recordToLines(preview));
                              const keys = new Set<string>([...before.keys(), ...after.keys()]);
                              const rows = [...keys]
                                .map((line) => {
                                  const b = before.get(line) || 0;
                                  const a = after.get(line) || 0;
                                  if (a === b) return null;
                                  if (a > b) return { line, kind: "added" as const };
                                  return { line, kind: "removed" as const };
                                })
                                .filter(Boolean) as Array<{
                                line: string;
                                kind: "added" | "removed";
                              }>;

                              const added = rows.filter((r) => r.kind === "added");
                              const removed = rows.filter((r) => r.kind === "removed");
                              return { added, removed };
                            })();

                            const showDiff = Boolean(aiExpandedDiffs[s.id]);
                            const canAccept = !decision || decision !== "accepted";
                            const canReject = !decision || decision !== "rejected";

                            return (
                              <div
                                key={s.id}
                                className="rounded-lg border bg-background p-3 space-y-2"
                              >
                                <div className="flex items-start justify-between gap-2">
                                  <div className="min-w-0">
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <Badge variant="outline">{s.type}</Badge>
                                      <Badge variant="outline">
                                        {Math.round((Number(s.confidence || 0) || 0) * 100)}%
                                      </Badge>
                                      {decision ? (
                                        <Badge
                                          className={
                                            decision === "accepted"
                                              ? "bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/10"
                                              : "bg-rose-500/10 text-rose-700 hover:bg-rose-500/10"
                                          }
                                        >
                                          {decision}
                                        </Badge>
                                      ) : null}
                                    </div>
                                    <div className="text-sm font-medium mt-1">{s.message}</div>
                                  </div>
                                </div>

                                <div className="rounded-md border bg-muted/30 px-2 py-2 font-mono text-xs whitespace-pre-wrap">
                                  {s.suggestedValue}
                                </div>

                                {Array.isArray(s.provenance) && s.provenance.length > 0 ? (
                                  <div className="text-xs text-muted-foreground space-y-1">
                                    <div className="font-medium text-foreground/80">Provenance</div>
                                    <ul className="list-disc pl-5">
                                      {s.provenance.slice(0, 5).map((p, idx) => (
                                        <li key={idx}>{p}</li>
                                      ))}
                                    </ul>
                                  </div>
                                ) : null}

                                <div className="flex items-center justify-between gap-2">
                                  <div className="flex items-center gap-2">
                                    <Button
                                      size="sm"
                                      onClick={() => {
                                        applySuggestion(s);
                                        setAiDecisions((prev) => ({ ...prev, [s.id]: "accepted" }));
                                        void decideSuggestion("accepted", s.id);
                                      }}
                                      disabled={!canAccept}
                                    >
                                      <ThumbsUp className="h-4 w-4 mr-1" />
                                      Accept
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => {
                                        setAiDecisions((prev) => ({ ...prev, [s.id]: "rejected" }));
                                        void decideSuggestion("rejected", s.id);
                                      }}
                                      disabled={!canReject}
                                    >
                                      <ThumbsDown className="h-4 w-4 mr-1" />
                                      Reject
                                    </Button>
                                  </div>

                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() =>
                                      setAiExpandedDiffs((prev) => ({
                                        ...prev,
                                        [s.id]: !Boolean(prev[s.id]),
                                      }))
                                    }
                                    disabled={
                                      previewDiff.added.length + previewDiff.removed.length === 0
                                    }
                                  >
                                    {showDiff ? "Hide diff" : "Show diff"}
                                  </Button>
                                </div>

                                {showDiff ? (
                                  <div className="rounded-lg border bg-background max-h-[260px] overflow-auto">
                                    <div className="p-2 font-mono text-xs space-y-1">
                                      {previewDiff.removed.map((r) => (
                                        <div
                                          key={`r-${r.line}`}
                                          className="rounded-md px-2 py-1 bg-rose-50 text-rose-900"
                                        >
                                          <span className="inline-block w-4 text-center mr-1">
                                            -
                                          </span>
                                          <span className="break-words">{r.line}</span>
                                        </div>
                                      ))}
                                      {previewDiff.added.map((r) => (
                                        <div
                                          key={`a-${r.line}`}
                                          className="rounded-md px-2 py-1 bg-emerald-50 text-emerald-900"
                                        >
                                          <span className="inline-block w-4 text-center mr-1">
                                            +
                                          </span>
                                          <span className="break-words">{r.line}</span>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                ) : null}
                              </div>
                            );
                          })}
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  {tasksPanelOpen && (
                    <Card>
                      <CardHeader className="py-3">
                        <CardTitle className="text-base flex items-center justify-between">
                          <span className="inline-flex items-center gap-2">
                            <ClipboardList className="h-4 w-4" />
                            Tasks & notes
                          </span>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8"
                            onClick={() => setTasksPanelOpen(false)}
                            title="Close tasks panel" aria-label="Close tasks panel"
                          >
                            <X className="h-4 w-4" />
                            <span className="sr-only">Close tasks panel</span>
                          </Button>
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        {!recordIdNum ? (
                          <div className="text-sm text-muted-foreground">
                            Save the record first to attach tasks.
                          </div>
                        ) : (
                          <>
                            <div className="space-y-2">
                              <Input
                                value={newTaskTitle}
                                onChange={(e) => setNewTaskTitle(e.target.value)}
                                placeholder="Task title"
                              />
                              <Input
                                value={newTaskBody}
                                onChange={(e) => setNewTaskBody(e.target.value)}
                                placeholder="Optional note"
                              />
                              <Button
                                size="sm"
                                onClick={() => void createTask()}
                                disabled={!newTaskTitle.trim()}
                              >
                                Add task
                              </Button>
                            </div>

                            {tasksError ? (
                              <div className="text-sm text-muted-foreground">
                                Failed to load tasks: {tasksError}
                              </div>
                            ) : null}

                            {tasksLoading ? (
                              <div className="text-sm text-muted-foreground flex items-center gap-2">
                                <Loader2 className="h-4 w-4 animate-spin" /> Loading…
                              </div>
                            ) : (
                              <div className="space-y-2">
                                {tasks.length === 0 ? (
                                  <div className="text-sm text-muted-foreground">No tasks yet.</div>
                                ) : (
                                  tasks.map((t) => (
                                    <div
                                      key={t.id}
                                      className="rounded-lg border bg-background p-3 space-y-2"
                                    >
                                      <div className="flex items-center justify-between gap-2">
                                        <div className="text-sm font-medium">{t.title}</div>
                                        <Badge variant="outline">{t.status}</Badge>
                                      </div>
                                      {t.body ? (
                                        <div className="text-xs text-muted-foreground whitespace-pre-wrap">
                                          {t.body}
                                        </div>
                                      ) : null}
                                      <div className="flex items-center gap-2">
                                        <Button
                                          size="sm"
                                          variant="outline"
                                          onClick={() => void setTaskStatus(t.id, "open")}
                                          disabled={t.status === "open"}
                                        >
                                          Open
                                        </Button>
                                        <Button
                                          size="sm"
                                          variant="outline"
                                          onClick={() => void setTaskStatus(t.id, "done")}
                                          disabled={t.status === "done"}
                                        >
                                          Done
                                        </Button>
                                        <Button
                                          size="sm"
                                          variant="outline"
                                          onClick={() => void setTaskStatus(t.id, "canceled")}
                                          disabled={t.status === "canceled"}
                                        >
                                          Cancel
                                        </Button>
                                      </div>
                                    </div>
                                  ))
                                )}
                              </div>
                            )}
                          </>
                        )}
                      </CardContent>
                    </Card>
                  )}

                  {comparePanelOpen && (
                    <Card>
                      <CardHeader className="py-3">
                        <CardTitle className="text-base flex items-center justify-between">
                          <span className="inline-flex items-center gap-2">
                            <Columns2 className="h-4 w-4" />
                            Compare records
                          </span>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8"
                            onClick={closeCompare}
                            title="Close compare" aria-label="Close compare panel"
                          >
                            <X className="h-4 w-4" />
                            <span className="sr-only">Close compare</span>
                          </Button>
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        <div className="text-sm text-muted-foreground">
                          Load another bib record ID to compare against the current record.
                        </div>

                        <div className="flex items-center gap-2">
                          <Input
                            value={compareDraft}
                            onChange={(e) => setCompareDraft(e.target.value)}
                            placeholder="Compare record ID (e.g. 123)"
                            inputMode="numeric"
                          />
                          <Button
                            onClick={() => {
                              const id = compareDraft.trim();
                              if (!/^\d+$/.test(id)) {
                                setCompareError("Enter a numeric record id.");
                                return;
                              }
                              if (recordId && id === recordId) {
                                setCompareError("Pick a different record id to compare.");
                                return;
                              }
                              updateCompareInUrl(id);
                            }}
                            disabled={!canLoadCompare || compareLoading}
                          >
                            {compareLoading ? (
                              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            ) : null}
                            Load
                          </Button>
                        </div>

                        <div className="flex items-center justify-between gap-2">
                          <div className="text-xs text-muted-foreground">
                            Tip: add `?compare=123` to deep-link this view.
                          </div>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={clearCompare}
                            disabled={compareLoading}
                          >
                            Clear
                          </Button>
                        </div>

                        {compareError && (
                          <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                            {compareError}
                          </div>
                        )}

                        {compareBibInfo && (
                          <div className="rounded-lg border bg-muted/30 px-3 py-2">
                            <div className="text-sm font-medium truncate">
                              {compareBibInfo.title || "Untitled"}
                            </div>
                            <div className="text-xs text-muted-foreground truncate">
                              {compareBibInfo.author || "—"}
                            </div>
                          </div>
                        )}

                        {diff.hasCompare ? (
                          <div className="space-y-2">
                            <div className="flex items-center gap-2 flex-wrap">
                              <Badge variant="outline">Base #{recordId}</Badge>
                              <Badge variant="outline">
                                Compare #{compareDraft.trim() || compareIdParam}
                              </Badge>
                              <Badge className="bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/10">
                                +{diff.added}
                              </Badge>
                              <Badge className="bg-rose-500/10 text-rose-700 hover:bg-rose-500/10">
                                -{diff.removed}
                              </Badge>
                            </div>

                            <div className="max-h-[520px] overflow-auto rounded-lg border bg-background">
                              <div className="p-2 font-mono text-xs space-y-1">
                                {diff.rows
                                  .filter((r) => !diffOnly || r.kind !== "same")
                                  .map((r) => (
                                    <div
                                      key={r.line}
                                      className={
                                        "rounded-md px-2 py-1 leading-relaxed " +
                                        (r.kind === "added"
                                          ? "bg-emerald-50 text-emerald-900"
                                          : r.kind === "removed"
                                            ? "bg-rose-50 text-rose-900"
                                            : "text-muted-foreground")
                                      }
                                    >
                                      <span className="inline-block w-4 text-center mr-1">
                                        {r.kind === "added"
                                          ? "+"
                                          : r.kind === "removed"
                                            ? "-"
                                            : "·"}
                                      </span>
                                      <span className="break-words">{r.line}</span>
                                      {r.delta > 1 ? (
                                        <span className="ml-2 text-[10px] text-muted-foreground">
                                          ×{r.delta}
                                        </span>
                                      ) : null}
                                    </div>
                                  ))}
                              </div>
                            </div>
                          </div>
                        ) : (
                          <div className="rounded-lg border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
                            No compare record loaded yet.
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  )}

                  {showHelp && (
                    <div className="border rounded-lg p-4 bg-muted/30">
                      <h3 className="font-medium mb-3 flex items-center gap-2">
                        <HelpCircle className="h-4 w-4" />
                        MARC Help
                      </h3>
                      <div className="space-y-2 text-sm">
                        {Object.entries(marcFieldDescriptions)
                          .slice(0, 12)
                          .map(([tag, desc]) => (
                            <div key={tag} className="flex gap-2">
                              <Badge variant="outline" className="shrink-0">
                                {tag}
                              </Badge>
                              <span className="text-muted-foreground text-xs">{desc}</span>
                            </div>
                          ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="bg-muted/50 border-t px-4 py-1 text-xs text-muted-foreground flex items-center gap-4">
            <span>Fields: {record.fields.length}</span>
            <span>Errors: {validationErrors.length}</span>
            <div className="flex-1" />
            <span>MARC21 Bibliographic</span>
          </div>
        </div>
        <datalist id="marc-tag-suggestions">
          {marcTagSuggestions.map((entry) => (
            <option key={`tag-${entry.tag}`} value={entry.tag}>
              {entry.label}
            </option>
          ))}
        </datalist>
      </PageContent>
    </PageContainer>
  );
}

export default function MarcEditorPage() {
  return (
    <Suspense fallback={<div className="p-4">Loading...</div>}>
      <MarcEditorContent />
    </Suspense>
  );
}
