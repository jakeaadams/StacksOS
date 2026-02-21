/**
 * Checkout Page - Staff circulation checkout interface
 */

"use client";

import * as React from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { useRouter, useSearchParams } from "next/navigation";

import {
  PatronCard,
  BarcodeInput,
  LoadingInline,
  PageContainer,
  PageHeader,
  PageContent,
  DataTable,
  DataTableColumnHeader,
  StatusBadge,
  EmptyState,
} from "@/components/shared";

import { ApiError, useKeyboardShortcuts, useMutation, usePatronLookup } from "@/hooks";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

import {
  RotateCcw,
  Printer,
  CreditCard,
  Clock,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  BookOpen,
  HelpCircle,
  ThumbsUp,
  ThumbsDown,
} from "lucide-react";
import type { ColumnDef } from "@tanstack/react-table";

import { escapeHtml, printHtml } from "@/lib/print";
import { featureFlags } from "@/lib/feature-flags";
import { fetchWithAuth } from "@/lib/client-fetch";

interface CheckoutItem {
  id: string;
  barcode: string;
  title: string;
  author: string;
  callNumber: string;
  dueDate: string;
  status: "success" | "warning" | "error";
  message?: string;
  timestamp: Date;
}

interface CheckoutBlockDetails {
  code?: string | null;
  desc?: string | null;
  failPart?: string | null;
  nextSteps?: string[] | null;
  overridePerm?: string | null;
  overrideEligible?: boolean;
  requestId?: string | null;
}

type AiPolicyExplain = {
  explanation: string;
  nextSteps: string[];
  suggestedNote?: string;
  requiresConfirmation?: boolean;
};

type CheckoutVariables = {
  action: "checkout";
  patronBarcode: string;
  itemBarcode: string;
  override?: boolean;
  overrideReason?: string;
};

function buildReceiptHtml(params: {
  patronName?: string;
  patronBarcode?: string;
  items: CheckoutItem[];
}) {
  const now = new Date();
  const safePatronName = escapeHtml(params.patronName || "");
  const safePatronBarcode = escapeHtml(params.patronBarcode || "");

  const rows = params.items
    .slice()
    .reverse()
    .map((i) => {
      const status = i.status === "success" ? "OK" : i.status === "warning" ? "WARN" : "ERROR";
      const statusColor =
        i.status === "success" ? "#16a34a" : i.status === "warning" ? "#d97706" : "#dc2626";

      return [
        "<tr>",
        `<td class="mono">${escapeHtml(i.barcode)}</td>`,
        `<td>${escapeHtml(i.title)}${i.author ? `<div class="muted">${escapeHtml(i.author)}</div>` : ""}${i.message ? `<div class="muted">${escapeHtml(i.message)}</div>` : ""}</td>`,
        `<td class="mono">${escapeHtml(i.callNumber)}</td>`,
        `<td class="mono">${escapeHtml(i.dueDate)}</td>`,
        `<td class="right" style="color:${statusColor}; font-weight:700">${status}</td>`,
        "</tr>",
      ].join("");
    })
    .join("\n");

  const total = params.items.length;
  const okCount = params.items.filter((i) => i.status === "success").length;
  const warnCount = params.items.filter((i) => i.status === "warning").length;
  const errCount = params.items.filter((i) => i.status === "error").length;

  return [
    '<div class="box">',
    '<div class="brand">StacksOS</div>',
    '<h1 style="margin-top:4px">Checkout Receipt</h1>',
    `<div class="muted">${escapeHtml(now.toLocaleString())}</div>`,
    "<div class=\"meta\">",
    safePatronName ? `<div><span class="k">Patron:</span> <span class="v">${safePatronName}</span></div>` : "",
    safePatronBarcode ? `<div><span class="k">Barcode:</span> <span class="v mono">${safePatronBarcode}</span></div>` : "",
    `<div><span class="k">Items:</span> <span class="v">${total}</span></div>`,
    `<div><span class="k">OK:</span> <span class="v">${okCount}</span></div>`,
    warnCount ? `<div><span class="k">Warnings:</span> <span class="v">${warnCount}</span></div>` : "",
    errCount ? `<div><span class="k">Errors:</span> <span class="v">${errCount}</span></div>` : "",
    "</div>",
    "</div>",
    "<h2>Items</h2>",
    "<table>",
    `<thead><tr><th scope="col">Barcode</th><th scope="col">Title</th><th scope="col">Call #</th><th scope="col">Due</th><th scope="col" class="right">Status</th></tr></thead>`,
    `<tbody>${rows || "<tr><td colspan=\"5\" class=\"muted\">No items.</td></tr>"}</tbody>`,
    "</table>",
    "<div class=\"muted\" style=\"margin-top:16px\">Questions? Ask your library staff.</div>",
  ].join("\n");
}

export default function CheckoutPage() {
  const router = useRouter();
  const canAi = featureFlags.ai;

  const {
    selectedPatron: patron,
    isLoading: isLoadingPatron,
    error: patronError,
    lookupByBarcode: lookupPatron,
    selectPatron,
    clear: clearPatron,
  } = usePatronLookup({
    onError: (err) => toast.error("Patron not found", { description: err.message }),
    onFound: (p) => toast.success("Loaded: " + p.displayName),
  });

  const searchParams = useSearchParams();
  const [checkedOutItems, setCheckedOutItems] = useState<CheckoutItem[]>([]);
  const [scanQueue, setScanQueue] = useState<string[]>([]);
  const [activeScan, setActiveScan] = useState<string | null>(null);
  const [isCheckingOut, setIsCheckingOut] = useState(false);
  const [itemBarcode, setItemBarcode] = useState("");
  const [itemError, setItemError] = useState<string | undefined>(undefined);
  const [itemSuccess, setItemSuccess] = useState(false);
  const [dueDatesOpen, setDueDatesOpen] = useState(false);

  const [overridePrompt, setOverridePrompt] = useState<null | { itemBarcode: string; details: CheckoutBlockDetails }>(null);
  const [overrideReason, setOverrideReason] = useState("");
  const [overrideError, setOverrideError] = useState<string | null>(null);
  const [isOverriding, setIsOverriding] = useState(false);
  const [aiExplainLoading, setAiExplainLoading] = useState(false);
  const [aiExplainError, setAiExplainError] = useState<string | null>(null);
  const [aiExplainDraftId, setAiExplainDraftId] = useState<string | null>(null);
  const [aiExplain, setAiExplain] = useState<AiPolicyExplain | null>(null);
  const [aiExplainFeedback, setAiExplainFeedback] = useState<null | "accepted" | "rejected">(null);

  const patronInputRef = useRef<HTMLInputElement>(null);
  const itemInputRef = useRef<HTMLInputElement>(null);
  const lastDeepLinkRef = useRef<{ patron?: string; item?: string }>({});

  // Deep-link support:
  // - /staff/circulation/checkout?patron=<barcode|id>
  // - /staff/circulation/checkout?item=<barcode>
  useEffect(() => {
    const patronParamRaw = (searchParams.get("patron") || "").trim();
    if (!patronParamRaw) return;
    if (patron?.barcode && patron?.barcode === patronParamRaw) return;
    if (isLoadingPatron) return;
    if (lastDeepLinkRef.current.patron === patronParamRaw) return;

    lastDeepLinkRef.current.patron = patronParamRaw;

    void (async () => {
      const looksLikeId = /^\d+$/.test(patronParamRaw);
      const loaded = looksLikeId
        ? await selectPatron(Number(patronParamRaw))
        : await lookupPatron(patronParamRaw);

      if (loaded) {
        itemInputRef.current?.focus();
      }
    })();
  }, [isLoadingPatron, lookupPatron, patron?.barcode, searchParams, selectPatron]);

  useEffect(() => {
    const itemParamRaw = (searchParams.get("item") || "").trim();
    if (!itemParamRaw) return;
    if (lastDeepLinkRef.current.item === itemParamRaw) return;
    lastDeepLinkRef.current.item = itemParamRaw;
    setItemBarcode(itemParamRaw);
    itemInputRef.current?.focus();
  }, [searchParams]);

  const checkoutMutation = useMutation<any, CheckoutVariables>({
    onSuccess: (data, variables) => {
      setOverridePrompt(null);
      setOverrideReason("");
      setOverrideError(null);
      setIsOverriding(false);
      const dueDate = data.circulation?.dueDate
        ? new Date(data.circulation.dueDate).toLocaleDateString()
        : new Date(Date.now() + 21 * 24 * 60 * 60 * 1000).toLocaleDateString();

      const newItem: CheckoutItem = {
        id: "item-" + Date.now(),
        barcode: variables.itemBarcode,
        title: data.circulation?.title || "Item",
        author: data.circulation?.author || "",
        callNumber: data.circulation?.callNumber || "",
        dueDate,
        status: "success",
        timestamp: new Date(),
      };

      setCheckedOutItems((prev) => [newItem, ...prev]);
      setItemError(undefined);
      setItemSuccess(true);
      toast.success("Item checked out", { description: "Due: " + dueDate });
    },
    onError: (err, variables) => {
      if (err instanceof ApiError && err.status === 403) {
        const missing = Array.isArray((err.details as any)?.missing)
          ? (err.details as any).missing
          : [];
        const reqId = (err.details as any)?.requestId;
        const desc = missing.length > 0 ? `Missing: ${missing.join(", ")}` : err.message;
        toast.error("Permission denied", {
          description: reqId ? `${desc} (req ${reqId})` : desc,
        });
        setItemError(err.message || "Permission denied");
        setItemSuccess(false);
        return;
      }

      const details =
        err instanceof ApiError && err.details && typeof err.details === "object"
          ? (err.details as CheckoutBlockDetails)
          : ((err as any)?.details as CheckoutBlockDetails | undefined);

      const code = details?.code ? String(details.code) : undefined;
      const desc = details?.desc ? String(details.desc) : undefined;
      const explain = (desc && desc.trim()) || code || err.message || "Checkout failed";
      const overrideEligible = Boolean(details?.overrideEligible) && !variables.override;

      const status: CheckoutItem["status"] = overrideEligible ? "warning" : "error";
      const message = overrideEligible ? explain + " (override available)" : explain;

      const errorItem: CheckoutItem = {
        id: "item-" + Date.now(),
        barcode: variables.itemBarcode,
        title: "Unknown",
        author: "",
        callNumber: "",
        dueDate: "",
        status,
        message,
        timestamp: new Date(),
      };

      setCheckedOutItems((prev) => [errorItem, ...prev]);
      setItemError(explain);
      setItemSuccess(false);

      if (overrideEligible) {
        setOverridePrompt({ itemBarcode: variables.itemBarcode, details: details || {} });
        setOverrideReason("");
        setOverrideError(null);
        toast.message("Override required", { description: explain });
        return;
      }

      toast.error("Checkout failed", { description: explain });
      if (variables.override) {
        setOverrideError(explain);
      }
    },
  });

  const closeOverridePrompt = useCallback(() => {
    setOverridePrompt(null);
    setOverrideReason("");
    setOverrideError(null);
    setIsOverriding(false);
    setAiExplainLoading(false);
    setAiExplainError(null);
    setAiExplainDraftId(null);
    setAiExplain(null);
    setAiExplainFeedback(null);
    itemInputRef.current?.focus();
  }, [itemInputRef]);

  const handleOverrideCheckout = useCallback(async () => {
    if (!patron || !overridePrompt) return;
    const reason = overrideReason.trim();
    if (!reason) {
      setOverrideError("Override reason is required");
      return;
    }

    setIsOverriding(true);
    setOverrideError(null);

    try {
      await checkoutMutation.mutateAsync("/api/evergreen/circulation", {
        action: "checkout",
        patronBarcode: patron.barcode,
        itemBarcode: overridePrompt.itemBarcode,
        override: true,
        overrideReason: reason,
      });

      closeOverridePrompt();
    } catch {
      // Errors are surfaced via onError + overrideError.
    } finally {
      setIsOverriding(false);
    }
  }, [patron, overridePrompt, overrideReason, checkoutMutation, closeOverridePrompt]);

  useEffect(() => {
    if (!canAi) return;
    if (!overridePrompt) return;

    const details = overridePrompt.details || {};
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
            action: "checkout",
            code: details.code || undefined,
            desc: details.desc || undefined,
            overrideEligible: details.overrideEligible ?? undefined,
            overridePerm: details.overridePerm || undefined,
            context: {
              route: "staff.circulation.checkout",
              itemBarcode: overridePrompt.itemBarcode,
            },
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
      } catch (e) {
        if (cancelled) return;
        setAiExplainError(e instanceof Error ? e.message : String(e));
        setAiExplainLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [canAi, overridePrompt]);

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

  const enqueueCheckout = useCallback(
    (barcode: string) => {
      const cleaned = String(barcode || "").trim();
      if (!cleaned) return;

      if (!patron) {
        toast.message("Scan a patron first");
        return;
      }

      // Per-scan UI hints; the table is the durable session history.
      setItemError(undefined);
      setItemSuccess(false);

      setScanQueue((prev) => [...prev, cleaned]);
    },
    [patron]
  );

  const processNextCheckout = useCallback(async () => {
    if (!patron) return;
    if (isCheckingOut) return;
    if (overridePrompt) return;

    const nextBarcode = scanQueue[0];
    if (!nextBarcode) return;

    setIsCheckingOut(true);
    setActiveScan(nextBarcode);

    try {
      await checkoutMutation.mutateAsync("/api/evergreen/circulation", {
        action: "checkout",
        patronBarcode: patron.barcode,
        itemBarcode: nextBarcode,
      });
    } finally {
      setIsCheckingOut(false);
      setActiveScan(null);
      setScanQueue((prev) => prev.slice(1));
      itemInputRef.current?.focus();
    }
  }, [patron, isCheckingOut, overridePrompt, scanQueue, checkoutMutation]);

  React.useEffect(() => { // Process queue when it changes
    void processNextCheckout();
  }, [scanQueue.length, patron, isCheckingOut, overridePrompt]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleNewSession = useCallback(() => {
    clearPatron();
    setCheckedOutItems([]);
    setItemBarcode("");
    setScanQueue([]);
    setActiveScan(null);
    setItemError(undefined);
    setItemSuccess(false);
    setDueDatesOpen(false);
    setOverridePrompt(null);
    setOverrideReason("");
    setOverrideError(null);
    setIsOverriding(false);
    patronInputRef.current?.focus();
  }, [clearPatron]);

  const handlePrintReceipt = useCallback(() => {
    if (!patron) {
      toast.message("Select a patron first");
      return;
    }

    printHtml(
      buildReceiptHtml({
        patronName: patron.displayName,
        patronBarcode: patron.barcode,
        items: checkedOutItems,
      }),
      { title: "StacksOS Receipt", tone: "receipt" }
    );
  }, [patron, checkedOutItems]);

  const handleViewBills = useCallback(() => {
    if (!patron) {
      toast.message("Select a patron first");
      return;
    }
    router.push(`/staff/circulation/bills?patron=${encodeURIComponent(patron.barcode)}`);
  }, [router, patron]);

  const dueDateGroups = useMemo(() => {
    const map = new Map<string, { dueDate: string; count: number; barcodes: string[] }>();
    for (const item of checkedOutItems) {
      if (!item.dueDate) continue;
      const entry = map.get(item.dueDate) || { dueDate: item.dueDate, count: 0, barcodes: [] };
      entry.count += 1;
      entry.barcodes.push(item.barcode);
      map.set(item.dueDate, entry);
    }
    return Array.from(map.values()).sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  }, [checkedOutItems]);

  const handleViewDueDates = useCallback(() => {
    if (checkedOutItems.length === 0) {
      toast.message("No items in this session yet");
      return;
    }
    setDueDatesOpen(true);
  }, [checkedOutItems.length]);

  useKeyboardShortcuts([
    { key: "Escape", handler: handleNewSession },
    { key: "p", ctrl: true, handler: handlePrintReceipt, preventDefault: true },
  ]);

  const sessionStats = {
    total: checkedOutItems.length,
    success: checkedOutItems.filter((i) => i.status === "success").length,
    warning: checkedOutItems.filter((i) => i.status === "warning").length,
    error: checkedOutItems.filter((i) => i.status === "error").length,
  };

  const columns = useMemo<ColumnDef<CheckoutItem>[]>(
    () => [
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => {
          const status = row.original.status;
          const label = status === "success" ? "Checked Out" : status === "warning" ? "Warning" : "Failed";
          return (
            <StatusBadge
              label={label}
              status={status === "success" ? "success" : status === "warning" ? "warning" : "error"}
              showIcon
            />
          );
        },
      },
      {
        accessorKey: "title",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Title" />,
        cell: ({ row }) => (
          <div className="space-y-0.5">
            <div className="font-medium">{row.original.title}</div>
            {row.original.author && <div className="text-xs text-muted-foreground">{row.original.author}</div>}
            {row.original.message && <div className="text-xs text-amber-600">{row.original.message}</div>}
          </div>
        ),
      },
      {
        accessorKey: "barcode",
        header: "Barcode",
        cell: ({ row }) => <span className="font-mono text-xs">{row.original.barcode}</span>,
      },
      {
        accessorKey: "callNumber",
        header: "Call Number",
        cell: ({ row }) => <span className="text-xs">{row.original.callNumber}</span>,
      },
      {
        accessorKey: "dueDate",
        header: "Due",
        cell: ({ row }) => <span className="text-xs">{row.original.dueDate}</span>,
      },
      {
        accessorKey: "timestamp",
        header: "Time",
        cell: ({ row }) => (
          <span className="text-xs text-muted-foreground">
            {row.original.timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          </span>
        ),
      },
    ],
    []
  );

const checkoutEmptyState = useMemo(    () => (      <EmptyState        title="No items checked out yet"        description="Scan a patron and item to start circulating materials."      />    ),    []  );
  return (
    <PageContainer>
      <PageHeader
        title="Check Out"
        subtitle="Scan patron and item barcodes to circulate materials."
        breadcrumbs={[{ label: "Circulation" }, { label: "Check Out" }]}
        actions={[
          { label: "New Session", onClick: handleNewSession, icon: RotateCcw, shortcut: { key: "Escape" } },
          { label: "Print Receipt", onClick: handlePrintReceipt, icon: Printer, shortcut: { key: "p", ctrl: true } },
          { label: "Walkthrough", onClick: () => window.location.assign("/staff/training?workflow=checkout"), icon: HelpCircle, variant: "outline" },
        ]}
      >
        <div className="flex flex-wrap gap-2">
          <Badge variant="secondary" className="rounded-full">Active Session</Badge>
          {patron && (
            <Badge variant="outline" className="rounded-full">Patron: {patron.displayName}</Badge>
          )}
        </div>
      </PageHeader>

      <PageContent className="space-y-6">
        <div className="grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
          <Card className="rounded-2xl border-border/70 shadow-sm">
            <CardContent className="space-y-4 p-5">
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Patron & Item Scan</h3>

                <BarcodeInput
                  ref={patronInputRef}
                  label="Patron Barcode"
                  placeholder="Scan or enter patron barcode"
                  onSubmit={lookupPatron}
                  isLoading={isLoadingPatron}
                  isSuccess={!!patron && !isLoadingPatron}
                  error={patronError?.message}
                  autoFocus
                />

                {patron && (
                  <PatronCard
                    patron={patron}
                    variant="default"
                    showActions
                    onClear={handleNewSession}
                  />
                )}

                <BarcodeInput
                  ref={itemInputRef}
                  label="Item Barcode"
                  placeholder="Scan item to check out"
                  value={itemBarcode}
                  onChange={setItemBarcode}
                  onSubmit={enqueueCheckout}
                  isLoading={isCheckingOut}
                  isSuccess={itemSuccess}
                  error={itemError}
                  disabled={!patron}
                  autoClear
                />
                {isCheckingOut && (
                  <div aria-live="polite" aria-atomic="true">
                    <LoadingInline message="Processing checkout..." />
                  </div>
                )}
                {(scanQueue.length > 0 || activeScan) && (
                  <div className="text-xs text-muted-foreground">
                    {activeScan ? (
                      <span className="font-mono">Processing: {activeScan}</span>
                    ) : (
                      <span>Ready</span>
                    )}
                    {scanQueue.length > 1 && (
                      <span className="ml-2">Queued: {scanQueue.length - 1}</span>
                    )}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-4">
            <Card className="rounded-2xl border-border/70 shadow-sm">
              <CardContent className="p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">Session Totals</p>
                    <h3 className="text-2xl font-semibold mt-1">{sessionStats.total}</h3>
                  </div>
                  <div className="h-10 w-10 rounded-full bg-[hsl(var(--brand-1))]/10 flex items-center justify-center text-[hsl(var(--brand-1))]">
                    <BookOpen className="h-5 w-5" />
                  </div>
                </div>
                <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-xl bg-muted/50 p-3">
                    <CheckCircle2 className="h-4 w-4 text-emerald-600 mx-auto" />
                    <div className="text-sm font-semibold mt-1">{sessionStats.success}</div>
                    <div className="text-[11px] text-muted-foreground">Success</div>
                  </div>
                  <div className="rounded-xl bg-muted/50 p-3">
                    <AlertTriangle className="h-4 w-4 text-amber-500 mx-auto" />
                    <div className="text-sm font-semibold mt-1">{sessionStats.warning}</div>
                    <div className="text-[11px] text-muted-foreground">Warnings</div>
                  </div>
                  <div className="rounded-xl bg-muted/50 p-3">
                    <XCircle className="h-4 w-4 text-rose-500 mx-auto" />
                    <div className="text-sm font-semibold mt-1">{sessionStats.error}</div>
                    <div className="text-[11px] text-muted-foreground">Errors</div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="rounded-2xl border-border/70 shadow-sm">
              <CardContent className="p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">Quick Actions</p>
                    <h3 className="text-base font-semibold mt-1">Session Tools</h3>
                  </div>
                  <CreditCard className="h-5 w-5 text-muted-foreground" />
                </div>
                <div className="space-y-2">
                  <Button variant="outline" className="w-full justify-between" onClick={handlePrintReceipt} disabled={!patron}>
                    Print Receipt
                    <Printer className="h-4 w-4 text-muted-foreground" />
                  </Button>
                  <Button variant="outline" className="w-full justify-between" onClick={handleViewBills} disabled={!patron}>
                    View Patron Bills
                    <CreditCard className="h-4 w-4 text-muted-foreground" />
                  </Button>
                  <Button variant="outline" className="w-full justify-between" onClick={handleViewDueDates} disabled={checkedOutItems.length === 0}>
                    View Due Dates
                    <Clock className="h-4 w-4 text-muted-foreground" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Checkout Activity</h3>
            <Badge variant="secondary" className="rounded-full">{sessionStats.total} items</Badge>
          </div>

          <DataTable
            paginated={false}
            columns={columns}
            data={checkedOutItems}
            searchable
            searchPlaceholder="Search by title, barcode, call number..."
            emptyState={checkoutEmptyState}
          />
        </div>
      </PageContent>

      <Dialog
        open={!!overridePrompt}
        onOpenChange={(open) => {
          if (!open) {
            closeOverridePrompt();
          }
        }}
      >
        <DialogContent className="sm:max-w-[560px]">
          <DialogHeader>
            <DialogTitle>Override Required</DialogTitle>
            <DialogDescription>
              Evergreen blocked this checkout. If you have permission, you can override with a reason.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="rounded-xl border border-border/70 bg-muted/30 p-3">
              <div className="text-sm font-medium">Blocked action</div>
              <div className="text-sm text-muted-foreground mt-1">
                {overridePrompt?.details.desc || overridePrompt?.details.code || itemError || "Checkout blocked."}
              </div>
              {Array.isArray(overridePrompt?.details.nextSteps) && overridePrompt.details.nextSteps.length > 0 && (
                <ul className="mt-3 space-y-1 text-xs text-muted-foreground list-disc list-inside">
                  {overridePrompt.details.nextSteps.map((step, idx) => (
                    <li key={idx}>{step}</li>
                  ))}
                </ul>
              )}
              <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-muted-foreground font-mono">
                {overridePrompt?.itemBarcode && (
                  <span className="rounded-full border px-2 py-0.5">Item {overridePrompt.itemBarcode}</span>
                )}
                {overridePrompt?.details.code && (
                  <span className="rounded-full border px-2 py-0.5">Code {overridePrompt.details.code}</span>
                )}
                {overridePrompt?.details.overridePerm && (
                  <span className="rounded-full border px-2 py-0.5">Perm {overridePrompt.details.overridePerm}</span>
                )}
                {overridePrompt?.details.requestId && (
                  <span className="rounded-full border px-2 py-0.5">Req {overridePrompt.details.requestId}</span>
                )}
              </div>
            </div>

            {canAi && (
              <div className="rounded-xl border border-border/70 bg-background p-3 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-sm font-medium">AI explanation (draft-only)</div>
                  <div className="flex items-center gap-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => void submitAiExplainFeedback("accepted")}
                      disabled={!aiExplainDraftId || aiExplainFeedback !== null}
                      title="Thumbs up"
                    >
                      <ThumbsUp className="h-4 w-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => void submitAiExplainFeedback("rejected")}
                      disabled={!aiExplainDraftId || aiExplainFeedback !== null}
                      title="Thumbs down"
                    >
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
                  <div className="text-sm text-muted-foreground">AI unavailable: {aiExplainError}</div>
                ) : aiExplain ? (
                  <div className="space-y-2">
                    <div className="text-sm">{aiExplain.explanation}</div>
                    {Array.isArray(aiExplain.nextSteps) && aiExplain.nextSteps.length > 0 ? (
                      <ul className="space-y-1 text-xs text-muted-foreground list-disc list-inside">
                        {aiExplain.nextSteps.slice(0, 6).map((step, idx) => (
                          <li key={idx}>{step}</li>
                        ))}
                      </ul>
                    ) : null}
                    {aiExplain.suggestedNote ? (
                      <div className="rounded-lg border bg-muted/30 p-2 space-y-2">
                        <div className="text-xs text-muted-foreground">
                          <div className="font-medium text-foreground/80">Suggested override note</div>
                          <div className="mt-1 whitespace-pre-wrap">{aiExplain.suggestedNote}</div>
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setOverrideReason((prev) => (prev ? prev : aiExplain.suggestedNote || ""))}
                        >
                          Use note
                        </Button>
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <div className="text-sm text-muted-foreground">No AI explanation available.</div>
                )}
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="override-reason">Override reason</Label>
              <Textarea
                id="override-reason"
                placeholder="Required. Explain why you're overriding this block."
                value={overrideReason}
                onChange={(e) => setOverrideReason(e.target.value)}
                rows={3}
              />
              {overrideError && <div className="text-sm text-destructive">{overrideError}</div>}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={closeOverridePrompt} disabled={isOverriding}>
              Cancel
            </Button>
            <Button onClick={handleOverrideCheckout} disabled={isOverriding || !overrideReason.trim()}>
              {isOverriding && (
                <span className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
              )}
              Override &amp; Check Out
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={dueDatesOpen} onOpenChange={setDueDatesOpen}>
        <DialogContent className="sm:max-w-[700px]">
          <DialogHeader>
            <DialogTitle>Due Dates</DialogTitle>
            <DialogDescription>
              {patron ? `Session due dates for ${patron.displayName}.` : "Session due dates."}
            </DialogDescription>
          </DialogHeader>

          {dueDateGroups.length === 0 ? (
            <div className="text-sm text-muted-foreground">No due dates available yet.</div>
          ) : (
            <div className="space-y-3">
              <div className="rounded-xl border border-border/70 bg-muted/30 p-3 text-xs text-muted-foreground">
                Tip: print a receipt (Ctrl/⌘+P) for a patron-friendly list.
              </div>
              <div className="grid gap-2">
                {dueDateGroups.map((g) => (
                  <div key={g.dueDate} className="flex items-center justify-between rounded-xl border border-border/70 px-3 py-2">
                    <div>
                      <div className="font-medium">{g.dueDate}</div>
                      <div className="text-xs text-muted-foreground mono">{g.barcodes.slice(0, 4).join(", ")}{g.barcodes.length > 4 ? "…" : ""}</div>
                    </div>
                    <Badge variant="secondary" className="rounded-full">{g.count} item{g.count === 1 ? "" : "s"}</Badge>
                  </div>
                ))}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </PageContainer>
  );
}
