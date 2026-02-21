"use client";

import { fetchWithAuth } from "@/lib/client-fetch";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  PageContainer,
  PageHeader,
  PageContent,
  EmptyState,
  StatusBadge,
  DataTable,
  ErrorMessage,
  SetupRequired,
  SETUP_CONFIGS,
} from "@/components/shared";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useApi } from "@/hooks";
import { Globe, Search, Download, Loader2, BookOpen, AlertCircle } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ColumnDef } from "@tanstack/react-table";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface Z3950Service {
  name: string;
  label: string;
  host?: string;
  port?: number;
  db?: string;
}

interface Z3950Record {
  id: string;
  service: string;
  title: string;
  author: string;
  pubdate?: string;
  isbn?: string;
  publisher?: string;
  marcxml: string;
}

interface SearchState {
  isSearching: boolean;
  query: string;
  results: Z3950Record[];
  totalResults: number;
  error: string | null;
}

export default function Z3950Page() {
  const router = useRouter();

  // Check Evergreen connection status
  const { data: ping } = useApi<any>("/api/evergreen/ping", { immediate: true });

  // Load available Z39.50 services/targets
  const {
    data: servicesData,
    error: servicesError,
    isLoading: servicesLoading,
    refetch: refetchServices,
  } = useApi<any>("/api/evergreen/z3950?action=services", { immediate: true });

  const services = useMemo<Z3950Service[]>(
    () => servicesData?.services ?? [],
    [servicesData?.services]
  );

  const [selectedService, setSelectedService] = useState("");
  const [searchType, setSearchType] = useState("title");
  const [searchState, setSearchState] = useState<SearchState>({
    isSearching: false,
    query: "",
    results: [],
    totalResults: 0,
    error: null,
  });
  const [importingIds, setImportingIds] = useState<Set<string>>(new Set());

  // Auto-select first service when services load
  useEffect(() => {
    if (!services.length) return;
    if (!selectedService || !services.some((s) => s.name === selectedService)) {
      setSelectedService(services[0]!.name);
    }
  }, [selectedService, services]);

  /**
   * Import a Z39.50 record into Evergreen as a bib record
   */
  const importRecord = useCallback(async (record: Z3950Record) => {
    if (!record.marcxml) {
      toast.error("Cannot import record", {
        description: "No MARC XML data available",
      });
      return;
    }

    setImportingIds((prev) => new Set(prev).add(record.id));

    try {
      // Determine source based on service
      const source =
        record.service.toLowerCase() === "oclc"
          ? "OCLC"
          : record.service.toUpperCase();

      const res = await fetchWithAuth("/api/evergreen/marc", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          marcxml: record.marcxml,
          source,
          auto_tcn: true,
        }),
      });

      const json = await res.json();

      if (!res.ok || json.ok === false) {
        throw new Error(json.error || "Import failed");
      }

      const recordId = json.record?.id;
      const tcn = json.record?.tcn;

      toast.success("Record imported successfully", {
        description: `Record ID: ${recordId}${tcn ? ` | TCN: ${tcn}` : ""}`,
        action: recordId
          ? {
              label: "View Record",
              onClick: () => router.push(`/staff/catalog/record/${recordId}`),
            }
          : undefined,
      });

      // Remove the imported record from results
      setSearchState((prev) => ({
        ...prev,
        results: prev.results.filter((r) => r.id !== record.id),
      }));
    } catch (err: any) {
      const errorMessage = err?.message || "Import failed";
      toast.error("Failed to import record", { description: errorMessage });
    } finally {
      setImportingIds((prev) => {
        const next = new Set(prev);
        next.delete(record.id);
        return next;
      });
    }
  }, [router]);

  // Define table columns
  const columns = useMemo<ColumnDef<Z3950Record>[]>(
    () => [
      {
        accessorKey: "title",
        header: "Title",
        cell: ({ row }) => (
          <div className="max-w-md">
            <div className="font-medium">{row.original.title}</div>
            {row.original.publisher && (
              <div className="text-xs text-muted-foreground mt-1">
                {row.original.publisher}
              </div>
            )}
          </div>
        ),
      },
      {
        accessorKey: "author",
        header: "Author",
        cell: ({ row }) => row.original.author || "—",
      },
      {
        accessorKey: "pubdate",
        header: "Year",
        cell: ({ row }) => row.original.pubdate || "—",
      },
      {
        accessorKey: "isbn",
        header: "ISBN",
        cell: ({ row }) =>
          row.original.isbn ? (
            <span className="font-mono text-xs">{row.original.isbn}</span>
          ) : (
            "—"
          ),
      },
      {
        accessorKey: "service",
        header: "Source",
        cell: ({ row }) => {
          const svc = services.find((s) => s.name === row.original.service);
          return (
            <div className="flex items-center gap-1.5">
              <Globe className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-sm">{svc?.label || row.original.service}</span>
            </div>
          );
        },
      },
      {
        id: "actions",
        header: "",
        cell: ({ row }) => {
          const isImporting = importingIds.has(row.original.id);
          return (
            <Button
              size="sm"
              variant="outline"
              onClick={() => void importRecord(row.original)}
              disabled={isImporting}
            >
              {isImporting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Importing...
                </>
              ) : (
                <>
                  <Download className="h-4 w-4 mr-2" />
                  Import
                </>
              )}
            </Button>
          );
        },
      },
    ],
    [importRecord, importingIds, services]
  );

  /**
   * Handle Z39.50 search
   */
  const handleSearch = async () => {
    const query = searchState.query.trim();
    if (!query || !selectedService) {
      toast.error("Please enter a search query");
      return;
    }

    setSearchState((prev) => ({
      ...prev,
      isSearching: true,
      error: null,
      results: [],
      totalResults: 0,
    }));

    try {
      const params = new URLSearchParams({
        q: query,
        service: selectedService,
        type: searchType,
        limit: "25",
      });

      const res = await fetchWithAuth(`/api/evergreen/z3950?${params.toString()}`);
      const json = await res.json();

      if (!res.ok || json.ok === false) {
        throw new Error(json.error || "Search failed");
      }

      // Flatten results from all services
      const allRecords = (json.results || []).flatMap(
        (result: any) => result.records || []
      );

      setSearchState((prev) => ({
        ...prev,
        results: allRecords,
        totalResults: json.total || allRecords.length,
        isSearching: false,
        error: null,
      }));

      if (allRecords.length === 0) {
        toast.info("No records found", {
          description: "Try a different search term or target",
        });
      } else {
        toast.success(`Found ${allRecords.length} record(s)`);
      }
    } catch (err: any) {
      const errorMessage = err?.message || "Search failed";
      setSearchState((prev) => ({
        ...prev,
        isSearching: false,
        error: errorMessage,
        results: [],
        totalResults: 0,
      }));
      toast.error("Search failed", { description: errorMessage });
    }
  };

  /**
   * Handle Enter key in search input
   */
  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !searchState.isSearching) {
      void handleSearch();
    }
  };

  // Check if Z39.50 is properly configured
  const setupRequired = !servicesLoading && services.length === 0;
  const isOnline = ping?.ok === true;

  return (
    <PageContainer>
      <PageHeader
        title="Z39.50 Cataloging Import"
        subtitle="Search external library catalogs and import MARC records into Evergreen"
        breadcrumbs={[
          { label: "Cataloging", href: "/staff/cataloging" },
          { label: "Z39.50" },
        ]}
      >
        <StatusBadge
          label={isOnline ? "Evergreen Online" : "Evergreen Offline"}
          status={isOnline ? "success" : "error"}
        />
      </PageHeader>

      <PageContent>
        {/* Connection Error */}
        {!isOnline && (
          <Alert variant="destructive" className="mb-4">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              Cannot connect to Evergreen. Please check your connection and try again.
            </AlertDescription>
          </Alert>
        )}

        {/* Services Error */}
        {servicesError && (
          <div className="mb-4">
            <ErrorMessage
              message={servicesError?.message || "Failed to load Z39.50 services"}
              onRetry={refetchServices}
            />
          </div>
        )}

        {/* Setup Required */}
        {setupRequired && !servicesError && (
          <SetupRequired
            module={SETUP_CONFIGS.z3950.module}
            description={SETUP_CONFIGS.z3950.description}
            setupSteps={SETUP_CONFIGS.z3950.setupSteps}
            docsUrl="https://docs.evergreen-ils.org/eg/docs/latest/cataloging/z3950.html"
          />
        )}

        {/* Search Interface */}
        {!setupRequired && (
          <>
            <Card>
              <CardHeader>
                <CardTitle>Search External Catalogs</CardTitle>
                <CardDescription>
                  Search Z39.50 targets like Library of Congress, OCLC WorldCat, and other
                  configured sources
                </CardDescription>
              </CardHeader>

              <CardContent className="space-y-4">
                {/* Search Error */}
                {searchState.error && (
                  <ErrorMessage
                    message={searchState.error}
                    onRetry={() => setSearchState((prev) => ({ ...prev, error: null }))}
                  />
                )}

                {/* Search Form */}
                <div className="grid gap-4 md:grid-cols-[1fr,160px,220px,auto]">
                  <div className="relative">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Enter title, author, ISBN, or keyword..."
                      value={searchState.query}
                      onChange={(e) =>
                        setSearchState((prev) => ({ ...prev, query: e.target.value }))
                      }
                      onKeyPress={handleKeyPress}
                      className="!pl-14"
                      disabled={searchState.isSearching || !isOnline}
                    />
                  </div>

                  <Select
                    value={searchType}
                    onValueChange={setSearchType}
                    disabled={searchState.isSearching || !isOnline}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Search by" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="title">Title</SelectItem>
                      <SelectItem value="author">Author</SelectItem>
                      <SelectItem value="isbn">ISBN</SelectItem>
                      <SelectItem value="issn">ISSN</SelectItem>
                      <SelectItem value="keyword">Keyword</SelectItem>
                    </SelectContent>
                  </Select>

                  <Select
                    value={selectedService}
                    onValueChange={setSelectedService}
                    disabled={searchState.isSearching || !isOnline || servicesLoading}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select target" />
                    </SelectTrigger>
                    <SelectContent>
                      {services.map((svc) => (
                        <SelectItem key={svc.name} value={svc.name}>
                          {svc.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Button
                    onClick={handleSearch}
                    disabled={
                      searchState.isSearching ||
                      !searchState.query.trim() ||
                      !selectedService ||
                      !isOnline
                    }
                  >
                    {searchState.isSearching ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Searching...
                      </>
                    ) : (
                      <>
                        <Search className="h-4 w-4 mr-2" />
                        Search
                      </>
                    )}
                  </Button>
                </div>

                {/* Search Info */}
                {searchState.totalResults > 0 && (
                  <div className="text-sm text-muted-foreground">
                    {`Found ${searchState.totalResults} record(s) for "${searchState.query}"`}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Results Table */}
            <Card className="mt-6">
              <CardHeader>
                <CardTitle>Search Results</CardTitle>
                <CardDescription>
                  Review records and import them into your Evergreen catalog
                </CardDescription>
              </CardHeader>
              <CardContent>
                <DataTable
                  columns={columns}
                  data={searchState.results}
                  isLoading={searchState.isSearching}
                  searchable={false}
                  paginated={searchState.results.length > 10}
                  emptyState={
                    <EmptyState
                      icon={BookOpen}
                      title="No search results"
                      description={
                        searchState.query
                          ? "No records found. Try adjusting your search terms or selecting a different target."
                          : "Enter a search query above to find records from external catalogs."
                      }
                    />
                  }
                />
              </CardContent>
            </Card>
          </>
        )}
      </PageContent>
    </PageContainer>
  );
}
