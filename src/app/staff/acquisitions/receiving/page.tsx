"use client";

import { fetchWithAuth } from "@/lib/client-fetch";
import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  PageContainer,
  PageHeader,
  PageContent,
  DataTable,
  EmptyState,
  StatusBadge,
  ConfirmDialog,
  ErrorMessage,
  SetupRequired,
  SETUP_CONFIGS,
} from "@/components/shared";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { ColumnDef } from "@tanstack/react-table";
import { useApi } from "@/hooks";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { 
  Globe, 
  Package, 
  PackageCheck, 
  PackageX, 
  AlertTriangle,
  Undo2,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface PurchaseOrder {
  id: number;
  name: string;
  state: string;
  order_date?: string;
  lineitem_count?: number;
}

interface LineItemDetail {
  id: number;
  barcode?: string;
  recv_time?: string | null;
  fund?: any;
  location?: any;
  note?: string;
  claims?: any[];
}

interface LineItem {
  id: number;
  title: string;
  state: string;
  item_count: number;
  estimated_unit_price?: number;
  details?: LineItemDetail[];
  receivedCount?: number;
}

type ReceiveAction = 'receive_all' | 'partial_receive' | 'unreceive' | 'mark_damaged';

export default function ReceivingPage() {
  const router = useRouter();

  const { data, isLoading } = useApi<any>(
    "/api/evergreen/acquisitions?action=orders",
    { immediate: true }
  );

  const orders: PurchaseOrder[] = data?.orders || [];
  const ordersMessage = typeof data?.message === "string" ? data.message : "";

  const [selectedPo, setSelectedPo] = useState<PurchaseOrder | null>(null);
  const [lineitems, setLineitems] = useState<LineItem[]>([]);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [detailsError, setDetailsError] = useState<string | null>(null);
  const [poMessage, setPoMessage] = useState<string>("");
  const [actionLoadingId, setActionLoadingId] = useState<number | null>(null);
  const [expandedLineItems, setExpandedLineItems] = useState<Set<number>>(new Set());

  // Dialog states
  const [receiveDialogOpen, setReceiveDialogOpen] = useState(false);
  const [receiveTarget, setReceiveTarget] = useState<LineItem | null>(null);
  const [receiveAction, setReceiveAction] = useState<ReceiveAction>('receive_all');
  const [selectedDetails, setSelectedDetails] = useState<Set<number>>(new Set());
  
  const [claimDialogOpen, setClaimDialogOpen] = useState(false);
  const [claimTarget, setClaimTarget] = useState<LineItem | null>(null);
  const [claimNote, setClaimNote] = useState("");

  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [cancelTarget, setCancelTarget] = useState<LineItem | null>(null);
  const [cancelReason, setCancelReason] = useState("");

  const [damagedDialogOpen, setDamagedDialogOpen] = useState(false);
  const [damagedTarget, setDamagedTarget] = useState<{ lineitem: LineItem; detailId: number } | null>(null);
  const [damagedNote, setDamagedNote] = useState("");

  const loadPurchaseOrder = useCallback(async (po: PurchaseOrder) => {
    setSelectedPo(po);
    setDetailsLoading(true);
    setDetailsError(null);
    setPoMessage("");
    setExpandedLineItems(new Set());

    try {
      const res = await fetchWithAuth(`/api/evergreen/acquisitions?action=po&id=${po.id}`);
      const json = await res.json();
      if (!res.ok || json.ok === false) {
        throw new Error(json.error || "Failed to load purchase order");
      }
      setLineitems(json.lineitems || []);
      setPoMessage(typeof json.message === "string" ? json.message : "");
    } catch (err: any) {
      setDetailsError(err?.message || "Failed to load purchase order");
      setLineitems([]);
    } finally {
      setDetailsLoading(false);
    }
  }, []);

  const toggleLineItemExpanded = useCallback((lineitemId: number) => {
    setExpandedLineItems(prev => {
      const next = new Set(prev);
      if (next.has(lineitemId)) {
        next.delete(lineitemId);
      } else {
        next.add(lineitemId);
      }
      return next;
    });
  }, []);

  const openReceiveDialog = useCallback((lineitem: LineItem, action: ReceiveAction = 'receive_all') => {
    setReceiveTarget(lineitem);
    setReceiveAction(action);
    setSelectedDetails(new Set());
    setReceiveDialogOpen(true);
  }, []);

  const handleReceive = useCallback(async () => {
    if (!receiveTarget) return;
    
    setActionLoadingId(receiveTarget.id);
    
    try {
      if (receiveAction === 'receive_all') {
        const res = await fetchWithAuth("/api/evergreen/acquisitions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ 
            action: "receive_lineitem", 
            lineitemId: receiveTarget.id 
          }),
        });
        const json = await res.json();
        if (!res.ok || json.ok === false) {
          throw new Error(json.error || "Failed to receive line item");
        }
        toast.success("All items received");
      } else if (receiveAction === 'partial_receive') {
        if (selectedDetails.size === 0) {
          toast.error("Please select at least one item to receive");
          return;
        }
        
        // Receive each selected detail
        const detailIds = Array.from(selectedDetails);
        for (const detailId of detailIds) {
          const res = await fetchWithAuth("/api/evergreen/acquisitions", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ 
              action: "receive_lineitem_detail", 
              lineitemDetailId: detailId 
            }),
          });
          const json = await res.json();
          if (!res.ok || json.ok === false) {
            throw new Error(json.error || "Failed to receive item");
          }
        }
        toast.success(`Received ${detailIds.length} item(s)`);
      } else if (receiveAction === 'unreceive') {
        if (selectedDetails.size === 0) {
          toast.error("Please select at least one item to unreceive");
          return;
        }
        
        const detailIds = Array.from(selectedDetails);
        for (const detailId of detailIds) {
          const res = await fetchWithAuth("/api/evergreen/acquisitions", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ 
              action: "unreceive_lineitem_detail", 
              lineitemDetailId: detailId 
            }),
          });
          const json = await res.json();
          if (!res.ok || json.ok === false) {
            throw new Error(json.error || "Failed to unreceive item");
          }
        }
        toast.success(`Unreceived ${detailIds.length} item(s)`);
      }
      
      if (selectedPo) await loadPurchaseOrder(selectedPo);
      setReceiveDialogOpen(false);
    } catch (err: any) {
      toast.error(err?.message || "Operation failed");
    } finally {
      setActionLoadingId(null);
    }
  }, [receiveAction, receiveTarget, selectedDetails, loadPurchaseOrder, selectedPo]);

  const openClaimDialog = useCallback((lineitem: LineItem) => {
    setClaimTarget(lineitem);
    setClaimNote("");
    setClaimDialogOpen(true);
  }, []);

  const handleClaim = useCallback(async () => {
    if (!claimTarget) return;
    setActionLoadingId(claimTarget.id);

    try {
      const res = await fetchWithAuth("/api/evergreen/acquisitions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "claim_lineitem",
          lineitemId: claimTarget.id,
          note: claimNote,
        }),
      });
      const json = await res.json();
      if (!res.ok || json.ok === false) {
        throw new Error(json.error || "Claim failed");
      }
      toast.success("Claim submitted");
      if (selectedPo) await loadPurchaseOrder(selectedPo);
      setClaimDialogOpen(false);
    } catch (err: any) {
      toast.error(err?.message || "Claim failed");
    } finally {
      setActionLoadingId(null);
    }
  }, [claimNote, claimTarget, loadPurchaseOrder, selectedPo]);

  const openCancelDialog = useCallback((lineitem: LineItem) => {
    setCancelTarget(lineitem);
    setCancelReason("");
    setCancelDialogOpen(true);
  }, []);

  const handleCancel = useCallback(async () => {
    if (!cancelTarget) return;
    setActionLoadingId(cancelTarget.id);
    
    try {
      const res = await fetchWithAuth("/api/evergreen/acquisitions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          action: "cancel_lineitem", 
          lineitemId: cancelTarget.id,
          reason: cancelReason || "Staff cancelled"
        }),
      });
      const json = await res.json();
      if (!res.ok || json.ok === false) {
        throw new Error(json.error || "Failed to cancel line item");
      }
      toast.success("Line item cancelled");
      if (selectedPo) await loadPurchaseOrder(selectedPo);
      setCancelDialogOpen(false);
    } catch (err: any) {
      toast.error(err?.message || "Failed to cancel line item");
    } finally {
      setActionLoadingId(null);
    }
  }, [cancelTarget, cancelReason, loadPurchaseOrder, selectedPo]);

  const openDamagedDialog = useCallback((lineitem: LineItem, detailId: number) => {
    setDamagedTarget({ lineitem, detailId });
    setDamagedNote("");
    setDamagedDialogOpen(true);
  }, []);

  const handleMarkDamaged = useCallback(async () => {
    if (!damagedTarget) return;
    setActionLoadingId(damagedTarget.lineitem.id);
    
    try {
      const res = await fetchWithAuth("/api/evergreen/acquisitions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          action: "mark_damaged", 
          lineitemDetailId: damagedTarget.detailId,
          note: damagedNote
        }),
      });
      const json = await res.json();
      if (!res.ok || json.ok === false) {
        throw new Error(json.error || "Failed to mark as damaged");
      }
      toast.success("Item marked as damaged");
      if (selectedPo) await loadPurchaseOrder(selectedPo);
      setDamagedDialogOpen(false);
    } catch (err: any) {
      toast.error(err?.message || "Failed to mark as damaged");
    } finally {
      setActionLoadingId(null);
    }
  }, [damagedTarget, damagedNote, loadPurchaseOrder, selectedPo]);

  const ordersColumns = useMemo<ColumnDef<PurchaseOrder>[]>(
    () => [
      { accessorKey: "name", header: "PO" },
      {
        accessorKey: "state",
        header: "Status",
        cell: ({ row }) => (
          <StatusBadge
            label={row.original.state}
            status={row.original.state === "received" ? "success" : "pending"}
          />
        ),
      },
      {
        accessorKey: "order_date",
        header: "Order Date",
        cell: ({ row }) =>
          row.original.order_date
            ? new Date(row.original.order_date).toLocaleDateString()
            : "—",
      },
      {
        accessorKey: "lineitem_count",
        header: "Line Items",
        cell: ({ row }) => row.original.lineitem_count ?? 0,
      },
    ],
    []
  );

  const lineitemColumns = useMemo<ColumnDef<LineItem>[]>(
    () => [
      {
        id: "expander",
        header: "",
        cell: ({ row }) => {
          const hasDetails = row.original.details && row.original.details.length > 0;
          if (!hasDetails) return null;
          const isExpanded = expandedLineItems.has(row.original.id);
          return (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0"
              onClick={(e) => {
                e.stopPropagation();
                toggleLineItemExpanded(row.original.id);
              }}
              title={isExpanded ? "Collapse details" : "Expand details"}
            >
              {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              <span className="sr-only">{isExpanded ? "Collapse" : "Expand"} line item details</span>
            </Button>
          );
        },
      },
      {
        accessorKey: "title",
        header: "Title",
        cell: ({ row }) => row.original.title || "Untitled",
      },
      {
        accessorKey: "state",
        header: "State",
        cell: ({ row }) => (
          <StatusBadge
            label={row.original.state}
            status={row.original.state === "received" ? "success" : "warning"}
          />
        ),
      },
      {
        accessorKey: "item_count",
        header: "Items",
        cell: ({ row }) => row.original.item_count ?? 0,
      },
      {
        accessorKey: "receivedCount",
        header: "Received",
        cell: ({ row }) => {
          const received = row.original.receivedCount ?? 0;
          const total = row.original.item_count ?? 0;
          const allReceived = received === total && total > 0;
          return (
            <span className={cn(allReceived && "text-green-600 font-medium")}>
              {received}
            </span>
          );
        },
      },
      {
        id: "actions",
        header: "Actions",
        cell: ({ row }) => {
          const hasUnreceived = row.original.details?.some(d => !d.recv_time);
          const hasReceived = row.original.details?.some(d => d.recv_time);
          
          return (
            <div className="flex items-center gap-1">
              {hasUnreceived && (
                <>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={(e) => {
                      e.stopPropagation();
                      openReceiveDialog(row.original, 'receive_all');
                    }}
                    disabled={actionLoadingId === row.original.id}
                  >
                    <PackageCheck className="h-4 w-4 mr-1" />
                    Receive All
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={(e) => {
                      e.stopPropagation();
                      openReceiveDialog(row.original, 'partial_receive');
                    }}
                    disabled={actionLoadingId === row.original.id}
                  >
                    <Package className="h-4 w-4 mr-1" />
                    Partial
                  </Button>
                </>
              )}
              {hasReceived && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={(e) => {
                    e.stopPropagation();
                    openReceiveDialog(row.original, 'unreceive');
                  }}
                  disabled={actionLoadingId === row.original.id}
                >
                  <Undo2 className="h-4 w-4 mr-1" />
                  Unreceive
                </Button>
              )}
              <Button
                size="sm"
                variant="ghost"
                onClick={(e) => {
                  e.stopPropagation();
                  openClaimDialog(row.original);
                }}
                disabled={actionLoadingId === row.original.id}
              >
                <AlertTriangle className="h-4 w-4 mr-1" />
                Claim
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="text-destructive hover:text-destructive"
                onClick={(e) => {
                  e.stopPropagation();
                  openCancelDialog(row.original);
                }}
                disabled={actionLoadingId === row.original.id}
              >
                <PackageX className="h-4 w-4 mr-1" />
                Cancel
              </Button>
            </div>
          );
        },
      },
    ],
    [expandedLineItems, actionLoadingId, toggleLineItemExpanded, openReceiveDialog, openClaimDialog, openCancelDialog]
  );

  // Show SetupRequired if no orders and there's a message indicating setup needed
  const showSetupRequired = !isLoading && orders.length === 0 && (
    ordersMessage.includes('configured') || 
    ordersMessage.includes('permission') ||
    ordersMessage.includes('not found')
  );

  const lineitemsEmptyState = !selectedPo ? (
    <EmptyState
      title="No purchase order selected"
      description="Select a purchase order above to load line items."
    />
  ) : (
    <EmptyState
      title="No line items"
      description={poMessage || "No line items were returned for this purchase order."}
      action={{
        label: "Setup Guide",
        onClick: () => router.push("/staff/help#evergreen-setup"),
        icon: Globe,
      }}
    />
  );

  return (
    <PageContainer>
      <PageHeader
        title="Receiving"
        subtitle="Review purchase orders ready for receiving."
        breadcrumbs={[
          { label: "Acquisitions", href: "/staff/acquisitions" },
          { label: "Receiving" },
        ]}
      />
      <PageContent>
        {detailsError && (
          <div className="mb-4">
            <ErrorMessage
              message={detailsError}
              onRetry={() => setDetailsError(null)}
            />
          </div>
        )}

        {showSetupRequired ? (
          <SetupRequired
            {...SETUP_CONFIGS.acquisitions}
            docsUrl="https://docs.evergreen-ils.org/eg/docs/latest/acquisitions.html"
          />
        ) : (
          <>
            <Card>
              <CardHeader>
                <CardTitle>Purchase Orders</CardTitle>
                <CardDescription>Select a PO to view line items.</CardDescription>
              </CardHeader>
              <CardContent>
                <DataTable
                  columns={ordersColumns}
                  data={orders}
                  isLoading={isLoading}
                  searchable
                  searchPlaceholder="Search POs..."
                  paginated={false}
                  onRowClick={(po) => void loadPurchaseOrder(po)}
                  emptyState={
                    <EmptyState
                      title="No purchase orders"
                      description={ordersMessage || "No purchase orders were returned."}
                      action={{
                        label: "Setup Guide",
                        onClick: () => router.push("/staff/help#evergreen-setup"),
                        icon: Globe,
                      }}
                    />
                  }
                />
              </CardContent>
            </Card>

            <Card className="mt-6">
              <CardHeader>
                <CardTitle>Line Items</CardTitle>
                <CardDescription>
                  {selectedPo ? `PO ${selectedPo.name}` : "Select a purchase order to view line items"}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <DataTable
                    columns={lineitemColumns}
                    data={lineitems}
                    isLoading={detailsLoading}
                    searchable
                    searchPlaceholder="Search line items..."
                    paginated={false}
                    emptyState={lineitemsEmptyState}
                  />
                  
                  {/* Expanded details */}
                  {lineitems.filter(li => expandedLineItems.has(li.id)).map(lineitem => (
                    <div key={lineitem.id} className="ml-8 mt-2 border-l-2 border-muted pl-4">
                      <div className="text-sm font-medium mb-2">Item Details</div>
                      <div className="space-y-1">
                        {lineitem.details?.map((detail, idx) => (
                          <div 
                            key={detail.id} 
                            className={cn(
                              "flex items-center gap-4 p-2 rounded text-sm",
                              detail.recv_time ? "bg-green-50 dark:bg-green-950/20" : "bg-muted/50"
                            )}
                          >
                            <span className="w-8 text-muted-foreground">#{idx + 1}</span>
                            <span className="flex-1 font-mono">{detail.barcode || "No barcode"}</span>
                            <span className={cn(
                              "px-2 py-0.5 rounded text-xs",
                              detail.recv_time 
                                ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100" 
                                : "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-100"
                            )}>
                              {detail.recv_time ? "Received" : "Pending"}
                            </span>
                            {detail.recv_time && (
                              <span className="text-xs text-muted-foreground">
                                {new Date(detail.recv_time).toLocaleString()}
                              </span>
                            )}
                            {!detail.recv_time && (
                              <Button
                                size="sm"
                                variant="ghost"
                                className="text-destructive hover:text-destructive"
                                onClick={() => openDamagedDialog(lineitem, detail.id)}
                              >
                                <PackageX className="h-3 w-3 mr-1" />
                                Mark Damaged
                              </Button>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </>
        )}

        {/* Receive Dialog */}
        <Dialog open={receiveDialogOpen} onOpenChange={setReceiveDialogOpen}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>
                {receiveAction === 'receive_all' && "Receive All Items"}
                {receiveAction === 'partial_receive' && "Partial Receive"}
                {receiveAction === 'unreceive' && "Unreceive Items"}
              </DialogTitle>
              <DialogDescription>
                {receiveAction === 'receive_all' && `Receive all items for: ${receiveTarget?.title}`}
                {receiveAction === 'partial_receive' && "Select items to receive"}
                {receiveAction === 'unreceive' && "Select items to unreceive"}
              </DialogDescription>
            </DialogHeader>
            
            {(receiveAction === 'partial_receive' || receiveAction === 'unreceive') && receiveTarget && (
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {receiveTarget.details
                  ?.filter(detail => 
                    receiveAction === 'partial_receive' ? !detail.recv_time : detail.recv_time
                  )
                  .map((detail, idx) => (
                    <div key={detail.id} className="flex items-center gap-3 p-2 border rounded">
                      <Checkbox
                        checked={selectedDetails.has(detail.id)}
                        onCheckedChange={(checked) => {
                          setSelectedDetails(prev => {
                            const next = new Set(prev);
                            if (checked) {
                              next.add(detail.id);
                            } else {
                              next.delete(detail.id);
                            }
                            return next;
                          });
                        }}
                      />
                      <span className="w-8 text-muted-foreground">#{idx + 1}</span>
                      <span className="flex-1 font-mono">{detail.barcode || "No barcode"}</span>
                      {detail.recv_time && (
                        <span className="text-xs text-muted-foreground">
                          Received: {new Date(detail.recv_time).toLocaleString()}
                        </span>
                      )}
                    </div>
                  ))}
              </div>
            )}
            
            <DialogFooter>
              <Button variant="outline" onClick={() => setReceiveDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleReceive} disabled={actionLoadingId !== null}>
                {receiveAction === 'receive_all' && "Receive All"}
                {receiveAction === 'partial_receive' && `Receive Selected (${selectedDetails.size})`}
                {receiveAction === 'unreceive' && `Unreceive Selected (${selectedDetails.size})`}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Claim Dialog */}
        <ConfirmDialog
          open={claimDialogOpen}
          onOpenChange={setClaimDialogOpen}
          title="Claim line item"
          description={claimTarget ? `Submit a claim for ${claimTarget.title}` : "Submit a claim"}
          confirmText="Submit Claim"
          onConfirm={handleClaim}
          variant="warning"
          isLoading={actionLoadingId !== null}
        >
          <div className="space-y-2">
            <Label htmlFor="claim-note">Claim note (optional)</Label>
            <Textarea
              id="claim-note"
              value={claimNote}
              onChange={(e) => setClaimNote(e.target.value)}
              placeholder="Add claim note"
            />
          </div>
        </ConfirmDialog>

        {/* Cancel Dialog */}
        <ConfirmDialog
          open={cancelDialogOpen}
          onOpenChange={setCancelDialogOpen}
          title="Cancel line item"
          description={cancelTarget ? `Cancel line item: ${cancelTarget.title}?` : "Cancel line item?"}
          confirmText="Cancel Line Item"
          onConfirm={handleCancel}
          variant="danger"
          isLoading={actionLoadingId !== null}
        >
          <div className="space-y-2">
            <Label htmlFor="cancel-reason">Cancellation reason (optional)</Label>
            <Textarea
              id="cancel-reason"
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              placeholder="Reason for cancellation"
            />
          </div>
        </ConfirmDialog>

        {/* Damaged Dialog */}
        <ConfirmDialog
          open={damagedDialogOpen}
          onOpenChange={setDamagedDialogOpen}
          title="Mark as damaged"
          description="Mark this item as damaged and create a claim"
          confirmText="Mark Damaged"
          onConfirm={handleMarkDamaged}
          variant="warning"
          isLoading={actionLoadingId !== null}
        >
          <div className="space-y-2">
            <Label htmlFor="damaged-note">Damage note (required)</Label>
            <Textarea
              id="damaged-note"
              value={damagedNote}
              onChange={(e) => setDamagedNote(e.target.value)}
              placeholder="Describe the damage..."
              required
            />
          </div>
        </ConfirmDialog>
      </PageContent>
    </PageContainer>
  );
}
