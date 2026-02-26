"use client";

import { fetchWithAuth } from "@/lib/client-fetch";

import { useState, useCallback, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Search,
  AlertTriangle,
  CheckCircle2,
  FileQuestion,
  RefreshCw,
  BookOpen,
  Loader2,
  AlertCircle,
} from "lucide-react";
import { toast } from "sonner";
import { ColumnDef } from "@tanstack/react-table";
import {
  PageContainer,
  PageHeader,
  PageContent,
  DataTable,
  DataTableColumnHeader,
  EmptyState,
  StatusBadge,
  BarcodeInput,
} from "@/components/shared";

interface PatronInfo {
  id: number;
  barcode: string;
  firstName: string;
  lastName: string;
  claimsReturnedCount: number;
  claimsNeverCheckedOutCount: number;
}

interface CheckoutItem {
  id: number;
  circId: number;
  barcode: string;
  title: string;
  author: string;
  callNumber: string;
  dueDate: string;
  checkoutDate: string;
  isOverdue: boolean;
  fineAmount: number;
  status: "out" | "overdue" | "claims_returned" | "claims_never_checked_out";
  claimDate?: string;
}

const RESOLUTION_OPTIONS = [
  { value: "found_in_library", label: "Found in Library" },
  { value: "returned_by_patron", label: "Returned by Patron" },
  { value: "mark_lost", label: "Mark as Lost" },
  { value: "mark_missing", label: "Mark as Missing" },
];

const MAX_CLAIMS_WARNING = 3;

export default function ClaimsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [patronBarcode, setPatronBarcode] = useState(searchParams.get("patron") || "");
  const [patron, setPatron] = useState<PatronInfo | null>(null);
  const [itemsOut, setItemsOut] = useState<CheckoutItem[]>([]);
  const [claimedItems, setClaimedItems] = useState<CheckoutItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedItem, setSelectedItem] = useState<CheckoutItem | null>(null);

  const [showClaimsReturnedDialog, setShowClaimsReturnedDialog] = useState(false);
  const [showClaimsNeverCheckedOutDialog, setShowClaimsNeverCheckedOutDialog] = useState(false);
  const [showResolveDialog, setShowResolveDialog] = useState(false);
  const [showEditCountsDialog, setShowEditCountsDialog] = useState(false);

  const [claimDate, setClaimDate] = useState("");
  const [adjustFines, setAdjustFines] = useState(true);
  const [resolution, setResolution] = useState("");
  const [refundFee, setRefundFee] = useState(false);
  const [newClaimsReturnedCount, setNewClaimsReturnedCount] = useState(0);
  const [newClaimsNeverCheckedOutCount, setNewClaimsNeverCheckedOutCount] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);

  const loadPatron = useCallback(async () => {
    if (!patronBarcode.trim()) return;

    setIsLoading(true);
    try {
      const patronRes = await fetchWithAuth(
        `/api/evergreen/patrons?q=${encodeURIComponent(patronBarcode)}&type=barcode`
      );
      const patronData = await patronRes.json();

      if (!patronData.ok || !patronData.patrons?.length) {
        toast.error("Patron not found");
        setPatron(null);
        setItemsOut([]);
        setClaimedItems([]);
        setIsLoading(false);
        return;
      }

      const p = patronData.patrons[0];

      const claimsRes = await fetchWithAuth(`/api/evergreen/claims?patron_id=${p.id}`);
      const claimsData = await claimsRes.json();

      const checkoutsRes = await fetchWithAuth(`/api/evergreen/circulation?patron_id=${p.id}`);
      const checkoutsData = await checkoutsRes.json();

      setPatron({
        id: p.id,
        barcode: p.barcode,
        firstName: p.firstName,
        lastName: p.lastName,
        claimsReturnedCount: claimsData.counts?.claimsReturned || 0,
        claimsNeverCheckedOutCount: claimsData.counts?.claimsNeverCheckedOut || 0,
      });

      const checkedOut = (checkoutsData.checkouts?.out || []).map((item: any) => ({
        id: item.id,
        circId: item.id,
        barcode: item.barcode,
        title: item.title,
        author: item.author,
        callNumber: item.callNumber,
        dueDate: item.dueDate,
        checkoutDate: item.checkoutDate,
        isOverdue: item.isOverdue,
        fineAmount: item.fineAmount || 0,
        status: item.isOverdue ? "overdue" : "out",
      }));

      const claimed = (claimsData.claims?.returned || []).map((item: any) => ({
        id: item.id,
        circId: item.circ_id,
        barcode: item.barcode,
        title: item.title,
        author: item.author,
        callNumber: item.callNumber,
        dueDate: item.dueDate,
        checkoutDate: item.checkoutDate,
        isOverdue: false,
        fineAmount: item.fineAmount || 0,
        status:
          item.status === "claims_never_checked_out"
            ? "claims_never_checked_out"
            : "claims_returned",
        claimDate: item.claimDate,
      }));

      setItemsOut(checkedOut);
      setClaimedItems(claimed);
    } catch (_error) {
      toast.error("Failed to load patron");
    } finally {
      setIsLoading(false);
    }
  }, [patronBarcode]);

  const handleClaimsReturned = async () => {
    if (!selectedItem || !patron) return;

    setIsProcessing(true);
    try {
      const res = await fetchWithAuth("/api/evergreen/claims", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "claims_returned",
          patronId: patron.id,
          circId: selectedItem.circId,
          copyBarcode: selectedItem.barcode,
          claimDate,
          adjustFines,
        }),
      });

      const data = await res.json();

      if (data.ok) {
        toast.success("Marked as claims returned");
        setShowClaimsReturnedDialog(false);
        loadPatron();
      } else {
        toast.error("Failed to mark claims returned", { description: data.error });
      }
    } catch (_error) {
      toast.error("Failed to mark claims returned");
    }
    setIsProcessing(false);
  };

  const handleClaimsNeverCheckedOut = async () => {
    if (!selectedItem || !patron) return;

    setIsProcessing(true);
    try {
      const res = await fetchWithAuth("/api/evergreen/claims", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "claims_never_checked_out",
          patronId: patron.id,
          circId: selectedItem.circId,
          copyBarcode: selectedItem.barcode,
        }),
      });

      const data = await res.json();

      if (data.ok) {
        toast.success("Marked as claims never checked out");
        setShowClaimsNeverCheckedOutDialog(false);
        loadPatron();
      } else {
        toast.error("Failed to mark claims never checked out", { description: data.error });
      }
    } catch (_error) {
      toast.error("Failed to mark claims never checked out");
    }
    setIsProcessing(false);
  };

  const handleResolveClaim = async () => {
    if (!selectedItem || !patron || !resolution) return;

    setIsProcessing(true);
    try {
      const res = await fetchWithAuth("/api/evergreen/claims", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "resolve_claim",
          patronId: patron.id,
          circId: selectedItem.circId,
          copyBarcode: selectedItem.barcode,
          resolution,
          refundFee,
        }),
      });

      const data = await res.json();

      if (data.ok) {
        toast.success("Claim resolved");
        setShowResolveDialog(false);
        loadPatron();
      } else {
        toast.error("Failed to resolve claim", { description: data.error });
      }
    } catch (_error) {
      toast.error("Failed to resolve claim");
    }
    setIsProcessing(false);
  };

  const handleUpdateCounts = async () => {
    if (!patron) return;

    setIsProcessing(true);
    try {
      const res = await fetchWithAuth("/api/evergreen/claims", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          patronId: patron.id,
          claimsReturnedCount: newClaimsReturnedCount,
          claimsNeverCheckedOutCount: newClaimsNeverCheckedOutCount,
        }),
      });

      const data = await res.json();

      if (data.ok) {
        toast.success("Claim counts updated");
        setShowEditCountsDialog(false);
        loadPatron();
      } else {
        toast.error("Failed to update counts", { description: data.error });
      }
    } catch (_error) {
      toast.error("Error updating counts");
    }
    setIsProcessing(false);
  };

  const formatDate = (dateStr: string) => {
    if (!dateStr) return "-";
    return new Date(dateStr).toLocaleDateString();
  };

  const isOverThreshold =
    patron &&
    (patron.claimsReturnedCount >= MAX_CLAIMS_WARNING ||
      patron.claimsNeverCheckedOutCount >= MAX_CLAIMS_WARNING);

  const itemsOutColumns = useMemo<ColumnDef<CheckoutItem>[]>(
    () => [
      {
        accessorKey: "title",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Title" />,
        cell: ({ row }) => (
          <div className="space-y-0.5">
            <div className="font-medium">{row.original.title}</div>
            <div className="text-xs text-muted-foreground">{row.original.author}</div>
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
          <span
            className={row.original.isOverdue ? "text-rose-600 font-medium text-xs" : "text-xs"}
          >
            {formatDate(row.original.dueDate)}
          </span>
        ),
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) =>
          row.original.isOverdue ? (
            <StatusBadge label="Overdue" status="error" showIcon />
          ) : (
            <StatusBadge label="Out" status="info" showIcon />
          ),
      },
      {
        id: "actions",
        header: "Actions",
        cell: ({ row }) => (
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setSelectedItem(row.original);
                setShowClaimsReturnedDialog(true);
              }}
            >
              Claim Returned
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="text-rose-600"
              onClick={() => {
                setSelectedItem(row.original);
                setShowClaimsNeverCheckedOutDialog(true);
              }}
            >
              Never Had
            </Button>
          </div>
        ),
      },
    ],
    []
  );

  const claimedColumns = useMemo<ColumnDef<CheckoutItem>[]>(
    () => [
      {
        accessorKey: "title",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Title" />,
        cell: ({ row }) => (
          <div className="space-y-0.5">
            <div className="font-medium">{row.original.title}</div>
            <div className="text-xs text-muted-foreground">{row.original.author}</div>
          </div>
        ),
      },
      {
        accessorKey: "barcode",
        header: "Barcode",
        cell: ({ row }) => <span className="font-mono text-xs">{row.original.barcode}</span>,
      },
      {
        accessorKey: "claimDate",
        header: "Claim Date",
        cell: ({ row }) => (
          <span className="text-xs">{formatDate(row.original.claimDate || "")}</span>
        ),
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => (
          <StatusBadge
            label={
              row.original.status === "claims_returned" ? "Claimed Returned" : "Never Checked Out"
            }
            status="warning"
            showIcon
          />
        ),
      },
      {
        id: "actions",
        header: "Actions",
        cell: ({ row }) => (
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setSelectedItem(row.original);
              setShowResolveDialog(true);
            }}
          >
            Resolve
          </Button>
        ),
      },
    ],
    []
  );

  return (
    <PageContainer>
      <PageHeader
        title="Claims Management"
        subtitle="Track claims returned and never‑checked‑out items."
        breadcrumbs={[{ label: "Circulation" }, { label: "Claims" }]}
        actions={[{ label: "Refresh", onClick: loadPatron, icon: RefreshCw, loading: isLoading }]}
      >
        <div className="flex flex-wrap gap-2">
          <Badge variant="secondary" className="rounded-full">
            Threshold: {MAX_CLAIMS_WARNING}
          </Badge>
          {isOverThreshold && (
            <Badge variant="destructive" className="rounded-full">
              High Claims
            </Badge>
          )}
        </div>
      </PageHeader>

      <PageContent className="space-y-6">
        <Card className="rounded-2xl border-border/70 shadow-sm">
          <CardContent className="p-5 space-y-3">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
              Patron
            </h3>
            <BarcodeInput
              label="Patron Barcode"
              placeholder="Enter patron barcode..."
              value={patronBarcode}
              onChange={setPatronBarcode}
              onSubmit={loadPatron}
              isLoading={isLoading}
            />
            <div className="flex gap-2">
              <Button onClick={loadPatron} disabled={isLoading}>
                {isLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    <Search className="h-4 w-4 mr-1" />
                    Load Patron
                  </>
                )}
              </Button>
              <Button variant="outline" onClick={() => setPatronBarcode("")}>
                Clear
              </Button>
            </div>
          </CardContent>
        </Card>

        {patron && (
          <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
            <Card className="rounded-2xl border-border/70 shadow-sm">
              <CardContent className="p-5">
                <Tabs defaultValue="items_out">
                  <TabsList>
                    <TabsTrigger value="items_out" className="gap-2">
                      <BookOpen className="h-4 w-4" />
                      Items Out ({itemsOut.length})
                    </TabsTrigger>
                    <TabsTrigger value="claimed" className="gap-2">
                      <FileQuestion className="h-4 w-4" />
                      Claimed Items ({claimedItems.length})
                    </TabsTrigger>
                  </TabsList>

                  <TabsContent value="items_out" className="mt-4">
                    <DataTable
                      columns={itemsOutColumns}
                      data={itemsOut}
                      searchable
                      searchPlaceholder="Search checkouts..."
                      emptyState={
                        <EmptyState
                          icon={CheckCircle2}
                          title="No items currently checked out"
                          description="This patron has no items out."
                        />
                      }
                    />
                  </TabsContent>

                  <TabsContent value="claimed" className="mt-4">
                    <DataTable
                      columns={claimedColumns}
                      data={claimedItems}
                      searchable
                      searchPlaceholder="Search claimed items..."
                      emptyState={
                        <EmptyState
                          icon={FileQuestion}
                          title="No claimed items"
                          description="Claims will appear here once recorded."
                        />
                      }
                    />
                  </TabsContent>
                </Tabs>
              </CardContent>
            </Card>

            <div className="space-y-4">
              <Card className="rounded-2xl border-border/70 shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Patron Summary</CardTitle>
                  <CardDescription className="font-mono text-xs">{patron.barcode}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="text-sm font-semibold">
                    {patron.lastName}, {patron.firstName}
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-center">
                    <div className="rounded-xl bg-amber-50 dark:bg-amber-950 p-2">
                      <div className="text-lg font-bold text-amber-600">
                        {patron.claimsReturnedCount}
                      </div>
                      <div className="text-[10px] text-muted-foreground">Claims Returned</div>
                    </div>
                    <div className="rounded-xl bg-rose-50 dark:bg-rose-950 p-2">
                      <div className="text-lg font-bold text-rose-600">
                        {patron.claimsNeverCheckedOutCount}
                      </div>
                      <div className="text-[10px] text-muted-foreground">Never Checked Out</div>
                    </div>
                  </div>
                  {isOverThreshold && (
                    <div className="rounded-xl border border-rose-200 bg-rose-50 p-2 text-xs text-rose-700">
                      <AlertTriangle className="h-3 w-3 inline mr-1" />
                      Claims threshold exceeded. Review the account.
                    </div>
                  )}
                  <Button variant="outline" size="sm" onClick={() => setShowEditCountsDialog(true)}>
                    Edit Claim Counts
                  </Button>
                </CardContent>
              </Card>

              <Card className="rounded-2xl border-border/70 shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Activity</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-xs">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Items Out</span>
                    <span className="font-medium">{itemsOut.length}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Overdue</span>
                    <span className="font-medium text-rose-600">
                      {itemsOut.filter((i) => i.isOverdue).length}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Claimed Items</span>
                    <span className="font-medium text-amber-600">{claimedItems.length}</span>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        )}

        {!patron && (
          <EmptyState
            icon={FileQuestion}
            title="Enter a patron barcode"
            description="Load a patron to manage claims returned or never checked out items."
            action={{
              label: "Evergreen setup checklist",
              onClick: () => router.push("/staff/help#evergreen-setup"),
            }}
            secondaryAction={{
              label: "Search patrons",
              onClick: () => router.push("/staff/patrons"),
            }}
          />
        )}
      </PageContent>

      <Dialog open={showClaimsReturnedDialog} onOpenChange={setShowClaimsReturnedDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-amber-600" />
              Mark Claims Returned
            </DialogTitle>
            <DialogDescription>The patron claims they returned this item.</DialogDescription>
          </DialogHeader>
          {selectedItem && (
            <div className="space-y-4">
              <div className="rounded-lg bg-muted/50 p-3 text-sm">
                <div className="font-medium">{selectedItem.title}</div>
                <div className="text-muted-foreground text-xs">{selectedItem.author}</div>
                <div className="font-mono text-xs mt-1">{selectedItem.barcode}</div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="claim-date">Claim date</Label>
                <Input
                  id="claim-date"
                  type="date"
                  value={claimDate}
                  onChange={(e) => setClaimDate(e.target.value)}
                  max={new Date().toISOString().split("T")[0]}
                />
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="adjustFines"
                  checked={adjustFines}
                  onCheckedChange={(c) => setAdjustFines(c as boolean)}
                />
                <Label htmlFor="adjustFines" className="text-sm">
                  Adjust overdue fines based on claim date
                </Label>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowClaimsReturnedDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleClaimsReturned} disabled={isProcessing}>
              {isProcessing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              Mark Returned
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={showClaimsNeverCheckedOutDialog}
        onOpenChange={setShowClaimsNeverCheckedOutDialog}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Claims Never Checked Out</DialogTitle>
            <DialogDescription>The patron says they never checked this item out.</DialogDescription>
          </DialogHeader>
          {selectedItem && (
            <div className="rounded-lg bg-muted/50 p-3 text-sm">
              <div className="font-medium">{selectedItem.title}</div>
              <div className="text-muted-foreground text-xs">{selectedItem.author}</div>
              <div className="font-mono text-xs mt-1">{selectedItem.barcode}</div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowClaimsNeverCheckedOutDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleClaimsNeverCheckedOut} disabled={isProcessing}>
              {isProcessing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              Mark Never Checked Out
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showResolveDialog} onOpenChange={setShowResolveDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Resolve Claim</DialogTitle>
            <DialogDescription>Choose how to resolve this claim.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="resolution">Resolution</Label>
              <Select id="resolution" value={resolution} onValueChange={setResolution}>
                <SelectTrigger>
                  <SelectValue placeholder="Select resolution" />
                </SelectTrigger>
                <SelectContent>
                  {RESOLUTION_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center space-x-2">
              <Checkbox
                id="refundFee"
                checked={refundFee}
                onCheckedChange={(c) => setRefundFee(c as boolean)}
              />
              <Label htmlFor="refundFee">Refund fees if applicable</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowResolveDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleResolveClaim} disabled={isProcessing || !resolution}>
              {isProcessing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              Resolve Claim
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showEditCountsDialog} onOpenChange={setShowEditCountsDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Claim Counts</DialogTitle>
            <DialogDescription>Adjust claim counts for this patron.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="claims-returned-count">Claims Returned Count</Label>
              <Input
                id="claims-returned-count"
                type="number"
                value={newClaimsReturnedCount}
                onChange={(e) => setNewClaimsReturnedCount(parseInt(e.target.value) || 0)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="claims-never-checked-out-count">Claims Never Checked Out Count</Label>
              <Input
                id="claims-never-checked-out-count"
                type="number"
                value={newClaimsNeverCheckedOutCount}
                onChange={(e) => setNewClaimsNeverCheckedOutCount(parseInt(e.target.value) || 0)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditCountsDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleUpdateCounts} disabled={isProcessing}>
              {isProcessing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              Update Counts
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageContainer>
  );
}
