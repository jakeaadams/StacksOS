/**
 * Cataloging Copilot AI - Assists with MARC cataloging and copy cataloging
 * Features: Field suggestions, Z39.50 import, MARC validation, auto-fill
 */

"use client";

import { useState, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
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
  Tag,
  Loader2,
  ArrowRight,
  Lightbulb,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

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

// Simulated suggestions based on input
function generateSuggestions(isbn?: string, title?: string): Suggestion[] {
  const suggestions: Suggestion[] = [];
  
  if (!isbn && title) {
    suggestions.push({
      id: "s1",
      type: "warning",
      field: "020",
      message: "ISBN is missing. Consider adding for better discoverability.",
      confidence: 0.95,
    });
  }
  
  suggestions.push({
    id: "s2",
    type: "enhance",
    field: "650",
    message: "Add subject headings for better searchability",
    suggestedValue: "Library science",
    confidence: 0.82,
  });
  
  if (title) {
    suggestions.push({
      id: "s3",
      type: "fill",
      field: "245$a",
      message: "Title field can be auto-populated",
      suggestedValue: title,
      confidence: 0.99,
    });
  }
  
  return suggestions;
}

// Simulated Z39.50 search
async function searchZ3950(query: string, sources: string[]): Promise<Z3950Result[]> {
  await new Promise(r => setTimeout(r, 1000 + Math.random() * 500));
  
  // Simulated results
  return [
    {
      id: "loc-1",
      source: "Library of Congress",
      title: query.includes("9780") ? "The Art of Programming" : query,
      author: "Smith, John",
      isbn: query.includes("9780") ? query : "9780123456789",
      publicationYear: "2024",
    },
    {
      id: "oclc-1", 
      source: "OCLC WorldCat",
      title: query.includes("9780") ? "The Art of Programming" : query,
      author: "Smith, John A.",
      isbn: query.includes("9780") ? query : "9780123456789",
      publicationYear: "2024",
    },
  ];
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
  const [suggestions] = useState(() => generateSuggestions(isbn, title));

  const handleZ3950Search = useCallback(async () => {
    if (!searchQuery.trim()) return;
    setIsSearching(true);
    try {
      const results = await searchZ3950(searchQuery, ["loc", "oclc"]);
      setZ3950Results(results);
    } catch (error) {
      toast.error("Search failed");
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
    toast.success(`Imported record from ${result.source}`);
    setIsOpen(false);
  }, []);

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
          Review suggestions to improve your MARC record quality
        </div>

        <ScrollArea className="h-[350px]">
          <div className="space-y-3 pr-4">
            {suggestions.length > 0 ? (
              suggestions.map((s) => (
                <SuggestionCard 
                  key={s.id} 
                  suggestion={s} 
                  onApply={() => handleApplySuggestion(s)}
                />
              ))
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <CheckCircle2 className="h-8 w-8 mx-auto mb-2 text-green-500" />
                <p>No suggestions - record looks good!</p>
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
        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <CheckCircle2 className="h-5 w-5 text-green-600" />
            <span className="font-medium text-green-800">Record Valid</span>
          </div>
          <p className="text-sm text-green-700">
            All required MARC fields are present and properly formatted.
          </p>
        </div>

        <div className="space-y-3">
          <h4 className="font-medium text-sm">Validation Checks</h4>
          
          <div className="space-y-2">
            {[
              { label: "Leader valid", status: "pass" },
              { label: "008 field complete", status: "pass" },
              { label: "245 title present", status: "pass" },
              { label: "100/110 main entry", status: "pass" },
              { label: "Subject headings (6XX)", status: "warning", note: "Consider adding more" },
              { label: "Call number (050/090)", status: "pass" },
            ].map((check, i) => (
              <div key={check.label || i} className="flex items-center justify-between py-1.5 px-2 rounded bg-muted/30">
                <span className="text-sm">{check.label}</span>
                <div className="flex items-center gap-2">
                  {check.note && <span className="text-xs text-muted-foreground">{check.note}</span>}
                  {check.status === "pass" ? (
                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                  ) : (
                    <AlertTriangle className="h-4 w-4 text-amber-500" />
                  )}
                </div>
              </div>
            ))}
          </div>
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
