"use client";

import { useState, useCallback, useEffect } from "react";
import { BookOpen, Copy } from "lucide-react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";

/* ------------------------------------------------------------------ */
/*  MARC XML Types & Parsing (exported for testing)                    */
/* ------------------------------------------------------------------ */

export interface MarcField {
  tag: string;
  ind1: string;
  ind2: string;
  subfields: { code: string; value: string }[];
  /** For control fields (001-009) with no subfields. */
  value?: string;
}

export interface MarcRecord {
  leader: string;
  fields: MarcField[];
}

/** Well-known MARC field labels for common tags. */
const TAG_LABELS: Record<string, string> = {
  "001": "Control Number",
  "003": "Control Number ID",
  "005": "Date/Time Modified",
  "008": "Fixed-Length Data",
  "010": "LCCN",
  "020": "ISBN",
  "022": "ISSN",
  "035": "System Control Number",
  "040": "Cataloging Source",
  "041": "Language Code",
  "050": "LC Call Number",
  "082": "Dewey Classification",
  "100": "Author (Personal)",
  "110": "Author (Corporate)",
  "111": "Author (Meeting)",
  "130": "Uniform Title",
  "245": "Title Statement",
  "246": "Varying Form of Title",
  "250": "Edition",
  "260": "Publication (Imprint)",
  "264": "Production/Publication",
  "300": "Physical Description",
  "336": "Content Type",
  "337": "Media Type",
  "338": "Carrier Type",
  "490": "Series Statement",
  "500": "General Note",
  "505": "Contents Note",
  "520": "Summary",
  "600": "Subject (Personal)",
  "610": "Subject (Corporate)",
  "650": "Subject (Topical)",
  "651": "Subject (Geographic)",
  "655": "Genre/Form",
  "700": "Added Entry (Personal)",
  "710": "Added Entry (Corporate)",
  "776": "Additional Physical Form",
  "800": "Series (Personal)",
  "830": "Series (Uniform Title)",
  "856": "Electronic Location",
  "900": "Local Field",
  "938": "Vendor Info",
};

/** Get a human-readable label for a MARC tag. */
export function getTagLabel(tag: string): string {
  return TAG_LABELS[tag] ?? `Field ${tag}`;
}

/** Parse a MARC XML string into a structured MarcRecord. */
export function parseMarcXml(xml: string): MarcRecord | null {
  if (!xml || typeof xml !== "string") return null;

  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xml, "text/xml");
    const parserError = doc.querySelector("parsererror");
    if (parserError) return null;

    const recordEl = doc.querySelector("record");
    if (!recordEl) return null;

    const leaderEl = recordEl.querySelector("leader");
    const leader = leaderEl?.textContent ?? "";

    const fields: MarcField[] = [];

    // Control fields (001-009)
    const controlFields = recordEl.querySelectorAll("controlfield");
    controlFields.forEach((cf) => {
      fields.push({
        tag: cf.getAttribute("tag") || "???",
        ind1: "",
        ind2: "",
        subfields: [],
        value: cf.textContent ?? "",
      });
    });

    // Data fields (010+)
    const dataFields = recordEl.querySelectorAll("datafield");
    dataFields.forEach((df) => {
      const subfields: { code: string; value: string }[] = [];
      df.querySelectorAll("subfield").forEach((sf) => {
        subfields.push({
          code: sf.getAttribute("code") || "?",
          value: sf.textContent ?? "",
        });
      });

      fields.push({
        tag: df.getAttribute("tag") || "???",
        ind1: df.getAttribute("ind1") || " ",
        ind2: df.getAttribute("ind2") || " ",
        subfields,
      });
    });

    return { leader, fields };
  } catch {
    return null;
  }
}

/** Format a MARC record as plain text for copy/paste. */
export function formatMarcText(record: MarcRecord): string {
  const lines: string[] = [];
  lines.push(`LDR ${record.leader}`);

  for (const field of record.fields) {
    if (field.value !== undefined) {
      lines.push(`${field.tag}    ${field.value}`);
    } else {
      const subs = field.subfields.map((sf) => `$${sf.code} ${sf.value}`).join(" ");
      lines.push(`${field.tag} ${field.ind1}${field.ind2} ${subs}`);
    }
  }

  return lines.join("\n");
}

/* ------------------------------------------------------------------ */
/*  Props                                                              */
/* ------------------------------------------------------------------ */

export interface MarcViewerProps {
  marcXml?: string;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function MarcViewer({ marcXml }: MarcViewerProps) {
  const t = useTranslations("marcViewer");
  const [record, setRecord] = useState<MarcRecord | null>(null);

  useEffect(() => {
    if (marcXml) {
      setRecord(parseMarcXml(marcXml));
    }
  }, [marcXml]);

  const handleCopy = useCallback(() => {
    if (!record) return;
    const text = formatMarcText(record);
    navigator.clipboard.writeText(text).then(
      () => toast.success(t("copied")),
      () => toast.error(t("copyFailed"))
    );
  }, [record, t]);

  if (!marcXml || !record) return null;

  return (
    <Accordion type="single" collapsible className="stx-surface rounded-xl">
      <AccordionItem value="marc" className="border-0">
        <AccordionTrigger className="px-6 py-4 hover:no-underline">
          <div className="flex items-center gap-2 text-base font-semibold">
            <BookOpen className="h-5 w-5" />
            {t("title")}
          </div>
        </AccordionTrigger>
        <AccordionContent className="px-6 pb-6">
          {/* Leader */}
          <div className="mb-3 rounded-lg bg-muted/30 px-3 py-2 font-mono text-xs">
            <span className="font-semibold text-muted-foreground">LDR</span>{" "}
            <span className="text-foreground">{record.leader}</span>
          </div>

          {/* Fields table */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/80">
                  <th
                    scope="col"
                    className="text-left py-2 pr-3 font-medium text-muted-foreground w-16"
                  >
                    {t("tag")}
                  </th>
                  <th
                    scope="col"
                    className="text-left py-2 pr-3 font-medium text-muted-foreground w-16"
                  >
                    {t("indicators")}
                  </th>
                  <th scope="col" className="text-left py-2 font-medium text-muted-foreground">
                    {t("content")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {record.fields.map((field, idx) => (
                  <tr key={idx} className="border-b border-border/30 hover:bg-muted/20">
                    <td className="py-2 pr-3 font-mono text-xs font-semibold text-primary-600">
                      <span title={getTagLabel(field.tag)}>{field.tag}</span>
                    </td>
                    <td className="py-2 pr-3 font-mono text-xs text-muted-foreground">
                      {field.value !== undefined ? "" : `${field.ind1}${field.ind2}`}
                    </td>
                    <td className="py-2 font-mono text-xs">
                      {field.value !== undefined ? (
                        <span className="text-foreground">{field.value}</span>
                      ) : (
                        field.subfields.map((sf, si) => (
                          <span key={si} className="mr-2">
                            <span className="text-primary-500 font-semibold">${sf.code}</span>{" "}
                            <span className="text-foreground">{sf.value}</span>
                          </span>
                        ))
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Copy button */}
          <div className="mt-4 flex justify-end">
            <Button variant="outline" size="sm" onClick={handleCopy}>
              <Copy className="mr-1.5 h-3.5 w-3.5" />
              {t("copyMarc")}
            </Button>
          </div>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}
