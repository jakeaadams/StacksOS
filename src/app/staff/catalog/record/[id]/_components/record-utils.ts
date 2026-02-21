import { clientLogger } from "@/lib/client-logger";
import type { ParsedMarcRecord, FixedFieldRow } from "./record-types";

// MARC mapping tables
const leaderRecordStatusMap: Record<string, string> = {
  a: "Increase in encoding level", c: "Corrected or revised", d: "Deleted", n: "New", p: "Increase in encoding level from prepublication",
};
const leaderTypeOfRecordMap: Record<string, string> = {
  a: "Language material", c: "Notated music", d: "Manuscript notated music", e: "Cartographic material",
  f: "Manuscript cartographic material", g: "Projected medium", i: "Nonmusical sound recording",
  j: "Musical sound recording", k: "Two-dimensional nonprojectable graphic", m: "Computer file",
  o: "Kit", p: "Mixed materials", r: "Three-dimensional artifact", t: "Manuscript language material",
};
const leaderBibLevelMap: Record<string, string> = {
  a: "Monographic component part", b: "Serial component part", c: "Collection", d: "Subunit",
  i: "Integrating resource", m: "Monograph/item", s: "Serial",
};
const leaderEncodingLevelMap: Record<string, string> = {
  " ": "Full level", 1: "Full level, material not examined", 2: "Less-than-full level, material not examined",
  3: "Abbreviated level", 4: "Core level", 5: "Partial level", 7: "Minimal level", 8: "Prepublication level",
  u: "Unknown", z: "Not applicable",
};
const leaderCatalogingFormMap: Record<string, string> = {
  " ": "Non-ISBD", a: "AACR2", i: "ISBD punctuation included", n: "Non-ISBD punctuation omitted", u: "Unknown",
};
const fixed008DateTypeMap: Record<string, string> = {
  b: "No dates given; B.C. date involved", c: "Continuing resource currently published",
  d: "Continuing resource ceased publication", e: "Detailed date", i: "Inclusive dates of collection",
  k: "Range of years of bulk of collection", m: "Multiple dates", n: "Dates unknown",
  p: "Date of distribution/release/issue and production/recording session", q: "Questionable date",
  r: "Reprint/reissue and original date", s: "Single known date/probable date",
  t: "Publication date and copyright date", u: "Continuing resource status unknown",
};
const fixed008AudienceMap: Record<string, string> = {
  " ": "Unknown/unspecified", a: "Preschool", b: "Primary", c: "Pre-adolescent", d: "Adolescent",
  e: "Adult", f: "Specialized", g: "General", j: "Juvenile",
};
const fixed008FormOfItemMap: Record<string, string> = {
  " ": "None of the following", a: "Microfilm", b: "Microfiche", c: "Microopaque", d: "Large print",
  f: "Braille", o: "Online", q: "Direct electronic", r: "Regular print reproduction", s: "Electronic",
};
const fixed008CatalogingSourceMap: Record<string, string> = {
  " ": "National bibliographic agency", c: "Cooperative cataloging program", d: "Other", u: "Unknown",
};

function getCodeDescription(code: string, map: Record<string, string>) {
  return map[code] || "Unmapped code";
}

export function sortMarcTags(a: string, b: string) {
  const aNum = Number.parseInt(a, 10);
  const bNum = Number.parseInt(b, 10);
  if (!Number.isNaN(aNum) && !Number.isNaN(bNum) && aNum !== bNum) return aNum - bNum;
  return a.localeCompare(b);
}

export function parseMarcXmlForView(marcXml?: string): ParsedMarcRecord | null {
  if (!marcXml || !marcXml.trim()) return null;
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(marcXml, "text/xml");
    const recordEl = doc.querySelector("record");
    if (!recordEl) return null;
    const leader = recordEl.querySelector("leader")?.textContent || "";
    const controlFields = Array.from(recordEl.querySelectorAll("controlfield")).map((cf) => ({
      tag: cf.getAttribute("tag") || "", value: cf.textContent || "",
    }));
    const dataFields = Array.from(recordEl.querySelectorAll("datafield")).map((df) => ({
      tag: df.getAttribute("tag") || "", ind1: df.getAttribute("ind1") || " ", ind2: df.getAttribute("ind2") || " ",
      subfields: Array.from(df.querySelectorAll("subfield")).map((sf) => ({
        code: sf.getAttribute("code") || "", value: sf.textContent || "",
      })),
    }));
    controlFields.sort((a, b) => sortMarcTags(a.tag, b.tag));
    dataFields.sort((a, b) => sortMarcTags(a.tag, b.tag));
    const field008 = controlFields.find((f) => f.tag === "008")?.value || "";
    return { leader, controlFields, dataFields, field008 };
  } catch (error) {
    clientLogger.error("Failed to parse MARC XML for bib view", error);
    return null;
  }
}

export function buildLeaderRows(leader: string): FixedFieldRow[] {
  const value = String(leader || "").padEnd(24, " ");
  return [
    { position: "05", label: "Record Status", value: value.charAt(5) || "-", note: getCodeDescription(value.charAt(5), leaderRecordStatusMap) },
    { position: "06", label: "Type of Record", value: value.charAt(6) || "-", note: getCodeDescription(value.charAt(6), leaderTypeOfRecordMap) },
    { position: "07", label: "Bibliographic Level", value: value.charAt(7) || "-", note: getCodeDescription(value.charAt(7), leaderBibLevelMap) },
    { position: "17", label: "Encoding Level", value: value.charAt(17) || "-", note: getCodeDescription(value.charAt(17), leaderEncodingLevelMap) },
    { position: "18", label: "Descriptive Cataloging Form", value: value.charAt(18) || "-", note: getCodeDescription(value.charAt(18), leaderCatalogingFormMap) },
  ];
}

export function build008Rows(field008: string): FixedFieldRow[] {
  const value = String(field008 || "").padEnd(40, " ");
  return [
    { position: "00-05", label: "Date Entered on File", value: value.slice(0, 6) || "-", note: "YYMMDD" },
    { position: "06", label: "Date Type/Publication Status", value: value.charAt(6) || "-", note: getCodeDescription(value.charAt(6), fixed008DateTypeMap) },
    { position: "07-10", label: "Date 1", value: value.slice(7, 11) || "-", note: "Year or beginning date" },
    { position: "11-14", label: "Date 2", value: value.slice(11, 15) || "-", note: "Ending date when applicable" },
    { position: "15-17", label: "Place of Publication", value: value.slice(15, 18) || "-", note: "MARC country code" },
    { position: "22", label: "Target Audience", value: value.charAt(22) || "-", note: getCodeDescription(value.charAt(22), fixed008AudienceMap) },
    { position: "23", label: "Form of Item", value: value.charAt(23) || "-", note: getCodeDescription(value.charAt(23), fixed008FormOfItemMap) },
    { position: "35-37", label: "Language", value: value.slice(35, 38) || "-", note: "MARC language code" },
    { position: "39", label: "Cataloging Source", value: value.charAt(39) || "-", note: getCodeDescription(value.charAt(39), fixed008CatalogingSourceMap) },
  ];
}

export function formatMarcSubfields(subfields: Array<{ code: string; value: string }>) {
  if (!Array.isArray(subfields) || subfields.length === 0) return "-";
  return subfields
    .map((sf) => {
      const code = (sf.code || "").trim();
      const val = (sf.value || "").trim();
      if (!code && !val) return "";
      return `$${code || "?"} ${val}`.trim();
    })
    .filter(Boolean)
    .join(" ");
}

export function isCopyAvailable(statusId: number) {
  return statusId === 0 || statusId === 7;
}

export function getStatusColor(statusId: number) {
  switch (statusId) {
    case 0: case 7: return "text-green-600 bg-green-50 border-green-200";
    case 1: return "text-blue-600 bg-blue-50 border-blue-200";
    case 6: return "text-amber-600 bg-amber-50 border-amber-200";
    case 8: return "text-purple-600 bg-purple-50 border-purple-200";
    default: return "text-muted-foreground bg-muted border-border";
  }
}

export function getHoldStatusLabel(status: string | number | undefined) {
  if (typeof status === "string" && status.trim()) return status;
  if (typeof status === "number") return `Status ${status}`;
  return "Pending";
}

export function getHoldStatusClass(status: string | number | undefined) {
  const text = String(status ?? "").toLowerCase();
  if (text.includes("ready") || text.includes("captured") || text.includes("shelf")) return "text-green-600 bg-green-50 border-green-200";
  if (text.includes("cancel") || text.includes("expire") || text.includes("fail")) return "text-red-600 bg-red-50 border-red-200";
  if (text.includes("transit")) return "text-amber-600 bg-amber-50 border-amber-200";
  return "text-muted-foreground bg-muted border-border";
}

export function formatDateTime(value?: string) {
  if (!value) return "Unknown";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString();
}
