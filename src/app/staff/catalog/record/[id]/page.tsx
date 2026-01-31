"use client";

import { fetchWithAuth } from "@/lib/client-fetch";
import { clientLogger } from "@/lib/client-logger";
import * as React from "react";
import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  PageContainer,
  PageHeader,
  PageContent,
  LoadingSpinner,
  DataTable,
  DataTableColumnHeader,
  EmptyState,
  ErrorBoundary,
} from "@/components/shared";
import { CoverArtPicker } from "@/components/shared/cover-art-picker";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { ColumnDef } from "@tanstack/react-table";
import {
  ArrowLeft,
  BookOpen,
  Edit,
  PencilLine,
  Package,
  Bookmark,
  MapPin,
  Building,
  Printer,
  CheckCircle,
  ExternalLink,
  ImageOff,
  Copy,
} from "lucide-react";

interface RecordDetail {
  id: number;
  tcn: string;
  title: string;
  author?: string;
  contributors?: string[];
  isbn?: string;
  issn?: string;
  upc?: string;
  publisher?: string;
  pubdate?: string;
  edition?: string;
  physicalDescription?: string;
  language?: string;
  subjects?: string[];
  summary?: string;
  series?: string;
  format?: string;
  notes?: string[];
  createDate?: string;
  editDate?: string;
}

interface CopyInfo {
  id: number;
  barcode: string;
  status: string;
  statusId: number;
  location: string;
  circLib: string;
  callNumber: string;
  dueDate?: string;
  holdable: boolean;
  circulate: boolean;
}

interface HoldingsSummary {
  library: string;
  location: string;
  callNumber: string;
  totalCopies: number;
  availableCopies: number;
}

function CoverImage({
  isbn,
  title,
  customCoverUrl,
  onClick
}: {
  isbn?: string;
  title: string;
  customCoverUrl?: string;
  onClick: () => void;
}) {
  const [error, setError] = useState(false);
  const [loaded, setLoaded] = useState(false);

  // Use custom cover if available, otherwise use OpenLibrary
  const cleanIsbn = isbn ? isbn.replace(/[^0-9X]/gi, "") : "";
  const coverUrl = customCoverUrl || (cleanIsbn ? `https://covers.openlibrary.org/b/isbn/${cleanIsbn}-L.jpg` : null);

  if (!coverUrl || error) {
    return (
      <div
        className="w-48 h-64 bg-muted rounded-lg flex flex-col items-center justify-center cursor-pointer hover:bg-muted/70 transition-colors group"
        onClick={onClick}
        title="Click to upload cover art"
      >
        <ImageOff className="h-12 w-12 text-muted-foreground group-hover:text-foreground transition-colors" />
        <span className="text-xs text-muted-foreground group-hover:text-foreground mt-2 transition-colors">Click to upload</span>
      </div>
    );
  }

  return (
    <div className="w-48 h-64 relative group cursor-pointer" onClick={onClick} title="Click to change cover art">
      {!loaded && (
        <div className="absolute inset-0 bg-muted rounded-lg animate-pulse" />
      )}
      <img
        src={coverUrl}
        alt={"Cover of " + title}
        className={"w-48 h-64 object-contain bg-muted rounded-lg shadow-md " + (loaded ? "opacity-100" : "opacity-0")}
        onError={() => setError(true)}
        onLoad={() => setLoaded(true)}
      />
      <div className="absolute inset-0 bg-black/60 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
        <div className="text-white text-center">
          <Edit className="h-8 w-8 mx-auto mb-2" />
          <span className="text-sm font-medium">Change Cover</span>
        </div>
      </div>
    </div>
  );
}

function getStatusColor(statusId: number) {
  switch (statusId) {
    case 0: return "text-green-600 bg-green-50 border-green-200";
    case 1: return "text-blue-600 bg-blue-50 border-blue-200";
    case 6: return "text-amber-600 bg-amber-50 border-amber-200";
    case 8: return "text-purple-600 bg-purple-50 border-purple-200";
    default: return "text-muted-foreground bg-muted border-border";
  }
}

export default function CatalogRecordPage() {
  const params = useParams();
  const router = useRouter();
  const recordId = params.id as string;

  const [record, setRecord] = useState<RecordDetail | null>(null);
  const [copies, setCopies] = useState<CopyInfo[]>([]);
  const [holdings, setHoldings] = useState<HoldingsSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [coverPickerOpen, setCoverPickerOpen] = useState(false);
  const [customCoverUrl, setCustomCoverUrl] = useState<string | undefined>(undefined);
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameTitle, setRenameTitle] = useState("");
  const [renameSaving, setRenameSaving] = useState(false);

  const loadRecordData = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const [recordRes, holdingsRes, coverRes] = await Promise.all([
        fetchWithAuth("/api/evergreen/catalog?action=record&id=" + recordId),
        fetchWithAuth("/api/evergreen/catalog?action=holdings&id=" + recordId),
        fetch("/api/save-cover?recordId=" + recordId).catch(() => null),
      ]);

      const recordData = await recordRes.json();
      if (recordData.ok && recordData.record) {
        const r = recordData.record;
        setRecord({
          id: r.id,
          tcn: r.tcn || "",
          title: r.title || "Unknown Title",
          author: r.author,
          contributors: r.contributors || [],
          isbn: r.isbn,
          issn: r.issn,
          upc: r.upc,
          publisher: r.publisher,
          pubdate: r.pubdate,
          edition: r.edition,
          physicalDescription: r.physicalDescription || r.physical_description,
          language: r.language,
          subjects: r.subjects || [],
          summary: r.summary,
          series: r.series,
          format: r.format,
          notes: r.notes || [],
          createDate: r.create_date,
          editDate: r.edit_date,
        });
      } else {
        setError("Record not found");
      }

      // Load custom cover if available
      if (coverRes && coverRes.ok) {
        const coverData = await coverRes.json();
        if (coverData.success && coverData.coverUrl) {
          setCustomCoverUrl(coverData.coverUrl);
        }
      }

      const holdingsData = await holdingsRes.json();
      if (holdingsData.ok) {
        if (holdingsData.summary) {
          setHoldings(
            holdingsData.summary.map((h: any) => ({
              library: h.library || h.org_name || "Library " + h.org_id,
              location: h.location || h.copy_location || "-",
              callNumber: h.call_number || "-",
              totalCopies: h.copy_count || 0,
              availableCopies: h.available_count || 0,
            }))
          );
        }

        if (holdingsData.copies) {
          setCopies(
            holdingsData.copies.map((c: any) => ({
              id: c.id,
              barcode: c.barcode || "-",
              status: c.status_name || c.status || "Unknown",
              statusId: c.status_id || c.statusId || 0,
              location: c.location || c.copy_location || "-",
              circLib: c.circ_lib_name || c.circLib || "-",
              callNumber: c.call_number || c.callNumber || "-",
              dueDate: c.due_date,
              holdable: c.holdable !== false,
              circulate: c.circulate !== false,
            }))
          );
        }
      }
    } catch (err) {
      clientLogger.error("Error loading record:", err);
      setError("Failed to load record details");
      toast.error("Failed to load record");
    } finally {
      setIsLoading(false);
    }
  }, [recordId]);

  useEffect(() => {
    loadRecordData();
  }, [loadRecordData]);

  const totalCopies = holdings.length > 0 ? holdings.reduce((sum, h) => sum + h.totalCopies, 0) : copies.length;
  const availableCopies = holdings.length > 0 ? holdings.reduce((sum, h) => sum + h.availableCopies, 0) : copies.filter(c => c.statusId === 0 || c.statusId === 7).length;

  useEffect(() => {
    if (renameOpen && record?.title) {
      setRenameTitle(record.title);
    }
  }, [renameOpen, record?.title]);

	  const handleCoverSelected = async (url: string, source: string) => {
	    setCustomCoverUrl(url);
	    
	    // Save to server (and eventually to Evergreen)
	    try {
	      const response = await fetchWithAuth("/api/save-cover", {
	        method: "POST",
	        headers: { "Content-Type": "application/json" },
	        body: JSON.stringify({ recordId, coverUrl: url, source }),
	      });
      
      if (!response.ok) {
        throw new Error("Failed to save cover");
      }
      
      toast.success(`Cover updated from ${source}`);
      clientLogger.info("Cover saved:", { url, source, recordId });
    } catch (err) {
      clientLogger.error("Error saving cover:", err);
      toast.error("Cover updated locally, but failed to save to server");
    }
  };

  const handleTitleEdit = async (newTitle: string) => {
	    const response = await fetchWithAuth("/api/update-record-title", {
	      method: "POST",
	      headers: { "Content-Type": "application/json" },
	      body: JSON.stringify({ recordId, title: newTitle }),
	    });
    
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || "Failed to update title");
    }
    
    if (data.warning) {
      toast.warning(data.warning);
    } else {
      toast.success("Title updated");
    }
    
    // Update local state
    if (record) {
      setRecord({ ...record, title: newTitle });
    }
  };

  const handleRenameSubmit = async () => {
    const nextTitle = renameTitle.trim();
    if (!nextTitle) {
      toast.error("Title cannot be empty");
      return;
    }
    if (record && nextTitle === record.title) {
      setRenameOpen(false);
      return;
    }

    setRenameSaving(true);
    try {
      await handleTitleEdit(nextTitle);
      setRenameOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to rename title");
    } finally {
      setRenameSaving(false);
    }
  };

  const copyColumns: ColumnDef<CopyInfo>[] = [
    {
      accessorKey: "barcode",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Barcode" />,
      cell: ({ row }) => (
        <Link href={"/staff/catalog/item/" + row.original.id} className="font-mono text-sm text-primary hover:underline">
          {row.original.barcode}
        </Link>
      ),
    },
    {
      accessorKey: "callNumber",
      header: "Call Number",
      cell: ({ row }) => (
        <span className="text-sm">{row.original.callNumber}</span>
      ),
    },
    {
      accessorKey: "location",
      header: "Location",
      cell: ({ row }) => (
        <div className="flex items-center gap-1.5">
          <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-sm">{row.original.location}</span>
        </div>
      ),
    },
    {
      accessorKey: "circLib",
      header: "Library",
      cell: ({ row }) => (
        <div className="flex items-center gap-1.5">
          <Building className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-sm">{row.original.circLib}</span>
        </div>
      ),
    },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row }) => (
        <Badge variant="outline" className={getStatusColor(row.original.statusId)}>
          {row.original.status}
        </Badge>
      ),
    },
    {
      accessorKey: "dueDate",
      header: "Due Date",
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">
          {row.original.dueDate ? new Date(row.original.dueDate).toLocaleDateString() : "-"}
        </span>
      ),
    },
  ];

  if (isLoading) {
    return <LoadingSpinner message="Loading record..." />;
  }

  if (error || !record) {
    return (
      <PageContainer>
        <PageContent>
          <EmptyState
            title="Record not found"
            description={error || "The requested record could not be found."}
            action={{
              label: "Back to Catalog",
              onClick: () => router.push("/staff/catalog"),
              icon: ArrowLeft,
            }}
          />
        </PageContent>
      </PageContainer>
    );
  }

  return (
    <ErrorBoundary onReset={() => router.refresh()}>
      <PageContainer>
        <PageHeader
          title={record.title}
        subtitle={`${record.author ? `by ${record.author} • ` : ""}Record #${record.id}`}
        breadcrumbs={[
          { label: "Catalog", href: "/staff/catalog" },
          { label: record.title && record.title.length > 42 ? `${record.title.slice(0, 42)}…` : (record.title || `Record ${record.id}`) },
        ]}
        actions={[
          {
            label: "Back",
            onClick: () => router.back(),
            icon: ArrowLeft,
            variant: "outline",
          },
          {
            label: "Edit MARC",
            onClick: () => router.push("/staff/cataloging/marc-editor?id=" + record.id),
            icon: Edit,
          },
          {
            label: "Rename Title",
            onClick: () => setRenameOpen(true),
            icon: PencilLine,
            variant: "outline",
          },
          {
            label: "Holdings",
            onClick: () => router.push("/staff/cataloging/holdings?id=" + record.id),
            icon: Package,
            variant: "outline",
          },
          {
            label: "Place Hold",
            onClick: () => toast.info("Hold dialog would open"),
            icon: Bookmark,
            variant: "outline",
          },
        ]}
      />

      <PageContent className="space-y-6">
        {/* Main Info Card */}
        <div className="grid lg:grid-cols-4 gap-6">
          {/* Cover & Quick Stats */}
          <Card className="lg:col-span-1">
            <CardContent className="pt-6 flex flex-col items-center gap-4">
              <CoverImage
                isbn={record.isbn}
                title={record.title}
                customCoverUrl={customCoverUrl}
                onClick={() => setCoverPickerOpen(true)}
              />
              
              <div className="w-full space-y-3 pt-2">
                <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                  <span className="text-sm text-muted-foreground">Total Copies</span>
                  <span className="text-lg font-semibold">{totalCopies}</span>
                </div>
                <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                  <span className="text-sm text-muted-foreground">Available</span>
                  <span className={"text-lg font-semibold " + (availableCopies > 0 ? "text-green-600" : "text-amber-600")}>
                    {availableCopies}
                  </span>
                </div>
              </div>

              <Separator />

              <div className="w-full space-y-2">
                <Button variant="outline" size="sm" className="w-full" asChild>
                  <Link href={"/opac/record/" + record.id} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="h-4 w-4 mr-2" />
                    View in OPAC
                  </Link>
                </Button>
                <Button variant="outline" size="sm" className="w-full" type="button">
                  <Printer className="h-4 w-4 mr-2" />
                  Print Labels
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Details */}
          <Card className="lg:col-span-3">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BookOpen className="h-5 w-5" />
                Bibliographic Details
              </CardTitle>
              <CardDescription>
                TCN: {record.tcn || record.id} | Record ID: {record.id}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Tabs defaultValue="details">
                <TabsList>
                  <TabsTrigger value="details">Details</TabsTrigger>
                  <TabsTrigger value="subjects">Subjects</TabsTrigger>
                  {record.summary && <TabsTrigger value="summary">Summary</TabsTrigger>}
                  {record.notes && record.notes.length > 0 && <TabsTrigger value="notes">Notes</TabsTrigger>}
                </TabsList>

                <TabsContent value="details" className="mt-4">
                  <div className="grid sm:grid-cols-2 gap-4">
                    {record.author && (
                      <div>
                        <span className="text-xs text-muted-foreground uppercase tracking-wide">Author</span>
                        <p className="font-medium">{record.author}</p>
                      </div>
                    )}
                    {record.publisher && (
                      <div>
                        <span className="text-xs text-muted-foreground uppercase tracking-wide">Publisher</span>
                        <p className="font-medium">{record.publisher}</p>
                      </div>
                    )}
                    {record.pubdate && (
                      <div>
                        <span className="text-xs text-muted-foreground uppercase tracking-wide">Publication Date</span>
                        <p className="font-medium">{record.pubdate}</p>
                      </div>
                    )}
                    {record.edition && (
                      <div>
                        <span className="text-xs text-muted-foreground uppercase tracking-wide">Edition</span>
                        <p className="font-medium">{record.edition}</p>
                      </div>
                    )}
                    {record.isbn && (
                      <div>
                        <span className="text-xs text-muted-foreground uppercase tracking-wide">ISBN</span>
                        <p className="font-mono">{record.isbn}</p>
                      </div>
                    )}
                    {record.issn && (
                      <div>
                        <span className="text-xs text-muted-foreground uppercase tracking-wide">ISSN</span>
                        <p className="font-mono">{record.issn}</p>
                      </div>
                    )}
                    {record.format && (
                      <div>
                        <span className="text-xs text-muted-foreground uppercase tracking-wide">Format</span>
                        <Badge variant="secondary">{record.format}</Badge>
                      </div>
                    )}
                    {record.language && (
                      <div>
                        <span className="text-xs text-muted-foreground uppercase tracking-wide">Language</span>
                        <p className="font-medium">{record.language}</p>
                      </div>
                    )}
                    {record.physicalDescription && (
                      <div className="sm:col-span-2">
                        <span className="text-xs text-muted-foreground uppercase tracking-wide">Physical Description</span>
                        <p className="font-medium">{record.physicalDescription}</p>
                      </div>
                    )}
                    {record.series && (
                      <div className="sm:col-span-2">
                        <span className="text-xs text-muted-foreground uppercase tracking-wide">Series</span>
                        <p className="font-medium">{record.series}</p>
                      </div>
                    )}
                  </div>
                </TabsContent>

                <TabsContent value="subjects" className="mt-4">
                  {record.subjects && record.subjects.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {record.subjects.map((subject, idx) => (
                        <Badge key={"subject-" + idx} variant="outline" className="cursor-pointer hover:bg-muted">
                          {subject}
                        </Badge>
                      ))}
                    </div>
                  ) : (
                    <p className="text-muted-foreground">No subjects available</p>
                  )}
                </TabsContent>

                {record.summary && (
                  <TabsContent value="summary" className="mt-4">
                    <p className="text-sm leading-relaxed whitespace-pre-line">{record.summary}</p>
                  </TabsContent>
                )}

                {record.notes && record.notes.length > 0 && (
                  <TabsContent value="notes" className="mt-4">
                    <ul className="space-y-2">
                      {record.notes.map((note, idx) => (
                        <li key={"note-" + idx} className="text-sm text-muted-foreground">{note}</li>
                      ))}
                    </ul>
                  </TabsContent>
                )}
              </Tabs>
            </CardContent>
          </Card>
        </div>

        {/* Holdings Summary */}
        {holdings.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Building className="h-5 w-5" />
                Holdings by Location
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {holdings.map((h, idx) => (
                  <div key={"holding-" + idx} className="p-4 border rounded-lg">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-medium">{h.library}</span>
                      <Badge variant={h.availableCopies > 0 ? "default" : "secondary"}>
                        {h.availableCopies}/{h.totalCopies}
                      </Badge>
                    </div>
                    <div className="text-sm text-muted-foreground">
                      <p>{h.location}</p>
                      <p className="font-mono text-xs mt-1">{h.callNumber}</p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Individual Copies */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Copy className="h-5 w-5" />
              Item Copies ({copies.length})
            </CardTitle>
            <CardDescription>
              Individual copies attached to this bibliographic record
            </CardDescription>
          </CardHeader>
          <CardContent>
            <DataTable
              columns={copyColumns}
              data={copies}
              searchable={false}
              emptyState={
                <EmptyState
                  title="No copies"
                  description="No copies are attached to this record."
                />
              }
            />
          </CardContent>
        </Card>
      </PageContent>

      <CoverArtPicker
        open={coverPickerOpen}
        onOpenChange={setCoverPickerOpen}
        isbn={record?.isbn}
        title={record?.title || ""}
        author={record?.author}
        recordId={parseInt(recordId)}
        currentCoverUrl={customCoverUrl}
        onCoverSelected={handleCoverSelected}
      />

      <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Rename Title</DialogTitle>
            <DialogDescription>
              This changes the display title. For authoritative changes, update the MARC record.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="rename-title">Title</Label>
            <Input
              id="rename-title"
              value={renameTitle}
              onChange={(e) => setRenameTitle(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleRenameSubmit()}
              autoFocus
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setRenameOpen(false)} disabled={renameSaving}>
              Cancel
            </Button>
            <Button onClick={handleRenameSubmit} disabled={renameSaving}>
              Save Title
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      </PageContainer>
    </ErrorBoundary>
  );
}
