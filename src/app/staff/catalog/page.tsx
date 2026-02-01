"use client";
import { getEffectiveSearchType } from "@/lib/smart-search";

import { fetchWithAuth } from "@/lib/client-fetch";

import * as React from "react";
import { useCallback, useEffect, useMemo, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ColumnDef } from "@tanstack/react-table";
import { toast } from "sonner";

import {

  PageContainer,
  PageHeader,
  PageContent,
  DataTable,
  DataTableColumnHeader,
  EmptyState,
  LoadingSpinner,
  PlaceHoldDialog,
  RecordCockpit,
} from "@/components/shared";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import {
  BookOpen,
  Plus,
  Globe,
  FileText,
  Package,
  Bookmark,
  Search,
  RefreshCw,
  Eye,
} from "lucide-react";

interface BibRecord {
  id: number;
  tcn: string;
  title: string;
  author: string;
  pubdate: string;
  publisher: string;
  isbn: string;
  format: string;
  language: string;
  edition: string;
  physical_description: string;
}

function formatLabel(format?: string) {
  const value = format || "Unknown";
  return value.length > 14 ? `${value.slice(0, 14)}...` : value;
}

function CatalogSearchContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const patronContextBarcode = searchParams.get("patron") || "";

  const [searchQuery, setSearchQuery] = useState(searchParams.get("q") || "");
  const [searchType, setSearchType] = useState(searchParams.get("type") || "keyword");
  const [records, setRecords] = useState<BibRecord[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedRecord, setSelectedRecord] = useState<BibRecord | null>(null);

  const [placeHoldOpen, setPlaceHoldOpen] = useState(false);
  const [cockpitRecordId, setCockpitRecordId] = useState<number | null>(null);
  const [cockpitOpen, setCockpitOpen] = useState(false);

  const clearPatronContext = () => {
    const next = new URLSearchParams(searchParams.toString());
    next.delete("patron");
    const qs = next.toString();
    router.push(qs ? `/staff/catalog?${qs}` : "/staff/catalog");
  };

  const handleSearch = useCallback(async () => {
    if (!searchQuery.trim()) return;
    // Smart search: auto-detect ISBN, barcode, call number
    const effectiveType = getEffectiveSearchType(searchQuery, searchType, "catalog");
    setIsLoading(true);

    try {
      const query = encodeURIComponent(searchQuery.trim());
      const res = await fetchWithAuth(`/api/evergreen/catalog?q=${query}&type=${effectiveType}&limit=50`);
      const data = await res.json();

      if (data.ok) {
        setRecords(data.records || []);
        setTotalCount(data.count || 0);
        setSelectedRecord(null);

        if (data.count === 0) {
          toast.message("No matches", { description: "Try a different search" });
        } else {
          toast.success(`Found ${data.count} record(s)`);
        }
      } else {
        toast.error("Search failed", { description: data.error });
        setRecords([]);
        setTotalCount(0);
      }
    } catch (_error) {
      toast.error("Connection error", { description: "Could not reach Evergreen" });
    } finally {
      setIsLoading(false);
    }
  }, [searchQuery, searchType]);

  // Auto-run search when landing with a ?q= URL.
  useEffect(() => {
    if (searchQuery.trim()) {
      void handleSearch();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleRowClick = (record: BibRecord) => {
    setSelectedRecord(record);
  };

  const handleOpenCockpit = useCallback((recordId: number, e?: React.MouseEvent) => {
    if (e) {
      e.stopPropagation();
    }
    setCockpitRecordId(recordId);
    setCockpitOpen(true);
  }, []);

  const columns = useMemo<ColumnDef<BibRecord>[]>(
    () => [
      {
        accessorKey: "title",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Title" />, 
        cell: ({ row }) => (
          <div className="space-y-1">
            <div 
              className="font-medium leading-tight cursor-pointer hover:text-primary hover:underline"
              onClick={(e) => {
                e.stopPropagation();
                handleOpenCockpit(row.original.id);
              }}
            >
              {row.original.title}
            </div>
            <div className="text-xs text-muted-foreground">{row.original.author || "Unknown author"}</div>
          </div>
        ),
      },
      {
        accessorKey: "format",
        header: "Format",
        cell: ({ row }) => (
          <Badge variant="outline" className="text-[10px]">
            {formatLabel(row.original.format)}
          </Badge>
        ),
      },
      {
        accessorKey: "pubdate",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Year" />, 
        cell: ({ row }) => <span className="text-xs">{row.original.pubdate || "—"}</span>,
      },
      {
        accessorKey: "isbn",
        header: "ISBN",
        cell: ({ row }) => (
          <span className="text-xs font-mono text-muted-foreground">{row.original.isbn || "—"}</span>
        ),
      },
      {
        accessorKey: "tcn",
        header: "TCN",
        cell: ({ row }) => (
          <span className="text-xs font-mono text-muted-foreground">{row.original.tcn || "—"}</span>
        ),
      },
      {
        id: "actions",
        header: "Actions",
        cell: ({ row }) => (
          <Button
            variant="ghost"
            size="sm"
            onClick={(e) => handleOpenCockpit(row.original.id, e)}
            className="h-8 px-2"
          >
            <Eye className="h-4 w-4 mr-1" />
            Quick View
          </Button>
        ),
      },
    ],
    [handleOpenCockpit]
  );

  return (
    <PageContainer>
      <PageHeader
        title="Catalog Search"
        subtitle="Search and manage bibliographic records across the catalog."
        breadcrumbs={[{ label: "Catalog" }]}
        actions={[
          {
            label: "New Record",
            onClick: () => router.push("/staff/catalog/create"),
            icon: Plus,
          },
          {
            label: "Z39.50",
            onClick: () => router.push("/staff/cataloging/z3950"),
            icon: Globe,
            variant: "outline",
          },
          {
            label: "MARC Editor",
            onClick: () =>
              selectedRecord
                ? router.push(`/staff/cataloging/marc-editor?id=${selectedRecord.id}`)
                : toast.message("Select a record first"),
            icon: FileText,
            variant: "outline",
            disabled: !selectedRecord,
          },
          {
            label: "Holdings",
            onClick: () =>
              selectedRecord
                ? router.push(`/staff/cataloging/holdings?id=${selectedRecord.id}`)
                : toast.message("Select a record first"),
            icon: Package,
            variant: "outline",
            disabled: !selectedRecord,
          },
          {
            label: "Place Hold",
            onClick: () => setPlaceHoldOpen(true),
            icon: Bookmark,
            disabled: !selectedRecord,
          },
          {
            label: "Manage Holds",
            onClick: () =>
              selectedRecord
                ? router.push(`/staff/circulation/holds-management?tab=title&title_id=${selectedRecord.id}`)
                : router.push("/staff/circulation/holds-management"),
            icon: Bookmark,
            variant: "outline",
          },
        ]}
      >
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary" className="rounded-full">
            Results: {totalCount}
          </Badge>
          {selectedRecord && (
            <Badge variant="outline" className="rounded-full">
              Selected: {selectedRecord.tcn || selectedRecord.id}
            </Badge>
          )}
          {patronContextBarcode && (
            <button type="button"
              className="inline-flex items-center rounded-full border px-3 py-1 text-xs font-mono text-muted-foreground hover:bg-muted"
              onClick={clearPatronContext}
              title="Clear patron context"
            >
              Hold for patron: {patronContextBarcode} (clear)
            </button>
          )}
        </div>
      </PageHeader>

      <PageContent className="space-y-6">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm uppercase tracking-wide text-muted-foreground">Search Catalog</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-3 items-center">
              <div className="relative flex-1 min-w-[240px]">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Title, author, ISBN, keyword..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                  className="!pl-14"
                />
              </div>
              <Select value={searchType} onValueChange={setSearchType}>
                <SelectTrigger className="w-[160px]">
                  <SelectValue placeholder="Search type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="keyword">Keyword</SelectItem>
                  <SelectItem value="title">Title</SelectItem>
                  <SelectItem value="author">Author</SelectItem>
                  <SelectItem value="isbn">ISBN</SelectItem>
                  <SelectItem value="tcn">TCN</SelectItem>
                </SelectContent>
              </Select>
              <Button onClick={handleSearch} disabled={isLoading}>
                {isLoading ? (
                  <RefreshCw className="h-4 w-4 animate-spin" />
                ) : (
                  <BookOpen className="h-4 w-4" />
                )}
                <span className="ml-2">Search</span>
              </Button>
            </div>
          </CardContent>
        </Card>

        <DataTable
          columns={columns}
          data={records}
          isLoading={isLoading}
          searchable={false}
          onRowClick={handleRowClick}
          emptyState={<EmptyState title="No records" description="Run a search to see results." />}
        />

        <PlaceHoldDialog
          open={placeHoldOpen}
          onOpenChange={setPlaceHoldOpen}
          record={
            selectedRecord
              ? { id: selectedRecord.id, title: selectedRecord.title, author: selectedRecord.author }
              : null
          }
          initialPatronBarcode={patronContextBarcode || undefined}
        />

        <RecordCockpit
          recordId={cockpitRecordId}
          open={cockpitOpen}
          onOpenChange={setCockpitOpen}
        />
      </PageContent>
    </PageContainer>
  );
}

export default function CatalogSearchPage() {
  return (
    <Suspense fallback={<LoadingSpinner message="Loading catalog..." />}>
      <CatalogSearchContent />
    </Suspense>
  );
}
