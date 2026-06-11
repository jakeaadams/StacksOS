/**
 * Checkin Page - Staff circulation check-in desk
 */

"use client";

import dynamic from "next/dynamic";
import * as React from "react";
import { useCallback, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import {
  BarcodeInput,
  ConfirmDialog,
  PageContainer,
  PageHeader,
  PageContent,
  StatusBadge,
} from "@/components/shared";

import { ApiError, useMutation, useKeyboardShortcuts } from "@/hooks";

import { useAuth } from "@/contexts/auth-context";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

import {
  Archive,
  Bell,
  CheckCircle2,
  ListFilter,
  Package,
  Printer,
  RotateCcw,
  ScanLine,
  ThumbsDown,
  ThumbsUp,
  Truck,
  XCircle,
  AlertTriangle,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { escapeHtml, printHtml } from "@/lib/print";
import { featureFlags } from "@/lib/feature-flags";
import { fetchWithAuth } from "@/lib/client-fetch";
import { useCirculationSound } from "@/hooks/use-circulation-sound";
import type { CheckinItem } from "./types";

type CheckinBlockDetails = {
  code?: string;
  desc?: string;
  requestId?: string;
};

type AiPolicyExplain = {
  explanation: string;
  nextSteps: string[];
  suggestedNote?: string;
  requiresConfirmation?: boolean;
};

function buildSlipHtml(item: CheckinItem) {
  const heading =
    item.status === "hold"
      ? "Hold Shelf Slip"
      : item.status === "transit"
        ? "Transit Slip"
        : "Routing Slip";

  const lines: Array<[string, string]> = [
    ["Time", item.timestamp.toLocaleString()],
    ["Item", item.barcode],
    ["Title", item.title],
  ];

  if (item.callNumber) lines.push(["Call Number", item.callNumber]);
  if (item.author) lines.push(["Author", item.author]);
  if (item.status === "hold" && item.holdFor)
    lines.push(["Hold For", `${item.holdFor.name} (${item.holdFor.barcode})`]);
  if (item.status === "transit" && item.transitTo) lines.push(["Transit To", item.transitTo]);

  return [
    '<div class="box pb">',
    `<h1 class="brand">StacksOS</h1>`,
    `<div class="muted">${escapeHtml(heading)}</div>`,
    '<div class="meta">',
    ...lines.map(
      ([k, v]) =>
        `<div><span class="k">${escapeHtml(k)}:</span> <span class="v">${escapeHtml(v)}</span></div>`
    ),
    "</div>",
    "</div>",
  ].join("\n");
}

const CheckinActivityTable = dynamic(
  () => import("./checkin-activity-table").then((mod) => mod.CheckinActivityTable),
  {
    ssr: false,
    loading: () => (
      <div className="rounded-2xl border border-border/70 bg-card px-6 py-10 text-center text-sm text-muted-foreground">
        Loading check-in activity…
      </div>
    ),
  }
);

export default function CheckinPage() {
  const canAi = featureFlags.ai;
  const { play: playSound } = useCirculationSound();
  const [checkedInItems, setCheckedInItems] = useState<CheckinItem[]>([]);
  const [selectedItems, setSelectedItems] = useState<CheckinItem[]>([]);
  const [scanQueue, setScanQueue] = useState<string[]>([]);
  const [activeScan, setActiveScan] = useState<string | null>(null);
  const [itemBarcode, setItemBarcode] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [printSlips, setPrintSlips] = useState(true);
  const [clearOpen, setClearOpen] = useState(false);
  const [itemError, setItemError] = useState<string | undefined>(undefined);
  const [itemSuccess, setItemSuccess] = useState(false);
  const [attentionOnly, setAttentionOnly] = useState(false);
  const [bookdropMode, setBookdropMode] = useState(false);
  const [lastErrorDetails, setLastErrorDetails] = useState<CheckinBlockDetails | null>(null);
  const [aiExplainLoading, setAiExplainLoading] = useState(false);
  const [aiExplainError, setAiExplainError] = useState<string | null>(null);
  const [aiExplainDraftId, setAiExplainDraftId] = useState<string | null>(null);
  const [aiExplain, setAiExplain] = useState<AiPolicyExplain | null>(null);
  const [aiExplainFeedback, setAiExplainFeedback] = useState<null | "accepted" | "rejected">(null);

  const itemInputRef = useRef<HTMLInputElement>(null);

  const { getOrgName } = useAuth();

  const checkinMutation = useMutation<any, { action: "checkin"; itemBarcode: string }>({
    onSuccess: (data, variables) => {
      let status: CheckinItem["status"] = "checkedin";
      let message: string | undefined;
      let holdFor: CheckinItem["holdFor"] | undefined;
      let transitTo: string | undefined;

      if (data.status === "hold_captured" && data.hold) {
        status = "hold";
        holdFor = {
          name:
            data.hold.patronName ||
            (data.hold.patronId ? "Patron " + data.hold.patronId : "Patron"),
          barcode: data.hold.patronBarcode || String(data.hold.patronId || ""),
        };
        message = holdFor.barcode
          ? `Hold for ${holdFor.name} (${holdFor.barcode})`
          : `Hold for ${holdFor.name}`;
      } else if (data.status === "in_transit" && data.transit) {
        status = "transit";
        const destId = Number(data.transit.destination);
        transitTo = Number.isFinite(destId)
          ? getOrgName(destId)
          : String(data.transit.destination || "Another branch");
        message = transitTo ? `Transit to ${transitTo}` : "In transit";
      } else {
        message = "Reshelve";
      }

      const newItem: CheckinItem = {
        id: `item-${Date.now()}-${variables.itemBarcode}`,
        barcode: variables.itemBarcode,
        title: data.title || "Item",
        author: data.author || "",
        callNumber: data.callNumber || "",
        status,
        message,
        holdFor,
        transitTo,
        timestamp: new Date(),
        wasOverdue: data.wasOverdue || false,
        fineAmount: data.fineAmount || 0,
      };

      setCheckedInItems((prev) => [newItem, ...prev]);
      setItemError(undefined);
      setItemSuccess(true);
      setLastErrorDetails(null);
      setAiExplainLoading(false);
      setAiExplainError(null);
      setAiExplainDraftId(null);
      setAiExplain(null);
      setAiExplainFeedback(null);

      if (printSlips && (status === "hold" || status === "transit")) {
        printHtml(buildSlipHtml(newItem), { title: "StacksOS Slip", tone: "slip" });
      }

      playSound(status === "hold" || status === "transit" ? "info" : "success");

      if (!bookdropMode) {
        toast.success(status === "checkedin" ? "Ready to shelve" : "Routing required", {
          description:
            status === "hold" ? "Send to hold shelf" : status === "transit" ? message : "Processed",
        });
      }
    },
    onError: (err, variables) => {
      if (err instanceof ApiError && err.status === 403) {
        const missing = Array.isArray((err.details as Record<string, any>)?.missing)
          ? (err.details as Record<string, any>).missing
          : [];
        const reqId = (err.details as Record<string, any>)?.requestId;
        const desc = missing.length > 0 ? `Missing: ${missing.join(", ")}` : err.message;

        const errorItem: CheckinItem = {
          id: `item-${Date.now()}-${variables.itemBarcode}`,
          barcode: variables.itemBarcode,
          title: "Not checked in",
          author: "",
          callNumber: "",
          status: "error",
          message: reqId ? `${desc} (req ${reqId})` : desc,
          timestamp: new Date(),
        };

        setCheckedInItems((prev) => [errorItem, ...prev]);
        toast.error("Permission denied", {
          description: reqId ? `${desc} (req ${reqId})` : desc,
        });
        setItemError(err.message || "Permission denied");
        setItemSuccess(false);
        playSound("error");
        setLastErrorDetails({
          code: "PERMISSION_DENIED",
          desc: err.message || "Permission denied",
          requestId: reqId ? String(reqId) : undefined,
        });
        return;
      }

      const rawDetails =
        err instanceof ApiError
          ? err.details
          : err instanceof Error
            ? (err as Error & { details?: unknown }).details
            : undefined;
      const code =
        rawDetails &&
        typeof rawDetails === "object" &&
        typeof (rawDetails as Record<string, any>).textcode === "string"
          ? String((rawDetails as Record<string, any>).textcode)
          : undefined;
      const desc =
        rawDetails &&
        typeof rawDetails === "object" &&
        typeof (rawDetails as Record<string, any>).desc === "string"
          ? String((rawDetails as Record<string, any>).desc)
          : undefined;

      const errorItem: CheckinItem = {
        id: `item-${Date.now()}-${variables.itemBarcode}`,
        barcode: variables.itemBarcode,
        title: "Not checked in",
        author: "",
        callNumber: "",
        status: "error",
        message: desc || err.message || "Check-in failed",
        timestamp: new Date(),
      };

      setCheckedInItems((prev) => [errorItem, ...prev]);
      setItemError(desc || err.message || "Check-in failed");
      setItemSuccess(false);
      playSound("error");
      setLastErrorDetails({
        code: code || undefined,
        desc: desc || err.message || "Check-in failed",
      });
      toast.error("Check-in failed", { description: desc || err.message });
    },
  });

  React.useEffect(() => {
    if (!canAi) return;
    if (!itemError) return;
    if (!lastErrorDetails) return;

    let cancelled = false;
    setAiExplainLoading(true);
    setAiExplainError(null);
    setAiExplainDraftId(null);
    setAiExplain(null);
    setAiExplainFeedback(null);

    void (async () => {
      try {
        const res = await fetchWithAuth("/api/ai/policy-explain", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "checkin",
            code: lastErrorDetails.code || undefined,
            desc: lastErrorDetails.desc || undefined,
            context: { route: "staff.circulation.checkin" },
          }),
        });
        const json = await res.json().catch(() => null);
        if (cancelled) return;
        if (!res.ok || !json || json.ok === false) {
          const msg = (json && (json.error || json.message)) || `AI explain failed (${res.status})`;
          setAiExplainError(String(msg));
          setAiExplainLoading(false);
          return;
        }
        setAiExplainDraftId(json.draftId || null);
        setAiExplain(json.response || null);
        setAiExplainLoading(false);
      } catch (e: unknown) {
        if (cancelled) return;
        setAiExplainError(e instanceof Error ? e.message : String(e));
        setAiExplainLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [canAi, itemError, lastErrorDetails]);

  const submitAiExplainFeedback = useCallback(
    async (decision: "accepted" | "rejected") => {
      if (!aiExplainDraftId) return;
      setAiExplainFeedback(decision);
      try {
        await fetchWithAuth(`/api/ai/drafts/${aiExplainDraftId}/decision`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ decision, suggestionId: "policy_explain" }),
        });
      } catch {
        // Best-effort: do not block circulation on feedback.
      }
    },
    [aiExplainDraftId]
  );

  const enqueueCheckin = useCallback(
    (barcode: string) => {
      const cleaned = String(barcode || "").trim();
      if (!cleaned) return;

      if (
        cleaned === activeScan ||
        scanQueue.includes(cleaned) ||
        checkedInItems.some((item) => item.barcode === cleaned && item.status !== "error")
      ) {
        toast.message("Item already scanned in this session", { description: cleaned });
        itemInputRef.current?.focus();
        return;
      }

      setItemError(undefined);
      setItemSuccess(false);
      setScanQueue((prev) => [...prev, cleaned]);
    },
    [activeScan, checkedInItems, scanQueue]
  );

  const processNextCheckin = useCallback(async () => {
    if (isProcessing) return;
    const nextBarcode = scanQueue[0];
    if (!nextBarcode) return;

    setIsProcessing(true);
    setActiveScan(nextBarcode);

    try {
      await checkinMutation.mutateAsync("/api/evergreen/circulation", {
        action: "checkin",
        itemBarcode: nextBarcode,
      });
    } finally {
      setIsProcessing(false);
      setActiveScan(null);
      setScanQueue((prev) =>
        prev[0] === nextBarcode ? prev.slice(1) : prev.filter((queued) => queued !== nextBarcode)
      );
      itemInputRef.current?.focus();
    }
  }, [checkinMutation, isProcessing, scanQueue]);

  React.useEffect(() => {
    void processNextCheckin();
  }, [scanQueue.length, isProcessing]); // eslint-disable-line react-hooks/exhaustive-deps

  const clearSession = useCallback(() => {
    setCheckedInItems([]);
    setSelectedItems([]);
    setScanQueue([]);
    setActiveScan(null);
    setItemBarcode("");
    setItemError(undefined);
    setItemSuccess(false);
    setAttentionOnly(false);
    setLastErrorDetails(null);
    setAiExplainLoading(false);
    setAiExplainError(null);
    setAiExplainDraftId(null);
    setAiExplain(null);
    setAiExplainFeedback(null);
    itemInputRef.current?.focus();
  }, []);

  const hasSessionWork = checkedInItems.length > 0 || scanQueue.length > 0 || activeScan !== null;

  const requestClearSession = useCallback(() => {
    if (!hasSessionWork) {
      clearSession();
      return;
    }
    setClearOpen(true);
  }, [clearSession, hasSessionWork]);

  const slipItems = useMemo(
    () => checkedInItems.filter((i) => i.status === "hold" || i.status === "transit"),
    [checkedInItems]
  );

  const attentionItems = useMemo(
    () =>
      checkedInItems.filter(
        (i) =>
          i.status === "error" ||
          i.status === "alert" ||
          i.status === "hold" ||
          i.status === "transit"
      ),
    [checkedInItems]
  );

  const handlePrintAllSlips = useCallback(() => {
    if (slipItems.length === 0) {
      toast.message("No routing slips to print");
      return;
    }

    const html = slipItems
      .slice()
      .reverse()
      .map((item) => buildSlipHtml(item))
      .join("\n");

    printHtml(html, { title: "StacksOS Slips", tone: "slip" });
  }, [slipItems]);

  useKeyboardShortcuts([
    { key: "Escape", handler: requestClearSession },
    { key: "p", ctrl: true, handler: handlePrintAllSlips, preventDefault: true },
    { key: "b", ctrl: true, handler: () => setBookdropMode((v) => !v), preventDefault: true },
  ]);

  const stats = useMemo(
    () => ({
      total: checkedInItems.length,
      reshelve: checkedInItems.filter((i) => i.status === "checkedin").length,
      holds: checkedInItems.filter((i) => i.status === "hold").length,
      transits: checkedInItems.filter((i) => i.status === "transit").length,
      exceptions: checkedInItems.filter((i) => i.status === "error" || i.status === "alert").length,
    }),
    [checkedInItems]
  );

  const tableData = attentionOnly ? attentionItems : checkedInItems;
  const queuedCount = activeScan ? Math.max(scanQueue.length - 1, 0) : scanQueue.length;

  return (
    <PageContainer>
      <PageHeader
        title="Check-in Desk"
        subtitle="Return, route, and exception-review item scans from one work surface."
        breadcrumbs={[{ label: "Circulation" }, { label: "Check In" }]}
      />

      <PageContent className="space-y-6">
        <div className="grid min-w-0 gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
          <div className="min-w-0 space-y-5">
            <Card className="min-w-0 rounded-2xl border-border/70">
              <CardContent className="space-y-4 p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <StepHeader
                    index={1}
                    title="Scan returns"
                    hint={bookdropMode ? "Bookdrop mode active" : "Ready for item barcodes"}
                  />
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge
                      label={bookdropMode ? "Bookdrop" : "Desk return"}
                      status={bookdropMode ? "warning" : "success"}
                      icon={bookdropMode ? Package : ScanLine}
                      showIcon
                      size="sm"
                    />
                    <StatusBadge
                      label={printSlips ? "Slips on" : "Slips off"}
                      status={printSlips ? "info" : "neutral"}
                      icon={Printer}
                      showIcon
                      size="sm"
                    />
                  </div>
                </div>

                <BarcodeInput
                  ref={itemInputRef}
                  label="Item barcode"
                  placeholder="Scan item barcode…"
                  value={itemBarcode}
                  onChange={setItemBarcode}
                  onSubmit={enqueueCheckin}
                  isLoading={false}
                  isSuccess={itemSuccess}
                  error={itemError}
                  autoFocus
                  autoClear
                  size="lg"
                />

                <div
                  className="flex min-h-[20px] flex-wrap items-center gap-2 text-xs"
                  aria-live="polite"
                  aria-atomic="true"
                >
                  {activeScan ? (
                    <span className="inline-flex items-center gap-2 text-muted-foreground">
                      <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-[hsl(var(--brand-1))] border-t-transparent" />
                      Checking in <span className="font-mono text-foreground">{activeScan}</span>
                    </span>
                  ) : scanQueue.length > 0 ? (
                    <span className="text-muted-foreground">{scanQueue.length} queued…</span>
                  ) : itemSuccess ? (
                    <span className="inline-flex items-center gap-1.5 text-[hsl(var(--status-success-text))]">
                      <CheckCircle2 className="h-3.5 w-3.5" /> Processed. Ready for next item.
                    </span>
                  ) : itemError ? (
                    <span className="inline-flex items-center gap-1.5 text-[hsl(var(--status-error-text))]">
                      <XCircle className="h-3.5 w-3.5" /> {itemError}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">Ready to scan.</span>
                  )}
                  {activeScan && queuedCount > 0 && (
                    <span className="text-muted-foreground">· {queuedCount} more queued</span>
                  )}
                </div>

                {canAi && itemError && (
                  <div className="rounded-xl border border-border/70 bg-background px-3 py-2 text-sm space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="font-medium">Decision support</div>
                      <div className="flex items-center gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => void submitAiExplainFeedback("accepted")}
                          disabled={!aiExplainDraftId || aiExplainFeedback !== null}
                          title="Helpful"
                        >
                          <span className="sr-only">Helpful</span>
                          <ThumbsUp className="h-4 w-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => void submitAiExplainFeedback("rejected")}
                          disabled={!aiExplainDraftId || aiExplainFeedback !== null}
                          title="Not helpful"
                        >
                          <span className="sr-only">Not helpful</span>
                          <ThumbsDown className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>

                    {aiExplainLoading ? (
                      <div className="text-sm text-muted-foreground flex items-center gap-2">
                        <span className="h-4 w-4 animate-spin rounded-full border-2 border-muted-foreground/40 border-t-transparent" />
                        Generating explanation…
                      </div>
                    ) : aiExplainError ? (
                      <div className="text-sm text-muted-foreground">
                        AI unavailable: {aiExplainError}
                      </div>
                    ) : aiExplain ? (
                      <div className="space-y-2">
                        <div className="text-sm">{aiExplain.explanation}</div>
                        {Array.isArray(aiExplain.nextSteps) && aiExplain.nextSteps.length > 0 ? (
                          <ul className="space-y-1 text-xs text-muted-foreground list-disc list-inside">
                            {aiExplain.nextSteps.slice(0, 4).map((step, idx) => (
                              <li key={idx}>{step}</li>
                            ))}
                          </ul>
                        ) : null}
                      </div>
                    ) : (
                      <div className="text-sm text-muted-foreground">No explanation available.</div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

            <div className="min-w-0 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <StepHeader
                  index={2}
                  title={attentionOnly ? "Routing exceptions" : "Routing log"}
                  hint={attentionOnly ? "Holds, transits, and failed scans" : "Newest scan first"}
                  done={stats.total > 0}
                />
                <div className="flex flex-wrap items-center gap-1.5">
                  {stats.reshelve > 0 && (
                    <SessionPill
                      tone="success"
                      icon={Archive}
                      count={stats.reshelve}
                      label="reshelve"
                    />
                  )}
                  {stats.holds > 0 && (
                    <SessionPill tone="warning" icon={Bell} count={stats.holds} label="holds" />
                  )}
                  {stats.transits > 0 && (
                    <SessionPill tone="info" icon={Truck} count={stats.transits} label="transit" />
                  )}
                  {stats.exceptions > 0 && (
                    <SessionPill
                      tone="error"
                      icon={AlertTriangle}
                      count={stats.exceptions}
                      label="review"
                    />
                  )}
                </div>
              </div>

              {selectedItems.length > 0 && (
                <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border/70 bg-muted/30 px-4 py-2">
                  <span className="text-sm font-medium">{selectedItems.length} selected</span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      const slips = selectedItems.filter(
                        (i) => i.status === "hold" || i.status === "transit"
                      );
                      if (slips.length === 0) {
                        toast.message("No routing slips in selection");
                        return;
                      }
                      const html = slips.map((item) => buildSlipHtml(item)).join("\n");
                      printHtml(html, { title: "StacksOS Slips", tone: "slip" });
                    }}
                  >
                    <Printer className="h-4 w-4 mr-1" />
                    Print Selected
                  </Button>
                </div>
              )}

              <CheckinActivityTable data={tableData} onSelectionChange={setSelectedItems} />
            </div>
          </div>

          <aside className="min-w-0 self-start xl:sticky xl:top-6">
            <Card className="min-w-0 rounded-2xl border-border/70">
              <CardContent className="space-y-4 p-5">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-sm font-semibold">Check-in session</h3>
                  <Badge variant="outline" className="rounded-full text-[11px]">
                    {bookdropMode ? "Bookdrop" : "Desk"}
                  </Badge>
                </div>

                <div className="rounded-2xl border border-border/70 bg-muted/30 p-4 text-center">
                  <div className="text-4xl font-semibold tabular-nums text-foreground">
                    {stats.total}
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    item{stats.total === 1 ? "" : "s"} processed
                  </div>
                  {stats.exceptions > 0 && (
                    <div className="mt-2 text-[11px] font-medium text-[hsl(var(--status-error-text))]">
                      {stats.exceptions} need review
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <RoutingMetric icon={Archive} label="Reshelve" value={stats.reshelve} />
                  <RoutingMetric
                    icon={Bell}
                    label="Hold shelf"
                    value={stats.holds}
                    tone="warning"
                  />
                  <RoutingMetric icon={Truck} label="Transit" value={stats.transits} tone="info" />
                  <RoutingMetric
                    icon={AlertTriangle}
                    label="Review"
                    value={stats.exceptions}
                    tone="error"
                  />
                </div>

                <div className="grid gap-2 text-xs text-muted-foreground">
                  <div className="flex items-center justify-between gap-3">
                    <span>Queue</span>
                    <span className="font-mono text-foreground">
                      {activeScan
                        ? "1 active"
                        : scanQueue.length > 0
                          ? `${scanQueue.length} waiting`
                          : "Idle"}
                      {activeScan && queuedCount > 0 ? ` + ${queuedCount} waiting` : ""}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span>Routing slips</span>
                    <span className="font-mono text-foreground">{slipItems.length} queued</span>
                  </div>
                </div>

                <div className="space-y-2">
                  <Button
                    type="button"
                    variant={bookdropMode ? "default" : "outline"}
                    className="w-full justify-between"
                    onClick={() => setBookdropMode((v) => !v)}
                  >
                    Bookdrop mode
                    <Package className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    variant={printSlips ? "outline" : "ghost"}
                    className="w-full justify-between"
                    onClick={() => setPrintSlips((p) => !p)}
                  >
                    {printSlips ? "Auto-print slips" : "Slips paused"}
                    <Printer className="h-4 w-4 text-muted-foreground" />
                  </Button>
                  <Button
                    type="button"
                    variant={slipItems.length > 0 ? "default" : "outline"}
                    className="w-full justify-between"
                    onClick={handlePrintAllSlips}
                    disabled={slipItems.length === 0}
                  >
                    Print routing slips
                    <span className="inline-flex items-center gap-2">
                      {slipItems.length > 0 && (
                        <Badge variant="secondary" className="rounded-full text-[10px]">
                          {slipItems.length}
                        </Badge>
                      )}
                      <Printer className="h-4 w-4" />
                    </span>
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full justify-between"
                    onClick={() => setAttentionOnly((v) => !v)}
                    disabled={attentionItems.length === 0}
                  >
                    {attentionOnly ? "Show all scans" : "Review routing"}
                    <span className="inline-flex items-center gap-2">
                      {attentionItems.length > 0 && (
                        <Badge variant="secondary" className="rounded-full text-[10px]">
                          {attentionItems.length}
                        </Badge>
                      )}
                      <ListFilter className="h-4 w-4 text-muted-foreground" />
                    </span>
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    className="w-full justify-between text-muted-foreground"
                    onClick={requestClearSession}
                    disabled={!hasSessionWork}
                  >
                    Clear / next batch
                    <RotateCcw className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          </aside>
        </div>
      </PageContent>

      <ConfirmDialog
        open={clearOpen}
        onOpenChange={setClearOpen}
        title="Clear this check-in session?"
        description="This removes the current scan log from the screen. It does not undo completed Evergreen check-ins."
        confirmText="Clear session"
        variant="danger"
        onConfirm={() => {
          clearSession();
          setClearOpen(false);
        }}
      />
    </PageContainer>
  );
}

function StepHeader({
  index,
  title,
  hint,
  done,
}: {
  index: number;
  title: string;
  hint?: string;
  done?: boolean;
}) {
  return (
    <div className="flex items-center gap-2.5">
      <span
        className={cn(
          "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs font-semibold",
          done
            ? "border-[hsl(var(--status-success))/0.5] bg-[hsl(var(--status-success-bg))] text-[hsl(var(--status-success-text))]"
            : "border-[hsl(var(--brand-1))/0.4] bg-[hsl(var(--brand-1))/0.1] text-[hsl(var(--brand-1))]"
        )}
      >
        {done ? <CheckCircle2 className="h-3.5 w-3.5" /> : index}
      </span>
      <div className="min-w-0">
        <h3 className="text-sm font-semibold leading-none">{title}</h3>
        {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
      </div>
    </div>
  );
}

function SessionPill({
  tone,
  icon: Icon,
  count,
  label,
}: {
  tone: "success" | "warning" | "error" | "info";
  icon: React.ComponentType<{ className?: string }>;
  count: number;
  label: string;
}) {
  const cls =
    tone === "success"
      ? "bg-[hsl(var(--status-success-bg))] text-[hsl(var(--status-success-text))]"
      : tone === "warning"
        ? "bg-[hsl(var(--status-warning-bg))] text-[hsl(var(--status-warning-text))]"
        : tone === "info"
          ? "bg-[hsl(var(--status-info-bg))] text-[hsl(var(--status-info-text))]"
          : "bg-[hsl(var(--status-error-bg))] text-[hsl(var(--status-error-text))]";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium tabular-nums",
        cls
      )}
    >
      <Icon className="h-3.5 w-3.5" />
      {count} {label}
    </span>
  );
}

function RoutingMetric({
  icon: Icon,
  label,
  value,
  tone = "success",
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
  tone?: "success" | "warning" | "error" | "info";
}) {
  const toneClass =
    tone === "warning"
      ? "text-[hsl(var(--status-warning-text))]"
      : tone === "error"
        ? "text-[hsl(var(--status-error-text))]"
        : tone === "info"
          ? "text-[hsl(var(--status-info-text))]"
          : "text-[hsl(var(--status-success-text))]";
  return (
    <div className="rounded-xl border border-border/60 bg-background/60 p-3 text-center">
      <div
        className={cn("flex items-center justify-center gap-1 text-lg font-semibold", toneClass)}
      >
        <Icon className="h-4 w-4 opacity-80" />
        <span className="tabular-nums">{value}</span>
      </div>
      <div className="mt-0.5 text-[11px] text-muted-foreground">{label}</div>
    </div>
  );
}
