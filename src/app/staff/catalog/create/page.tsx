"use client";

import { fetchWithAuth } from "@/lib/client-fetch";

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
import { ColumnDef } from "@tanstack/react-table";
import { toast } from "sonner";
import { Search, FileText, Globe } from "lucide-react";

interface CatalogRecord {
  id: number;
  title: string;
  author: string;
  pubdate?: string;
  publisher?: string;
  isbn?: string;
}

export default function CreateRecordPage() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CatalogRecord[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSearch = async () => {
    if (!query.trim()) return;
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetchWithAuth(`/api/evergreen/catalog?q=${encodeURIComponent(query.trim())}`);
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
        subtitle="Start from a blank MARC template or derive from an existing record."
        breadcrumbs={[
          { label: "Catalog", href: "/staff/catalog" },
          { label: "Create Record" },
        ]}
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
          <Card>
            <CardHeader>
              <CardTitle>Find an Existing Record</CardTitle>
              <CardDescription>Search Evergreen and derive a new record if needed.</CardDescription>
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
