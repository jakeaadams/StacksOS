import { clientLogger } from "@/lib/client-logger";
import type { MarcField, MarcRecord, AiCatalogingSuggestion } from "./marc-types";

export function controlTagSort(a: string, b: string) {
  return Number.parseInt(a || "0", 10) - Number.parseInt(b || "0", 10);
}

export function escapeXml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function parseMarcXml(marcXml: string): MarcRecord | null {
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(marcXml, "text/xml");
    const record = doc.querySelector("record");

    if (!record) return null;

    const leaderEl = record.querySelector("leader");
    const leader = leaderEl?.textContent || "00000nam a22000007i 4500";

    const fields: MarcField[] = [];

    record.querySelectorAll("controlfield").forEach((cf) => {
      const tag = cf.getAttribute("tag") || "";
      fields.push({
        tag,
        ind1: " ",
        ind2: " ",
        subfields: [{ code: "", value: cf.textContent || "" }],
      });
    });

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

export function buildMarcXml(record: MarcRecord): string {
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

export function recordToLines(record: MarcRecord): string[] {
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

export function toCounts(lines: string[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const line of lines) {
    map.set(line, (map.get(line) || 0) + 1);
  }
  return map;
}

export function applySuggestionToRecord(base: MarcRecord, s: AiCatalogingSuggestion): MarcRecord {
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
}
