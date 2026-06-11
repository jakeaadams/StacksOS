/**
 * Checkout Page - Staff circulation checkout desk
 *
 * Flow mirrors how a clerk works:
 *   1. Identify patron (scan card)           ->  patron summary with blocks/fines/expiration
 *   2. Scan items                             ->  instant per-scan feedback + running list
 *   3. Finish: running totals + print receipt
 */

"use client";

import * as React from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { useRouter, useSearchParams } from "next/navigation";

import {
  BarcodeInput,
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
  CheckCircle2,
  XCircle,
  AlertTriangle,
  ScanLine,
  ThumbsUp,
  ThumbsDown,
  User,
  CalendarClock,
  CalendarDays,
  Ban,
  Mail,
  BookOpen,
  ChevronRight,
} from "lucide-react";
import type { ColumnDef } from "@tanstack/react-table";

import { cn } from "@/lib/utils";
import { escapeHtml, printHtml } from "@/lib/print";
import { featureFlags } from "@/lib/feature-flags";
import { fetchWithAuth } from "@/lib/client-fetch";
import { useCirculationSound } from "@/hooks/use-circulation-sound";
import { useCirculationPatron } from "@/contexts/patron-context";

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
  dueDate?: string;
};

function buildReceiptHtml(params: {
  patronName?: string;
  patronBarcode?: string;
  items: CheckoutItem[];
}) {
  const now = new Date();
  const safePatronName = escapeHtml(params.patronName || "");
  const safePatronBarcode = escapeHtml(params.patronBarcode || "");

  // Receipt lists only what the patron actually took home.
  const checkedOut = params.items.filter((i) => i.status === "success");

  const rows = checkedOut
    .slice()
    .reverse()
    .map((i) =>
      [
        "<tr>",
        `<td>${escapeHtml(i.title)}${i.author ? `<div class="muted">${escapeHtml(i.author)}</div>` : ""}</td>`,
        `<td class="mono">${escapeHtml(i.barcode)}</td>`,
        `<td class="mono">${escapeHtml(i.callNumber)}</td>`,
        `<td class="mono"><strong>${escapeHtml(i.dueDate)}</strong></td>`,
        "</tr>",
      ].join("")
    )
    .join("\n");

  return [
    '<div class="box">',
    '<div class="brand">StacksOS</div>',
    '<h1 style="margin-top:4px">Checkout Receipt</h1>',
    `<div class="muted">${escapeHtml(now.toLocaleString())}</div>`,
    '<div class="meta">',
    safePatronName
      ? `<div><span class="k">Patron:</span> <span class="v">${safePatronName}</span></div>`
      : "",
    safePatronBarcode
      ? `<div><span class="k">Card:</span> <span class="v mono">${safePatronBarcode}</span></div>`
      : "",
    `<div><span class="k">Items checked out:</span> <span class="v">${checkedOut.length}</span></div>`,
    "</div>",
    "</div>",
    "<h2>Items checked out</h2>",
    "<table>",
    `<thead><tr><th scope="col">Title</th><th scope="col">Barcode</th><th scope="col">Call #</th><th scope="col">Due date</th></tr></thead>`,
    `<tbody>${rows || '<tr><td colspan="4" class="muted">No items checked out.</td></tr>'}</tbody>`,
    "</table>",
    '<div class="muted" style="margin-top:16px">Please return or renew items by the due date. Questions? Ask your library staff.</div>',
  ].join("\n");
}

/** A short, human-readable expiry/balance assessment for the patron banner. */
function describeExpiry(expires?: string): { expired: boolean; soon: boolean; label: string } {
  if (!expires) return { expired: false, soon: false, label: "" };
  const d = parseLibraryDate(expires);
  if (Number.isNaN(d.getTime())) return { expired: false, soon: false, label: "" };
  const today = startOfLocalDay(new Date());
  const days = Math.floor((startOfLocalDay(d).getTime() - today.getTime()) / (24 * 60 * 60 * 1000));
  const label = d.toLocaleDateString();
  if (days < 0) return { expired: true, soon: false, label };
  if (days <= 30) return { expired: false, soon: true, label };
  return { expired: false, soon: false, label };
}

function parseLibraryDate(value: string): Date {
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (dateOnly) {
    return new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]));
  }
  return new Date(value);
}

function startOfLocalDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function formatLibraryDate(value?: string): string {
  if (!value) return "";
  const d = parseLibraryDate(value);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString();
}

export default function CheckoutPage() {
  const router = useRouter();
  const canAi = featureFlags.ai;
  const { play: playSound } = useCirculationSound();
  const { setPatron: setContextPatron } = useCirculationPatron();

  const {
    selectedPatron: patron,
    isLoading: isLoadingPatron,
    error: patronError,
    lookupByBarcode: lookupPatron,
    selectPatron,
    clear: clearPatron,
  } = usePatronLookup({
    onError: (err) => toast.error("Patron not found", { description: err.message }),
    onFound: (p) => {
      toast.success("Loaded: " + p.displayName);
      setContextPatron({
        id: p.id,
        barcode: p.barcode,
        displayName: p.displayName,
        alerts: p.alertCount > 0 ? [`${p.alertCount} alert(s)`] : undefined,
        balance: p.balanceOwed,
        isBlocked: p.barred,
      });
    },
  });

  const searchParams = useSearchParams();
  const [checkedOutItems, setCheckedOutItems] = useState<CheckoutItem[]>([]);
  const [scanQueue, setScanQueue] = useState<string[]>([]);
  const [activeScan, setActiveScan] = useState<string | null>(null);
  const [isCheckingOut, setIsCheckingOut] = useState(false);
  const [itemBarcode, setItemBarcode] = useState("");
  const [itemError, setItemError] = useState<string | undefined>(undefined);
  const [itemSuccess, setItemSuccess] = useState(false);
  const [specificDueDate, setSpecificDueDate] = useState("");
  const [dueDateOpen, setDueDateOpen] = useState(false);

  const [overridePrompt, setOverridePrompt] = useState<null | {
    itemBarcode: string;
    details: CheckoutBlockDetails;
  }>(null);
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
      const loadedByBarcode = await lookupPatron(patronParamRaw);
      const loaded =
        loadedByBarcode ||
        (/^\d+$/.test(patronParamRaw) ? await selectPatron(Number(patronParamRaw)) : null);

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

  // Move focus to the item scanner the moment a patron is loaded.
  useEffect(() => {
    if (patron && !isLoadingPatron) {
      itemInputRef.current?.focus();
    }
  }, [patron, isLoadingPatron]);

  const checkoutMutation = useMutation<any, CheckoutVariables>({
    onSuccess: (data, variables) => {
      setOverridePrompt(null);
      setOverrideReason("");
      setOverrideError(null);
      setIsOverriding(false);
      const dueDate =
        formatLibraryDate(data.circulation?.dueDate) ||
        new Date(Date.now() + 21 * 24 * 60 * 60 * 1000).toLocaleDateString();

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
      playSound("success");
      toast.success("Checked out: " + newItem.title, { description: "Due " + dueDate });
    },
    onError: (err, variables) => {
      if (err instanceof ApiError && err.status === 403) {
        const missing = Array.isArray((err.details as Record<string, any>)?.missing)
          ? (err.details as Record<string, any>).missing
          : [];
        const reqId = (err.details as Record<string, any>)?.requestId;
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
          : ((err as Error & { details?: unknown }).details as CheckoutBlockDetails | undefined);

      const code = details?.code ? String(details.code) : undefined;
      const desc = details?.desc ? String(details.desc) : undefined;
      const explain = (desc && desc.trim()) || code || err.message || "Checkout failed";
      const overrideEligible = Boolean(details?.overrideEligible) && !variables.override;

      const status: CheckoutItem["status"] = overrideEligible ? "warning" : "error";
      const message = overrideEligible ? explain + " Override available." : explain;

      const errorItem: CheckoutItem = {
        id: "item-" + Date.now(),
        barcode: variables.itemBarcode,
        title: "Not checked out",
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

      playSound("error");
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
        dueDate: specificDueDate || undefined,
      });

      closeOverridePrompt();
    } catch {
      // Errors are surfaced via onError + overrideError.
    } finally {
      setIsOverriding(false);
    }
  }, [
    patron,
    overridePrompt,
    overrideReason,
    specificDueDate,
    checkoutMutation,
    closeOverridePrompt,
  ]);

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
      } catch (e: unknown) {
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
        toast.message("Scan a patron's card first");
        patronInputRef.current?.focus();
        return;
      }

      if (cleaned === activeScan || scanQueue.includes(cleaned)) {
        toast.message("Item already queued", { description: cleaned });
        itemInputRef.current?.focus();
        return;
      }

      if (
        overridePrompt?.itemBarcode === cleaned ||
        checkedOutItems.some((item) => item.barcode === cleaned)
      ) {
        toast.message("Item already scanned in this checkout", { description: cleaned });
        itemInputRef.current?.focus();
        return;
      }

      // Per-scan UI hints; the table is the durable session history.
      setItemError(undefined);
      setItemSuccess(false);

      setScanQueue((prev) => [...prev, cleaned]);
    },
    [activeScan, checkedOutItems, overridePrompt?.itemBarcode, patron, scanQueue]
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
        dueDate: specificDueDate || undefined,
      });
    } finally {
      setIsCheckingOut(false);
      setActiveScan(null);
      setScanQueue((prev) => prev.slice(1));
      itemInputRef.current?.focus();
    }
  }, [patron, isCheckingOut, overridePrompt, scanQueue, checkoutMutation, specificDueDate]);

  React.useEffect(() => {
    // Process queue when it changes
    void processNextCheckout();
  }, [scanQueue.length, patron, isCheckingOut, overridePrompt]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleNewSession = useCallback(() => {
    clearPatron();
    setContextPatron(null);
    setCheckedOutItems([]);
    setItemBarcode("");
    setScanQueue([]);
    setActiveScan(null);
    setItemError(undefined);
    setItemSuccess(false);
    setSpecificDueDate("");
    setDueDateOpen(false);
    setOverridePrompt(null);
    setOverrideReason("");
    setOverrideError(null);
    setIsOverriding(false);
    patronInputRef.current?.focus();
  }, [clearPatron, setContextPatron]);

  const handleFinishSession = useCallback(() => {
    const hasOpenWork =
      checkedOutItems.length > 0 ||
      scanQueue.length > 0 ||
      activeScan !== null ||
      overridePrompt !== null;

    if (hasOpenWork) {
      const ok = window.confirm(
        "Finish this checkout and clear the session? Print the receipt first if the patron needs one."
      );
      if (!ok) return;
    }

    handleNewSession();
  }, [activeScan, checkedOutItems.length, handleNewSession, overridePrompt, scanQueue.length]);

  const handlePrintReceipt = useCallback(() => {
    if (!patron) {
      toast.message("Load a patron first");
      return;
    }
    if (checkedOutItems.filter((i) => i.status === "success").length === 0) {
      toast.message("No items checked out to print");
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
    if (!patron) return;
    router.push(`/staff/circulation/bills?patron=${encodeURIComponent(patron.barcode)}`);
  }, [router, patron]);

  const handleViewRecord = useCallback(() => {
    if (!patron) return;
    router.push(`/staff/patrons/${patron.id}`);
  }, [router, patron]);

  useKeyboardShortcuts([
    { key: "Escape", handler: handleFinishSession },
    { key: "p", ctrl: true, handler: handlePrintReceipt, preventDefault: true },
  ]);

  const sessionStats = useMemo(
    () => ({
      total: checkedOutItems.length,
      success: checkedOutItems.filter((i) => i.status === "success").length,
      warning: checkedOutItems.filter((i) => i.status === "warning").length,
      error: checkedOutItems.filter((i) => i.status === "error").length,
    }),
    [checkedOutItems]
  );

  const dueDateGroups = useMemo(() => {
    const groups = new Map<string, number>();
    for (const item of checkedOutItems) {
      if (item.status !== "success" || !item.dueDate) continue;
      groups.set(item.dueDate, (groups.get(item.dueDate) ?? 0) + 1);
    }
    return Array.from(groups.entries())
      .map(([dueDate, count]) => ({ dueDate, count }))
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  }, [checkedOutItems]);

  const expiry = describeExpiry(patron?.expires);
  const balance = patron?.balanceOwed ?? 0;
  const penalties = patron?.penalties ?? [];
  const hasHardBlock = Boolean(patron?.barred) || expiry.expired || penalties.length > 0;
  const hasAccountAttention =
    hasHardBlock || expiry.soon || balance > 0 || (patron?.overdueCount ?? 0) > 0;

  const columns = useMemo<ColumnDef<CheckoutItem>[]>(
    () => [
      {
        accessorKey: "status",
        header: "Result",
        cell: ({ row }) => {
          const status = row.original.status;
          const label =
            status === "success"
              ? "Checked out"
              : status === "warning"
                ? "Needs override"
                : "Failed";
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
          <div className="min-w-0 space-y-0.5">
            <div className="font-medium leading-snug">{row.original.title}</div>
            {row.original.author && (
              <div className="text-xs text-muted-foreground">{row.original.author}</div>
            )}
            {row.original.message && (
              <div
                className={cn(
                  "text-xs",
                  row.original.status === "error"
                    ? "text-[hsl(var(--status-error-text))]"
                    : "text-[hsl(var(--status-warning-text))]"
                )}
              >
                {row.original.message}
              </div>
            )}
          </div>
        ),
      },
      {
        accessorKey: "barcode",
        header: "Item barcode",
        cell: ({ row }) => (
          <span className="font-mono text-xs text-muted-foreground">{row.original.barcode}</span>
        ),
      },
      {
        accessorKey: "callNumber",
        header: "Call number",
        cell: ({ row }) => (
          <span className="font-mono text-xs text-muted-foreground">
            {row.original.callNumber || "—"}
          </span>
        ),
      },
      {
        accessorKey: "dueDate",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Due date" />,
        cell: ({ row }) =>
          row.original.dueDate ? (
            <span className="inline-flex items-center gap-1.5 font-medium tabular-nums">
              <CalendarDays className="h-3.5 w-3.5 text-muted-foreground" />
              {row.original.dueDate}
            </span>
          ) : (
            <span className="text-muted-foreground">—</span>
          ),
      },
      {
        accessorKey: "timestamp",
        header: "Scanned",
        cell: ({ row }) => (
          <span className="text-xs text-muted-foreground tabular-nums">
            {row.original.timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          </span>
        ),
      },
    ],
    []
  );

  const checkoutEmptyState = useMemo(
    () => (
      <EmptyState
        icon={ScanLine}
        title={patron ? "No items in this checkout" : "No active checkout"}
        description={
          patron
            ? "Items appear here as they are checked out."
            : "Load a patron to start a checkout."
        }
      />
    ),
    [patron]
  );

  const successCount = sessionStats.success;
  const canPrint = !!patron && successCount > 0;

  return (
    <PageContainer>
      <PageHeader
        title="Checkout Desk"
        subtitle="Fast patron checkout with account attention and item results in one place."
        breadcrumbs={[{ label: "Circulation" }, { label: "Check Out" }]}
      />

      <PageContent className="space-y-6">
        <div className="grid min-w-0 gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
          {/* ----- Primary work surface ----- */}
          <div className="min-w-0 space-y-5">
            {/* Step 1: Patron */}
            <Card className="min-w-0 rounded-2xl border-border/70">
              <CardContent className="space-y-3 p-5">
                <StepHeader
                  index={1}
                  title="Patron"
                  hint={patron ? undefined : "Scan card or enter barcode"}
                  done={!!patron}
                />
                <BarcodeInput
                  ref={patronInputRef}
                  label="Patron barcode"
                  placeholder="Scan patron card or enter barcode…"
                  onSubmit={lookupPatron}
                  isLoading={isLoadingPatron}
                  isSuccess={!!patron && !isLoadingPatron}
                  error={patronError?.message}
                  autoFocus
                  size="lg"
                />

                {patron && (
                  <PatronSummaryPanel
                    patron={patron}
                    expiry={expiry}
                    balance={balance}
                    penalties={penalties}
                    hasHardBlock={hasHardBlock}
                    hasAccountAttention={hasAccountAttention}
                    onViewRecord={handleViewRecord}
                    onViewBills={handleViewBills}
                  />
                )}
              </CardContent>
            </Card>

            {/* Step 2: Items */}
            <Card className="min-w-0 rounded-2xl border-border/70">
              <CardContent className="space-y-3 p-5">
                <div className="flex items-center justify-between gap-3">
                  <StepHeader
                    index={2}
                    title="Scan items"
                    hint={patron ? "Enter submits each scan" : "Load a patron first"}
                    disabled={!patron}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 gap-1.5 text-xs"
                    onClick={() => setDueDateOpen((v) => !v)}
                    disabled={!patron}
                  >
                    <CalendarClock className="h-3.5 w-3.5" />
                    {specificDueDate
                      ? `Due ${formatLibraryDate(specificDueDate) || specificDueDate}`
                      : "Set due date"}
                  </Button>
                </div>

                <BarcodeInput
                  ref={itemInputRef}
                  label="Item barcode"
                  placeholder={patron ? "Scan item barcode…" : "Load a patron to begin scanning"}
                  value={itemBarcode}
                  onChange={setItemBarcode}
                  onSubmit={enqueueCheckout}
                  isLoading={false}
                  isSuccess={itemSuccess}
                  error={itemError}
                  disabled={!patron}
                  autoClear
                  size="lg"
                />

                {/* Specific due-date override (collapsed by default) */}
                {patron && dueDateOpen && (
                  <div className="grid gap-2 rounded-xl border border-border/70 bg-muted/30 p-3 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-center">
                    <Label
                      htmlFor="specific-due-date"
                      className="flex items-center gap-2 text-xs text-muted-foreground"
                    >
                      <CalendarClock className="h-4 w-4 shrink-0" />
                      Due date override
                    </Label>
                    <input
                      id="specific-due-date"
                      type="date"
                      value={specificDueDate}
                      onChange={(e) => setSpecificDueDate(e.target.value)}
                      className="h-8 w-full min-w-0 rounded-md border border-border/70 bg-background px-2 text-xs"
                    />
                    {specificDueDate && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-8 px-2 text-xs"
                        onClick={() => setSpecificDueDate("")}
                      >
                        Use policy default
                      </Button>
                    )}
                  </div>
                )}

                {/* Live scan status */}
                <div
                  className="flex min-h-[20px] flex-wrap items-center gap-2 text-xs"
                  aria-live="polite"
                  aria-atomic="true"
                >
                  {activeScan ? (
                    <span className="inline-flex items-center gap-2 text-muted-foreground">
                      <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-[hsl(var(--brand-1))] border-t-transparent" />
                      Checking out <span className="font-mono text-foreground">{activeScan}</span>
                    </span>
                  ) : scanQueue.length > 0 ? (
                    <span className="text-muted-foreground">{scanQueue.length} queued…</span>
                  ) : itemSuccess ? (
                    <span className="inline-flex items-center gap-1.5 text-[hsl(var(--status-success-text))]">
                      <CheckCircle2 className="h-3.5 w-3.5" /> Checked out. Ready for next item.
                    </span>
                  ) : itemError ? (
                    <span className="inline-flex items-center gap-1.5 text-[hsl(var(--status-error-text))]">
                      <XCircle className="h-3.5 w-3.5" /> {itemError}
                    </span>
                  ) : patron ? (
                    <span className="text-muted-foreground">Ready to scan.</span>
                  ) : null}
                  {scanQueue.length > 0 && activeScan && scanQueue.length > 1 && (
                    <span className="text-muted-foreground">
                      · {scanQueue.length - 1} more queued
                    </span>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Step 3: Running list of items */}
            <div className="min-w-0 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <StepHeader
                  index={3}
                  title="Scan log"
                  hint={
                    successCount > 0
                      ? "Successful checkouts are included on the receipt"
                      : undefined
                  }
                />
                <div className="flex items-center gap-1.5">
                  {sessionStats.success > 0 && (
                    <SessionPill
                      tone="success"
                      icon={CheckCircle2}
                      count={sessionStats.success}
                      label="out"
                    />
                  )}
                  {sessionStats.warning > 0 && (
                    <SessionPill
                      tone="warning"
                      icon={AlertTriangle}
                      count={sessionStats.warning}
                      label="override"
                    />
                  )}
                  {sessionStats.error > 0 && (
                    <SessionPill
                      tone="error"
                      icon={XCircle}
                      count={sessionStats.error}
                      label="failed"
                    />
                  )}
                </div>
              </div>

              <DataTable
                paginated={false}
                columns={columns}
                data={checkedOutItems}
                searchable={checkedOutItems.length >= 8}
                searchPlaceholder="Filter by title, barcode, or call number…"
                emptyState={checkoutEmptyState}
                columnVisibilityToggle={false}
                compact
                className="min-w-0"
              />
            </div>
          </div>

          {/* ----- Sticky session rail ----- */}
          <aside className="min-w-0 self-start xl:sticky xl:top-6">
            <Card className="min-w-0 rounded-2xl border-border/70">
              <CardContent className="space-y-4 p-5">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-sm font-semibold">Checkout session</h3>
                  {patron ? (
                    <Badge variant="outline" className="rounded-full text-[11px] font-mono">
                      {patron.barcode}
                    </Badge>
                  ) : (
                    <span className="text-xs text-muted-foreground">No patron</span>
                  )}
                </div>

                {patron && (
                  <div className="space-y-2 rounded-xl border border-border/70 bg-muted/20 p-3">
                    <div className="truncate text-sm font-medium">{patron.displayName}</div>
                    <StatusBadge
                      label={
                        hasHardBlock
                          ? "Checkout blocked"
                          : hasAccountAttention
                            ? "Review before checkout"
                            : "Clear to check out"
                      }
                      status={hasHardBlock ? "error" : hasAccountAttention ? "warning" : "success"}
                      showIcon
                      size="sm"
                    />
                  </div>
                )}

                {/* Big, unambiguous success counter */}
                <div className="rounded-2xl border border-border/70 bg-muted/30 p-4 text-center">
                  <div className="text-4xl font-semibold tabular-nums text-foreground">
                    {successCount}
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    item{successCount === 1 ? "" : "s"} checked out
                  </div>
                  {(sessionStats.warning > 0 || sessionStats.error > 0) && (
                    <div className="mt-2 flex items-center justify-center gap-3 text-[11px]">
                      {sessionStats.warning > 0 && (
                        <span className="text-[hsl(var(--status-warning-text))]">
                          {sessionStats.warning} need override
                        </span>
                      )}
                      {sessionStats.error > 0 && (
                        <span className="text-[hsl(var(--status-error-text))]">
                          {sessionStats.error} failed
                        </span>
                      )}
                    </div>
                  )}
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
                      {activeScan && scanQueue.length > 1
                        ? ` + ${scanQueue.length - 1} waiting`
                        : ""}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span>Due dates</span>
                    <span
                      className={cn(
                        "text-right font-medium",
                        specificDueDate
                          ? "text-[hsl(var(--status-warning-text))]"
                          : "text-foreground"
                      )}
                    >
                      {specificDueDate
                        ? `Manual: ${formatLibraryDate(specificDueDate) || specificDueDate}`
                        : "Policy default"}
                    </span>
                  </div>
                  {dueDateGroups.length > 0 && (
                    <div className="space-y-1 border-t border-border/60 pt-2">
                      {dueDateGroups.slice(0, 3).map((group) => (
                        <div
                          key={group.dueDate}
                          className="flex items-center justify-between gap-3"
                        >
                          <span className="font-mono text-foreground">{group.dueDate}</span>
                          <span>
                            {group.count} item{group.count === 1 ? "" : "s"}
                          </span>
                        </div>
                      ))}
                      {dueDateGroups.length > 3 && (
                        <div className="text-right">
                          + {dueDateGroups.length - 3} more due date
                          {dueDateGroups.length - 3 === 1 ? "" : "s"}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <Button
                    variant={canPrint ? "default" : "outline"}
                    className="w-full justify-center gap-2"
                    onClick={handlePrintReceipt}
                    disabled={!canPrint}
                  >
                    <Printer className="h-4 w-4" />
                    Print Receipt
                  </Button>
                  <Button
                    variant="outline"
                    className="w-full justify-between"
                    onClick={handleViewBills}
                    disabled={!patron}
                  >
                    Bills & payments
                    <CreditCard className="h-4 w-4 text-muted-foreground" />
                  </Button>
                  <Button
                    variant="ghost"
                    className="w-full justify-between text-muted-foreground"
                    onClick={handleFinishSession}
                    disabled={!patron && checkedOutItems.length === 0 && scanQueue.length === 0}
                  >
                    Finish / next patron
                    <RotateCcw className="h-4 w-4" />
                  </Button>
                </div>

                {!patron && (
                  <p className="text-[11px] leading-relaxed text-muted-foreground">
                    Session actions unlock after a patron is loaded.
                  </p>
                )}
              </CardContent>
            </Card>
          </aside>
        </div>
      </PageContent>

      {/* Override dialog */}
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
            <DialogTitle>Checkout blocked — override?</DialogTitle>
            <DialogDescription>
              Evergreen blocked this item. If you have permission, enter a reason to override and
              check it out anyway.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="rounded-xl border border-[hsl(var(--status-warning))/0.4] bg-[hsl(var(--status-warning-bg))] p-3">
              <div className="flex items-center gap-2 text-sm font-medium text-[hsl(var(--status-warning-text))]">
                <AlertTriangle className="h-4 w-4" />
                Blocked
              </div>
              <div className="mt-1 text-sm text-foreground">
                {overridePrompt?.details.desc ||
                  overridePrompt?.details.code ||
                  itemError ||
                  "Checkout blocked."}
              </div>
              {Array.isArray(overridePrompt?.details.nextSteps) &&
                overridePrompt.details.nextSteps.length > 0 && (
                  <ul className="mt-3 space-y-1 text-xs text-muted-foreground list-disc list-inside">
                    {overridePrompt.details.nextSteps.map((step, idx) => (
                      <li key={idx}>{step}</li>
                    ))}
                  </ul>
                )}
              <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-muted-foreground font-mono">
                {overridePrompt?.itemBarcode && (
                  <span className="rounded-full border border-border/70 px-2 py-0.5">
                    Item {overridePrompt.itemBarcode}
                  </span>
                )}
                {overridePrompt?.details.code && (
                  <span className="rounded-full border border-border/70 px-2 py-0.5">
                    Code {overridePrompt.details.code}
                  </span>
                )}
                {overridePrompt?.details.overridePerm && (
                  <span className="rounded-full border border-border/70 px-2 py-0.5">
                    Perm {overridePrompt.details.overridePerm}
                  </span>
                )}
                {overridePrompt?.details.requestId && (
                  <span className="rounded-full border border-border/70 px-2 py-0.5">
                    Req {overridePrompt.details.requestId}
                  </span>
                )}
              </div>
            </div>

            {canAi && (
              <div className="rounded-xl border border-border/70 bg-background p-3 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-sm font-medium">AI explanation (draft only)</div>
                  <div className="flex items-center gap-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => void submitAiExplainFeedback("accepted")}
                      disabled={!aiExplainDraftId || aiExplainFeedback !== null}
                      title="Helpful"
                    >
                      <ThumbsUp className="h-4 w-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => void submitAiExplainFeedback("rejected")}
                      disabled={!aiExplainDraftId || aiExplainFeedback !== null}
                      title="Not helpful"
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
                  <div className="text-sm text-muted-foreground">
                    AI unavailable: {aiExplainError}
                  </div>
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
                      <div className="rounded-lg border border-border/70 bg-muted/30 p-2 space-y-2">
                        <div className="text-xs text-muted-foreground">
                          <div className="font-medium text-foreground/80">
                            Suggested override note
                          </div>
                          <div className="mt-1 whitespace-pre-wrap">{aiExplain.suggestedNote}</div>
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            setOverrideReason((prev) =>
                              prev ? prev : aiExplain.suggestedNote || ""
                            )
                          }
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
              {overrideError && (
                <div className="text-sm text-[hsl(var(--status-error-text))]">{overrideError}</div>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={closeOverridePrompt} disabled={isOverriding}>
              Cancel
            </Button>
            <Button
              onClick={handleOverrideCheckout}
              disabled={isOverriding || !overrideReason.trim()}
            >
              {isOverriding && (
                <span className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
              )}
              Override &amp; Check Out
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageContainer>
  );
}

/* -------------------------------------------------------------------------- */
/* Sub-components                                                              */
/* -------------------------------------------------------------------------- */

/** Numbered step label so the on-screen order matches the clerk's workflow. */
function StepHeader({
  index,
  title,
  hint,
  done,
  disabled,
}: {
  index: number;
  title: string;
  hint?: string;
  done?: boolean;
  disabled?: boolean;
}) {
  return (
    <div className={cn("flex items-center gap-2.5", disabled && "opacity-60")}>
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

/** A small status count pill for the running-list header. */
function SessionPill({
  tone,
  icon: Icon,
  count,
  label,
}: {
  tone: "success" | "warning" | "error";
  icon: React.ComponentType<{ className?: string }>;
  count: number;
  label: string;
}) {
  const cls =
    tone === "success"
      ? "bg-[hsl(var(--status-success-bg))] text-[hsl(var(--status-success-text))]"
      : tone === "warning"
        ? "bg-[hsl(var(--status-warning-bg))] text-[hsl(var(--status-warning-text))]"
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

/**
 * Circulation-focused patron summary. It leads with checkout eligibility,
 * then shows only the account facts staff need before scanning items.
 */
function PatronSummaryPanel({
  patron,
  expiry,
  balance,
  penalties,
  hasHardBlock,
  hasAccountAttention,
  onViewRecord,
  onViewBills,
}: {
  patron: NonNullable<ReturnType<typeof usePatronLookup>["selectedPatron"]>;
  expiry: { expired: boolean; soon: boolean; label: string };
  balance: number;
  penalties: NonNullable<ReturnType<typeof usePatronLookup>["selectedPatron"]>["penalties"];
  hasHardBlock: boolean;
  hasAccountAttention: boolean;
  onViewRecord: () => void;
  onViewBills: () => void;
}) {
  const initials =
    `${patron.firstName?.[0] || ""}${patron.lastName?.[0] || ""}`.toUpperCase() || "?";

  return (
    <div
      className={cn(
        "rounded-2xl border p-4",
        hasHardBlock
          ? "border-[hsl(var(--status-error))/0.45] bg-[hsl(var(--status-error-bg))/0.5]"
          : hasAccountAttention
            ? "border-[hsl(var(--status-warning))/0.35] bg-[hsl(var(--status-warning-bg))/0.35]"
            : "border-border/70 bg-muted/20"
      )}
    >
      <div className="flex items-start gap-3">
        <div
          className={cn(
            "flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-sm font-semibold",
            hasHardBlock
              ? "bg-[hsl(var(--status-error))/0.18] text-[hsl(var(--status-error-text))]"
              : hasAccountAttention
                ? "bg-[hsl(var(--status-warning-bg))] text-[hsl(var(--status-warning-text))]"
                : "bg-[hsl(var(--brand-1))/0.14] text-[hsl(var(--brand-1))]"
          )}
        >
          {initials}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="truncate text-base font-semibold leading-tight">{patron.displayName}</h4>
            {patron.barred && (
              <StatusBadge label="Barred" status="error" icon={Ban} showIcon size="sm" />
            )}
            {expiry.expired && (
              <StatusBadge label="Expired" status="error" icon={CalendarClock} showIcon size="sm" />
            )}
            {!patron.barred && !patron.active && (
              <StatusBadge label="Inactive" status="warning" size="sm" />
            )}
            <StatusBadge
              label={
                hasHardBlock
                  ? "Checkout blocked"
                  : hasAccountAttention
                    ? "Review before checkout"
                    : "Clear to check out"
              }
              status={hasHardBlock ? "error" : hasAccountAttention ? "warning" : "success"}
              showIcon
              size="sm"
            />
          </div>

          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1 font-mono">
              <CreditCard className="h-3 w-3" />
              {patron.barcode}
            </span>
            {patron.profileGroup && (
              <span className="inline-flex items-center gap-1">
                <User className="h-3 w-3" />
                {patron.profileGroup}
              </span>
            )}
            {patron.email && (
              <span className="inline-flex items-center gap-1 truncate">
                <Mail className="h-3 w-3" />
                {patron.email}
              </span>
            )}
            {expiry.label && (
              <span
                className={cn(
                  "inline-flex items-center gap-1",
                  expiry.expired
                    ? "font-medium text-[hsl(var(--status-error-text))]"
                    : expiry.soon
                      ? "font-medium text-[hsl(var(--status-warning-text))]"
                      : ""
                )}
              >
                <CalendarClock className="h-3 w-3" />
                {expiry.expired ? "Expired" : "Expires"} {expiry.label}
              </span>
            )}
          </div>
        </div>

        <button
          type="button"
          onClick={onViewRecord}
          className="inline-flex shrink-0 items-center gap-0.5 text-xs font-medium text-[hsl(var(--brand-1))] hover:underline"
        >
          Open record
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* At-a-glance counters */}
      <div className="mt-3 grid grid-cols-4 gap-2">
        <PatronStat icon={BookOpen} value={patron.checkoutsCount} label="Out" />
        <PatronStat icon={CalendarDays} value={patron.holdsCount} label="Holds" />
        <PatronStat value={patron.overdueCount} label="Overdue" danger={patron.overdueCount > 0} />
        <PatronStat
          value={`$${balance.toFixed(2)}`}
          label="Owed"
          danger={balance > 0}
          actionable={balance > 0}
          onClick={balance > 0 ? onViewBills : undefined}
        />
      </div>

      {/* Loud block banner */}
      {(patron.barred || expiry.expired || (penalties && penalties.length > 0)) && (
        <div className="mt-3 space-y-1.5 rounded-xl border border-[hsl(var(--status-error))/0.4] bg-[hsl(var(--status-error-bg))] p-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-[hsl(var(--status-error-text))]">
            <AlertTriangle className="h-4 w-4" />
            {patron.barred ? "Account blocked" : expiry.expired ? "Card expired" : "Account blocks"}
          </div>
          {penalties && penalties.length > 0 && (
            <ul className="space-y-0.5 pl-6 text-xs text-[hsl(var(--status-error-text))] list-disc">
              {penalties.slice(0, 4).map((p) => (
                <li key={p.id}>{p.message || p.type}</li>
              ))}
            </ul>
          )}
          {expiry.expired && !patron.barred && (penalties?.length ?? 0) === 0 && (
            <p className="pl-6 text-xs text-[hsl(var(--status-error-text))]">
              Card expired {expiry.label}. Renew the registration before checking out.
            </p>
          )}
        </div>
      )}

      {/* Soft warnings (non-blocking) */}
      {!hasHardBlock && (expiry.soon || balance > 0 || patron.overdueCount > 0) && (
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
          {expiry.soon && (
            <span className="inline-flex items-center gap-1 rounded-full bg-[hsl(var(--status-warning-bg))] px-2 py-0.5 font-medium text-[hsl(var(--status-warning-text))]">
              <CalendarClock className="h-3 w-3" />
              Card expires {expiry.label}
            </span>
          )}
          {balance > 0 && (
            <button
              type="button"
              onClick={onViewBills}
              className="inline-flex items-center gap-1 rounded-full bg-[hsl(var(--status-warning-bg))] px-2 py-0.5 font-medium text-[hsl(var(--status-warning-text))] hover:underline"
            >
              <CreditCard className="h-3 w-3" />${balance.toFixed(2)} owed. Review bills.
            </button>
          )}
          {patron.overdueCount > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full bg-[hsl(var(--status-warning-bg))] px-2 py-0.5 font-medium text-[hsl(var(--status-warning-text))]">
              <AlertTriangle className="h-3 w-3" />
              {patron.overdueCount} overdue
            </span>
          )}
        </div>
      )}
    </div>
  );
}

function PatronStat({
  icon: Icon,
  value,
  label,
  danger,
  actionable,
  onClick,
}: {
  icon?: React.ComponentType<{ className?: string }>;
  value: React.ReactNode;
  label: string;
  danger?: boolean;
  actionable?: boolean;
  onClick?: () => void;
}) {
  const inner = (
    <>
      <div
        className={cn(
          "flex items-center justify-center gap-1 text-lg font-semibold tabular-nums",
          danger ? "text-[hsl(var(--status-error-text))]" : "text-foreground"
        )}
      >
        {Icon && <Icon className="h-3.5 w-3.5 opacity-70" />}
        {value}
      </div>
      <div className="mt-0.5 text-[11px] text-muted-foreground">{label}</div>
    </>
  );
  const cls = "rounded-xl border border-border/60 bg-background/60 p-2 text-center";
  if (actionable && onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={cn(cls, "transition-colors hover:bg-muted/50")}
      >
        {inner}
      </button>
    );
  }
  return <div className={cls}>{inner}</div>;
}
