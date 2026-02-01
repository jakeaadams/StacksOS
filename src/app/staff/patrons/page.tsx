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
  PatronStatusBadge,
  PatronCockpit,
} from "@/components/shared";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

import { UserPlus, Search, CreditCard, BookOpen, History, RefreshCw, Eye } from "lucide-react";

interface PatronRow {
  id: number;
  barcode: string;
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
  homeLibrary?: string | number;
  patronType?: string;
  isActive: boolean;
  cardExpiry?: string;
}

function formatHomeLibrary(value?: string | number) {
  if (value === undefined || value === null) return "—";
  if (typeof value === "string") return value;
  return `Library ${value}`;
}

function PatronSearchContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const [searchQuery, setSearchQuery] = useState(searchParams.get("q") || "");
  const [searchType, setSearchType] = useState(searchParams.get("type") || "name");
  const [patrons, setPatrons] = useState<PatronRow[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [lastQuery, setLastQuery] = useState<string | null>(null);
  const [selectedPatron, setSelectedPatron] = useState<PatronRow | null>(null);
  const [cockpitOpen, setCockpitOpen] = useState(false);

  const handleSearch = useCallback(async () => {
    const query = searchQuery.trim();
    if (!query) {
      setHasSearched(false);
      setLastQuery(null);
      setPatrons([]);
      setSelectedPatron(null);
      toast.message("Enter a search term");
      return;
    }
    // Smart search: auto-detect barcode, email, phone
    setHasSearched(true);
    setLastQuery(query);
    const effectiveType = getEffectiveSearchType(query, searchType, "patron");
    setIsLoading(true);

    try {
      const res = await fetchWithAuth(
        `/api/evergreen/patrons?q=${encodeURIComponent(query)}&type=${effectiveType}&limit=50`
      );
      const data = await res.json();

      if (data.ok && data.patrons) {
        const mapped: PatronRow[] = data.patrons.map((p: any) => ({
          id: p.id,
          barcode: p.barcode || "",
          firstName: p.firstName || "",
          lastName: p.lastName || "",
          email: p.email || "",
          phone: p.phone || "",
          homeLibrary: p.homeLibrary,
          patronType: p.patronType || "Patron",
          isActive: p.isActive !== false,
          cardExpiry: p.cardExpiry || "",
        }));

        setPatrons(mapped);
        setSelectedPatron(null);
        if (mapped.length === 0) {
          toast.message("No patrons found");
        } else {
          toast.success(`Found ${mapped.length} patron(s)`);
        }
      } else {
        setPatrons([]);
        toast.message("No patrons found");
      }
    } catch (_error) {
      toast.error("Search failed", { description: "Could not connect to Evergreen" });
      setPatrons([]);
    } finally {
      setIsLoading(false);
    }
  }, [searchQuery, searchType]);

  // Auto-run search when landing with a ?q= URL (e.g. post-create redirect).
  useEffect(() => {
    if (searchQuery.trim()) {
      handleSearch();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleRowClick = useCallback((row: PatronRow) => {
    setSelectedPatron(row);
    setCockpitOpen(true);
  }, []);

  const handleQuickView = useCallback((row: PatronRow, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedPatron(row);
    setCockpitOpen(true);
  }, []);

  const columns = useMemo<ColumnDef<PatronRow>[]>(
    () => [
      {
        accessorKey: "lastName",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Patron" />,
        cell: ({ row }) => (
          <div className="space-y-1">
            <div className="font-medium">
              {row.original.lastName}, {row.original.firstName}
            </div>
            <div className="text-xs text-muted-foreground">
              {row.original.email || row.original.phone || "—"}
            </div>
          </div>
        ),
      },
      {
        accessorKey: "barcode",
        header: "Barcode",
        cell: ({ row }) => (
          <span className="text-xs font-mono text-muted-foreground">{row.original.barcode}</span>
        ),
      },
      {
        accessorKey: "patronType",
        header: "Type",
        cell: ({ row }) => <span className="text-xs">{row.original.patronType || "Patron"}</span>,
      },
      {
        accessorKey: "homeLibrary",
        header: "Home Library",
        cell: ({ row }) => <span className="text-xs">{formatHomeLibrary(row.original.homeLibrary)}</span>,
      },
      {
        id: "status",
        header: "Status",
        cell: ({ row }) => {
          const expired = row.original.cardExpiry
            ? new Date(row.original.cardExpiry) < new Date()
            : false;
          return (
            <PatronStatusBadge
              active={row.original.isActive}
              barred={false}
              expired={expired}
            />
          );
        },
      },
      {
        id: "actions",
        header: "Actions",
        cell: ({ row }) => (
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={(e) => handleQuickView(row.original, e)}
            >
              <Eye className="h-4 w-4 mr-1" />
              Quick View
            </Button>
          </div>
        ),
      },
    ],
    [handleQuickView]
  );

  return (
    <PageContainer>
      <PageHeader
        title="Patron Search"
        subtitle="Find, manage, and act on patron accounts."
        breadcrumbs={[{ label: "Patrons" }]}
        actions={[
          {
            label: "New Patron",
            onClick: () => router.push("/staff/patrons/register"),
            icon: UserPlus,
          },
          {
            label: "Checkout",
            onClick: () =>
              selectedPatron
                ? router.push(`/staff/circulation/checkout?patron=${selectedPatron.barcode}`)
                : toast.message("Select a patron first"),
            icon: BookOpen,
            variant: "outline",
            disabled: !selectedPatron,
          },
          {
            label: "Bills",
            onClick: () =>
              selectedPatron
                ? router.push(`/staff/circulation/bills?patron=${selectedPatron.barcode}`)
                : toast.message("Select a patron first"),
            icon: CreditCard,
            variant: "outline",
            disabled: !selectedPatron,
          },
          {
            label: "History",
            onClick: () =>
              selectedPatron
                ? router.push(`/staff/patrons/${selectedPatron.id}`)
                : toast.message("Select a patron first"),
            icon: History,
            variant: "outline",
            disabled: !selectedPatron,
          },
        ]}
      >
        <div className="flex flex-wrap items-center gap-2">
          {hasSearched ? (
            <Badge
              variant="secondary"
              className="rounded-full"
              data-testid="patron-search-results"
            >
              {isLoading ? "Searching…" : `Results: ${patrons.length}`}
            </Badge>
          ) : null}
          {lastQuery ? (
            <Badge variant="outline" className="rounded-full">
              Query: {lastQuery}
            </Badge>
          ) : null}
          {selectedPatron && (
            <Badge variant="outline" className="rounded-full">
              Selected: {selectedPatron.barcode}
            </Badge>
          )}
        </div>
      </PageHeader>

      <PageContent className="space-y-6">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm uppercase tracking-wide text-muted-foreground">
              Search Patrons
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-3 items-center">
              <div className="relative flex-1 min-w-[240px]">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Name, barcode, email, phone..."
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
                  <SelectItem value="name">Name</SelectItem>
                  <SelectItem value="barcode">Barcode</SelectItem>
                  <SelectItem value="email">Email</SelectItem>
                  <SelectItem value="phone">Phone</SelectItem>
                </SelectContent>
              </Select>
              <Button onClick={handleSearch} disabled={isLoading}>
                {isLoading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                <span className="ml-2">Search</span>
              </Button>
            </div>
          </CardContent>
        </Card>

        <DataTable
          columns={columns}
          data={patrons}
          isLoading={isLoading}
          searchable={false}
          onRowClick={handleRowClick}
          emptyState={
            hasSearched ? (
              <EmptyState
                title="No patrons found"
                description="Try a different name, barcode, email, or phone."
              />
            ) : (
              <EmptyState title="Search for patrons" description="Run a search to see results." />
            )
          }
        />
      </PageContent>

      <PatronCockpit
        open={cockpitOpen}
        onOpenChange={setCockpitOpen}
        patronId={selectedPatron?.id ?? null}
      />
    </PageContainer>
  );
}

export default function PatronSearchPage() {
  return (
    <Suspense fallback={<LoadingSpinner message="Loading patrons..." />}>
      <PatronSearchContent />
    </Suspense>
  );
}
