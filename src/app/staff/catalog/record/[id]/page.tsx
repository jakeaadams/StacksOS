"use client";

import * as React from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ArrowLeft,
  BookOpen,
  Bookmark,
  Edit,
  ExternalLink,
  ListOrdered,
  Package,
  Plus,
} from "lucide-react";
import { fetchWithAuth } from "@/lib/client-fetch";
import { clientLogger } from "@/lib/client-logger";
import {
  EmptyState,
  ErrorBoundary,
  LoadingSpinner,
  PageContainer,
  PageContent,
  PageHeader,
  PlaceHoldDialog,
} from "@/components/shared";
import { AddItemDialog } from "@/components/cataloging/add-item-dialog";
import { CoverArtPicker } from "@/components/shared/cover-art-picker";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { CoverImage, ItemsTab, MarcViewTab, HoldQueueCard } from "./_components";
import type {
  RecordDetail,
  CopyInfo,
  HoldingsSummary,
  TitleHold,
  CopyLocationOption,
  CopyStatusOption,
} from "./_components/record-types";
import {
  parseMarcXmlForView,
  buildLeaderRows,
  build008Rows,
  isCopyAvailable,
  formatDateTime,
} from "./_components/record-utils";

export default function CatalogRecordPage() {
  const params = useParams();
  const router = useRouter();
  const recordId = params.id as string;

  const [record, setRecord] = useState<RecordDetail | null>(null);
  const [copies, setCopies] = useState<CopyInfo[]>([]);
  const [holdings, setHoldings] = useState<HoldingsSummary[]>([]);
  const [titleHolds, setTitleHolds] = useState<TitleHold[]>([]);
  const [titleHoldCount, setTitleHoldCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [coverPickerOpen, setCoverPickerOpen] = useState(false);
  const [customCoverUrl, setCustomCoverUrl] = useState<string | undefined>(undefined);
  const [holdOpen, setHoldOpen] = useState(false);
  const [addItemOpen, setAddItemOpen] = useState(false);
  const [copyLocations, setCopyLocations] = useState<CopyLocationOption[]>([]);
  const [copyStatuses, setCopyStatuses] = useState<CopyStatusOption[]>([]);

  const loadRecordData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [recordRes, holdingsRes, coverRes, titleHoldsRes] = await Promise.all([
        fetchWithAuth("/api/evergreen/catalog?action=record&id=" + recordId),
        fetchWithAuth("/api/evergreen/catalog?action=holdings&id=" + recordId),
        fetch("/api/save-cover?recordId=" + recordId).catch(() => null),
        fetchWithAuth(
          `/api/evergreen/holds?action=title_holds&title_id=${encodeURIComponent(recordId)}&limit=25`
        ).catch(() => null),
      ]);
      let fallbackHoldCount = 0;
      const recordData = await recordRes.json();
      if (recordData.ok && recordData.record) {
        const r = recordData.record;
        const holdCountRaw = Number.parseInt(String(r.hold_count ?? r.holdCount ?? "0"), 10);
        fallbackHoldCount = Number.isFinite(holdCountRaw) ? holdCountRaw : 0;
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
          holdCount: fallbackHoldCount,
          marcXml: typeof r.marc_xml === "string" ? r.marc_xml : undefined,
        });
      } else {
        setError("Record not found");
      }

      if (coverRes && coverRes.ok) {
        const coverData = await coverRes.json();
        if (coverData.success && coverData.coverUrl) setCustomCoverUrl(coverData.coverUrl);
      }

      const holdingsData = await holdingsRes.json();
      if (holdingsData.ok) {
        if (holdingsData.summary) {
          setHoldings(
            holdingsData.summary.map((holding: unknown) => {
              const h =
                typeof holding === "object" && holding ? (holding as Record<string, any>) : {};
              const orgId = String(h.org_id ?? "").trim();
              return {
                library: String(
                  h.library ?? h.org_name ?? (orgId ? `Library ${orgId}` : "Library")
                ),
                location: String(h.location ?? h.copy_location ?? "-"),
                callNumber: String(h.call_number ?? "-"),
                totalCopies: Number.parseInt(String(h.copy_count ?? "0"), 10) || 0,
                availableCopies: Number.parseInt(String(h.available_count ?? "0"), 10) || 0,
              };
            })
          );
        }
        if (holdingsData.copies) {
          setCopies(
            holdingsData.copies.map((copy: unknown) => {
              const c = typeof copy === "object" && copy ? (copy as Record<string, any>) : {};
              return {
                id: Number.parseInt(String(c.id ?? "0"), 10) || 0,
                barcode: String(c.barcode ?? "-"),
                status: String(c.status_name ?? c.status ?? "Unknown"),
                statusId: Number.parseInt(String(c.status_id ?? c.statusId ?? "0"), 10) || 0,
                location: String(c.location ?? c.copy_location ?? "-"),
                locationId:
                  c.location_id !== undefined
                    ? Number.parseInt(String(c.location_id), 10) || undefined
                    : c.locationId !== undefined
                      ? Number.parseInt(String(c.locationId), 10) || undefined
                      : undefined,
                circLib: String(c.circ_lib_name ?? c.circLib ?? "-"),
                callNumber: String(c.call_number ?? c.callNumber ?? "-"),
                dueDate: typeof c.due_date === "string" ? c.due_date : undefined,
                holdable: c.holdable !== false,
                circulate: c.circulate !== false,
              };
            })
          );
        }
      }

      if (titleHoldsRes) {
        const titleHoldsData = await titleHoldsRes.json().catch(() => null);
        if (titleHoldsData?.ok) {
          const holdList = Array.isArray(titleHoldsData.holds) ? titleHoldsData.holds : [];
          setTitleHolds(
            holdList.map((hold: unknown, idx: number) => {
              const h = typeof hold === "object" && hold ? (hold as Record<string, any>) : {};
              const queuePosition = Number.parseInt(
                String(h.queuePosition ?? h.queue_position ?? ""),
                10
              );
              const pickupLib = Number.parseInt(String(h.pickupLib ?? h.pickup_lib ?? ""), 10);
              return {
                id: Number.isFinite(Number(h.id)) ? Number(h.id) : -(idx + 1),
                queuePosition: Number.isFinite(queuePosition) ? queuePosition : undefined,
                status:
                  typeof h.status === "string" || typeof h.status === "number"
                    ? h.status
                    : undefined,
                requestTime: String(h.requestTime ?? h.request_time ?? "").trim() || undefined,
                pickupLib: Number.isFinite(pickupLib) ? pickupLib : undefined,
                patronName: String(h.patronName ?? h.patron_name ?? "").trim() || undefined,
                patronBarcode:
                  String(h.patronBarcode ?? h.patron_barcode ?? "").trim() || undefined,
              };
            })
          );
          const explicitCount = Number.parseInt(String(titleHoldsData.holdCount ?? ""), 10);
          setTitleHoldCount(
            Number.isFinite(explicitCount) ? explicitCount : fallbackHoldCount || holdList.length
          );
        } else {
          setTitleHolds([]);
          setTitleHoldCount(fallbackHoldCount);
        }
      } else {
        setTitleHolds([]);
        setTitleHoldCount(fallbackHoldCount);
      }
    } catch (err) {
      clientLogger.error("Error loading record:", err);
      setError("Failed to load record details");
      toast.error("Failed to load record");
    } finally {
      setIsLoading(false);
    }
  }, [recordId]);

  const loadCopyMetadata = useCallback(async () => {
    try {
      const [locRes, statusRes] = await Promise.all([
        fetchWithAuth("/api/evergreen/catalog?action=copy_locations"),
        fetchWithAuth("/api/evergreen/copy-statuses"),
      ]);
      const locData = await locRes.json();
      if (locData.ok && locData.locations)
        setCopyLocations(
          locData.locations.map((l: { id: number; name: string }) => ({ id: l.id, name: l.name }))
        );
      const statusData = await statusRes.json();
      if (statusData.ok && statusData.statuses)
        setCopyStatuses(
          statusData.statuses.map((s: { id: number; name: string }) => ({ id: s.id, name: s.name }))
        );
    } catch (err) {
      clientLogger.warn("Failed to load copy metadata for inline editing", err);
    }
  }, []);

  useEffect(() => {
    void loadRecordData();
    void loadCopyMetadata();
  }, [loadRecordData, loadCopyMetadata]);

  const parsedMarc = useMemo(() => parseMarcXmlForView(record?.marcXml), [record?.marcXml]);
  const leaderRows = useMemo(() => buildLeaderRows(parsedMarc?.leader || ""), [parsedMarc?.leader]);
  const field008Rows = useMemo(
    () => build008Rows(parsedMarc?.field008 || ""),
    [parsedMarc?.field008]
  );

  const totalCopies =
    holdings.length > 0 ? holdings.reduce((sum, h) => sum + h.totalCopies, 0) : copies.length;
  const availableCopies =
    holdings.length > 0
      ? holdings.reduce((sum, h) => sum + h.availableCopies, 0)
      : copies.filter((c) => isCopyAvailable(c.statusId)).length;
  const holdQueueCount = titleHoldCount > 0 ? titleHoldCount : record?.holdCount || 0;

  const handleCoverSelected = async (url: string, source: string) => {
    setCustomCoverUrl(url);
    try {
      const response = await fetchWithAuth("/api/save-cover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recordId, coverUrl: url, source }),
      });
      if (!response.ok) throw new Error("Failed to save cover");
      toast.success(`Cover updated from ${source}`);
      clientLogger.info("Cover saved:", { url, source, recordId });
    } catch (err) {
      clientLogger.error("Error saving cover:", err);
      toast.error("Cover updated locally, but failed to save to server");
    }
  };

  if (isLoading) return <LoadingSpinner message="Loading record..." />;
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

  const holdQueueHref = `/staff/circulation/holds-management?tab=title&title_id=${record.id}`;

  return (
    <ErrorBoundary onReset={() => router.refresh()}>
      <PageContainer>
        <PageHeader
          title={
            <>
              {record.title}
              {copies.length > 0 && (
                <Badge variant="secondary" className="ml-3 text-sm font-normal align-middle">
                  {copies.length} {copies.length === 1 ? "item" : "items"}
                </Badge>
              )}
            </>
          }
          subtitle={[
            record.author ? `by ${record.author}` : null,
            record.pubdate || null,
            record.format || null,
          ]
            .filter(Boolean)
            .join(" \u2022 ")}
          breadcrumbs={[
            { label: "Catalog", href: "/staff/catalog" },
            {
              label:
                record.title && record.title.length > 42
                  ? `${record.title.slice(0, 42)}\u2026`
                  : record.title || `Record ${record.id}`,
            },
          ]}
          actions={[
            { label: "Back", onClick: () => router.back(), icon: ArrowLeft, variant: "outline" },
            {
              label: "Edit MARC",
              onClick: () => router.push("/staff/cataloging/marc-editor?id=" + record.id),
              icon: Edit,
            },
            { label: "Add Items", onClick: () => setAddItemOpen(true), icon: Plus },
            {
              label: "Hold Queue",
              onClick: () => router.push(holdQueueHref),
              icon: ListOrdered,
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
              onClick: () => setHoldOpen(true),
              icon: Bookmark,
              variant: "outline",
            },
          ]}
        />
        <PageContent className="space-y-6">
          <div className="grid lg:grid-cols-4 gap-6">
            {/* Sidebar */}
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
                    <span
                      className={
                        "text-lg font-semibold " +
                        (availableCopies > 0 ? "text-green-600" : "text-amber-600")
                      }
                    >
                      {availableCopies}
                    </span>
                  </div>
                  <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                    <span className="text-sm text-muted-foreground">Holds in Queue</span>
                    <span
                      className={
                        "text-lg font-semibold " +
                        (holdQueueCount > 0 ? "text-amber-600" : "text-muted-foreground")
                      }
                    >
                      {holdQueueCount}
                    </span>
                  </div>
                  {(record.createDate || record.editDate) && (
                    <div className="rounded-lg border bg-background px-3 py-2">
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-xs uppercase tracking-wide text-muted-foreground">
                          Record Created
                        </span>
                        <span className="text-xs font-medium">
                          {formatDateTime(record.createDate)}
                        </span>
                      </div>
                      <div className="mt-1 flex items-center justify-between gap-3">
                        <span className="text-xs uppercase tracking-wide text-muted-foreground">
                          Last Edited
                        </span>
                        <span className="text-xs font-medium">
                          {formatDateTime(record.editDate)}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
                <Separator />
                <div className="w-full space-y-2">
                  <Button variant="outline" size="sm" className="w-full" asChild>
                    <Link
                      href={"/opac/record/" + record.id}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <ExternalLink className="h-4 w-4 mr-2" />
                      View in OPAC
                    </Link>
                  </Button>
                  <Button variant="outline" size="sm" className="w-full" asChild>
                    <Link href={holdQueueHref}>
                      <ListOrdered className="h-4 w-4 mr-2" />
                      View Hold Queue
                    </Link>
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Main content */}
            <Card className="lg:col-span-3">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <BookOpen className="h-5 w-5" /> Bibliographic Details
                </CardTitle>
                <CardDescription>
                  TCN: {record.tcn || record.id} | Record ID: {record.id}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Tabs defaultValue="details">
                  <TabsList>
                    <TabsTrigger value="details">Details</TabsTrigger>
                    <TabsTrigger value="items" className="flex items-center gap-1.5">
                      Items
                      {copies.length > 0 && (
                        <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-xs">
                          {copies.length}
                        </Badge>
                      )}
                    </TabsTrigger>
                    <TabsTrigger value="marc">MARC</TabsTrigger>
                    <TabsTrigger value="subjects">Subjects</TabsTrigger>
                    {record.summary && <TabsTrigger value="summary">Summary</TabsTrigger>}
                    {record.notes && record.notes.length > 0 && (
                      <TabsTrigger value="notes">Notes</TabsTrigger>
                    )}
                  </TabsList>

                  <TabsContent value="details" className="mt-4">
                    <div className="grid sm:grid-cols-2 gap-4">
                      {record.author && (
                        <div>
                          <span className="text-xs text-muted-foreground uppercase tracking-wide">
                            Author
                          </span>
                          <p className="font-medium">{record.author}</p>
                        </div>
                      )}
                      {record.publisher && (
                        <div>
                          <span className="text-xs text-muted-foreground uppercase tracking-wide">
                            Publisher
                          </span>
                          <p className="font-medium">{record.publisher}</p>
                        </div>
                      )}
                      {record.pubdate && (
                        <div>
                          <span className="text-xs text-muted-foreground uppercase tracking-wide">
                            Publication Date
                          </span>
                          <p className="font-medium">{record.pubdate}</p>
                        </div>
                      )}
                      {record.edition && (
                        <div>
                          <span className="text-xs text-muted-foreground uppercase tracking-wide">
                            Edition
                          </span>
                          <p className="font-medium">{record.edition}</p>
                        </div>
                      )}
                      {record.isbn && (
                        <div>
                          <span className="text-xs text-muted-foreground uppercase tracking-wide">
                            ISBN
                          </span>
                          <p className="font-mono">{record.isbn}</p>
                        </div>
                      )}
                      {record.issn && (
                        <div>
                          <span className="text-xs text-muted-foreground uppercase tracking-wide">
                            ISSN
                          </span>
                          <p className="font-mono">{record.issn}</p>
                        </div>
                      )}
                      {record.format && (
                        <div>
                          <span className="text-xs text-muted-foreground uppercase tracking-wide">
                            Format
                          </span>
                          <Badge variant="secondary">{record.format}</Badge>
                        </div>
                      )}
                      {record.language && (
                        <div>
                          <span className="text-xs text-muted-foreground uppercase tracking-wide">
                            Language
                          </span>
                          <p className="font-medium">{record.language}</p>
                        </div>
                      )}
                      {record.physicalDescription && (
                        <div className="sm:col-span-2">
                          <span className="text-xs text-muted-foreground uppercase tracking-wide">
                            Physical Description
                          </span>
                          <p className="font-medium">{record.physicalDescription}</p>
                        </div>
                      )}
                      {record.series && (
                        <div className="sm:col-span-2">
                          <span className="text-xs text-muted-foreground uppercase tracking-wide">
                            Series
                          </span>
                          <p className="font-medium">{record.series}</p>
                        </div>
                      )}
                    </div>
                  </TabsContent>

                  <TabsContent value="items" className="mt-4">
                    <ItemsTab
                      copies={copies}
                      statuses={copyStatuses}
                      locations={copyLocations}
                      recordId={recordId}
                      onRefresh={loadRecordData}
                      onAddItem={() => setAddItemOpen(true)}
                    />
                  </TabsContent>

                  <TabsContent value="marc" className="mt-4 space-y-4">
                    <MarcViewTab
                      parsedMarc={parsedMarc}
                      leaderRows={leaderRows}
                      field008Rows={field008Rows}
                      recordId={record.id}
                    />
                  </TabsContent>

                  <TabsContent value="subjects" className="mt-4">
                    {record.subjects && record.subjects.length > 0 ? (
                      <div className="flex flex-wrap gap-2">
                        {record.subjects.map((subject, idx) => (
                          <Badge
                            key={"subject-" + idx}
                            variant="outline"
                            className="cursor-pointer hover:bg-muted"
                          >
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
                      <p className="text-sm leading-relaxed whitespace-pre-line">
                        {record.summary}
                      </p>
                    </TabsContent>
                  )}
                  {record.notes && record.notes.length > 0 && (
                    <TabsContent value="notes" className="mt-4">
                      <ul className="space-y-2">
                        {record.notes.map((note, idx) => (
                          <li key={"note-" + idx} className="text-sm text-muted-foreground">
                            {note}
                          </li>
                        ))}
                      </ul>
                    </TabsContent>
                  )}
                </Tabs>
              </CardContent>
            </Card>
          </div>

          <HoldQueueCard
            holdQueueCount={holdQueueCount}
            titleHolds={titleHolds}
            holdQueueHref={holdQueueHref}
          />
        </PageContent>

        <CoverArtPicker
          open={coverPickerOpen}
          onOpenChange={setCoverPickerOpen}
          isbn={record?.isbn}
          title={record?.title || ""}
          author={record?.author}
          recordId={Number.parseInt(recordId, 10)}
          currentCoverUrl={customCoverUrl}
          onCoverSelected={handleCoverSelected}
        />
        <PlaceHoldDialog
          open={holdOpen}
          onOpenChange={setHoldOpen}
          record={{ id: record.id, title: record.title, author: record.author }}
        />
        <AddItemDialog
          open={addItemOpen}
          onOpenChange={setAddItemOpen}
          bibRecord={{
            id: record.id,
            title: record.title,
            author: record.author,
            isbn: record.isbn,
          }}
          onItemCreated={() => loadRecordData()}
        />
      </PageContainer>
    </ErrorBoundary>
  );
}
