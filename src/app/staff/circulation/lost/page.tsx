"use client";

import { fetchWithAuth } from "@/lib/client-fetch";

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { ColumnDef } from "@tanstack/react-table";
import { toast } from "sonner";
import { clientLogger } from "@/lib/client-logger";
import {

  PageContainer,
  PageHeader,
  PageContent,
  BarcodeInput,
  DataTable,
  EmptyState,
  ErrorMessage,
  ItemStatusBadge,
  StatusBadge,
  ConfirmDialog,
} from "@/components/shared";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  AlertTriangle,
  DollarSign,
  Package,
  PackageX,
  Search,
  Undo2,
  XCircle,
} from "lucide-react";

interface PatronInfo {
  id: number;
  barcode: string;
  displayName: string;
  firstName?: string;
  lastName?: string;
  active?: boolean;
  barred?: boolean;
}

interface LostItem {
  id: number;
  target_copy: number;
  copy_barcode?: string;
  title?: string;
  due_date?: string;
  stop_fines?: string;
  stop_fines_time?: string;
}

interface Bill {
  id: number;
  xact: number;
  amount: number;
  balance_owed: number;
  billing_type: string;
  create_date: string;
  note?: string;
  voided?: boolean;
}

interface ItemInfo {
  id: number;
  barcode: string;
  status: number;
  statusLabel: string;
  callNumber?: string;
  title?: string;
  price?: number;
  isLost: boolean;
  isMissing: boolean;
  isDamaged: boolean;
  currentCirc?: {
    id: number;
    patronId: number;
    dueDate: string;
    checkoutDate: string;
  } | null;
}

function formatDate(date?: string | null) {
  if (!date) return "—";
  try {
    return format(new Date(date), "MMM d, yyyy");
  } catch (_error) {
    return "—";
  }
}

export default function LostMissingDamagedPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState("item");
  const [patronBarcode, setPatronBarcode] = useState("");
  const [itemBarcode, setItemBarcode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [patron, setPatron] = useState<PatronInfo | null>(null);
  const [lostItems, setLostItems] = useState<LostItem[]>([]);
  const [bills, setBills] = useState<Bill[]>([]);
  const [summary, setSummary] = useState<{ totalLostItems: number; totalOwed: number } | null>(null);
  const [selectedItem, setSelectedItem] = useState<ItemInfo | null>(null);

  const [markLostOpen, setMarkLostOpen] = useState(false);
  const [markMissingOpen, setMarkMissingOpen] = useState(false);
  const [markDamagedOpen, setMarkDamagedOpen] = useState(false);
  const [checkinLostOpen, setCheckinLostOpen] = useState(false);
  const [voidBillOpen, setVoidBillOpen] = useState(false);
  const [selectedBill, setSelectedBill] = useState<Bill | null>(null);

  const [damageAmount, setDamageAmount] = useState("");
  const [damageNote, setDamageNote] = useState("");
  const [voidNote, setVoidNote] = useState("");
  const [voidOverdues, setVoidOverdues] = useState(false);

  const searchPatron = useCallback(async (barcode: string) => {
    if (!barcode.trim()) return;

    setLoading(true);
    setError(null);

    try {
      const patronRes = await fetchWithAuth(`/api/evergreen/patrons?barcode=${encodeURIComponent(barcode.trim())}`
      );
      const patronData = await patronRes.json();

      if (!patronData.ok || !patronData.patron) {
        setError("Patron not found");
        setPatron(null);
        setLostItems([]);
        setBills([]);
        setSummary(null);
        toast.error("Patron not found");
        return;
      }

      const p = patronData.patron;
      const displayName = p.family_name
        ? `${p.family_name}, ${p.first_given_name || ""}`.trim()
        : p.first_given_name || p.barcode;

      const patronId = p.id;

      const lostRes = await fetchWithAuth(`/api/evergreen/lost?patron_id=${patronId}`);
      const lostData = await lostRes.json();

      if (lostData.ok) {
        setPatron({
          id: patronId,
          barcode: p.barcode || barcode,
          displayName,
          firstName: p.first_given_name,
          lastName: p.family_name,
          active: p.active,
          barred: p.barred,
        });
        setLostItems(lostData.lostItems || []);
        setBills(lostData.lostBills || []);
        setSummary(lostData.summary || null);
      } else {
        setError(lostData.error || "Failed to load patron data");
        toast.error("Failed to load patron data");
      }
    } catch (err) {
      setError("Failed to search patron");
      toast.error("Failed to search patron");
      clientLogger.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  const searchItem = useCallback(async (barcode: string) => {
    if (!barcode.trim()) return;

    setLoading(true);
    setError(null);

    try {
      const res = await fetchWithAuth(`/api/evergreen/lost?item_barcode=${encodeURIComponent(barcode.trim())}`);
      const data = await res.json();

      if (data.ok) {
        setSelectedItem(data.item);
      } else {
        setError(data.error || "Item not found");
        setSelectedItem(null);
        toast.error(data.error || "Item not found");
      }
    } catch (err) {
      setError("Failed to search item");
      toast.error("Failed to search item");
      clientLogger.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleMarkLost = async () => {
    if (!selectedItem?.currentCirc?.id) {
      setError("No active circulation found for this item");
      return;
    }

    setLoading(true);
    try {
      const res = await fetchWithAuth("/api/evergreen/lost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "mark_lost",
          circId: selectedItem.currentCirc.id,
        }),
      });

      const data = await res.json();

      if (data.ok) {
        setMarkLostOpen(false);
        await searchItem(selectedItem.barcode);
        toast.success("Item marked lost", {
          description: `Total billed: $${data.totalBilled?.toFixed(2) || "0.00"}`,
        });
      } else {
        setError(data.error || "Failed to mark item as lost");
        toast.error(data.error || "Failed to mark item as lost");
      }
    } catch (err) {
      setError("Failed to mark item as lost");
      toast.error("Failed to mark item as lost");
      clientLogger.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleMarkMissing = async () => {
    if (!selectedItem) return;

    setLoading(true);
    try {
      const res = await fetchWithAuth("/api/evergreen/lost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "mark_missing",
          copyId: selectedItem.id,
        }),
      });

      const data = await res.json();

      if (data.ok) {
        setMarkMissingOpen(false);
        await searchItem(selectedItem.barcode);
        toast.success("Item marked missing");
      } else {
        setError(data.error || "Failed to mark item as missing");
        toast.error(data.error || "Failed to mark item as missing");
      }
    } catch (err) {
      setError("Failed to mark item as missing");
      toast.error("Failed to mark item as missing");
      clientLogger.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleMarkDamaged = async () => {
    if (!selectedItem) return;

    setLoading(true);
    try {
      const res = await fetchWithAuth("/api/evergreen/lost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "mark_damaged",
          copyId: selectedItem.id,
          circId: selectedItem.currentCirc?.id,
          billAmount: damageAmount ? parseFloat(damageAmount) : undefined,
          billNote: damageNote || undefined,
        }),
      });

      const data = await res.json();

      if (data.ok) {
        setMarkDamagedOpen(false);
        setDamageAmount("");
        setDamageNote("");
        await searchItem(selectedItem.barcode);
        toast.success("Item marked damaged", { description: data.message });
      } else {
        setError(data.error || "Failed to mark item as damaged");
        toast.error(data.error || "Failed to mark item as damaged");
      }
    } catch (err) {
      setError("Failed to mark item as damaged");
      toast.error("Failed to mark item as damaged");
      clientLogger.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleCheckinLost = async () => {
    if (!selectedItem) return;

    setLoading(true);
    try {
      const res = await fetchWithAuth("/api/evergreen/lost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "checkin_lost",
          copyBarcode: selectedItem.barcode,
          voidOverdues,
        }),
      });

      const data = await res.json();

      if (data.ok) {
        setCheckinLostOpen(false);
        setVoidOverdues(false);
        await searchItem(selectedItem.barcode);
        toast.success("Item checked in", { description: data.message });
      } else {
        setError(data.error || "Failed to check in lost item");
        toast.error(data.error || "Failed to check in lost item");
      }
    } catch (err) {
      setError("Failed to check in lost item");
      toast.error("Failed to check in lost item");
      clientLogger.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleVoidBill = async () => {
    if (!selectedBill) return;

    setLoading(true);
    try {
      const res = await fetchWithAuth("/api/evergreen/lost", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "void_bill",
          billId: selectedBill.id,
          note: voidNote || undefined,
        }),
      });

      const data = await res.json();

      if (data.ok) {
        setVoidBillOpen(false);
        setSelectedBill(null);
        setVoidNote("");
        if (patron?.barcode) {
          await searchPatron(patron.barcode);
        }
        toast.success("Bill voided successfully");
      } else {
        setError(data.error || "Failed to void bill");
        toast.error(data.error || "Failed to void bill");
      }
    } catch (err) {
      setError("Failed to void bill");
      toast.error("Failed to void bill");
      clientLogger.error(err);
    } finally {
      setLoading(false);
    }
  };

  const lostColumns = useMemo<ColumnDef<LostItem>[]>(
    () => [
      {
        accessorKey: "copy_barcode",
        header: "Barcode",
        cell: ({ row }) => (
          <span className="font-mono text-sm">
            {row.original.copy_barcode || "—"}
          </span>
        ),
      },
      {
        accessorKey: "title",
        header: "Title",
        cell: ({ row }) => row.original.title || "Unknown",
      },
      {
        accessorKey: "due_date",
        header: "Due Date",
        cell: ({ row }) => formatDate(row.original.due_date),
      },
      {
        accessorKey: "stop_fines_time",
        header: "Lost Date",
        cell: ({ row }) => formatDate(row.original.stop_fines_time),
      },
      {
        id: "actions",
        header: "Actions",
        cell: ({ row }) => (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              const barcode = row.original.copy_barcode || "";
              if (!barcode) return;
              setItemBarcode(barcode);
              setActiveTab("item");
              searchItem(barcode);
            }}
          >
            View
          </Button>
        ),
      },
    ],
    [searchItem]
  );

  const billColumns = useMemo<ColumnDef<Bill>[]>(
    () => [
      {
        accessorKey: "billing_type",
        header: "Type",
      },
      {
        accessorKey: "amount",
        header: "Amount",
        cell: ({ row }) => `$${parseFloat(String(row.original.amount)).toFixed(2)}`,
      },
      {
        accessorKey: "balance_owed",
        header: "Balance",
        cell: ({ row }) => (
          <span className="font-medium">
            ${parseFloat(String(row.original.balance_owed)).toFixed(2)}
          </span>
        ),
      },
      {
        accessorKey: "create_date",
        header: "Date",
        cell: ({ row }) => formatDate(row.original.create_date),
      },
      {
        id: "status",
        header: "Status",
        cell: ({ row }) => {
          const balance = parseFloat(String(row.original.balance_owed));
          if (row.original.voided) {
            return <StatusBadge label="Voided" status="muted" />;
          }
          if (balance <= 0) {
            return <StatusBadge label="Paid" status="success" />;
          }
          return <StatusBadge label="Unpaid" status="error" />;
        },
      },
      {
        id: "actions",
        header: "Actions",
        cell: ({ row }) => {
          const balance = parseFloat(String(row.original.balance_owed));
          if (row.original.voided || balance <= 0) return null;
          return (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setSelectedBill(row.original);
                setVoidBillOpen(true);
              }}
            >
              <XCircle className="h-4 w-4 mr-1" />
              Void
            </Button>
          );
        },
      },
    ],
    []
  );

  return (
    <PageContainer>
      <PageHeader
        title="Lost, Missing & Damaged"
        subtitle="Process lost, missing, and damaged items with audit-ready billing."
        breadcrumbs={[
          { label: "Circulation", href: "/staff/circulation/checkout" },
          { label: "Lost / Missing / Damaged" },
        ]}
      />
      <PageContent>
        {error && (
          <div className="mb-4">
            <ErrorMessage message={error} onRetry={() => setError(null)} />
          </div>
        )}

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList>
            <TabsTrigger value="item" className="flex items-center gap-2">
              <PackageX className="h-4 w-4" />
              Item Lookup
            </TabsTrigger>
            <TabsTrigger value="patron" className="flex items-center gap-2">
              <DollarSign className="h-4 w-4" />
              Patron Lost Items
            </TabsTrigger>
          </TabsList>

          <TabsContent value="item" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Find Item</CardTitle>
                <CardDescription>Scan a barcode to view status and take action.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <BarcodeInput
                  label="Item Barcode"
                  placeholder="Scan or enter item barcode"
                  value={itemBarcode}
                  onChange={setItemBarcode}
                  onSubmit={(value) => searchItem(value)}
                  isLoading={loading}
                  autoFocus
                />
              </CardContent>
            </Card>

            {selectedItem && (
              <Card>
                <CardHeader>
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <CardTitle className="flex items-center gap-2">
                        {selectedItem.title || "Unknown Title"}
                        <ItemStatusBadge statusId={selectedItem.status} />
                      </CardTitle>
                      <CardDescription className="mt-1">
                        Barcode: {selectedItem.barcode}
                        {selectedItem.callNumber ? ` • Call #: ${selectedItem.callNumber}` : ""}
                        {selectedItem.price ? ` • Price: $${selectedItem.price}` : ""}
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {selectedItem.currentCirc && (
                    <div className="rounded-lg border bg-muted/40 p-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium">Currently Checked Out</p>
                          <p className="text-sm text-muted-foreground">
                            Patron ID: {selectedItem.currentCirc.patronId}
                          </p>
                        </div>
                        <StatusBadge
                          label={`Due ${formatDate(selectedItem.currentCirc.dueDate)}`}
                          status="warning"
                        />
                      </div>
                    </div>
                  )}

                  <div className="flex flex-wrap gap-2">
                    {selectedItem.currentCirc && !selectedItem.isLost && (
                      <Button
                        variant="destructive"
                        onClick={() => setMarkLostOpen(true)}
                        disabled={loading}
                      >
                        <AlertTriangle className="h-4 w-4 mr-2" />
                        Mark Lost
                      </Button>
                    )}

                    {!selectedItem.isMissing && !selectedItem.currentCirc && (
                      <Button
                        variant="secondary"
                        onClick={() => setMarkMissingOpen(true)}
                        disabled={loading}
                      >
                        <Package className="h-4 w-4 mr-2" />
                        Mark Missing
                      </Button>
                    )}

                    {!selectedItem.isDamaged && (
                      <Button
                        variant="outline"
                        className="border-orange-500 text-orange-500 hover:bg-orange-50"
                        onClick={() => setMarkDamagedOpen(true)}
                        disabled={loading}
                      >
                        <AlertTriangle className="h-4 w-4 mr-2" />
                        Mark Damaged
                      </Button>
                    )}

                    {(selectedItem.isLost || selectedItem.isMissing) && (
                      <Button
                        variant="default"
                        onClick={() => setCheckinLostOpen(true)}
                        disabled={loading}
                      >
                        <Undo2 className="h-4 w-4 mr-2" />
                        Check In (Found)
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="patron" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Find Patron</CardTitle>
                <CardDescription>Scan a patron card to review lost items and bills.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <BarcodeInput
                  label="Patron Barcode"
                  placeholder="Scan or enter patron barcode"
                  value={patronBarcode}
                  onChange={setPatronBarcode}
                  onSubmit={(value) => searchPatron(value)}
                  isLoading={loading}
                />
              </CardContent>
            </Card>

            {patron && (
              <Card>
                <CardHeader>
                  <CardTitle>{patron.displayName}</CardTitle>
                  <CardDescription>Barcode: {patron.barcode}</CardDescription>
                </CardHeader>
                <CardContent>
                  {summary && (
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="rounded-lg border bg-muted/40 p-4">
                        <p className="text-2xl font-semibold">{summary.totalLostItems}</p>
                        <p className="text-sm text-muted-foreground">Lost Items</p>
                      </div>
                      <div className="rounded-lg border bg-muted/40 p-4">
                        <p className="text-2xl font-semibold text-destructive">
                          ${summary.totalOwed.toFixed(2)}
                        </p>
                        <p className="text-sm text-muted-foreground">Total Owed</p>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {patron && lostItems.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>Lost Items</CardTitle>
                </CardHeader>
                <CardContent>
                  <DataTable
                    columns={lostColumns}
                    data={lostItems}
                    searchable={false}
                    paginated={false}
                    emptyState={<EmptyState title="No lost items" description="This patron has no lost items." />}
                  />
                </CardContent>
              </Card>
            )}

            {patron && bills.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>Lost Item Bills</CardTitle>
                </CardHeader>
                <CardContent>
                  <DataTable
                    columns={billColumns}
                    data={bills}
                    searchable={false}
                    paginated={false}
                    emptyState={<EmptyState title="No bills" description="No lost item bills found." />}
                  />
                </CardContent>
              </Card>
            )}

            {patron && lostItems.length === 0 && bills.length === 0 && (
              <Card>
                <CardContent className="py-10">
                  <EmptyState
                    title="No lost items or bills"
                    description="This patron has no lost items or outstanding lost item bills."
                    icon={Search}
                    action={{ label: "Open patron record", onClick: () => router.push(`/staff/patrons/${patron.id}`) }}
                    secondaryAction={{ label: "Seed demo data", onClick: () => router.push("/staff/help#demo-data") }}
                  />
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>
      </PageContent>

      {/* Mark Lost Dialog */}
      <ConfirmDialog
        open={markLostOpen}
        onOpenChange={setMarkLostOpen}
        title="Mark Item as Lost"
        description="This will mark the item as lost and apply replacement and processing fees based on policy."
        variant="danger"
        confirmText="Mark Lost"
        onConfirm={handleMarkLost}
        isLoading={loading}
      >
        {selectedItem && (
          <div className="space-y-2">
            <div className="rounded-lg border bg-muted/40 p-3">
              <p className="font-medium">{selectedItem.title}</p>
              <p className="text-sm text-muted-foreground">Barcode: {selectedItem.barcode}</p>
            </div>
            <p className="text-sm text-muted-foreground">
              Item price: {selectedItem.price ? `$${selectedItem.price}` : "N/A"}
            </p>
          </div>
        )}
      </ConfirmDialog>

      {/* Mark Missing Dialog */}
      <ConfirmDialog
        open={markMissingOpen}
        onOpenChange={setMarkMissingOpen}
        title="Mark Item as Missing"
        description="Mark this item missing from shelf inventory. No billing will be generated."
        variant="warning"
        confirmText="Mark Missing"
        onConfirm={handleMarkMissing}
        isLoading={loading}
      >
        {selectedItem && (
          <div className="rounded-lg border bg-muted/40 p-3">
            <p className="font-medium">{selectedItem.title}</p>
            <p className="text-sm text-muted-foreground">Barcode: {selectedItem.barcode}</p>
          </div>
        )}
      </ConfirmDialog>

      {/* Mark Damaged Dialog */}
      <ConfirmDialog
        open={markDamagedOpen}
        onOpenChange={setMarkDamagedOpen}
        title="Mark Item as Damaged"
        description="Record damage and optionally bill the patron." 
        variant="warning"
        confirmText="Mark Damaged"
        onConfirm={handleMarkDamaged}
        isLoading={loading}
      >
        {selectedItem && (
          <div className="space-y-4">
            <div className="rounded-lg border bg-muted/40 p-3">
              <p className="font-medium">{selectedItem.title}</p>
              <p className="text-sm text-muted-foreground">Barcode: {selectedItem.barcode}</p>
            </div>
            {selectedItem.currentCirc ? (
              <>
                <div className="space-y-2">
                  <Label htmlFor="damageAmount">Damage Bill Amount (optional)</Label>
                  <Input
                    id="damageAmount"
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0.00"
                    value={damageAmount}
                    onChange={(e) => setDamageAmount(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="damageNote">Damage Notes</Label>
                  <Textarea
                    id="damageNote"
                    placeholder="Describe the damage..."
                    value={damageNote}
                    onChange={(e) => setDamageNote(e.target.value)}
                  />
                </div>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                Item is not currently checked out. It will be marked damaged without billing.
              </p>
            )}
          </div>
        )}
      </ConfirmDialog>

      {/* Checkin Lost Dialog */}
      <ConfirmDialog
        open={checkinLostOpen}
        onOpenChange={setCheckinLostOpen}
        title="Check In Found Item"
        description="Checking in a found item will update its status and may affect fines or refunds."
        confirmText="Check In"
        onConfirm={handleCheckinLost}
        isLoading={loading}
      >
        {selectedItem && (
          <div className="space-y-4">
            <div className="rounded-lg border bg-muted/40 p-3">
              <p className="font-medium">{selectedItem.title}</p>
              <p className="text-sm text-muted-foreground">Barcode: {selectedItem.barcode}</p>
            </div>
            {selectedItem.isLost && (
              <div className="flex items-center gap-2">
                <Checkbox
                  id="voidOverdues"
                  checked={voidOverdues}
                  onCheckedChange={(value) => setVoidOverdues(Boolean(value))}
                />
                <Label htmlFor="voidOverdues">Void overdue fines</Label>
              </div>
            )}
          </div>
        )}
      </ConfirmDialog>

      {/* Void Bill Dialog */}
      <ConfirmDialog
        open={voidBillOpen}
        onOpenChange={setVoidBillOpen}
        title="Void Bill"
        description="Voiding a bill removes it from the patron account."
        variant="danger"
        confirmText="Void Bill"
        onConfirm={handleVoidBill}
        isLoading={loading}
      >
        {selectedBill && (
          <div className="space-y-4">
            <div className="rounded-lg border bg-muted/40 p-3">
              <p className="font-medium">{selectedBill.billing_type}</p>
              <p className="text-sm text-muted-foreground">
                Amount: ${parseFloat(String(selectedBill.amount)).toFixed(2)}
                <br />
                Balance: ${parseFloat(String(selectedBill.balance_owed)).toFixed(2)}
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="voidNote">Reason for voiding</Label>
              <Textarea
                id="voidNote"
                placeholder="Enter reason..."
                value={voidNote}
                onChange={(e) => setVoidNote(e.target.value)}
              />
            </div>
          </div>
        )}
      </ConfirmDialog>
    </PageContainer>
  );
}
