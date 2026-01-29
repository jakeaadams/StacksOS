/**
 * Renew Page - Staff circulation renewal interface
 */

"use client";

import * as React from "react";
import { useCallback, useState, useRef, useEffect } from "react";
import { toast } from "sonner";
import { clientLogger } from "@/lib/client-logger";
import { fetchWithAuth } from "@/lib/client-fetch";

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
} from "@/components/shared";

import { usePatronLookup, useKeyboardShortcuts } from "@/hooks";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";

import {
  RotateCcw,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Printer,
  Calendar,
  UserPlus,
} from "lucide-react";
import { ColumnDef } from "@tanstack/react-table";

interface CheckoutItem {
  id: number;
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

export default function RenewPage() {
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
  const [isRenewing, setIsRenewing] = useState(false);

  const patronInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!patron) {
      patronInputRef.current?.focus();
    }
  }, [patron]);

  useEffect(() => {
    if (patron) {
      fetchWithAuth("/api/evergreen/circulation?patron_id=" + patron.id)
        .then((res) => res.json())
        .then((data) => {
          if (data.ok && data.checkouts) {
            const items = [...(data.checkouts.out || []), ...(data.checkouts.overdue || [])];
            setCheckouts(
              items.map((item: any, idx: number) => ({
                id: item.id || idx,
                barcode: item.barcode || "",
                title: item.title || "Unknown",
                author: item.author || "",
                callNumber: item.callNumber || "",
                dueDate: item.dueDate ? new Date(item.dueDate).toLocaleDateString() : "",
                renewals: item.renewals || 0,
                maxRenewals: item.maxRenewals || 3,
                isOverdue: item.isOverdue || false,
                selected: false,
              }))
            );
          }
        })
        .catch((err) => {
          clientLogger.error("Failed to load checkouts:", err);
        });
    } else {
      setCheckouts([]);
    }
  }, [patron]);

  const toggleSelection = useCallback((id: number) => {
    setCheckouts((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, selected: !item.selected } : item
      )
    );
  }, []);

  const selectAll = useCallback(() => {
    setCheckouts((prev) => {
      const allSelected = prev.length > 0 && prev.every((i) => i.selected);
      return prev.map((item) => ({ ...item, selected: !allSelected }));
    });
  }, []);

  const renewSelected = async () => {
    const selected = checkouts.filter((i) => i.selected);
    if (selected.length === 0 || !patron) return;

    setIsRenewing(true);

    setCheckouts((prev) =>
      prev.map((item) =>
        item.selected ? { ...item, renewStatus: "pending" as const } : item
      )
    );

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

        setCheckouts((prev) =>
          prev.map((i) =>
            i.id === item.id
              ? {
                  ...i,
                  renewStatus: data.ok ? ("success" as const) : ("error" as const),
                  renewMessage: data.ok ? "Renewed successfully" : data.error || "Renewal failed",
                  newDueDate: data.circulation?.dueDate
                    ? new Date(data.circulation.dueDate).toLocaleDateString()
                    : undefined,
                  dueDate: data.circulation?.dueDate
                    ? new Date(data.circulation.dueDate).toLocaleDateString()
                    : i.dueDate,
                  renewals: data.ok ? i.renewals + 1 : i.renewals,
                  isOverdue: false,
                  selected: false,
                }
              : i
          )
        );
      } catch (_error) {
        setCheckouts((prev) =>
          prev.map((i) =>
            i.id === item.id
              ? {
                  ...i,
                  renewStatus: "error" as const,
                  renewMessage: "Connection error",
                  selected: false,
                }
              : i
          )
        );
      }
    }

    setIsRenewing(false);
    toast.success("Renewal complete", {
      description: selected.length + " item(s) processed",
    });
  };

  const renewAll = async () => {
    setCheckouts((prev) => prev.map((item) => ({ ...item, selected: true })));
    setTimeout(renewSelected, 100);
  };

  const handleNewSession = useCallback(() => {
    clearPatron();
    setCheckouts([]);
    patronInputRef.current?.focus();
  }, [clearPatron]);

  useKeyboardShortcuts([
    { key: "Escape", handler: handleNewSession },
    { key: "a", ctrl: true, handler: selectAll, preventDefault: true },
    { key: "r", ctrl: true, handler: renewSelected, preventDefault: true },
  ]);

  const selectedCount = checkouts.filter((i) => i.selected).length;
  const overdueCount = checkouts.filter((i) => i.isOverdue).length;

  const columns = React.useMemo<ColumnDef<CheckoutItem>[]>(
    () => [
      {
        id: "select",
        header: () => (
          <Checkbox
            checked={checkouts.length > 0 && checkouts.every((i) => i.selected)}
            onCheckedChange={selectAll}
            aria-label="Select all"
          />
        ),
        cell: ({ row }) => (
          <Checkbox
            checked={row.original.selected}
            onCheckedChange={() => toggleSelection(row.original.id)}
            aria-label="Select item"
          />
        ),
      },
      {
        accessorKey: "title",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Title" />,
        cell: ({ row }) => (
          <div className="space-y-0.5">
            <div className="font-medium">{row.original.title}</div>
            <div className="text-xs text-muted-foreground">{row.original.author}</div>
            {row.original.renewMessage && row.original.renewStatus === "error" && (
              <div className="text-xs text-rose-500">{row.original.renewMessage}</div>
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
        accessorKey: "dueDate",
        header: "Due",
        cell: ({ row }) => (
          <div className="text-xs">
            <div className={row.original.isOverdue ? "text-rose-600 font-medium" : ""}>
              <Calendar className="inline h-3 w-3 mr-1" />
              {row.original.dueDate}
            </div>
            {row.original.newDueDate && (
              <div className="text-[11px] text-emerald-600">New: {row.original.newDueDate}</div>
            )}
          </div>
        ),
      },
      {
        accessorKey: "renewals",
        header: "Renewals",
        cell: ({ row }) => (
          <span className="text-xs">
            {row.original.renewals} / {row.original.maxRenewals}
          </span>
        ),
      },
      {
        accessorKey: "status",
        header: "Status",
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
          if (row.original.isOverdue) {
            return <StatusBadge label="Overdue" status="error" showIcon />;
          }
          return <StatusBadge label="Active" status="success" showIcon />;
        },
      },
    ],
    [checkouts, selectAll, toggleSelection]
  );

  return (
    <PageContainer>
      <PageHeader
        title="Renew Items"
        subtitle="Review a patron’s checkouts and renew what’s eligible."
        breadcrumbs={[{ label: "Circulation" }, { label: "Renew" }]}
        actions={[
          { label: "New Patron", onClick: handleNewSession, icon: UserPlus, shortcut: { key: "Escape" } },
          { label: `Renew Selected (${selectedCount})`, onClick: renewSelected, icon: RotateCcw, shortcut: { key: "r", ctrl: true }, disabled: selectedCount === 0 || isRenewing },
          { label: "Renew All", onClick: renewAll, icon: RotateCcw, disabled: checkouts.length === 0 || isRenewing },
          { label: "Print", onClick: () => window.print(), icon: Printer },
        ]}
      >
        <div className="flex flex-wrap gap-2">
          <Badge variant="secondary" className="rounded-full">{checkouts.length} checkouts</Badge>
          {overdueCount > 0 && (
            <Badge variant="destructive" className="rounded-full">{overdueCount} overdue</Badge>
          )}
        </div>
      </PageHeader>

      <PageContent className="space-y-6">
        <div className="grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
          <Card className="rounded-2xl border-border/70 shadow-sm">
            <CardContent className="space-y-4 p-5">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                Patron
              </h3>
              <BarcodeInput
                ref={patronInputRef}
                label="Patron Barcode"
                placeholder="Scan patron barcode..."
                onSubmit={lookupPatron}
                disabled={isLoadingPatron}
                isLoading={isLoadingPatron}
                autoFocus={!patron}
              />
              {isLoadingPatron ? (
                <div className="py-8 flex items-center justify-center">
                  <LoadingSpinner message="Loading patron..." />
                </div>
              ) : !patron ? (
                <div className="rounded-xl border border-border/70 bg-muted/40 p-6 text-sm text-muted-foreground text-center">
                  Scan a patron barcode to view their checkouts.
                </div>
              ) : (
                <PatronCard patron={patron} variant="detailed" showActions onClear={clearPatron} />
              )}
            </CardContent>
          </Card>

          <Card className="rounded-2xl border-border/70 shadow-sm">
            <CardContent className="p-5 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Renewal Summary</p>
                  <h3 className="text-2xl font-semibold mt-1">{selectedCount}</h3>
                </div>
                <div className="h-10 w-10 rounded-full bg-[hsl(var(--brand-1))]/10 flex items-center justify-center text-[hsl(var(--brand-1))]">
                  <RotateCcw className="h-5 w-5" />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="rounded-xl bg-muted/50 p-3">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600 mx-auto" />
                  <div className="text-sm font-semibold mt-1">
                    {checkouts.filter((i) => i.renewStatus === "success").length}
                  </div>
                  <div className="text-[11px] text-muted-foreground">Renewed</div>
                </div>
                <div className="rounded-xl bg-muted/50 p-3">
                  <AlertTriangle className="h-4 w-4 text-amber-500 mx-auto" />
                  <div className="text-sm font-semibold mt-1">
                    {checkouts.filter((i) => i.renewStatus === "pending").length}
                  </div>
                  <div className="text-[11px] text-muted-foreground">Pending</div>
                </div>
                <div className="rounded-xl bg-muted/50 p-3">
                  <XCircle className="h-4 w-4 text-rose-500 mx-auto" />
                  <div className="text-sm font-semibold mt-1">
                    {checkouts.filter((i) => i.renewStatus === "error").length}
                  </div>
                  <div className="text-[11px] text-muted-foreground">Failed</div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
              Current Checkouts
            </h3>
            <Badge variant="secondary" className="rounded-full">{checkouts.length} items</Badge>
          </div>

          <DataTable
            columns={columns}
            data={checkouts}
            searchable
            searchPlaceholder="Search by title, barcode, call number..."
            emptyState={
              <EmptyState
                title={patron ? "No items checked out" : "Load a patron"}
                description={
                  patron
                    ? "This patron has no active checkouts."
                    : "Scan a patron barcode to view current checkouts."
                }
              />
            }
          />
        </div>
      </PageContent>
    </PageContainer>
  );
}
