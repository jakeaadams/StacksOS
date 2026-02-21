"use client";

import { fetchWithAuth } from "@/lib/client-fetch";
import { featureFlags } from "@/lib/feature-flags";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  PageContainer,
  PageHeader,
  PageContent,
  DataTable,
  EmptyState,
  ErrorMessage,
} from "@/components/shared";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ColumnDef } from "@tanstack/react-table";
import { toast } from "sonner";
import { Search, FileText, Globe, Sparkles, Loader2, AlertTriangle, Info } from "lucide-react";

interface CatalogRecord {
  id: number;
  title: string;
  author: string;
  pubdate?: string;
  publisher?: string;
  isbn?: string;
}

interface AiMarcField {
  tag: string;
  ind1: string;
  ind2: string;
  subfields: { code: string; value: string }[];
  confidence: "high" | "medium" | "low";
}

interface AiMarcResult {
  draftId: string | null;
  leader: string;
  field_008: string;
  fields: AiMarcField[];
  provider: string;
  model?: string;
}

const MARC_FIELD_LABELS: Record<string, string> = {
  "020": "ISBN",
  "050": "LC Call Number",
  "082": "Dewey Decimal",
  "100": "Author (Main Entry)",
  "245": "Title Statement",
  "250": "Edition",
  "264": "Publication Info",
  "300": "Physical Description",
  "336": "Content Type",
  "337": "Media Type",
  "338": "Carrier Type",
  "500": "General Note",
  "520": "Summary",
  "650": "Subject (LCSH)",
  "655": "Genre/Form",
};

function confidenceColor(c: string) {
  switch (c) {
    case "high":
      return "bg-green-100 text-green-800 border-green-200";
    case "medium":
      return "bg-yellow-100 text-yellow-800 border-yellow-200";
    case "low":
      return "bg-red-100 text-red-800 border-red-200";
    default:
      return "bg-gray-100 text-gray-800 border-gray-200";
  }
}

function subfieldString(subfields: { code: string; value: string }[]) {
  return subfields.map((sf) => `$${sf.code} ${sf.value}`).join(" ");
}

export default function CreateRecordPage() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CatalogRecord[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // AI MARC generation state
  const [aiTitle, setAiTitle] = useState("");
  const [aiAuthor, setAiAuthor] = useState("");
  const [aiIsbn, setAiIsbn] = useState("");
  const [aiPublisher, setAiPublisher] = useState("");
  const [aiDescription, setAiDescription] = useState("");
  const [aiFormat, setAiFormat] = useState("book");
  const [aiGenerating, setAiGenerating] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiResult, setAiResult] = useState<AiMarcResult | null>(null);

  const handleSearch = async () => {
    if (!query.trim()) return;
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetchWithAuth(
        `/api/evergreen/catalog?q=${encodeURIComponent(query.trim())}`
      );
      const data = await res.json();
      if (!res.ok || data.ok === false) {
        throw new Error(data.error || "Search failed");
      }
      setResults(data.records || []);
      if (!data.records || data.records.length === 0) {
        toast.message("No records found");
      }
    } catch (err: any) {
      setError(err?.message || "Search failed");
      toast.error(err?.message || "Search failed");
    } finally {
      setIsLoading(false);
    }
  };

  const handleAiGenerate = async () => {
    if (!aiTitle.trim()) {
      toast.error("Title is required for AI generation");
      return;
    }

    setAiGenerating(true);
    setAiError(null);
    setAiResult(null);

    try {
      const res = await fetchWithAuth("/api/evergreen/ai-marc", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: aiTitle.trim(),
          author: aiAuthor.trim() || undefined,
          isbn: aiIsbn.trim() || undefined,
          publisher: aiPublisher.trim() || undefined,
          description: aiDescription.trim() || undefined,
          format: aiFormat,
        }),
      });

      const data = await res.json();

      if (!res.ok || data.ok === false) {
        throw new Error(data.error || "AI MARC generation failed");
      }

      setAiResult({
        draftId: data.draftId,
        leader: data.leader,
        field_008: data.field_008,
        fields: data.fields || [],
        provider: data.provider,
        model: data.model,
      });

      toast.success("AI MARC record generated. Review below before saving.");
    } catch (err: any) {
      setAiError(err?.message || "AI MARC generation failed");
      toast.error(err?.message || "AI MARC generation failed");
    } finally {
      setAiGenerating(false);
    }
  };

  const handleOpenInMarcEditor = () => {
    if (!aiResult) return;
    // Encode the AI result as a compact URL-safe parameter for the MARC editor
    const encodedData = encodeURIComponent(
      JSON.stringify({
        leader: aiResult.leader,
        field_008: aiResult.field_008,
        fields: aiResult.fields,
        draftId: aiResult.draftId,
      })
    );
    window.location.href = `/staff/cataloging/marc-editor?ai_draft=${encodedData}`;
  };

  const columns = useMemo<ColumnDef<CatalogRecord>[]>(
    () => [
      {
        accessorKey: "title",
        header: "Title",
        cell: ({ row }) => (
          <div>
            <div className="font-medium">{row.original.title}</div>
            <div className="text-xs text-muted-foreground">{row.original.author}</div>
          </div>
        ),
      },
      {
        accessorKey: "pubdate",
        header: "Pub Date",
      },
      {
        accessorKey: "isbn",
        header: "ISBN",
      },
      {
        id: "actions",
        header: "Actions",
        cell: ({ row }) => (
          <div className="flex items-center gap-2">
            <Button asChild size="sm" variant="outline">
              <Link href={`/staff/cataloging/marc-editor?id=${row.original.id}`}>Edit MARC</Link>
            </Button>
          </div>
        ),
      },
    ],
    []
  );

  return (
    <PageContainer>
      <PageHeader
        title="Create Bibliographic Record"
        subtitle="Start from a blank MARC template, derive from an existing record, or generate with AI."
        breadcrumbs={[{ label: "Catalog", href: "/staff/catalog" }, { label: "Create Record" }]}
        actions={[
          {
            label: "New MARC Record",
            onClick: () => (window.location.href = "/staff/cataloging/marc-editor"),
            icon: FileText,
          },
        ]}
      />
      <PageContent>
        {error && (
          <div className="mb-4">
            <ErrorMessage message={error} onRetry={() => setError(null)} />
          </div>
        )}

        <div className="grid gap-6 lg:grid-cols-[1fr,320px]">
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Find an Existing Record</CardTitle>
                <CardDescription>
                  Search Evergreen and derive a new record if needed.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex gap-2">
                  <Input
                    placeholder="Search by title, author, ISBN..."
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                  />
                  <Button onClick={handleSearch} disabled={isLoading}>
                    <Search className="h-4 w-4 mr-2" />
                    Search
                  </Button>
                </div>
                <DataTable
                  columns={columns}
                  data={results}
                  isLoading={isLoading}
                  searchable={false}
                  paginated={false}
                  emptyState={
                    <EmptyState
                      title="No records"
                      description="Search Evergreen to derive a new record, or start fresh with MARC editor."
                    />
                  }
                />
              </CardContent>
            </Card>

            {/* AI MARC Record Generation */}
            {featureFlags.ai && (
              <Card className="border-purple-200">
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <Sparkles className="h-5 w-5 text-purple-600" />
                    <CardTitle>AI Record Generation</CardTitle>
                  </div>
                  <CardDescription>
                    Generate a draft MARC record from basic bibliographic info using AI. Staff must
                    review and approve all fields before saving.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="sm:col-span-2">
                      <Label htmlFor="ai-title">
                        Title <span className="text-red-500">*</span>
                      </Label>
                      <Input
                        id="ai-title"
                        placeholder="e.g. The Great Gatsby"
                        value={aiTitle}
                        onChange={(e) => setAiTitle(e.target.value)}
                      />
                    </div>
                    <div>
                      <Label htmlFor="ai-author">Author</Label>
                      <Input
                        id="ai-author"
                        placeholder="e.g. F. Scott Fitzgerald"
                        value={aiAuthor}
                        onChange={(e) => setAiAuthor(e.target.value)}
                      />
                    </div>
                    <div>
                      <Label htmlFor="ai-isbn">ISBN</Label>
                      <Input
                        id="ai-isbn"
                        placeholder="e.g. 978-0743273565"
                        value={aiIsbn}
                        onChange={(e) => setAiIsbn(e.target.value)}
                      />
                    </div>
                    <div>
                      <Label htmlFor="ai-publisher">Publisher</Label>
                      <Input
                        id="ai-publisher"
                        placeholder="e.g. Scribner"
                        value={aiPublisher}
                        onChange={(e) => setAiPublisher(e.target.value)}
                      />
                    </div>
                    <div>
                      <Label htmlFor="ai-format">Format</Label>
                      <Select value={aiFormat} onValueChange={setAiFormat}>
                        <SelectTrigger id="ai-format">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="book">Book</SelectItem>
                          <SelectItem value="ebook">eBook</SelectItem>
                          <SelectItem value="audiobook">Audiobook</SelectItem>
                          <SelectItem value="dvd">DVD</SelectItem>
                          <SelectItem value="serial">Serial</SelectItem>
                          <SelectItem value="music_score">Music Score</SelectItem>
                          <SelectItem value="map">Map</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="sm:col-span-2">
                      <Label htmlFor="ai-description">Description / Notes</Label>
                      <Textarea
                        id="ai-description"
                        placeholder="Optional: describe the work to help AI generate better subjects, summary, and classification..."
                        value={aiDescription}
                        onChange={(e) => setAiDescription(e.target.value)}
                        rows={3}
                      />
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <Button
                      onClick={handleAiGenerate}
                      disabled={aiGenerating || !aiTitle.trim()}
                      className="bg-purple-600 hover:bg-purple-700 text-white"
                    >
                      {aiGenerating ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Generating...
                        </>
                      ) : (
                        <>
                          <Sparkles className="h-4 w-4 mr-2" />
                          Generate MARC Record
                        </>
                      )}
                    </Button>
                    {aiGenerating && (
                      <span className="text-sm text-muted-foreground">
                        AI is generating MARC fields...
                      </span>
                    )}
                  </div>

                  {aiError && (
                    <Alert variant="destructive">
                      <AlertTriangle className="h-4 w-4" />
                      <AlertDescription>{aiError}</AlertDescription>
                    </Alert>
                  )}

                  {/* AI Generated Results */}
                  {aiResult && (
                    <div className="space-y-4 mt-4">
                      <div className="flex items-center justify-between">
                        <h4 className="font-semibold text-foreground flex items-center gap-2">
                          <Sparkles className="h-4 w-4 text-purple-600" />
                          Generated MARC Record (Draft)
                        </h4>
                        <Button variant="outline" size="sm" onClick={handleOpenInMarcEditor}>
                          <FileText className="h-4 w-4 mr-2" />
                          Open in MARC Editor
                        </Button>
                      </div>

                      <Alert className="bg-amber-50 border-amber-200">
                        <Info className="h-4 w-4 text-amber-600" />
                        <AlertDescription className="text-amber-800">
                          This is an AI-generated draft. All fields must be reviewed and approved by
                          cataloging staff before saving to the catalog. Fields highlighted in amber
                          are AI-generated.
                        </AlertDescription>
                      </Alert>

                      {/* Fixed fields */}
                      <div className="space-y-2">
                        <div className="bg-amber-50/50 border border-amber-200 rounded-lg p-3">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-mono text-xs font-bold text-foreground">LDR</span>
                            <span className="text-xs text-muted-foreground">Leader</span>
                          </div>
                          <code className="text-sm font-mono text-foreground/80 break-all">
                            {aiResult.leader}
                          </code>
                        </div>

                        <div className="bg-amber-50/50 border border-amber-200 rounded-lg p-3">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-mono text-xs font-bold text-foreground">008</span>
                            <span className="text-xs text-muted-foreground">
                              Fixed-Length Data Elements
                            </span>
                          </div>
                          <code className="text-sm font-mono text-foreground/80 break-all">
                            {aiResult.field_008}
                          </code>
                        </div>
                      </div>

                      {/* Variable fields */}
                      <div className="space-y-2">
                        {aiResult.fields.map((field, idx) => (
                          <div
                            key={`${field.tag}-${idx}`}
                            className="bg-amber-50/50 border border-amber-200 rounded-lg p-3"
                          >
                            <div className="flex items-center gap-2 mb-1">
                              <span className="font-mono text-xs font-bold text-foreground">
                                {field.tag}
                              </span>
                              <span className="text-xs text-muted-foreground">
                                {MARC_FIELD_LABELS[field.tag] || ""}
                              </span>
                              <span className="font-mono text-xs text-muted-foreground">
                                [{field.ind1 || " "}
                                {field.ind2 || " "}]
                              </span>
                              <span className="ml-auto">
                                <span
                                  className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium border ${confidenceColor(
                                    field.confidence
                                  )}`}
                                >
                                  {field.confidence}
                                </span>
                              </span>
                            </div>
                            <code className="text-sm font-mono text-foreground/80 break-all">
                              {subfieldString(field.subfields)}
                            </code>
                          </div>
                        ))}
                      </div>

                      {/* Confidence legend */}
                      <div className="flex items-center gap-4 text-xs text-muted-foreground pt-2">
                        <span className="font-medium">Confidence:</span>
                        <span className="flex items-center gap-1">
                          <span className="w-2 h-2 rounded-full bg-green-500" /> High - from
                          provided input
                        </span>
                        <span className="flex items-center gap-1">
                          <span className="w-2 h-2 rounded-full bg-yellow-500" /> Medium - inferred
                        </span>
                        <span className="flex items-center gap-1">
                          <span className="w-2 h-2 rounded-full bg-red-500" /> Low - speculative
                        </span>
                      </div>

                      {aiResult.draftId && (
                        <p className="text-xs text-muted-foreground">
                          Draft ID: {aiResult.draftId} | Provider: {aiResult.provider}
                          {aiResult.model ? ` (${aiResult.model})` : ""}
                        </p>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Import Options</CardTitle>
              <CardDescription>Connect external sources for fast cataloging.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Button asChild variant="outline" className="w-full">
                <Link href="/staff/cataloging/z3950">
                  <Globe className="h-4 w-4 mr-2" />
                  Z39.50 Import
                </Link>
              </Button>
              <p className="text-xs text-muted-foreground">
                Z39.50 providers are configured at the Evergreen layer. We surface them once
                available.
              </p>
            </CardContent>
          </Card>
        </div>
      </PageContent>
    </PageContainer>
  );
}
