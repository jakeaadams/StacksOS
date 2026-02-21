"use client";

import { fetchWithAuth } from "@/lib/client-fetch";

import { Suspense, useState, useEffect } from "react";
import { PageContainer, PageHeader, PageContent, EmptyState } from "@/components/shared";
import { useRouter, useSearchParams } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Package, Eye, MapPin, Barcode, Loader2, Search } from "lucide-react";
import Link from "next/link";


interface HoldingRecord {
  id: string | number;
  barcode: string;
  callNumber: string;
  status: string;
  statusId: number;
  location: string;
  circLib: string;
  createDate: string;
  price: number;
  circCount: number;
}

interface BibRecord {
  id: string;
  title: string;
  author: string;
  isbn: string;
}

function HoldingsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const bibIdParam = searchParams.get("id") || searchParams.get("bib");

  const [holdings, setHoldings] = useState<HoldingRecord[]>([]);
  const [bibRecord, setBibRecord] = useState<BibRecord | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchBibId, setSearchBibId] = useState(bibIdParam || "");
  const [selectedHolding, setSelectedHolding] = useState<HoldingRecord | null>(null);
  const [editOpen, setEditOpen] = useState(false);

  const fetchHoldings = async (id: string) => {
    if (!id) return;

    setLoading(true);
    setError(null);

    try {
      // Fetch bib record info
      const recordRes = await fetchWithAuth(`/api/evergreen/catalog?action=record&id=${id}`);
      const recordData = await recordRes.json();

      if (recordData.ok && recordData.record) {
        setBibRecord({
          id: recordData.record.id,
          title: recordData.record.title,
          author: recordData.record.author,
          isbn: recordData.record.isbn,
        });
      }

      // Fetch holdings
      const holdingsRes = await fetchWithAuth(`/api/evergreen/catalog?action=holdings&id=${id}`);
      const holdingsData = await holdingsRes.json();

      if (holdingsData.ok) {
        const rows = Array.isArray(holdingsData.copies)
          ? holdingsData.copies
          : Array.isArray(holdingsData.holdings)
            ? holdingsData.holdings
            : [];

        setHoldings(
          rows.map((h: any) => ({
            id: h.id,
            barcode: h.barcode || "",
            callNumber: h.callNumber || h.call_number || h.call_number_label || "",
            status: h.status_name || h.status || "Unknown",
            statusId: Number(h.statusId ?? h.status_id ?? h.status ?? 0) || 0,
            location: h.location || h.copy_location || "",
            circLib: h.circLib || h.circ_lib_name || "",
            createDate: h.createDate || h.create_date || "",
            price: Number(h.price) || 0,
            circCount: Number(h.circCount ?? h.circ_count ?? h.total_circ_count ?? 0) || 0,
          }))
        );
      } else {
        setError(holdingsData.error || "Failed to fetch holdings");
      }
    } catch {
      setError("Failed to connect to catalog service");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (bibIdParam) {
      fetchHoldings(bibIdParam);
    }
  }, [bibIdParam]);

  const handleSearch = () => {
    if (searchBibId) {
      fetchHoldings(searchBibId);
    }
  };

  const getStatusBadge = (status: string) => {
    const statusLower = status.toLowerCase();
    let className = "bg-muted/50 text-foreground";

    if (statusLower.includes("available")) {
      className = "bg-green-100 text-green-800";
    } else if (statusLower.includes("checked out") || statusLower.includes("checked_out")) {
      className = "bg-blue-100 text-blue-800";
    } else if (statusLower.includes("transit")) {
      className = "bg-purple-100 text-purple-800";
    } else if (statusLower.includes("hold")) {
      className = "bg-yellow-100 text-yellow-800";
    } else if (statusLower.includes("missing") || statusLower.includes("lost")) {
      className = "bg-red-100 text-red-800";
    } else if (statusLower.includes("damaged")) {
      className = "bg-orange-100 text-orange-800";
    }

    return <Badge className={className}>{status.toUpperCase()}</Badge>;
  };

  const availableCount = holdings.filter(h => h.status.toLowerCase().includes("available")).length;
  const totalValue = holdings.reduce((sum, h) => sum + (h.price || 0), 0);

  return (
    <PageContainer>
      <PageHeader
        title="Holdings"
        subtitle="View and manage item holdings for a bibliographic record."
        breadcrumbs={[{ label: "Cataloging", href: "/staff/cataloging" }, { label: "Holdings" }]}
      />
      <PageContent className="p-0">
        <div className="h-full flex flex-col -m-6">
      <div className="bg-muted/50 border-b px-4 py-2 flex items-center gap-2">
        <div className="flex-1" />
        <Button asChild size="sm" variant="outline"><Link href="/staff/cataloging">Back to Cataloging</Link></Button>
      </div>

      {!bibIdParam && (
        <div className="bg-background border-b px-4 py-3">
          <div className="flex items-center gap-2 max-w-xl">
            <Input
              placeholder="Enter Bib Record ID..."
              value={searchBibId}
              onChange={(e) => setSearchBibId(e.target.value)}
              onKeyPress={(e) => e.key === "Enter" && handleSearch()}
              className="h-9"
            />
            <Button size="sm" onClick={handleSearch} disabled={loading || !searchBibId}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      )}

      {bibRecord && (
        <div className="bg-background border-b px-4 py-3">
          <div className="flex items-start gap-4">
            <div className="flex-1">
              <h2 className="font-semibold">{bibRecord.title}</h2>
              <p className="text-sm text-muted-foreground">{bibRecord.author}</p>
            </div>
            <div className="text-right text-sm">
              <div>Bib ID: <span className="font-mono">{bibRecord.id}</span></div>
              {bibRecord.isbn && <div>ISBN: <span className="font-mono">{bibRecord.isbn}</span></div>}
            </div>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-auto p-4">
        {loading && (
          <div className="flex items-center justify-center p-8">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        )}

        {error && (
          <div className="p-4 text-center text-red-600">{error}</div>
        )}

        {!loading && !error && !bibRecord && !bibIdParam && (
          <div className="p-8 text-center text-muted-foreground">
            <Package className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>Enter a Bib Record ID to view holdings</p>
          </div>
        )}

        {!loading && holdings.length === 0 && bibRecord && (
          <Card>
            <CardContent className="pt-10 pb-10">
              <EmptyState
                icon={Package}
                title="No holdings found"
                description="This bibliographic record has no item holdings (copies) yet."
                action={{
                  label: "Evergreen setup checklist",
                  onClick: () => router.push("/staff/help#evergreen-setup"),
                }}
                secondaryAction={{
                  label: "Seed demo data",
                  onClick: () => router.push("/staff/help#demo-data"),
                }}
              />
            </CardContent>
          </Card>
        )}

        {holdings.length > 0 && (
          <Card>
            <CardHeader className="py-3">
              <CardTitle className="text-base flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <Package className="h-4 w-4" />Holdings ({holdings.length} items)
                </span>
                <div className="flex items-center gap-4 text-sm font-normal">
                  <span className="text-green-600">{availableCount} available</span>
                  {totalValue > 0 && <span className="text-muted-foreground">Total value: ${totalValue.toFixed(2)}</span>}
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-36">Barcode</TableHead>
                    <TableHead>Call Number</TableHead>
                    <TableHead>Location</TableHead>
                    <TableHead className="w-28">Status</TableHead>
                    <TableHead className="w-20">Circs</TableHead>
                    <TableHead className="w-28">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {holdings.map((holding) => (
                    <TableRow key={holding.id}>
                      <TableCell className="font-mono text-sm">
                        <Link
                          href={`/staff/catalog/item/${holding.id}`}
                          className="text-primary hover:underline"
                          title="Open item details"
                        >
                          {holding.barcode || String(holding.id)}
                        </Link>
                      </TableCell>
                      <TableCell className="font-mono text-sm">{holding.callNumber || "-"}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <MapPin className="h-3 w-3 text-muted-foreground" />
                          {holding.location || holding.circLib || "-"}
                        </div>
                      </TableCell>
                      <TableCell>{getStatusBadge(holding.status)}</TableCell>
                      <TableCell className="text-center">{holding.circCount}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 w-7 p-0"
                            onClick={() => { setSelectedHolding(holding); setEditOpen(true); }}
                            aria-label="View details"
                            title="View details"
                          >
                            <Eye className="h-3 w-3" />
                          </Button>
                          <Button
                            asChild
                            size="sm"
                            variant="ghost"
                            className="h-7 w-7 p-0"
                            title="Open item details"
                          >
                            <Link href={`/staff/catalog/item/${holding.id}`}>
                              <Barcode className="h-3 w-3" />
                              <span className="sr-only">Item details</span>
                            </Link>
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
      </div>

      <div className="bg-muted/50 border-t px-4 py-1 text-xs text-muted-foreground flex items-center gap-4">
        <span>Bib ID: {bibRecord?.id || "-"}</span>
        <span>Total Items: {holdings.length}</span>
        <span>Available: {availableCount}</span>
        <div className="flex-1" />
        <span>Holdings Management</span>
      </div>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Item Details: {selectedHolding?.barcode}</DialogTitle>
          </DialogHeader>
          {selectedHolding && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="barcode" className="text-sm font-medium">Barcode</label>
                  <div className="font-mono">{selectedHolding.barcode}</div>
                </div>
                <div>
                  <label htmlFor="status" className="text-sm font-medium">Status</label>
                  <div>{getStatusBadge(selectedHolding.status)}</div>
                </div>
              </div>
              <div>
                <label htmlFor="call-number" className="text-sm font-medium">Call Number</label>
                <div className="font-mono">{selectedHolding.callNumber}</div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="location" className="text-sm font-medium">Location</label>
                  <div>{selectedHolding.location || selectedHolding.circLib || "-"}</div>
                </div>
                <div>
                  <label htmlFor="circulation-count" className="text-sm font-medium">Circulation Count</label>
                  <div>{selectedHolding.circCount}</div>
                </div>
              </div>
              {selectedHolding.price > 0 && (
                <div>
                  <label htmlFor="price" className="text-sm font-medium">Price</label>
                  <div>${selectedHolding.price.toFixed(2)}</div>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
      </PageContent>
    </PageContainer>
  );
}

export default function HoldingsPage() {
  return <Suspense fallback={<div className="p-4">Loading...</div>}><HoldingsContent /></Suspense>;
}
