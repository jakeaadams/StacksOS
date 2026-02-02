"use client";

import * as React from "react";
import { useCallback, useEffect, useState } from "react";
import { fetchWithAuth } from "@/lib/client-fetch";
import Link from "next/link";


import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { PlaceHoldDialog } from "./place-hold-dialog";

import {
  ArrowRight,
  Book,
  Bookmark,
  Building,
  Edit,
  ExternalLink,
  ImageOff,
  Package,
} from "lucide-react";

interface RecordCockpitProps {
  recordId: number | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPlaceHold?: (recordId: number) => void;
}

interface RecordData {
  id: number;
  title: string;
  author?: string;
  isbn?: string;
  publisher?: string;
  pubdate?: string;
  edition?: string;
  physicalDescription?: string;
  subjects?: string[];
  summary?: string;
}

interface HoldingInfo {
  library: string;
  location: string;
  callNumber: string;
  copyCount: number;
  availableCount: number;
}

interface CopyInfo {
  id: number;
  barcode: string;
  status: string;
  statusId: number;
  location: string;
  circLib: string;
  callNumber: string;
}

// Cover art with fallback
function CoverArt({ isbn, title }: { isbn?: string; title: string }) {
  const [error, setError] = useState(false);
  const [loaded, setLoaded] = useState(false);

  // Try Open Library first, fallback to placeholder
  const coverUrl = isbn
    ? `https://covers.openlibrary.org/b/isbn/${isbn}-M.jpg`
    : null;

  if (!coverUrl || error) {
    return (
      <div className="w-24 h-32 bg-muted rounded-md flex items-center justify-center shrink-0">
        <ImageOff className="h-8 w-8 text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="w-24 h-32 relative shrink-0">
      {!loaded && <Skeleton className="absolute inset-0 rounded-md" />}
      <img
        src={coverUrl}
        alt={`Cover of ${title}`}
        className={`w-24 h-32 object-contain bg-muted rounded-md shadow-sm ${loaded ? "opacity-100" : "opacity-0"}`}
        onError={() => setError(true)}
        onLoad={() => setLoaded(true)}
      />
    </div>
  );
}

function getStatusColor(statusId: number) {
  switch (statusId) {
    case 0: return "text-green-600"; // Available
    case 1: return "text-blue-600"; // Checked out
    case 6: return "text-amber-600"; // In transit
    case 8: return "text-purple-600"; // On holds shelf
    default: return "text-muted-foreground";
  }
}

export function RecordCockpit({ recordId, open, onOpenChange, onPlaceHold }: RecordCockpitProps) {
  const [record, setRecord] = useState<RecordData | null>(null);
  const [holdings, setHoldings] = useState<HoldingInfo[]>([]);
  const [copies, setCopies] = useState<CopyInfo[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [holdOpen, setHoldOpen] = useState(false);

  const loadRecordData = useCallback(async () => {
    if (!recordId) return;
    setIsLoading(true);

    try {
      const [recordRes, holdingsRes] = await Promise.all([
        fetchWithAuth(`/api/evergreen/catalog?action=record&id=${recordId}`),
        fetchWithAuth(`/api/evergreen/catalog?action=holdings&id=${recordId}`),
      ]);

      const recordData = await recordRes.json();
      if (recordData.ok && recordData.record) {
        const r = recordData.record;
        setRecord({
          id: r.id,
          title: r.title || "Unknown Title",
          author: r.author,
          isbn: r.isbn,
          publisher: r.publisher,
          pubdate: r.pubdate,
          edition: r.edition,
          physicalDescription: r.physicalDescription || r.physical_description,
          subjects: r.subjects || [],
          summary: r.summary,
        });
      }

      const holdingsData = await holdingsRes.json();
      if (holdingsData.ok) {
        // Parse holdings summary
        if (holdingsData.summary) {
          setHoldings(
            (holdingsData.summary || []).map((h: any) => ({
              library: h.library || h.org_name || `Library ${h.org_id}`,
              location: h.location || h.copy_location || "—",
              callNumber: h.call_number || "—",
              copyCount: h.copy_count || 0,
              availableCount: h.available_count || 0,
            }))
          );
        }

        // Parse individual copies
        if (holdingsData.copies) {
          setCopies(
            (holdingsData.copies || []).slice(0, 10).map((c: any) => ({
              id: c.id,
              barcode: c.barcode,
              status: c.status_name || c.status || "Unknown",
              statusId: c.status_id || c.statusId || 0,
              location: c.location || c.copy_location || "—",
              circLib: c.circ_lib_name || c.circLib || "—",
              callNumber: c.call_number || c.callNumber || "—",
            }))
          );
        }
      }
    } catch (_error) {
      toast.error("Failed to load record data");
    } finally {
      setIsLoading(false);
    }
  }, [recordId]);

  useEffect(() => {
    if (open && recordId) {
      loadRecordData();
    }
  }, [open, recordId, loadRecordData]);

  const totalCopies = holdings.length > 0 ? holdings.reduce((sum, h) => sum + h.copyCount, 0) : copies.length;
  const availableCopies = holdings.length > 0 ? holdings.reduce((sum, h) => sum + h.availableCount, 0) : copies.filter(c => c.statusId === 0 || c.statusId === 7).length;

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-[500px] sm:w-[600px] sm:max-w-xl p-0">
        <ScrollArea className="h-full">
          <div className="p-6">
            <SheetHeader className="text-left">
              <SheetTitle className="flex items-center gap-2">
                <Book className="h-5 w-5" />
                Record Quick View
              </SheetTitle>
              <SheetDescription>
                View availability and take quick actions
              </SheetDescription>
            </SheetHeader>

            {isLoading ? (
              <div className="mt-6 space-y-4">
                <div className="flex gap-4">
                  <Skeleton className="w-24 h-32" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-6 w-3/4" />
                    <Skeleton className="h-4 w-1/2" />
                    <Skeleton className="h-4 w-1/3" />
                  </div>
                </div>
                <Skeleton className="h-32 w-full" />
              </div>
            ) : record ? (
              <div className="mt-6 space-y-6">
                {/* Record Header with Cover */}
                <div className="flex gap-4">
                  <CoverArt isbn={record.isbn} title={record.title} />
                  <div className="flex-1 min-w-0">
                    <h3 className="text-lg font-semibold leading-tight">{record.title}</h3>
                    {record.author && (
                      <p className="text-sm text-muted-foreground mt-1">{record.author}</p>
                    )}
                    {record.publisher && (
                      <p className="text-xs text-muted-foreground mt-1">
                        {record.publisher} {record.pubdate && `(${record.pubdate})`}
                      </p>
                    )}
                    {record.isbn && (
                      <p className="text-xs font-mono text-muted-foreground mt-1">
                        ISBN: {record.isbn}
                      </p>
                    )}
                  </div>
                </div>

                {/* Availability Summary */}
                <Card>
                  <CardHeader className="py-3 px-4">
                    <CardTitle className="text-sm flex items-center justify-between">
                      <span>Availability</span>
                      <Badge variant={availableCopies > 0 ? "default" : "secondary"}>
                        {availableCopies} of {totalCopies} available
                      </Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="py-0 px-4 pb-3">
                    {holdings.length > 0 ? (
                      <div className="space-y-2">
                        {holdings.map((h, idx) => (
                          <div key={idx} className="flex items-center justify-between text-sm py-1 border-b last:border-0">
                            <div className="flex items-center gap-2">
                              <Building className="h-3.5 w-3.5 text-muted-foreground" />
                              <span>{h.library}</span>
                            </div>
                            <div className="flex items-center gap-3">
                              <span className="text-xs text-muted-foreground">{h.callNumber}</span>
                              <Badge variant="outline" className={h.availableCount > 0 ? "text-green-600 border-green-300" : ""}>
                                {h.availableCount}/{h.copyCount}
                              </Badge>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">No holdings information available</p>
                    )}
                  </CardContent>
                </Card>

                {/* Copy Details */}
                {copies.length > 0 && (
                  <Card>
                    <CardHeader className="py-3 px-4">
                      <CardTitle className="text-sm flex items-center justify-between">
                        <span>Item Details</span>
                        <Link href={`/staff/cataloging/holdings?record=${record.id}`} className="text-xs text-primary hover:underline">
                          View all <ArrowRight className="h-3 w-3 inline" />
                        </Link>
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="py-0 px-4 pb-3">
                      <div className="space-y-2">
                        {copies.map((c) => (
                          <div key={c.id} className="flex items-center justify-between text-sm py-1.5 border-b last:border-0">
                            <div>
                              <Link
                                href={`/staff/catalog/item/${c.id}`}
                                className="font-mono text-xs hover:underline"
                                title="Open item status"
                              >
                                {c.barcode}
                              </Link>
                              <span className="text-muted-foreground ml-2 text-xs">{c.location}</span>
                            </div>
                            <Badge variant="outline" className={getStatusColor(c.statusId)}>
                              {c.status}
                            </Badge>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Quick Actions */}
                <div className="flex gap-2 flex-wrap">
                  <Button size="sm" asChild>
                    <Link href={`/staff/catalog/record/${record.id}`}>
                      <ExternalLink className="h-4 w-4 mr-1" />
                      Full Record
                    </Link>
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      if (onPlaceHold) {
                        onOpenChange(false);
                        onPlaceHold(record.id);
                        return;
                      }

                      // Built-in hold workflow (no parent wiring required).
                      onOpenChange(false);
                      setHoldOpen(true);
                    }}
                  >
                    <Bookmark className="h-4 w-4 mr-1" />
                    Place Hold
                  </Button>
                  <Button size="sm" variant="outline" asChild>
                    <Link href={`/staff/cataloging/marc-editor?id=${record.id}`}>
                      <Edit className="h-4 w-4 mr-1" />
                      Edit MARC
                    </Link>
                  </Button>
                  <Button size="sm" variant="outline" asChild>
                    <Link href={`/staff/cataloging/holdings?record=${record.id}`}>
                      <Package className="h-4 w-4 mr-1" />
                      Holdings
                    </Link>
                  </Button>
                </div>

                {/* Summary if available */}
                {record.summary && (
                  <Card>
                    <CardHeader className="py-3 px-4">
                      <CardTitle className="text-sm">Summary</CardTitle>
                    </CardHeader>
                    <CardContent className="py-0 px-4 pb-3">
                      <p className="text-sm text-muted-foreground line-clamp-4">{record.summary}</p>
                    </CardContent>
                  </Card>
                )}

                {/* Subjects */}
                {record.subjects && record.subjects.length > 0 && (
                  <div>
                    <h4 className="text-sm font-medium mb-2">Subjects</h4>
                    <div className="flex flex-wrap gap-1">
                      {record.subjects.slice(0, 8).map((subject, idx) => (
                        <Badge key={idx} variant="secondary" className="text-xs">
                          {subject}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="mt-6 text-center py-8 text-muted-foreground">
                No record selected
              </div>
            )}
          </div>
        </ScrollArea>
      </SheetContent>
      </Sheet>
      <PlaceHoldDialog
        open={holdOpen}
        onOpenChange={setHoldOpen}
        record={record ? { id: record.id, title: record.title, author: record.author } : null}
      />
    </>
  );
}
