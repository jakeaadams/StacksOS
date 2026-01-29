"use client";

import { fetchWithAuth } from "@/lib/client-fetch";
import { clientLogger } from "@/lib/client-logger";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  PageContainer,
  PageHeader,
  PageContent,
  BarcodeInput,
  DataTable,
  DataTableColumnHeader,
  EmptyState,
  LoadingSpinner,
  StatusBadge,
} from "@/components/shared";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { ColumnDef } from "@tanstack/react-table";
import {
  Package,
  CheckCircle,
  XCircle,
  AlertTriangle,
  ArrowRight,
  Loader2,
  Filter,
} from "lucide-react";

interface Transit {
  id: number;
  source: number;
  dest: number;
  target_copy: number;
  source_send_time: string;
  dest_recv_time: string | null;
  copy_status: number;
  hold_type: string | null;
  hold: number | null;
  barcode?: string;
  title?: string;
  call_number?: string;
  sourceName?: string;
  destName?: string;
}

type StatusFilter = "all" | "in_transit" | "received" | "exceptions";
type DialogMode = "receive" | "exception" | "abort" | null;

interface DialogState {
  mode: DialogMode;
  transit: Transit | null;
  barcode: string;
  exceptionReason: string;
  exceptionNotes: string;
  abortReason: string;
  loading: boolean;
}

export default function TransitsPage() {
  const router = useRouter();
  const [transits, setTransits] = useState<Transit[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("in_transit");
  const [dialogState, setDialogState] = useState<DialogState>({
    mode: null,
    transit: null,
    barcode: "",
    exceptionReason: "",
    exceptionNotes: "",
    abortReason: "",
    loading: false,
  });

  // Fetch transits
  const fetchTransits = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetchWithAuth("/api/evergreen/transits?org_id=1&direction=incoming");
      const data = await response.json();
      if (data.ok && data.transits) {
        setTransits(data.transits);
      } else {
        toast.error("Failed to load transits");
      }
    } catch (error) {
      clientLogger.error("Failed to fetch transits:", error);
      toast.error("Failed to load transits");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTransits();
  }, [fetchTransits]);

  // Handle barcode scan for quick receive
  const handleBarcodeScan = useCallback(async (barcode: string) => {
    try {
      const response = await fetchWithAuth("/api/evergreen/transits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "receive",
          copy_barcode: barcode,
        }),
      });

      const data = await response.json();
      if (data.ok) {
        toast.success(data.hold ? "Transit received - Hold captured!" : "Transit received");
        fetchTransits();
      } else {
        toast.error(data.error || "Failed to receive transit");
      }
    } catch (error) {
      clientLogger.error("Failed to receive transit:", error);
      toast.error("Failed to receive transit");
    }
  }, [fetchTransits]);

  // Handle receive action
  const handleReceive = useCallback((transit: Transit) => {
    setDialogState({
      mode: "receive",
      transit,
      barcode: transit.barcode || "",
      exceptionReason: "",
      exceptionNotes: "",
      abortReason: "",
      loading: false,
    });
  }, []);

  // Handle exception action
  const handleException = useCallback((transit: Transit) => {
    setDialogState({
      mode: "exception",
      transit,
      barcode: transit.barcode || "",
      exceptionReason: "",
      exceptionNotes: "",
      abortReason: "",
      loading: false,
    });
  }, []);

  // Handle abort action
  const handleAbort = useCallback((transit: Transit) => {
    setDialogState({
      mode: "abort",
      transit,
      barcode: transit.barcode || "",
      exceptionReason: "",
      exceptionNotes: "",
      abortReason: "",
      loading: false,
    });
  }, []);

  // Confirm receive
  const confirmReceive = useCallback(async () => {
    if (!dialogState.transit) return;

    setDialogState((prev) => ({ ...prev, loading: true }));
    try {
      const response = await fetchWithAuth("/api/evergreen/transits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "receive",
          copy_barcode: dialogState.transit.barcode,
        }),
      });

      const data = await response.json();
      if (data.ok) {
        toast.success(data.hold ? "Transit received - Hold captured!" : "Transit received");
        setDialogState({ mode: null, transit: null, barcode: "", exceptionReason: "", exceptionNotes: "", abortReason: "", loading: false });
        fetchTransits();
      } else {
        toast.error(data.error || "Failed to receive transit");
        setDialogState((prev) => ({ ...prev, loading: false }));
      }
    } catch (error) {
      clientLogger.error("Failed to receive transit:", error);
      toast.error("Failed to receive transit");
      setDialogState((prev) => ({ ...prev, loading: false }));
    }
  }, [dialogState.transit, fetchTransits]);

  // Confirm exception
  const confirmException = useCallback(async () => {
    if (!dialogState.transit || !dialogState.exceptionReason) {
      toast.error("Please select an exception reason");
      return;
    }

    setDialogState((prev) => ({ ...prev, loading: true }));
    try {
      const response = await fetchWithAuth("/api/evergreen/transits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "exception",
          transit_id: dialogState.transit.id,
          reason: dialogState.exceptionReason,
          notes: dialogState.exceptionNotes,
        }),
      });

      const data = await response.json();
      if (data.ok) {
        toast.success("Transit exception recorded");
        setDialogState({ mode: null, transit: null, barcode: "", exceptionReason: "", exceptionNotes: "", abortReason: "", loading: false });
        fetchTransits();
      } else {
        toast.error(data.error || "Failed to record exception");
        setDialogState((prev) => ({ ...prev, loading: false }));
      }
    } catch (error) {
      clientLogger.error("Failed to record exception:", error);
      toast.error("Failed to record exception");
      setDialogState((prev) => ({ ...prev, loading: false }));
    }
  }, [dialogState.transit, dialogState.exceptionReason, dialogState.exceptionNotes, fetchTransits]);

  // Confirm abort
  const confirmAbort = useCallback(async () => {
    if (!dialogState.transit || !dialogState.abortReason) {
      toast.error("Please provide a reason for cancellation");
      return;
    }

    setDialogState((prev) => ({ ...prev, loading: true }));
    try {
      const response = await fetchWithAuth("/api/evergreen/transits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "abort",
          transit_id: dialogState.transit.id,
          reason: dialogState.abortReason,
        }),
      });

      const data = await response.json();
      if (data.ok) {
        toast.success("Transit cancelled");
        setDialogState({ mode: null, transit: null, barcode: "", exceptionReason: "", exceptionNotes: "", abortReason: "", loading: false });
        fetchTransits();
      } else {
        toast.error(data.error || "Failed to cancel transit");
        setDialogState((prev) => ({ ...prev, loading: false }));
      }
    } catch (error) {
      clientLogger.error("Failed to cancel transit:", error);
      toast.error("Failed to cancel transit");
      setDialogState((prev) => ({ ...prev, loading: false }));
    }
  }, [dialogState.transit, dialogState.abortReason, fetchTransits]);

  // Close dialog
  const closeDialog = useCallback(() => {
    setDialogState({ mode: null, transit: null, barcode: "", exceptionReason: "", exceptionNotes: "", abortReason: "", loading: false });
  }, []);

  // Filter transits by status
  const filteredTransits = useMemo(() => {
    return transits.filter((t) => {
      if (statusFilter === "all") return true;
      if (statusFilter === "in_transit") return !t.dest_recv_time;
      if (statusFilter === "received") return !!t.dest_recv_time;
      if (statusFilter === "exceptions") return false; // Would need exception flag in data
      return true;
    });
  }, [transits, statusFilter]);

  // Table columns
  const columns = useMemo<ColumnDef<Transit>[]>(
    () => [
      {
        accessorKey: "title",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Title" />,
        cell: ({ row }) => (
          <div className="max-w-md">
            <div className="font-medium truncate">{row.original.title || "Unknown Title"}</div>
            {row.original.call_number && (
              <div className="text-xs text-muted-foreground truncate">{row.original.call_number}</div>
            )}
          </div>
        ),
      },
      {
        accessorKey: "barcode",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Barcode" />,
        cell: ({ row }) => (
          <div className="font-mono text-sm">{row.original.barcode || "N/A"}</div>
        ),
      },
      {
        accessorKey: "source",
        header: ({ column }) => <DataTableColumnHeader column={column} title="From" />,
        cell: ({ row }) => (
          <div className="text-sm">{row.original.sourceName || `Org ${row.original.source}`}</div>
        ),
      },
      {
        accessorKey: "dest",
        header: ({ column }) => <DataTableColumnHeader column={column} title="To" />,
        cell: ({ row }) => (
          <div className="text-sm">{row.original.destName || `Org ${row.original.dest}`}</div>
        ),
      },
      {
        accessorKey: "source_send_time",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Sent" />,
        cell: ({ row }) => (
          <div className="text-sm">
            {row.original.source_send_time
              ? new Date(row.original.source_send_time).toLocaleDateString()
              : "N/A"}
          </div>
        ),
      },
      {
        accessorKey: "status",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Status" />,
        cell: ({ row }) => (
          <StatusBadge
            status={row.original.dest_recv_time ? "success" : "pending"}
            label={row.original.dest_recv_time ? "Received" : "In Transit"}
          />
        ),
      },
      {
        id: "actions",
        header: "Actions",
        cell: ({ row }) => (
          <div className="flex items-center gap-2">
            {!row.original.dest_recv_time && (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleReceive(row.original)}
                >
                  <CheckCircle className="h-4 w-4 mr-1" />
                  Receive
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleException(row.original)}
                >
                  <AlertTriangle className="h-4 w-4 mr-1" />
                  Exception
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleAbort(row.original)}
                >
                  <XCircle className="h-4 w-4 mr-1" />
                  Cancel
                </Button>
              </>
            )}
          </div>
        ),
      },
    ],
    [handleReceive, handleException, handleAbort]
  );

  return (
    <PageContainer>
      <PageHeader
        title="Transit Management"
        
        breadcrumbs={[{ label: "Circulation", href: "/staff/circulation" }, { label: "Transits" }]}
        
      />

      <PageContent>
        <div className="space-y-6">
          {/* Quick Receive */}
          <Card>
            <CardHeader>
              <CardTitle>Quick Transit Receipt</CardTitle>
              <CardDescription>
                Scan an item barcode to receive it from transit
              </CardDescription>
            </CardHeader>
            <CardContent>
              <BarcodeInput
                placeholder="Scan item barcode..."
                onSubmit={handleBarcodeScan}
                autoFocus
              />
            </CardContent>
          </Card>

          {/* Filters */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Transit List</CardTitle>
                <div className="flex items-center gap-2">
                  <Filter className="h-4 w-4 text-muted-foreground" />
                  <Select
                    value={statusFilter}
                    onValueChange={(value) => setStatusFilter(value as StatusFilter)}
                  >
                    <SelectTrigger className="w-[180px]">
                      <SelectValue placeholder="Filter by status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Transits</SelectItem>
                      <SelectItem value="in_transit">In Transit</SelectItem>
                      <SelectItem value="received">Received</SelectItem>
                      <SelectItem value="exceptions">Exceptions</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="flex items-center justify-center py-12">
                  <LoadingSpinner />
                </div>
              ) : filteredTransits.length === 0 ? (
                <EmptyState
                  icon={Package}
                  title="No transits found"
                  description="There are no transits matching the current filter"
                />
              ) : (
                <DataTable columns={columns} data={filteredTransits} />
              )}
            </CardContent>
          </Card>
        </div>
      </PageContent>

      {/* Receive Dialog */}
      <Dialog open={dialogState.mode === "receive"} onOpenChange={closeDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Receive Transit</DialogTitle>
            <DialogDescription>
              Confirm receipt of this item at its destination
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Item</Label>
              <div className="text-sm font-medium">{dialogState.transit?.title || "Unknown"}</div>
            </div>
            <div className="space-y-2">
              <Label>Barcode</Label>
              <div className="font-mono text-sm">{dialogState.transit?.barcode || "N/A"}</div>
            </div>
            <div className="space-y-2">
              <Label>From</Label>
              <div className="text-sm">
                {dialogState.transit?.sourceName || `Org ${dialogState.transit?.source}`}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeDialog} disabled={dialogState.loading}>
              Cancel
            </Button>
            <Button onClick={confirmReceive} disabled={dialogState.loading}>
              {dialogState.loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Confirm Receipt
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Exception Dialog */}
      <Dialog open={dialogState.mode === "exception"} onOpenChange={closeDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Transit Exception</DialogTitle>
            <DialogDescription>
              Record an exception for this transit
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Item</Label>
              <div className="text-sm font-medium">{dialogState.transit?.title || "Unknown"}</div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="exception-reason">Exception Reason *</Label>
              <Select
                value={dialogState.exceptionReason}
                onValueChange={(value) =>
                  setDialogState((prev) => ({ ...prev, exceptionReason: value }))
                }
              >
                <SelectTrigger id="exception-reason">
                  <SelectValue placeholder="Select reason" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="lost">Item Lost</SelectItem>
                  <SelectItem value="damaged">Item Damaged</SelectItem>
                  <SelectItem value="wrong_item">Wrong Item</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="exception-notes">Notes (Optional)</Label>
              <Textarea
                id="exception-notes"
                placeholder="Enter additional details..."
                value={dialogState.exceptionNotes}
                onChange={(e) =>
                  setDialogState((prev) => ({ ...prev, exceptionNotes: e.target.value }))
                }
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeDialog} disabled={dialogState.loading}>
              Cancel
            </Button>
            <Button onClick={confirmException} disabled={dialogState.loading}>
              {dialogState.loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Record Exception
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Abort Dialog */}
      <Dialog open={dialogState.mode === "abort"} onOpenChange={closeDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancel Transit</DialogTitle>
            <DialogDescription>
              Confirm cancellation of this transit
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Item</Label>
              <div className="text-sm font-medium">{dialogState.transit?.title || "Unknown"}</div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="abort-reason">Cancellation Reason *</Label>
              <Textarea
                id="abort-reason"
                placeholder="Enter reason for cancellation..."
                value={dialogState.abortReason}
                onChange={(e) =>
                  setDialogState((prev) => ({ ...prev, abortReason: e.target.value }))
                }
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeDialog} disabled={dialogState.loading}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={confirmAbort}
              disabled={dialogState.loading}
            >
              {dialogState.loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Confirm Cancellation
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageContainer>
  );
}
