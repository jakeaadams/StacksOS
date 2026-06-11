/**
 * Renew Page - Staff circulation renewal desk
 */

"use client";

import * as React from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { ColumnDef } from "@tanstack/react-table";

import {
  PatronCard,
  BarcodeInput,
  LoadingSpinner,
  StatusBadge,
  DataTable,
  DataTableColumnHeader,
  EmptyState,
  PageContainer,
  PageHeader,
  PageContent,
  ConfirmDialog,
} from "@/components/shared";

import { useKeyboardShortcuts, usePatronLookup } from "@/hooks";
import { useCirculationSound } from "@/hooks/use-circulation-sound";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";

import {
  AlertTriangle,
  Ban,
  Calendar,
  CheckCircle2,
  ListChecks,
  Printer,
  RotateCcw,
  ScanLine,
  UserPlus,
  XCircle,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { clientLogger } from "@/lib/client-logger";
import { fetchWithAuth } from "@/lib/client-fetch";
import { escapeHtml, printHtml } from "@/lib/print";

/** Shape of a single circulation item returned by the Evergreen API. */
interface CirculationItem {
  id?: number;
  barcode?: string;
  title?: string;
  author?: string;
  callNumber?: string;
  dueDate?: string;
  renewals?: number;
  maxRenewals?: number;
  isOverdue?: boolean;
}

/** Response shape from GET /api/evergreen/circulation. */
interface CheckoutsResponse {
  ok: boolean;
  error?: string;
  checkouts?: {
    out?: CirculationItem[];
    overdue?: CirculationItem[];
  };
}

interface CheckoutItem {
  rowId: string;
  id?: number;
  barcode: string;
  title: string;
  author: string;
  callNumber: string;
  dueDate: string;
  renewals: number;
  maxRenewals: number;
  isOverdue: boolean;
  selected: boolean;
  renewStatus?: "success" | "error" | "pending";
  renewMessage?: string;
  newDueDate?: string;
}

function parseLibraryDate(value: string): Date {
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (dateOnly) {
    return new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]));
  }
  return new Date(value);
}

function formatLibraryDate(value?: string): string {
  if (!value) return "";
  const d = parseLibraryDate(value);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString();
}

function canRenewItem(item: CheckoutItem): boolean {
  if (!item.barcode) return false;
  if (item.renewStatus === "pending" || item.renewStatus === "success") return false;
  return item.renewals < item.maxRenewals;
}

function buildRenewalReceiptHtml(params: {
  patronName?: string;
  patronBarcode?: string;
  items: CheckoutItem[];
}) {
  const renewed = params.items.filter((i) => i.renewStatus === "success");
  const rows = renewed
    .slice()
    .reverse()
    .map((i) =>
      [
        "<tr>",
        `<td>${escapeHtml(i.title)}${i.author ? `<div class="muted">${escapeHtml(i.author)}</div>` : ""}</td>`,
        `<td class="mono">${escapeHtml(i.barcode)}</td>`,
        `<td class="mono">${escapeHtml(i.callNumber)}</td>`,
        `<td class="mono"><strong>${escapeHtml(i.newDueDate || i.dueDate)}</strong></td>`,
        "</tr>",
      ].join("")
    )
    .join("\n");

  return [
    '<div class="box">',
    '<div class="brand">StacksOS</div>',
    '<h1 style="margin-top:4px">Renewal Receipt</h1>',
    `<div class="muted">${escapeHtml(new Date().toLocaleString())}</div>`,
    '<div class="meta">',
    params.patronName
      ? `<div><span class="k">Patron:</span> <span class="v">${escapeHtml(params.patronName)}</span></div>`
      : "",
    params.patronBarcode
      ? `<div><span class="k">Card:</span> <span class="v mono">${escapeHtml(params.patronBarcode)}</span></div>`
      : "",
    `<div><span class="k">Items renewed:</span> <span class="v">${renewed.length}</span></div>`,
    "</div>",
    "</div>",
    "<h2>Renewed items</h2>",
    "<table>",
    `<thead><tr><th scope="col">Title</th><th scope="col">Barcode</th><th scope="col">Call #</th><th scope="col">New due date</th></tr></thead>`,
    `<tbody>${rows || '<tr><td colspan="4" class="muted">No items renewed.</td></tr>'}</tbody>`,
    "</table>",
    '<div class="muted" style="margin-top:16px">Please return or renew items by the due date. Questions? Ask your library staff.</div>',
  ].join("\n");
}

export default function RenewPage() {
  const { play: playSound } = useCirculationSound();
  const {
    selectedPatron: patron,
    isLoading: isLoadingPatron,
    lookupByBarcode: lookupPatron,
    clear: clearPatron,
  } = usePatronLookup({
    onError: (err) => toast.error("Patron not found", { description: err.message }),
    onFound: (p) => toast.success("Loaded: " + p.displayName),
  });

  const [checkouts, setCheckouts] = useState<CheckoutItem[]>([]);
  const [isLoadingCheckouts, setIsLoadingCheckouts] = useState(false);
  const [isRenewing, setIsRenewing] = useState(false);
  const [itemBarcode, setItemBarcode] = useState("");
  const [clearOpen, setClearOpen] = useState(false);

  const patronInputRef = useRef<HTMLInputElement>(null);
  const itemInputRef = useRef<HTMLInputElement>(null);

  const loadCheckouts = useCallback(async (patronId: number) => {
    setIsLoadingCheckouts(true);
    try {
      const res = await fetchWithAuth("/api/evergreen/circulation?patron_id=" + patronId);
      const data: CheckoutsResponse = await res.json();
      if (!data.ok) throw new Error(data.error || "Failed to load checkouts");

      const items: CirculationItem[] = [
        ...(data.checkouts?.out || []),
        ...(data.checkouts?.overdue || []),
      ];

      setCheckouts(
        items.map((item, idx) => {
          const id = typeof item.id === "number" ? item.id : undefined;
          const barcode = item.barcode || "";
          return {
            rowId: String(id ?? barcode ?? idx),
            id,
            barcode,
            title: item.title || "Untitled item",
            author: item.author || "",
            callNumber: item.callNumber || "",
            dueDate: formatLibraryDate(item.dueDate),
            renewals: item.renewals || 0,
            maxRenewals: item.maxRenewals ?? 3,
            isOverdue: item.isOverdue || false,
            selected: false,
          };
        })
      );
    } catch (err) {
      clientLogger.error("Failed to load checkouts:", err);
      toast.error("Failed to load checkouts", {
        description: err instanceof Error ? err.message : undefined,
      });
      setCheckouts([]);
    } finally {
      setIsLoadingCheckouts(false);
    }
  }, []);

  useEffect(() => {
    if (!patron) {
      setCheckouts([]);
      patronInputRef.current?.focus();
      return;
    }
    void loadCheckouts(patron.id);
  }, [loadCheckouts, patron]);

  const selectedCount = checkouts.filter((i) => i.selected).length;
  const overdueCount = checkouts.filter((i) => i.isOverdue).length;
  const eligibleCount = checkouts.filter(canRenewItem).length;
  const renewedCount = checkouts.filter((i) => i.renewStatus === "success").length;
  const failedCount = checkouts.filter((i) => i.renewStatus === "error").length;
  const blockedCount = checkouts.filter(
    (i) => !canRenewItem(i) && i.renewStatus !== "success" && i.renewStatus !== "pending"
  ).length;

  const toggleSelection = useCallback((rowId: string) => {
    setCheckouts((prev) =>
      prev.map((item) =>
        item.rowId === rowId && canRenewItem(item) ? { ...item, selected: !item.selected } : item
      )
    );
  }, []);

  const selectAllEligible = useCallback(() => {
    setCheckouts((prev) => {
      const eligible = prev.filter(canRenewItem);
      const allSelected = eligible.length > 0 && eligible.every((i) => i.selected);
      return prev.map((item) =>
        canRenewItem(item) ? { ...item, selected: !allSelected } : { ...item, selected: false }
      );
    });
  }, []);

  const handleSelectItemBarcode = useCallback(
    (barcodeRaw: string) => {
      const barcode = barcodeRaw.trim();
      if (!barcode) return;
      if (!patron) {
        toast.message("Load a patron first");
        patronInputRef.current?.focus();
        return;
      }

      const match = checkouts.find((item) => item.barcode === barcode);
      if (!match) {
        toast.error("Item is not checked out to this patron", { description: barcode });
        setItemBarcode("");
        itemInputRef.current?.focus();
        return;
      }
      if (!canRenewItem(match)) {
        toast.message("Item is not eligible to renew", {
          description:
            match.renewStatus === "success"
              ? "Already renewed in this session"
              : `${match.renewals} of ${match.maxRenewals} renewals used`,
        });
        setItemBarcode("");
        itemInputRef.current?.focus();
        return;
      }

      setCheckouts((prev) =>
        prev.map((item) => (item.rowId === match.rowId ? { ...item, selected: true } : item))
      );
      toast.success("Selected for renewal", { description: match.title });
      setItemBarcode("");
      itemInputRef.current?.focus();
    },
    [checkouts, patron]
  );

  const renewSelected = useCallback(
    async (overrideItems?: CheckoutItem[]) => {
      if (!patron) {
        toast.message("Load a patron first");
        return;
      }

      const selected = (overrideItems || checkouts).filter((i) => i.selected && canRenewItem(i));
      if (selected.length === 0) {
        toast.message("Select renewable items first");
        return;
      }

      setIsRenewing(true);
      const selectedIds = new Set(selected.map((i) => i.rowId));
      setCheckouts((prev) =>
        prev.map((item) =>
          selectedIds.has(item.rowId)
            ? { ...item, renewStatus: "pending" as const, renewMessage: "Renewing..." }
            : item
        )
      );

      let success = 0;
      let failed = 0;

      for (const item of selected) {
        try {
          const res = await fetchWithAuth("/api/evergreen/circulation", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action: "renew",
              patronBarcode: patron.barcode,
              itemBarcode: item.barcode,
            }),
          });

          const data = await res.json();
          const newDueRaw =
            data.circulation?.dueDate || data.circulation?.due_date || data.dueDate || "";
          const newDueDate = formatLibraryDate(newDueRaw);

          if (data.ok) success += 1;
          else failed += 1;

          setCheckouts((prev) =>
            prev.map((i) =>
              i.rowId === item.rowId
                ? {
                    ...i,
                    renewStatus: data.ok ? ("success" as const) : ("error" as const),
                    renewMessage: data.ok
                      ? "Renewed"
                      : data.error || data.message || "Renewal failed",
                    newDueDate: data.ok ? newDueDate || i.newDueDate : i.newDueDate,
                    dueDate: data.ok ? newDueDate || i.dueDate : i.dueDate,
                    renewals: data.ok ? i.renewals + 1 : i.renewals,
                    isOverdue: data.ok ? false : i.isOverdue,
                    selected: false,
                  }
                : i
            )
          );

          playSound(data.ok ? "success" : "error");
        } catch (err) {
          failed += 1;
          setCheckouts((prev) =>
            prev.map((i) =>
              i.rowId === item.rowId
                ? {
                    ...i,
                    renewStatus: "error" as const,
                    renewMessage: err instanceof Error ? err.message : "Connection error",
                    selected: false,
                  }
                : i
            )
          );
          playSound("error");
        }
      }

      setIsRenewing(false);
      if (failed > 0) {
        toast.warning("Renewal finished with exceptions", {
          description: `${success} renewed, ${failed} failed`,
        });
      } else {
        toast.success("Renewal complete", { description: `${success} item(s) renewed` });
      }
    },
    [checkouts, patron, playSound]
  );

  const renewAllEligible = useCallback(async () => {
    if (eligibleCount === 0) {
      toast.message("No renewable items");
      return;
    }
    const allEligible = checkouts.map((item) => ({
      ...item,
      selected: canRenewItem(item),
    }));
    setCheckouts(allEligible);
    await renewSelected(allEligible);
  }, [checkouts, eligibleCount, renewSelected]);

  const clearSession = useCallback(() => {
    clearPatron();
    setCheckouts([]);
    setItemBarcode("");
    patronInputRef.current?.focus();
  }, [clearPatron]);

  const hasSessionWork = Boolean(patron) || checkouts.length > 0;

  const requestClearSession = useCallback(() => {
    if (!hasSessionWork) {
      clearSession();
      return;
    }
    setClearOpen(true);
  }, [clearSession, hasSessionWork]);

  const handlePrint = useCallback(() => {
    if (!patron) {
      toast.message("Load a patron first");
      return;
    }
    printHtml(
      buildRenewalReceiptHtml({
        patronName: patron.displayName,
        patronBarcode: patron.barcode,
        items: checkouts,
      }),
      { title: "StacksOS Renewal Receipt", tone: "receipt" }
    );
  }, [patron, checkouts]);

  useKeyboardShortcuts([
    { key: "Escape", handler: requestClearSession },
    { key: "a", ctrl: true, handler: selectAllEligible, preventDefault: true },
    { key: "r", ctrl: true, handler: () => void renewSelected(), preventDefault: true },
    { key: "p", ctrl: true, handler: handlePrint, preventDefault: true },
  ]);

  const columns = useMemo<ColumnDef<CheckoutItem>[]>(
    () => [
      {
        id: "select",
        header: () => (
          <Checkbox
            checked={eligibleCount > 0 && checkouts.filter(canRenewItem).every((i) => i.selected)}
            onCheckedChange={selectAllEligible}
            aria-label="Select all renewable items"
          />
        ),
        cell: ({ row }) => (
          <Checkbox
            checked={row.original.selected}
            onCheckedChange={() => toggleSelection(row.original.rowId)}
            disabled={!canRenewItem(row.original)}
            aria-label={`Select ${row.original.title}`}
          />
        ),
      },
      {
        accessorKey: "title",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Item" />,
        cell: ({ row }) => (
          <div className="min-w-0 space-y-1">
            <div className="truncate text-sm font-medium">{row.original.title}</div>
            <div className="flex min-w-0 flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
              {row.original.author && <span className="truncate">{row.original.author}</span>}
              {row.original.callNumber && (
                <span className="font-mono">{row.original.callNumber}</span>
              )}
              <span className="font-mono">{row.original.barcode}</span>
            </div>
            {row.original.renewMessage && row.original.renewStatus === "error" && (
              <div className="text-xs text-[hsl(var(--status-error-text))]">
                {row.original.renewMessage}
              </div>
            )}
          </div>
        ),
      },
      {
        accessorKey: "dueDate",
        header: "Due",
        cell: ({ row }) => (
          <div className="space-y-1 text-xs">
            <div
              className={cn(
                "inline-flex items-center gap-1",
                row.original.isOverdue && "font-medium text-[hsl(var(--status-error-text))]"
              )}
            >
              <Calendar className="h-3.5 w-3.5" />
              {row.original.dueDate || "No due date"}
            </div>
            {row.original.newDueDate && (
              <div className="text-[hsl(var(--status-success-text))]">
                New due date: {row.original.newDueDate}
              </div>
            )}
          </div>
        ),
      },
      {
        accessorKey: "renewals",
        header: "Renewals",
        cell: ({ row }) => (
          <span
            className={cn(
              "text-xs tabular-nums",
              !canRenewItem(row.original) &&
                row.original.renewStatus !== "success" &&
                "text-muted-foreground"
            )}
          >
            {row.original.renewals} / {row.original.maxRenewals}
          </span>
        ),
      },
      {
        id: "status",
        header: "Result",
        cell: ({ row }) => {
          if (row.original.renewStatus === "success") {
            return <StatusBadge label="Renewed" status="success" showIcon />;
          }
          if (row.original.renewStatus === "error") {
            return <StatusBadge label="Failed" status="error" showIcon />;
          }
          if (row.original.renewStatus === "pending") {
            return <StatusBadge label="Renewing" status="pending" showIcon />;
          }
          if (canRenewItem(row.original)) {
            return <StatusBadge label="Eligible" status="success" showIcon />;
          }
          return <StatusBadge label="Limit reached" status="warning" showIcon />;
        },
      },
    ],
    [checkouts, eligibleCount, selectAllEligible, toggleSelection]
  );

  return (
    <PageContainer>
      <PageHeader
        title="Renewal Desk"
        subtitle="Review checkouts, select eligible items, and renew through Evergreen."
        breadcrumbs={[{ label: "Circulation" }, { label: "Renew Items" }]}
      >
        <div className="flex flex-wrap gap-2">
          <Badge variant="secondary" className="rounded-full">
            {checkouts.length} checked out
          </Badge>
          {eligibleCount > 0 && (
            <Badge variant="secondary" className="rounded-full">
              {eligibleCount} renewable
            </Badge>
          )}
          {overdueCount > 0 && (
            <Badge variant="destructive" className="rounded-full">
              {overdueCount} overdue
            </Badge>
          )}
        </div>
      </PageHeader>

      <PageContent className="space-y-6">
        <div className="grid min-w-0 gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
          <div className="min-w-0 space-y-5">
            <Card className="min-w-0 rounded-2xl border-border/70">
              <CardContent className="space-y-4 p-5">
                <StepHeader
                  index={1}
                  title="Load patron"
                  hint={patron ? "Patron loaded" : "Scan a library card to show active checkouts"}
                  done={Boolean(patron)}
                />

                <BarcodeInput
                  ref={patronInputRef}
                  label="Patron card"
                  placeholder="Scan patron card or enter barcode..."
                  onSubmit={lookupPatron}
                  disabled={isLoadingPatron || isRenewing}
                  isLoading={isLoadingPatron}
                  autoFocus={!patron}
                  size="lg"
                />

                {isLoadingPatron ? (
                  <div className="flex items-center justify-center py-8">
                    <LoadingSpinner message="Loading patron..." />
                  </div>
                ) : patron ? (
                  <PatronCard
                    patron={patron}
                    variant="detailed"
                    showActions
                    onClear={requestClearSession}
                  />
                ) : (
                  <div className="rounded-xl border border-dashed border-border/70 bg-muted/30 p-6 text-center text-sm text-muted-foreground">
                    No patron loaded.
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className={cn("min-w-0 rounded-2xl border-border/70", !patron && "opacity-70")}>
              <CardContent className="space-y-4 p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <StepHeader
                    index={2}
                    title="Select items"
                    hint={
                      patron
                        ? "Scan an item barcode or select rows below"
                        : "Load a patron before selecting items"
                    }
                    disabled={!patron}
                  />
                  <StatusBadge
                    label={isRenewing ? "Renewing" : `${selectedCount} selected`}
                    status={selectedCount > 0 ? "info" : "neutral"}
                    icon={ListChecks}
                    showIcon
                    size="sm"
                  />
                </div>

                <BarcodeInput
                  ref={itemInputRef}
                  label="Item barcode"
                  placeholder="Scan item barcode to select checkout..."
                  value={itemBarcode}
                  onChange={setItemBarcode}
                  onSubmit={handleSelectItemBarcode}
                  disabled={!patron || isRenewing}
                  autoClear
                />

                <DataTable
                  columns={columns}
                  data={checkouts}
                  isLoading={isLoadingCheckouts}
                  searchable={checkouts.length >= 8}
                  searchPlaceholder="Search title, barcode, author, or call number..."
                  columnVisibilityToggle={false}
                  compact
                  paginated={checkouts.length >= 12}
                  className="min-w-0"
                  getRowClassName={(row) =>
                    row.renewStatus === "error"
                      ? "bg-[hsl(var(--status-error-bg))/0.18]"
                      : row.isOverdue
                        ? "bg-[hsl(var(--status-warning-bg))/0.12]"
                        : ""
                  }
                  emptyState={
                    <EmptyState
                      icon={patron ? CheckCircle2 : ScanLine}
                      title={patron ? "No active checkouts" : "Load a patron"}
                      description={
                        patron
                          ? "This patron has no items available for renewal."
                          : "Scan a patron card to view renewable checkouts."
                      }
                    />
                  }
                />
              </CardContent>
            </Card>
          </div>

          <div className="space-y-4 xl:sticky xl:top-24 xl:self-start">
            <Card className="rounded-2xl border-border/70">
              <CardContent className="space-y-4 p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Renewal session
                    </p>
                    <h3 className="mt-1 text-2xl font-semibold">{selectedCount}</h3>
                    <p className="text-xs text-muted-foreground">items selected</p>
                  </div>
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[hsl(var(--brand-1))]/10 text-[hsl(var(--brand-1))]">
                    <RotateCcw className="h-5 w-5" />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <SessionPill
                    tone="success"
                    icon={CheckCircle2}
                    count={renewedCount}
                    label="Renewed"
                  />
                  <SessionPill
                    tone="warning"
                    icon={AlertTriangle}
                    count={eligibleCount}
                    label="Eligible"
                  />
                  <SessionPill tone="error" icon={XCircle} count={failedCount} label="Failed" />
                  <SessionPill tone="neutral" icon={Ban} count={blockedCount} label="At limit" />
                </div>

                <div className="space-y-2">
                  <Button
                    className="w-full gap-2"
                    onClick={() => void renewSelected()}
                    disabled={!patron || selectedCount === 0 || isRenewing}
                  >
                    <RotateCcw className="h-4 w-4" />
                    Renew selected
                  </Button>
                  <Button
                    variant="outline"
                    className="w-full gap-2"
                    onClick={() => void renewAllEligible()}
                    disabled={!patron || eligibleCount === 0 || isRenewing}
                  >
                    <ListChecks className="h-4 w-4" />
                    Renew all eligible
                  </Button>
                  <Button
                    variant="outline"
                    className="w-full gap-2"
                    onClick={handlePrint}
                    disabled={!patron || renewedCount === 0}
                  >
                    <Printer className="h-4 w-4" />
                    Print renewal receipt
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Button
              variant="ghost"
              className="w-full justify-start gap-2"
              onClick={requestClearSession}
              disabled={isRenewing}
            >
              <UserPlus className="h-4 w-4" />
              New patron
            </Button>
          </div>
        </div>
      </PageContent>

      <ConfirmDialog
        open={clearOpen}
        onOpenChange={setClearOpen}
        title="Clear this renewal session?"
        description="This removes the patron and renewal results from the screen. It does not undo completed Evergreen renewals."
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

function SessionPill({
  tone,
  icon: Icon,
  count,
  label,
}: {
  tone: "success" | "warning" | "error" | "neutral";
  icon: React.ComponentType<{ className?: string }>;
  count: number;
  label: string;
}) {
  const cls =
    tone === "success"
      ? "bg-[hsl(var(--status-success-bg))] text-[hsl(var(--status-success-text))]"
      : tone === "warning"
        ? "bg-[hsl(var(--status-warning-bg))] text-[hsl(var(--status-warning-text))]"
        : tone === "error"
          ? "bg-[hsl(var(--status-error-bg))] text-[hsl(var(--status-error-text))]"
          : "bg-muted text-muted-foreground";

  return (
    <div className={cn("rounded-xl p-3", cls)}>
      <Icon className="h-4 w-4" />
      <div className="mt-1 text-sm font-semibold tabular-nums">{count}</div>
      <div className="text-[11px] opacity-80">{label}</div>
    </div>
  );
}
