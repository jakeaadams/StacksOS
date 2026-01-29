/**
 * CirculationDesk - Unified checkout/checkin interface
 * World-class UX: Single-page workflow with audio feedback and keyboard navigation
 */

"use client";

import * as React from "react";
import { useCallback, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import {
  PatronCard,
  BarcodeInput,
  LoadingInline,
  DataTable,
  DataTableColumnHeader,
  StatusBadge,
  HoldStatusBadge,
  EmptyState,
  ConfirmDialog,
} from "@/components/shared";

import { useAudioFeedback } from "@/hooks/useAudioFeedback";
import { useKeyboardShortcuts, useMutation, usePatronLookup } from "@/hooks";
import { useAuth } from "@/contexts/auth-context";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

import {
  ArrowUpRight,
  ArrowDownLeft,
  RotateCcw,
  Printer,
  Volume2,
  VolumeX,
  User,
  Package,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Bell,
  Truck,
} from "lucide-react";
import type { ColumnDef } from "@tanstack/react-table";

import { cn } from "@/lib/utils";

type Mode = "checkout" | "checkin";

interface TransactionItem {
  id: string;
  mode: Mode;
  barcode: string;
  title: string;
  author: string;
  callNumber: string;
  status: "success" | "warning" | "error" | "hold" | "transit";
  message?: string;
  dueDate?: string;
  holdFor?: { name: string; barcode: string };
  transitTo?: string;
  timestamp: Date;
}

interface CirculationDeskProps {
  className?: string;
  defaultMode?: Mode;
}

export function CirculationDesk({ className, defaultMode = "checkout" }: CirculationDeskProps) {
  const { getOrgName } = useAuth();
  const { playSuccess, playError, playWarning, playHoldReady } = useAudioFeedback();
  
  const [mode, setMode] = useState<Mode>(defaultMode);
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [transactions, setTransactions] = useState<TransactionItem[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [clearOpen, setClearOpen] = useState(false);
  
  const [itemBarcode, setItemBarcode] = useState("");
  const [itemError, setItemError] = useState<string | undefined>();
  const [itemSuccess, setItemSuccess] = useState(false);
  
  const patronInputRef = useRef<HTMLInputElement>(null);
  const itemInputRef = useRef<HTMLInputElement>(null);

  const {
    selectedPatron: patron,
    isLoading: isLoadingPatron,
    error: patronError,
    lookupByBarcode: lookupPatron,
    clear: clearPatron,
  } = usePatronLookup({
    onError: (err) => {
      if (audioEnabled) playError();
      toast.error("Patron not found", { description: err.message });
    },
    onFound: () => {
      if (audioEnabled) playSuccess();
    },
  });

  const checkoutMutation = useMutation<any, { action: "checkout"; patronBarcode: string; itemBarcode: string }>({
    onSuccess: (data, variables) => {
      if (audioEnabled) playSuccess();
      
      const dueDate = data.circulation?.dueDate
        ? new Date(data.circulation.dueDate).toLocaleDateString()
        : new Date(Date.now() + 21 * 24 * 60 * 60 * 1000).toLocaleDateString();

      const newItem: TransactionItem = {
        id: "txn-" + Date.now(),
        mode: "checkout",
        barcode: variables.itemBarcode,
        title: data.circulation?.title || "Item",
        author: data.circulation?.author || "",
        callNumber: data.circulation?.callNumber || "",
        dueDate,
        status: "success",
        timestamp: new Date(),
      };

      setTransactions((prev) => [newItem, ...prev]);
      setItemError(undefined);
      setItemSuccess(true);
      
      window.dispatchEvent(new CustomEvent("stacksos:scan", {
        detail: { message: `Checked out: ${newItem.title}` }
      }));
      
      toast.success("Item checked out", { description: "Due: " + dueDate });
    },
    onError: (err, variables) => {
      if (audioEnabled) playError();
      
      const errorItem: TransactionItem = {
        id: "txn-" + Date.now(),
        mode: "checkout",
        barcode: variables.itemBarcode,
        title: "Unknown",
        author: "",
        callNumber: "",
        status: "error",
        message: err.message || "Checkout failed",
        timestamp: new Date(),
      };

      setTransactions((prev) => [errorItem, ...prev]);
      setItemError(err.message);
      setItemSuccess(false);
      toast.error("Checkout failed", { description: err.message });
    },
  });

  const checkinMutation = useMutation<any, { action: "checkin"; itemBarcode: string }>({
    onSuccess: (data, variables) => {
      let status: TransactionItem["status"] = "success";
      let message: string | undefined;
      let holdFor: TransactionItem["holdFor"] | undefined;
      let transitTo: string | undefined;

      if (data.status === "hold_captured" && data.hold) {
        status = "hold";
        holdFor = { name: data.hold.patronName || "Patron", barcode: data.hold.patronBarcode || "" };
        message = `Hold for ${holdFor.name}`;
        if (audioEnabled) playHoldReady();
      } else if (data.status === "in_transit" && data.transit) {
        status = "transit";
        const destId = Number(data.transit.destination);
        transitTo = Number.isFinite(destId) ? getOrgName(destId) : String(data.transit.destination || "Another branch");
        message = `Transit to ${transitTo}`;
        if (audioEnabled) playWarning();
      } else {
        message = "Reshelve";
        if (audioEnabled) playSuccess();
      }

      const newItem: TransactionItem = {
        id: "txn-" + Date.now(),
        mode: "checkin",
        barcode: variables.itemBarcode,
        title: data.title || "Item",
        author: data.author || "",
        callNumber: data.callNumber || "",
        status, message, holdFor, transitTo,
        timestamp: new Date(),
      };

      setTransactions((prev) => [newItem, ...prev]);
      setItemError(undefined);
      setItemSuccess(true);
      
      window.dispatchEvent(new CustomEvent("stacksos:scan", {
        detail: { message: `Checked in: ${newItem.title}` }
      }));

      toast.success("Item checked in", {
        description: status === "hold" ? "Hold captured" : status === "transit" ? "In transit" : "Reshelve",
      });
    },
    onError: (err, variables) => {
      if (audioEnabled) playError();
      
      setTransactions((prev) => [{
        id: "txn-" + Date.now(), mode: "checkin", barcode: variables.itemBarcode,
        title: "Unknown", author: "", callNumber: "", status: "error",
        message: err.message || "Checkin failed", timestamp: new Date(),
      }, ...prev]);
      setItemError(err.message);
      setItemSuccess(false);
      toast.error("Checkin failed", { description: err.message });
    },
  });

  const handleCheckout = useCallback(async (barcode: string) => {
    if (!barcode.trim() || !patron) return;
    setIsProcessing(true);
    setItemError(undefined);
    setItemSuccess(false);
    try {
      await checkoutMutation.mutateAsync("/api/evergreen/circulation", {
        action: "checkout", patronBarcode: patron.barcode, itemBarcode: barcode,
      });
    } finally {
      setIsProcessing(false);
      itemInputRef.current?.focus();
    }
  }, [patron, checkoutMutation]);

  const handleCheckin = useCallback(async (barcode: string) => {
    if (!barcode.trim()) return;
    setIsProcessing(true);
    setItemError(undefined);
    setItemSuccess(false);
    try {
      await checkinMutation.mutateAsync("/api/evergreen/circulation", {
        action: "checkin", itemBarcode: barcode,
      });
    } finally {
      setIsProcessing(false);
      itemInputRef.current?.focus();
    }
  }, [checkinMutation]);

  const handleItemScan = useCallback((barcode: string) => {
    if (mode === "checkout") handleCheckout(barcode);
    else handleCheckin(barcode);
  }, [mode, handleCheckout, handleCheckin]);

  const handleNewSession = useCallback(() => {
    clearPatron();
    setTransactions([]);
    setItemBarcode("");
    setItemError(undefined);
    setItemSuccess(false);
    patronInputRef.current?.focus();
  }, [clearPatron]);

  const handleModeSwitch = useCallback((newMode: Mode) => {
    setMode(newMode);
    setItemError(undefined);
    setItemSuccess(false);
    itemInputRef.current?.focus();
  }, []);

  useKeyboardShortcuts([
    { key: "F1", handler: () => handleModeSwitch("checkout") },
    { key: "F2", handler: () => handleModeSwitch("checkin") },
    { key: "Escape", handler: handleNewSession },
    { key: "m", ctrl: true, handler: () => setAudioEnabled((v) => !v), preventDefault: true },
  ]);

  const stats = useMemo(() => {
    const modeItems = transactions.filter((t) => t.mode === mode);
    return {
      total: modeItems.length,
      success: modeItems.filter((t) => t.status === "success").length,
      holds: modeItems.filter((t) => t.status === "hold").length,
      transits: modeItems.filter((t) => t.status === "transit").length,
      warnings: modeItems.filter((t) => t.status === "warning").length,
      errors: modeItems.filter((t) => t.status === "error").length,
    };
  }, [transactions, mode]);

  const columns = useMemo<ColumnDef<TransactionItem>[]>(() => [
    {
      accessorKey: "status", header: "Status", size: 120,
      cell: ({ row }) => {
        const { status, mode } = row.original;
        if (status === "hold") return <HoldStatusBadge status="available" />;
        if (status === "transit") return <StatusBadge label="Transit" status="info" showIcon />;
        if (status === "error") return <StatusBadge label="Error" status="error" showIcon />;
        if (status === "warning") return <StatusBadge label="Warning" status="warning" showIcon />;
        return <StatusBadge label={mode === "checkout" ? "Checked Out" : "Checked In"} status="success" showIcon />;
      },
    },
    {
      accessorKey: "title",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Title" />,
      cell: ({ row }) => (
        <div className="space-y-0.5">
          <div className="font-medium">{row.original.title}</div>
          {row.original.author && <div className="text-xs text-muted-foreground">{row.original.author}</div>}
          {row.original.message && (
            <div className={cn("text-xs", row.original.status === "error" ? "text-destructive" : "text-muted-foreground")}>
              {row.original.message}
            </div>
          )}
        </div>
      ),
    },
    { accessorKey: "barcode", header: "Barcode", size: 140, cell: ({ row }) => <span className="font-mono text-xs">{row.original.barcode}</span> },
    { accessorKey: "callNumber", header: "Call #", size: 120, cell: ({ row }) => <span className="text-xs">{row.original.callNumber}</span> },
    { accessorKey: "dueDate", header: "Due", size: 100, cell: ({ row }) => row.original.dueDate ? <span className="text-xs">{row.original.dueDate}</span> : null },
    { accessorKey: "timestamp", header: "Time", size: 80, cell: ({ row }) => <span className="text-xs text-muted-foreground">{row.original.timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span> },
  ], []);

  const tableData = useMemo(() => transactions.filter((t) => t.mode === mode), [transactions, mode]);

  return (
    <div className={cn("space-y-6", className)}>
      <div className="flex items-center justify-between flex-wrap gap-4">
        <Tabs value={mode} onValueChange={(v) => handleModeSwitch(v as Mode)} className="w-auto">
          <TabsList className="grid w-[280px] grid-cols-2">
            <TabsTrigger value="checkout" className="gap-2">
              <ArrowUpRight className="h-4 w-4" />Check Out
              <kbd className="hidden sm:inline-flex ml-1 px-1 py-0.5 bg-muted rounded text-[10px]">F1</kbd>
            </TabsTrigger>
            <TabsTrigger value="checkin" className="gap-2">
              <ArrowDownLeft className="h-4 w-4" />Check In
              <kbd className="hidden sm:inline-flex ml-1 px-1 py-0.5 bg-muted rounded text-[10px]">F2</kbd>
            </TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="flex items-center gap-2">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="sm" onClick={() => setAudioEnabled((v) => !v)} className={cn(!audioEnabled && "text-muted-foreground")}>
                  {audioEnabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
                </Button>
              </TooltipTrigger>
              <TooltipContent>{audioEnabled ? "Mute sounds (Ctrl+M)" : "Enable sounds (Ctrl+M)"}</TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <Button variant="outline" size="sm" onClick={() => setClearOpen(true)}><RotateCcw className="h-4 w-4 mr-2" />New Session</Button>
          <Button variant="outline" size="sm"><Printer className="h-4 w-4 mr-2" />Print</Button>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
        <div className="space-y-5">
          {mode === "checkout" && (
            <Card className="rounded-2xl border-border/70 shadow-sm">
              <CardContent className="p-5 space-y-4">
                <div className="flex items-center gap-2">
                  <User className="h-4 w-4 text-muted-foreground" />
                  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Patron</h3>
                </div>
                {!patron ? (
                  <BarcodeInput ref={patronInputRef} label="Patron Barcode" placeholder="Scan or enter patron barcode" onSubmit={lookupPatron} isLoading={isLoadingPatron} error={patronError?.message} autoFocus={mode === "checkout"} />
                ) : (
                  <PatronCard patron={patron} variant="default" showActions onClear={handleNewSession} />
                )}
              </CardContent>
            </Card>
          )}
          <Card className="rounded-2xl border-border/70 shadow-sm">
            <CardContent className="p-5 space-y-4">
              <div className="flex items-center gap-2">
                <Package className="h-4 w-4 text-muted-foreground" />
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">{mode === "checkout" ? "Item Check Out" : "Item Check In"}</h3>
              </div>
              <BarcodeInput ref={itemInputRef} label="Item Barcode" placeholder={mode === "checkout" ? "Scan item to check out" : "Scan item to check in"} value={itemBarcode} onChange={setItemBarcode} onSubmit={handleItemScan} isLoading={isProcessing} isSuccess={itemSuccess} error={itemError} disabled={mode === "checkout" && !patron} autoFocus={mode === "checkin"} autoClear />
              {isProcessing && (
                <div aria-live="polite" aria-atomic="true">
                  <LoadingInline message={mode === "checkout" ? "Processing checkout..." : "Processing checkin..."} />
                </div>
              )}
            </CardContent>
          </Card>
          <Card className="rounded-2xl border-border/70 shadow-sm">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Session Activity</CardTitle>
                <Badge variant="secondary" className="rounded-full">{stats.total} items</Badge>
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              <DataTable columns={columns} data={tableData} searchable searchPlaceholder="Search by title, barcode..." emptyState={<EmptyState title={mode === "checkout" ? "No items checked out yet" : "No items checked in yet"} description={mode === "checkout" ? "Scan a patron and item to start." : "Scan an item barcode to begin."} />} />
            </CardContent>
          </Card>
        </div>
        <div className="space-y-5">
          <Card className="rounded-2xl border-border/70 shadow-sm">
            <CardContent className="p-5">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Session Total</p>
                  <h3 className="text-3xl font-bold mt-1">{stats.total}</h3>
                </div>
                <div className="h-12 w-12 rounded-full bg-[hsl(var(--brand-1))]/10 flex items-center justify-center text-[hsl(var(--brand-1))]">
                  {mode === "checkout" ? <ArrowUpRight className="h-6 w-6" /> : <ArrowDownLeft className="h-6 w-6" />}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-xl bg-emerald-50 dark:bg-emerald-950/30 p-3 text-center">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600 mx-auto" />
                  <div className="text-lg font-semibold mt-1">{stats.success}</div>
                  <div className="text-[11px] text-muted-foreground">Success</div>
                </div>
                {mode === "checkin" ? (
                  <>
                    <div className="rounded-xl bg-sky-50 dark:bg-sky-950/30 p-3 text-center">
                      <Bell className="h-4 w-4 text-sky-600 mx-auto" />
                      <div className="text-lg font-semibold mt-1">{stats.holds}</div>
                      <div className="text-[11px] text-muted-foreground">Holds</div>
                    </div>
                    <div className="rounded-xl bg-amber-50 dark:bg-amber-950/30 p-3 text-center">
                      <Truck className="h-4 w-4 text-amber-600 mx-auto" />
                      <div className="text-lg font-semibold mt-1">{stats.transits}</div>
                      <div className="text-[11px] text-muted-foreground">Transits</div>
                    </div>
                  </>
                ) : (
                  <div className="rounded-xl bg-amber-50 dark:bg-amber-950/30 p-3 text-center">
                    <AlertTriangle className="h-4 w-4 text-amber-600 mx-auto" />
                    <div className="text-lg font-semibold mt-1">{stats.warnings}</div>
                    <div className="text-[11px] text-muted-foreground">Warnings</div>
                  </div>
                )}
                <div className="rounded-xl bg-rose-50 dark:bg-rose-950/30 p-3 text-center">
                  <XCircle className="h-4 w-4 text-rose-600 mx-auto" />
                  <div className="text-lg font-semibold mt-1">{stats.errors}</div>
                  <div className="text-[11px] text-muted-foreground">Errors</div>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="rounded-2xl border-border/70 shadow-sm bg-muted/30">
            <CardContent className="p-4">
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Keyboard Shortcuts</h4>
              <div className="space-y-2 text-xs">
                <div className="flex justify-between"><span>Check Out mode</span><kbd className="px-1.5 py-0.5 bg-background border rounded">F1</kbd></div>
                <div className="flex justify-between"><span>Check In mode</span><kbd className="px-1.5 py-0.5 bg-background border rounded">F2</kbd></div>
                <div className="flex justify-between"><span>New session</span><kbd className="px-1.5 py-0.5 bg-background border rounded">Esc</kbd></div>
                <div className="flex justify-between"><span>Toggle sound</span><div className="flex gap-0.5"><kbd className="px-1.5 py-0.5 bg-background border rounded">Ctrl</kbd><kbd className="px-1.5 py-0.5 bg-background border rounded">M</kbd></div></div>
                <div className="flex justify-between"><span>All shortcuts</span><kbd className="px-1.5 py-0.5 bg-background border rounded">?</kbd></div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
      <ConfirmDialog open={clearOpen} onOpenChange={setClearOpen} title="Start new session?" description="This will clear the current patron and all transaction history." confirmText="New Session" variant="default" onConfirm={() => { handleNewSession(); setClearOpen(false); }} />
    </div>
  );
}

export type { CirculationDeskProps };
