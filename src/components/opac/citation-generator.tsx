"use client";

import { useState, useCallback, useEffect } from "react";
import { BookOpen, ChevronDown, Copy } from "lucide-react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";

/* ------------------------------------------------------------------ */
/*  Props                                                              */
/* ------------------------------------------------------------------ */

export interface CitationGeneratorProps {
  title: string;
  author?: string;
  contributors?: string[];
  publisher?: string;
  publicationDate?: string;
  isbn?: string;
  edition?: string;
  format?: string;
  language?: string;
}

/* ------------------------------------------------------------------ */
/*  Author helpers                                                     */
/* ------------------------------------------------------------------ */

/** Split "First Last" or "Last, First" into { first, last }. */
function parseAuthor(raw: string): { first: string; last: string } {
  const trimmed = raw.trim();
  if (trimmed.includes(",")) {
    const [last, first] = trimmed.split(",").map((s) => s.trim());
    return { first: first || "", last: last || "" };
  }
  const parts = trimmed.split(/\s+/);
  if (parts.length === 1) return { first: "", last: parts[0] ?? "" };
  const last = parts[parts.length - 1] ?? "";
  const first = parts.slice(0, -1).join(" ");
  return { first, last };
}

function extractYear(dateStr?: string): string {
  if (!dateStr) return "";
  const match = dateStr.match(/\d{4}/);
  return match ? match[0] : "";
}

function initial(name: string): string {
  return name ? `${name.charAt(0).toUpperCase()}.` : "";
}

/* ------------------------------------------------------------------ */
/*  Citation format functions (exported for testing)                   */
/* ------------------------------------------------------------------ */

/** MLA 9: Author Last, First. *Title*. Contributors. Publisher, Year. */
export function formatMLA(props: CitationGeneratorProps): string {
  const parts: string[] = [];
  if (props.author) {
    const { first, last } = parseAuthor(props.author);
    parts.push(first ? `${last}, ${first}.` : `${last}.`);
  }
  parts.push(`*${props.title}*.`);
  if (props.contributors && props.contributors.length > 0) {
    parts.push(`Contributions by ${props.contributors.join(", ")}.`);
  }
  if (props.edition) parts.push(`${props.edition} ed.,`);
  if (props.publisher) parts.push(`${props.publisher},`);
  const year = extractYear(props.publicationDate);
  if (year) parts.push(`${year}.`);
  return parts.join(" ").replace(/,\./g, ".").replace(/\.\./g, ".");
}

/** APA 7: Author Last, F. (Year). *Title*. Publisher. */
export function formatAPA(props: CitationGeneratorProps): string {
  const parts: string[] = [];
  if (props.author) {
    const { first, last } = parseAuthor(props.author);
    const init = initial(first);
    parts.push(init ? `${last}, ${init}` : `${last}.`);
  }
  const year = extractYear(props.publicationDate);
  parts.push(year ? `(${year}).` : "(n.d.).");
  parts.push(`*${props.title}*.`);
  if (props.edition) parts.push(`(${props.edition} ed.).`);
  if (props.publisher) parts.push(`${props.publisher}.`);
  return parts.join(" ").replace(/\.\./g, ".");
}

/** Chicago 17: Author Last, First. *Title*. Contributors. Place: Publisher, Year. */
export function formatChicago(props: CitationGeneratorProps): string {
  const parts: string[] = [];
  if (props.author) {
    const { first, last } = parseAuthor(props.author);
    parts.push(first ? `${last}, ${first}.` : `${last}.`);
  }
  parts.push(`*${props.title}*.`);
  if (props.contributors && props.contributors.length > 0) {
    parts.push(`With ${props.contributors.join(", ")}.`);
  }
  if (props.edition) parts.push(`${props.edition} ed.`);
  const pub: string[] = [];
  if (props.publisher) pub.push(props.publisher);
  const year = extractYear(props.publicationDate);
  if (year) pub.push(year);
  if (pub.length > 0) parts.push(`${pub.join(", ")}.`);
  return parts.join(" ").replace(/\.\./g, ".");
}

/** Harvard: Author Last, F. (Year) *Title*. Publisher. */
export function formatHarvard(props: CitationGeneratorProps): string {
  const parts: string[] = [];
  if (props.author) {
    const { first, last } = parseAuthor(props.author);
    const init = initial(first);
    parts.push(init ? `${last}, ${init}` : `${last}.`);
  }
  const year = extractYear(props.publicationDate);
  parts.push(year ? `(${year})` : "(n.d.)");
  parts.push(`*${props.title}*.`);
  if (props.edition) parts.push(`${props.edition} edn.`);
  if (props.publisher) parts.push(`${props.publisher}.`);
  return parts.join(" ").replace(/\.\./g, ".");
}

/** BibTeX @book entry. */
export function formatBibTeX(props: CitationGeneratorProps): string {
  const { first, last } = props.author ? parseAuthor(props.author) : { first: "", last: "" };
  const key =
    (last || "unknown").toLowerCase().replace(/\s+/g, "") + extractYear(props.publicationDate);
  const lines: string[] = [`@book{${key},`];
  lines.push(`  title     = {${props.title}},`);
  if (props.author) lines.push(`  author    = {${last}${first ? `, ${first}` : ""}},`);
  const year = extractYear(props.publicationDate);
  if (year) lines.push(`  year      = {${year}},`);
  if (props.publisher) lines.push(`  publisher = {${props.publisher}},`);
  if (props.edition) lines.push(`  edition   = {${props.edition}},`);
  if (props.isbn) lines.push(`  isbn      = {${props.isbn}},`);
  if (props.language) lines.push(`  language  = {${props.language}},`);
  lines.push("}");
  return lines.join("\n");
}

/* ------------------------------------------------------------------ */
/*  Format registry                                                    */
/* ------------------------------------------------------------------ */

const FORMATS = [
  { id: "mla", label: "MLA 9", fn: formatMLA },
  { id: "apa", label: "APA 7", fn: formatAPA },
  { id: "chicago", label: "Chicago 17", fn: formatChicago },
  { id: "harvard", label: "Harvard", fn: formatHarvard },
  { id: "bibtex", label: "BibTeX", fn: formatBibTeX },
] as const;

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function CitationGenerator(props: CitationGeneratorProps) {
  const t = useTranslations("citationGenerator");
  const [collapsed, setCollapsed] = useState(true);
  const [activeTab, setActiveTab] = useState<string>("mla");

  // Expand by default on md+ screens
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    if (mq.matches) setCollapsed(false);
  }, []);

  const citation = FORMATS.find((f) => f.id === activeTab)?.fn(props) ?? "";

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(citation.replace(/\*/g, ""));
      toast.success(t("copied"));
    } catch {
      toast.error(t("copyFailed"));
    }
  }, [citation, t]);

  return (
    <Card>
      <CardHeader>
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          className="flex w-full items-center justify-between text-left"
          aria-expanded={!collapsed}
        >
          <CardTitle className="flex items-center gap-2 text-base">
            <BookOpen className="h-5 w-5" />
            {t("title")}
          </CardTitle>
          <ChevronDown
            className={`h-4 w-4 text-muted-foreground transition-transform ${collapsed ? "" : "rotate-180"}`}
          />
        </button>
      </CardHeader>

      {!collapsed && (
        <CardContent>
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="flex-wrap">
              {FORMATS.map((f) => (
                <TabsTrigger key={f.id} value={f.id} className="text-xs">
                  {f.label}
                </TabsTrigger>
              ))}
            </TabsList>

            {FORMATS.map((f) => (
              <TabsContent key={f.id} value={f.id}>
                <div className="mt-3 rounded-xl border border-border/70 bg-muted/20 p-4">
                  <pre className="whitespace-pre-wrap break-words font-mono text-sm leading-relaxed text-foreground">
                    {f.fn(props)}
                  </pre>
                </div>
                <div className="mt-3 flex justify-end">
                  <Button variant="outline" size="sm" onClick={handleCopy}>
                    <Copy className="mr-1.5 h-3.5 w-3.5" />
                    {t("copy")}
                  </Button>
                </div>
              </TabsContent>
            ))}
          </Tabs>
        </CardContent>
      )}
    </Card>
  );
}
