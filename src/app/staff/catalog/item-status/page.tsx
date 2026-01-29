"use client";

import { fetchWithAuth } from "@/lib/client-fetch";

import { useEffect, useMemo, useState } from "react";
import {
  PageContainer,
  PageHeader,
  PageContent,
  BarcodeInput,
  EmptyState,
  ErrorMessage,
  ItemStatusBadge,
  StatusBadge,
  DataTable,
} from "@/components/shared";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useSearchParams } from "next/navigation";
import { BookOpen, Package, Tag, FileText } from "lucide-react";
import { ColumnDef } from "@tanstack/react-table";

interface ItemHistory {
  id: number;
  patronId?: number;
  checkoutDate?: string;
  patronBarcode?: string;
  patronName?: string;
  dueDate?: string;
  checkinDate?: string | null;
  status?: string;
  renewalRemaining?: number;
}

interface ItemStatus {
  id: number;
  barcode: string;
  statusId: number;
  statusName: string;
  callNumber: string;
  callNumberId?: number;
  recordId?: number;
  location: string;
  locationId?: number;
  circLib: string;
  circLibId?: number;
  owningLib: string;
  owningLibId?: number;
  copyNumber: number;
  price?: number;
  holdable: boolean;
  circulate: boolean;
  refItem: boolean;
  title: string;
  author: string;
  isbn?: string;
  publisher?: string;
  pubdate?: string;
  edition?: string;
  format?: string;
  history?: ItemHistory[];
  historyError?: string;
}

function formatDate(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString();
}

export default function ItemStatusPage() {
  const searchParams = useSearchParams();
  const barcodeParam = searchParams.get("barcode") || "";
  const [barcode, setBarcode] = useState(barcodeParam);
  const [item, setItem] = useState<ItemStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const historyColumns = useMemo<ColumnDef<ItemHistory>[]>(
    () => [
      {
        accessorKey: "patronId",
        header: "Patron",
        cell: ({ row }) => row.original.patronBarcode || row.original.patronId ? <span className="font-mono text-xs">{row.original.patronBarcode || 'ID ' + row.original.patronId}</span> : "—",
      },
      {
        accessorKey: "checkoutDate",
        header: "Checked Out",
        cell: ({ row }) => formatDate(row.original.checkoutDate),
      },
      {
        accessorKey: "dueDate",
        header: "Due",
        cell: ({ row }) => formatDate(row.original.dueDate),
      },
      {
        accessorKey: "checkinDate",
        header: "Checked In",
        cell: ({ row }) => formatDate(row.original.checkinDate || undefined),
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => (
          <StatusBadge
            label={row.original.status || "Unknown"}
            status={row.original.status === "Returned" ? "success" : "warning"}
          />
        ),
      },
    ],
    []
  );

  const handleLookup = async (value: string) => {
    if (!value.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetchWithAuth(`/api/evergreen/items?barcode=${encodeURIComponent(value.trim())}&include=bib,history`);
      const data = await res.json();
      if (!res.ok || data.ok === false) {
        throw new Error(data.error || "Item not found");
      }
      setItem(data.item);
      toast.success("Item found");
    } catch (err: any) {
      setError(err?.message || "Item lookup failed");
      setItem(null);
      toast.error(err?.message || "Item lookup failed");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (barcodeParam) {
      setBarcode(barcodeParam);
      handleLookup(barcodeParam);
    }
  }, [barcodeParam]);

  return (
    <PageContainer>
      <PageHeader
        title="Item Status"
        subtitle="Live item metadata and circulation status."
        breadcrumbs={[
          { label: "Catalog", href: "/staff/catalog" },
          { label: "Item Status" },
        ]}
      />
      <PageContent>
        {error && (
          <div className="mb-4">
            <ErrorMessage message={error} onRetry={() => setError(null)} />
          </div>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Lookup Item</CardTitle>
            <CardDescription>Scan or enter an item barcode.</CardDescription>
          </CardHeader>
          <CardContent>
            <BarcodeInput
              label="Item Barcode"
              value={barcode}
              onChange={setBarcode}
              onSubmit={handleLookup}
              isLoading={loading}
              autoFocus
            />
          </CardContent>
        </Card>

        {!item && (
          <Card className="mt-6">
            <CardContent className="py-10">
              <EmptyState
                icon={Tag}
                title="No item loaded"
                description="Scan an item barcode to view real-time status."
              />
            </CardContent>
          </Card>
        )}

        {item && (
          <div className="space-y-6 mt-6">
            <Card>
              <CardHeader>
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      {item.title || "Unknown Title"}
                      <ItemStatusBadge statusId={item.statusId} />
                    </CardTitle>
                    <CardDescription>
                      {item.author || "Unknown Author"} • {item.barcode}
                    </CardDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    {item.circulate ? (
                      <StatusBadge label="Circulating" status="success" />
                    ) : (
                      <StatusBadge label="Non-circulating" status="warning" />
                    )}
                    {item.refItem && <StatusBadge label="Reference" status="info" />}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Call Number</span>
                    <span className="font-medium">{item.callNumber || "—"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Location</span>
                    <span>{item.location || "—"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Circ Library</span>
                    <span>{item.circLib || "—"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Owning Library</span>
                    <span>{item.owningLib || "—"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Copy Number</span>
                    <span>{item.copyNumber}</span>
                  </div>
                </div>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Record ID</span>
                    <span className="font-mono">{item.recordId ?? "—"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">ISBN</span>
                    <span>{item.isbn || "—"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Publisher</span>
                    <span>{item.publisher || "—"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Publication Date</span>
                    <span>{item.pubdate || "—"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Price</span>
                    <span>{item.price ? `$${item.price.toFixed(2)}` : "—"}</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Circulation History</CardTitle>
                <CardDescription>Recent checkouts for this copy</CardDescription>
              </CardHeader>
              <CardContent>
                {item.historyError && (
                  <div className="mb-3">
                    <ErrorMessage message={item.historyError} />
                  </div>
                )}
                <DataTable
                  columns={historyColumns}
                  data={item.history || []}
                  searchable={false}
                  paginated={false}
                  emptyState={<EmptyState title="No circulation history" description="No prior checkouts returned." />}
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Actions</CardTitle>
                <CardDescription>Take action on this item</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-2">
                <Button variant="outline" onClick={() => window.location.href = `/staff/circulation/checkout?item=${item.barcode}`}>
                  <BookOpen className="h-4 w-4 mr-2" />
                  Check Out
                </Button>
                <Button variant="outline" onClick={() => window.location.href = `/staff/circulation/checkin?item=${item.barcode}`}>
                  <Package className="h-4 w-4 mr-2" />
                  Check In
                </Button>
                {item.recordId && (
                  <Button variant="outline" onClick={() => window.location.href = `/staff/cataloging/marc-editor?id=${item.recordId}`}>
                    <FileText className="h-4 w-4 mr-2" />
                    Edit MARC
                  </Button>
                )}
              </CardContent>
            </Card>
          </div>
        )}
      </PageContent>
    </PageContainer>
  );
}
