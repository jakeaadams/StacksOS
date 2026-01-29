/**
 * Checkin Page - Staff circulation checkin interface
 */

"use client";

import * as React from "react";
import { useCallback, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import {
  BarcodeInput,
  StatusBadge,
  HoldStatusBadge,
  ConfirmDialog,
  PageContainer,
  PageHeader,
  PageContent,
  DataTable,
  DataTableColumnHeader,
  EmptyState,
} from "@/components/shared";

import { ApiError, useMutation, useKeyboardShortcuts } from "@/hooks";

import { useAuth } from "@/contexts/auth-context";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

import { Package, Printer, Trash2, Bell, Truck, AlertTriangle } from "lucide-react";
import type { ColumnDef } from "@tanstack/react-table";

import { escapeHtml, printHtml } from "@/lib/print";

interface CheckinItem {
  id: string;
  barcode: string;
  title: string;
  author: string;
  callNumber: string;
  status: "checkedin" | "hold" | "transit" | "alert" | "error";
  message?: string;
  holdFor?: { name: string; barcode: string };
  transitTo?: string;
  timestamp: Date;
  wasOverdue?: boolean;
  fineAmount?: number;
}

function buildSlipHtml(item: CheckinItem) {
  const heading = item.status === "hold" ? "Hold Slip" : item.status === "transit" ? "Transit Slip" : "Slip";

  const lines: Array<[string, string]> = [
    ["Time", item.timestamp.toLocaleString()],
    ["Item", item.barcode],
    ["Title", item.title],
  ];

  if (item.callNumber) lines.push(["Call Number", item.callNumber]);
  if (item.author) lines.push(["Author", item.author]);
  if (item.status === "hold" && item.holdFor) lines.push(["Hold For", `${item.holdFor.name} (${item.holdFor.barcode})`]);
  if (item.status === "transit" && item.transitTo) lines.push(["Transit To", item.transitTo]);

  return [
    '<div class="box pb">',
    `<h1 class="brand">StacksOS</h1>`,
    `<div class="muted">${escapeHtml(heading)}</div>`,
    '<div class="meta">',
    ...lines.map(([k, v]) => `<div><span class="k">${escapeHtml(k)}:</span> <span class="v">${escapeHtml(v)}</span></div>`),
    "</div>",
    "</div>",
  ].join("\n");
}

export default function CheckinPage() {
  const [checkedInItems, setCheckedInItems] = useState<CheckinItem[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [printSlips, setPrintSlips] = useState(true);
  const [clearOpen, setClearOpen] = useState(false);
  const [itemError, setItemError] = useState<string | undefined>(undefined);
  const [itemSuccess, setItemSuccess] = useState(false);
  const [attentionOnly, setAttentionOnly] = useState(false);
  const [bookdropMode, setBookdropMode] = useState(false);

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
          name: data.hold.patronName || (data.hold.patronId ? "Patron " + data.hold.patronId : "Patron"),
          barcode: data.hold.patronBarcode || String(data.hold.patronId || ""),
        };
        message = holdFor.barcode ? `Hold for ${holdFor.name} (${holdFor.barcode})` : `Hold for ${holdFor.name}`;
      } else if (data.status === "in_transit" && data.transit) {
        status = "transit";
        const destId = Number(data.transit.destination);
        transitTo = Number.isFinite(destId) ? getOrgName(destId) : String(data.transit.destination || "Another branch");
        message = transitTo ? `Transit to ${transitTo}` : "In transit";
      } else {
        message = "Reshelve";
      }

      const newItem: CheckinItem = {
        id: "item-" + Date.now(),
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

      // Printing: use an iframe (no popups). This is "best-effort"; printers vary.
      if (printSlips && (status === "hold" || status === "transit")) {
        printHtml(buildSlipHtml(newItem), { title: "StacksOS Slip", tone: "slip" });
      }

      if (!bookdropMode) {
        toast.success("Item checked in", {
          description:
            status === "hold" ? "Hold captured" : status === "transit" ? "In transit" : "Processed",
        });
      }
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

      const errorItem: CheckinItem = {
        id: "item-" + Date.now(),
        barcode: variables.itemBarcode,
        title: "Unknown",
        author: "",
        callNumber: "",
        status: "error",
        message: err.message || "Checkin failed",
        timestamp: new Date(),
      };

      setCheckedInItems((prev) => [errorItem, ...prev]);
      setItemError(err.message || "Checkin failed");
      setItemSuccess(false);
      toast.error("Checkin failed", { description: err.message });
    },
  });

  const handleCheckin = useCallback(
    async (barcode: string) => {
      if (!barcode.trim()) return;
      setIsProcessing(true);
      try {
        await checkinMutation.mutateAsync("/api/evergreen/circulation", {
          action: "checkin",
          itemBarcode: barcode,
        });
      } finally {
        setIsProcessing(false);
        itemInputRef.current?.focus();
      }
    },
    [checkinMutation]
  );

  const clearSession = () => {
    setCheckedInItems([]);
    setItemError(undefined);
    setItemSuccess(false);
    setAttentionOnly(false);
    itemInputRef.current?.focus();
  };

  const slipItems = useMemo(
    () => checkedInItems.filter((i) => i.status === "hold" || i.status === "transit"),
    [checkedInItems]
  );

  const attentionItems = useMemo(
    () =>
      checkedInItems.filter(
        (i) => i.status === "error" || i.status === "alert" || i.status === "hold" || i.status === "transit"
      ),
    [checkedInItems]
  );

  const handlePrintAllSlips = useCallback(() => {
    if (slipItems.length === 0) {
      toast.message("No slips to print yet");
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
    { key: "Escape", handler: () => setClearOpen(true) },
    { key: "p", ctrl: true, handler: handlePrintAllSlips, preventDefault: true },
    { key: "b", ctrl: true, handler: () => setBookdropMode((v) => !v), preventDefault: true },
  ]);

  const stats = {
    total: checkedInItems.length,
    holds: checkedInItems.filter((i) => i.status === "hold").length,
    transits: checkedInItems.filter((i) => i.status === "transit").length,
    errors: checkedInItems.filter((i) => i.status === "error").length,
  };

  const columns = useMemo<ColumnDef<CheckinItem>[]>(
    () => [
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => {
          const status = row.original.status;
          if (status === "hold") {
            return <HoldStatusBadge status="available" />;
          }
          if (status === "transit") {
            return <StatusBadge label="In Transit" status="info" showIcon />;
          }
          if (status === "error") {
            return <StatusBadge label="Error" status="error" showIcon />;
          }
          if (status === "alert") {
            return <StatusBadge label="Alert" status="warning" showIcon />;
          }
          return <StatusBadge label="Checked In" status="success" showIcon />;
        },
      },
      {
        accessorKey: "title",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Title" />,
        cell: ({ row }) => (
          <div className="space-y-0.5">
            <div className="font-medium">{row.original.title}</div>
            {row.original.author && (
              <div className="text-xs text-muted-foreground">{row.original.author}</div>
            )}
            {row.original.message && (
              <div className={`text-xs ${row.original.status === "error" ? "text-destructive" : "text-muted-foreground"}`}>{row.original.message}</div>
            )}
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

  const tableData = attentionOnly ? attentionItems : checkedInItems;

  return (
    <PageContainer>
      <PageHeader
        title="Check In"
        subtitle="Scan items to return, route, or capture holds."
        breadcrumbs={[{ label: "Circulation" }, { label: "Check In" }]}
        actions={[
          {
            label: printSlips ? "Print Slips: On" : "Print Slips: Off",
            onClick: () => setPrintSlips((p) => !p),
            icon: Printer,
          },
          {
            label: bookdropMode ? "Bookdrop: On" : "Bookdrop: Off",
            onClick: () => setBookdropMode((v) => !v),
            icon: Package,
            variant: "outline",
            shortcut: { key: "b", ctrl: true },
          },
          {
            label: "Clear Session",
            onClick: () => setClearOpen(true),
            icon: Trash2,
            shortcut: { key: "Escape" },
          },
        ]}
      />

      <PageContent className="space-y-6">
        <div className="grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
          <Card className="rounded-2xl border-border/70 shadow-sm">
            <CardContent className="space-y-4 p-5">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Item Check‑In</h3>
              <BarcodeInput
                ref={itemInputRef}
                label="Item Barcode"
                placeholder="Scan item to check in"
                onSubmit={handleCheckin}
                isLoading={isProcessing}
                isSuccess={itemSuccess}
                error={itemError}
                autoFocus
                autoClear
              />
              <div className="rounded-xl border border-border/70 bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                Holds and transits will generate printable slips. Press <span className="font-mono">Ctrl/⌘ + P</span> to print all queued slips.
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-2xl border-border/70 shadow-sm">
            <CardContent className="p-5 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Session Summary</p>
                  <h3 className="text-2xl font-semibold mt-1">{stats.total}</h3>
                </div>
                <div className="h-10 w-10 rounded-full bg-[hsl(var(--brand-1))]/10 flex items-center justify-center text-[hsl(var(--brand-1))]">
                  <Package className="h-5 w-5" />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="rounded-xl bg-muted/50 p-3">
                  <Bell className="h-4 w-4 text-emerald-600 mx-auto" />
                  <div className="text-sm font-semibold mt-1">{stats.holds}</div>
                  <div className="text-[11px] text-muted-foreground">Holds</div>
                </div>
                <div className="rounded-xl bg-muted/50 p-3">
                  <Truck className="h-4 w-4 text-sky-500 mx-auto" />
                  <div className="text-sm font-semibold mt-1">{stats.transits}</div>
                  <div className="text-[11px] text-muted-foreground">Transits</div>
                </div>
                <div className="rounded-xl bg-muted/50 p-3">
                  <AlertTriangle className="h-4 w-4 text-rose-500 mx-auto" />
                  <div className="text-sm font-semibold mt-1">{stats.errors}</div>
                  <div className="text-[11px] text-muted-foreground">Errors</div>
                </div>
              </div>
              <div className="space-y-2">
                <Button
                  variant="outline"
                  className="w-full justify-between"
                  onClick={handlePrintAllSlips}
                  disabled={slipItems.length === 0}
                >
                  Print All Slips
                  <span className="inline-flex items-center gap-2">
                    {slipItems.length > 0 && (
                      <Badge variant="secondary" className="rounded-full text-[10px]">
                        {slipItems.length}
                      </Badge>
                    )}
                    <Printer className="h-4 w-4 text-muted-foreground" />
                  </span>
                </Button>
                <Button
                  variant="outline"
                  className="w-full justify-between"
                  onClick={() => setAttentionOnly((v) => !v)}
                  disabled={attentionItems.length === 0}
                >
                  {attentionOnly ? "Show All" : "Review Alerts"}
                  <span className="inline-flex items-center gap-2">
                    {attentionItems.length > 0 && (
                      <Badge variant="secondary" className="rounded-full text-[10px]">
                        {attentionItems.length}
                      </Badge>
                    )}
                    <AlertTriangle className="h-4 w-4 text-muted-foreground" />
                  </span>
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Check‑In Activity</h3>
            <Badge variant="secondary" className="rounded-full">
              {stats.total} items
            </Badge>
          </div>
          <DataTable
            columns={columns}
            data={tableData}
            searchable
            searchPlaceholder="Search by title, barcode, call number..."
            emptyState={
              <EmptyState
                title="No items checked in yet"
                description="Scan an item barcode to begin processing returns."
              />
            }
          />
        </div>
      </PageContent>

      <ConfirmDialog
        open={clearOpen}
        onOpenChange={setClearOpen}
        title="Clear this session?"
        description="This will remove all checked‑in items from the current list."
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
