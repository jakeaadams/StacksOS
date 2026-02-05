/**
 * Cataloging Copilot AI - Assists with MARC cataloging and copy cataloging
 * Features: Field suggestions, Z39.50 import, MARC validation, auto-fill
 */

"use client";

import { useEffect, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Sparkles,
  Search,
  Download,
  Wand2,
  CheckCircle2,
  AlertTriangle,
  Info,
  Globe,
  Calendar,
  Hash,
  Loader2,
  Lightbulb,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { fetchWithAuth } from "@/lib/client-fetch";

interface MARCField {
  tag: string;
  ind1: string;
  ind2: string;
  subfields: { code: string; value: string }[];
}

interface Suggestion {
  id: string;
  type: "fill" | "correct" | "enhance" | "warning";
  field: string;
  message: string;
  suggestedValue?: string;
  confidence: number;
}

interface Z3950Result {
  id: string;
  source: string;
  title: string;
  author: string;
  isbn: string;
  publicationYear: string;
  marcXml?: string;
}

interface CatalogingCopilotProps {
  isbn?: string;
  title?: string;
  onImport?: (marcFields: MARCField[]) => void;
  onFieldSuggestion?: (tag: string, value: string) => void;
  trigger?: React.ReactNode;
  variant?: "dialog" | "sheet" | "panel";
  className?: string;
}

async function searchZ3950(query: string, sources: string[]): Promise<Z3950Result[]> {
  const params = new URLSearchParams();
  params.set("q", query);
  params.set("service", sources.join(","));
  params.set("type", "title");
  params.set("limit", "10");

  const res = await fetchWithAuth(`/api/evergreen/z3950?${params.toString()}`);
  const data = await res.json();
  if (!data?.ok) {
    throw new Error(data?.error || "Z39.50 search failed");
  }

  const results = Array.isArray(data.results) ? data.results : [];
  const flattened: Z3950Result[] = [];
  for (const bucket of results) {
    const service = bucket?.service || "unknown";
    const records = Array.isArray(bucket?.records) ? bucket.records : [];
    for (const r of records) {
      flattened.push({
        id: r.id,
        source: service,
        title: r.title || "",
        author: r.author || "",
        isbn: r.isbn || "",
        publicationYear: r.pubdate || "",
        marcXml: r.marcxml || "",
      });
    }
  }
  return flattened;
}

function parseMarcXmlToFields(marcXml: string): MARCField[] | null {
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(marcXml, "text/xml");
    const record = doc.querySelector("record");
    if (!record) return null;

    const fields: MARCField[] = [];

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

    return fields;
  } catch {
    return null;
  }
}

function SuggestionCard({ suggestion, onApply }: { suggestion: Suggestion; onApply: () => void }) {
  const icons = {
    fill: Wand2,
    correct: AlertTriangle,
    enhance: Lightbulb,
    warning: AlertTriangle,
  };
  const colors = {
    fill: "text-primary",
    correct: "text-amber-600",
    enhance: "text-sky-600",
    warning: "text-amber-600",
  };
  const bgColors = {
    fill: "bg-primary/5 border-primary/20",
    correct: "bg-amber-50 border-amber-200",
    enhance: "bg-sky-50 border-sky-200",
    warning: "bg-amber-50 border-amber-200",
  };
  
  const Icon = icons[suggestion.type];
  
  return (
    <div className={cn("rounded-lg border p-3 space-y-2", bgColors[suggestion.type])}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2">
          <Icon className={cn("h-4 w-4 mt-0.5", colors[suggestion.type])} />
          <div>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-[10px] font-mono">{suggestion.field}</Badge>
              <span className="text-xs text-muted-foreground">{Math.round(suggestion.confidence * 100)}% confidence</span>
            </div>
            <p className="text-sm mt-1">{suggestion.message}</p>
            {suggestion.suggestedValue && (
              <p className="text-sm font-medium mt-1 font-mono bg-background/50 px-2 py-1 rounded">
                {suggestion.suggestedValue}
              </p>
            )}
          </div>
        </div>
        {suggestion.suggestedValue && (
          <Button size="sm" variant="outline" onClick={onApply} className="shrink-0">
            Apply
          </Button>
        )}
      </div>
    </div>
  );
}

function Z3950ResultCard({ 
  result, 
  onSelect 
}: { 
  result: Z3950Result; 
  onSelect: () => void;
}) {
  return (
    <Card className="hover:border-primary/50 transition-colors cursor-pointer" onClick={onSelect}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1 flex-1">
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="text-[10px]">{result.source}</Badge>
            </div>
            <h4 className="font-medium">{result.title}</h4>
            <p className="text-sm text-muted-foreground">{result.author}</p>
            <div className="flex items-center gap-4 text-xs text-muted-foreground mt-2">
              <span className="flex items-center gap-1">
                <Hash className="h-3 w-3" />
                {result.isbn}
              </span>
              <span className="flex items-center gap-1">
                <Calendar className="h-3 w-3" />
                {result.publicationYear}
              </span>
            </div>
          </div>
          <Button size="sm" variant="outline" className="shrink-0">
            <Download className="h-4 w-4 mr-1" />
            Import
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export function CatalogingCopilot({
  isbn,
  title,
  onImport,
  onFieldSuggestion,
  trigger,
  variant = "sheet",
  className,
}: CatalogingCopilotProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"suggest" | "z3950" | "validate">("suggest");
  const [searchQuery, setSearchQuery] = useState(isbn || title || "");
  const [isSearching, setIsSearching] = useState(false);
  const [z3950Results, setZ3950Results] = useState<Z3950Result[]>([]);
  const [isSuggesting, setIsSuggesting] = useState(false);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);

  const loadSuggestions = useCallback(async () => {
    if (isSuggesting) return;
    if (!isbn && !title) {
      setSuggestions([]);
      return;
    }

    setIsSuggesting(true);
    try {
      const res = await fetchWithAuth("/api/ai/cataloging-suggest", {
        method: "POST",
        body: JSON.stringify({ isbn, title }),
      });
      const data = await res.json();
      if (!data?.ok) {
        throw new Error(data?.error || "AI suggestions unavailable");
      }

      const raw = data.response?.suggestions;
      const list = Array.isArray(raw) ? raw : [];
      setSuggestions(
        list.map((s: any) => ({
          id: String(s.id || `ai-${Math.random()}`),
          type: "enhance",
          field: s.type ? `AI:${String(s.type)}` : "AI",
          message: String(s.message || "Suggestion"),
          suggestedValue: String(s.suggestedValue || ""),
          confidence: typeof s.confidence === "number" ? s.confidence : 0.5,
        }))
      );
    } catch (e) {
      setSuggestions([]);
      const msg = e instanceof Error ? e.message : "AI suggestions unavailable";
      toast.error(msg);
    } finally {
      setIsSuggesting(false);
    }
  }, [isbn, title, isSuggesting]);

  useEffect(() => {
    if (!isOpen) return;
    if (activeTab !== "suggest") return;
    void loadSuggestions();
  }, [isOpen, activeTab, loadSuggestions]);

  const handleZ3950Search = useCallback(async () => {
    if (!searchQuery.trim()) return;
    setIsSearching(true);
    try {
      const results = await searchZ3950(searchQuery, ["loc", "oclc"]);
      setZ3950Results(results);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Search failed");
    } finally {
      setIsSearching(false);
    }
  }, [searchQuery]);

  const handleApplySuggestion = useCallback((suggestion: Suggestion) => {
    if (suggestion.suggestedValue && onFieldSuggestion) {
      onFieldSuggestion(suggestion.field, suggestion.suggestedValue);
      toast.success(`Applied suggestion to ${suggestion.field}`);
    }
  }, [onFieldSuggestion]);

  const handleImportRecord = useCallback((result: Z3950Result) => {
    if (onImport) {
      const marcXml = typeof result.marcXml === "string" ? result.marcXml : "";
      if (!marcXml.trim()) {
        toast.error("Selected record did not include MARCXML.");
        return;
      }

      const fields = parseMarcXmlToFields(marcXml);
      if (!fields) {
        toast.error("Unable to parse MARCXML from selected record.");
        return;
      }

      onImport(fields);
    }

    toast.success(`Imported record from ${result.source}`);
    setIsOpen(false);
  }, [onImport]);

  const content = (
    <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as typeof activeTab)} className="h-full flex flex-col">
      <TabsList className="grid w-full grid-cols-3">
        <TabsTrigger value="suggest" className="gap-1.5">
          <Lightbulb className="h-4 w-4" />
          <span className="hidden sm:inline">Suggestions</span>
        </TabsTrigger>
        <TabsTrigger value="z3950" className="gap-1.5">
          <Globe className="h-4 w-4" />
          <span className="hidden sm:inline">Z39.50</span>
        </TabsTrigger>
        <TabsTrigger value="validate" className="gap-1.5">
          <CheckCircle2 className="h-4 w-4" />
          <span className="hidden sm:inline">Validate</span>
        </TabsTrigger>
      </TabsList>

      <TabsContent value="suggest" className="flex-1 mt-4 space-y-4">
        <div className="bg-muted/30 rounded-lg p-3 text-sm text-muted-foreground">
          <div className="flex items-center gap-2 mb-1">
            <Sparkles className="h-4 w-4 text-primary" />
            <span className="font-medium text-foreground">AI Suggestions</span>
          </div>
          Draft-only suggestions (never auto-applied). Requires AI configuration.
        </div>

        <ScrollArea className="h-[350px]">
          <div className="space-y-3 pr-4">
            {isSuggesting ? (
              <div className="text-center py-8">
                <Loader2 className="h-8 w-8 mx-auto mb-2 animate-spin text-muted-foreground" />
                <p className="text-muted-foreground">Generating suggestions...</p>
              </div>
            ) : suggestions.length > 0 ? (
              suggestions.map((s) => (
                <SuggestionCard 
                  key={s.id} 
                  suggestion={s} 
                  onApply={() => handleApplySuggestion(s)}
                />
              ))
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <Info className="h-8 w-8 mx-auto mb-2" />
                <p>{isbn || title ? "No suggestions returned." : "Add an ISBN or title to request suggestions."}</p>
              </div>
            )}
          </div>
        </ScrollArea>
      </TabsContent>

      <TabsContent value="z3950" className="flex-1 mt-4 space-y-4">
        <div className="flex gap-2">
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by ISBN, title, or author..."
            onKeyDown={(e) => e.key === "Enter" && handleZ3950Search()}
          />
          <Button onClick={handleZ3950Search} disabled={isSearching}>
            {isSearching ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Search className="h-4 w-4" />
            )}
          </Button>
        </div>

        <div className="text-xs text-muted-foreground">
          Searching: Library of Congress, OCLC WorldCat
        </div>

        <ScrollArea className="h-[320px]">
          <div className="space-y-3 pr-4">
            {z3950Results.length > 0 ? (
              z3950Results.map((result) => (
                <Z3950ResultCard
                  key={result.id}
                  result={result}
                  onSelect={() => handleImportRecord(result)}
                />
              ))
            ) : isSearching ? (
              <div className="text-center py-8">
                <Loader2 className="h-8 w-8 mx-auto mb-2 animate-spin text-muted-foreground" />
                <p className="text-muted-foreground">Searching catalogs...</p>
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <Globe className="h-8 w-8 mx-auto mb-2" />
                <p>Enter an ISBN or title to search Z39.50 sources</p>
              </div>
            )}
          </div>
        </ScrollArea>
      </TabsContent>

      <TabsContent value="validate" className="flex-1 mt-4 space-y-4">
        <div className="bg-muted/30 border rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <Info className="h-5 w-5 text-muted-foreground" />
            <span className="font-medium">Validation</span>
          </div>
          <p className="text-sm text-muted-foreground">
            Use the MARC Editor validation for authoritative checks (required fields, indicators, and
            Evergreen-specific rules). This assistant does not run demo validations.
          </p>
        </div>
      </TabsContent>
    </Tabs>
  );

  const defaultTrigger = (
    <Button variant="outline" size="sm" className="gap-2">
      <Sparkles className="h-4 w-4" />
      Cataloging Copilot
    </Button>
  );

  if (variant === "panel") {
    return (
      <Card className={cn("h-full", className)}>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Sparkles className="h-4 w-4 text-primary" />
            Cataloging Copilot
            <Badge variant="secondary" className="text-[10px]">AI</Badge>
          </CardTitle>
          <CardDescription>AI-powered cataloging assistance</CardDescription>
        </CardHeader>
        <CardContent>
          {content}
        </CardContent>
      </Card>
    );
  }

  if (variant === "dialog") {
    return (
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogTrigger asChild>{trigger || defaultTrigger}</DialogTrigger>
        <DialogContent className="max-w-lg h-[600px] p-0 flex flex-col">
          <DialogHeader className="p-4 pb-2 border-b">
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              Cataloging Copilot
              <Badge variant="secondary" className="text-[10px]">AI</Badge>
            </DialogTitle>
            <DialogDescription>AI-powered cataloging assistance</DialogDescription>
          </DialogHeader>
          <div className="flex-1 p-4 overflow-hidden">{content}</div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Sheet open={isOpen} onOpenChange={setIsOpen}>
      <SheetTrigger asChild>{trigger || defaultTrigger}</SheetTrigger>
      <SheetContent className="w-[400px] sm:w-[540px] p-0 flex flex-col">
        <SheetHeader className="p-4 border-b">
          <SheetTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Cataloging Copilot
            <Badge variant="secondary" className="text-[10px]">AI</Badge>
          </SheetTitle>
          <SheetDescription>AI-powered cataloging assistance</SheetDescription>
        </SheetHeader>
        <div className="flex-1 p-4 overflow-hidden">{content}</div>
      </SheetContent>
    </Sheet>
  );
}

export type { CatalogingCopilotProps, MARCField, Suggestion };
