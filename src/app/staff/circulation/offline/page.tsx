"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ColumnDef } from "@tanstack/react-table";
import { toast } from "sonner";
import {
  PageContainer,
  PageHeader,
  PageContent,
  BarcodeInput,
  DataTable,
  EmptyState,
  StatusBadge,
  ConfirmDialog,
} from "@/components/shared";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import {
  Wifi,
  WifiOff,
  Download,
  Upload,
  Clock,
  BookOpen,
  Package,
  RefreshCw,
  Home,
} from "lucide-react";
import { offlineService } from "@/lib/offline/service";
import { offlineDB, OfflineTransaction } from "@/lib/offline/db";

interface SessionItem {
  id: string;
  type: "checkout" | "checkin" | "renewal" | "in_house_use";
  barcode: string;
  patronBarcode?: string;
  dueDate?: string;
  status: "success" | "blocked" | "error";
  message: string;
  timestamp: Date;
}

function formatDateTime(date?: Date | string | null) {
  if (!date) return "—";
  const parsed = typeof date === "string" ? new Date(date) : date;
  return Number.isNaN(parsed.getTime()) ? "—" : parsed.toLocaleString();
}

export default function OfflineCirculationPage() {
  const router = useRouter();
  const [isOnline, setIsOnline] = useState(true);
  const [activeTab, setActiveTab] = useState("checkout");
  const [patronBarcode, setPatronBarcode] = useState("");
  const [itemBarcode, setItemBarcode] = useState("");
  const [customDueDate, setCustomDueDate] = useState("");
  const [backdateDate, setBackdateDate] = useState("");
  const [inHouseCount, setInHouseCount] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [sessionItems, setSessionItems] = useState<SessionItem[]>([]);
  const [pendingTransactions, setPendingTransactions] = useState<OfflineTransaction[]>([]);
  const [syncStatus, setSyncStatus] = useState({
    blockList: { lastSync: null as Date | null, count: 0 },
    patrons: { lastSync: null as Date | null, count: 0 },
    policies: { lastSync: null as Date | null, count: 0 },
    pendingTransactions: 0,
  });
  const [showBlockDialog, setShowBlockDialog] = useState(false);
  const [blockedPatronInfo, setBlockedPatronInfo] = useState<{
    barcode: string;
    reason: string;
  } | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [showErrorDialog, setShowErrorDialog] = useState(false);
  const [discardConfirmDialog, setDiscardConfirmDialog] = useState<{
    open: boolean;
    onConfirm: () => void;
  }>({ open: false, onConfirm: () => {} });
  const [selectedErrorTx, setSelectedErrorTx] = useState<OfflineTransaction | null>(null);

  const itemInputRef = useRef<HTMLInputElement>(null);

  const loadSyncStatus = useCallback(async () => {
    const status = await offlineService.getSyncStatus();
    setSyncStatus(status);
  }, []);

  const loadPendingTransactions = useCallback(async () => {
    const pending = await offlineService.getPendingTransactions();
    setPendingTransactions(pending);
  }, []);

  useEffect(() => {
    setIsOnline(navigator.onLine);

    const unsubscribe = offlineService.onOnlineStatusChange((online) => {
      setIsOnline(online);
      if (online) {
        toast.info("Connection restored", { description: "You can now upload transactions" });
      } else {
        toast.warning("Connection lost", { description: "Operating in offline mode" });
      }
    });

    loadSyncStatus();
    loadPendingTransactions();

    return unsubscribe;
  }, [loadSyncStatus, loadPendingTransactions]);

  const handleDownloadData = async () => {
    setIsSyncing(true);
    try {
      const result = await offlineService.downloadAllOfflineData();

      if (result.blockList.success) {
        toast.success("Block list downloaded", {
          description: `${result.blockList.count} records`,
        });
      } else if (result.blockList.error) {
        toast.error("Block list failed", { description: result.blockList.error });
      }

      if (result.patrons.success) {
        toast.success("Patron cache downloaded", {
          description: `${result.patrons.count} records`,
        });
      } else if (result.patrons.error) {
        toast.error("Patron cache failed", { description: result.patrons.error });
      }

      if (result.policies.success) {
        toast.success("Loan policies downloaded", {
          description: `${result.policies.count} policies`,
        });
      } else if (result.policies.error) {
        toast.error("Loan policies failed", { description: result.policies.error });
      }

      await loadSyncStatus();
    } catch (_error) {
      toast.error("Download failed", { description: "Could not download offline data" });
    }
    setIsSyncing(false);
  };

  const handleUploadTransactions = async () => {
    setIsUploading(true);
    try {
      const result = await offlineService.uploadTransactions();

      if (result.success) {
        toast.success("Upload complete", {
          description: `${result.processed} transactions processed`,
        });
      } else {
        toast.warning("Upload completed with errors", {
          description: `${result.processed} processed, ${result.errors} errors`,
        });
      }

      await loadPendingTransactions();
      await loadSyncStatus();
    } catch (_error) {
      toast.error("Upload failed", { description: "Could not upload transactions" });
    }
    setIsUploading(false);
  };

  const handleCheckout = async (overrideBlock: boolean = false) => {
    if (!patronBarcode.trim() || !itemBarcode.trim()) {
      toast.error("Missing data", { description: "Enter both patron and item barcodes" });
      return;
    }

    setIsLoading(true);
    try {
      const result = await offlineService.checkout(
        patronBarcode,
        itemBarcode,
        customDueDate || undefined,
        overrideBlock
      );

      if (result.blocked && !overrideBlock) {
        setBlockedPatronInfo({
          barcode: patronBarcode,
          reason: result.blockReason || "Unknown block",
        });
        setShowBlockDialog(true);
        setIsLoading(false);
        return;
      }

      setSessionItems((prev) => [
        {
          id: result.transactionId || `item-${Date.now()}`,
          type: "checkout",
          barcode: itemBarcode,
          patronBarcode,
          dueDate: result.dueDate,
          status: result.success ? "success" : "error",
          message: result.message,
          timestamp: new Date(),
        },
        ...prev,
      ]);

      if (result.success) {
        toast.success("Checkout recorded", {
          description: result.dueDate
            ? `Due: ${new Date(result.dueDate).toLocaleDateString()}`
            : undefined,
        });
        setItemBarcode("");
        await loadSyncStatus();
      } else {
        toast.error("Checkout failed", { description: result.message });
      }
    } catch (_error) {
      toast.error("Error", { description: "Could not process checkout" });
    }
    setIsLoading(false);
    itemInputRef.current?.focus();
  };

  const handleCheckin = async () => {
    if (!itemBarcode.trim()) {
      toast.error("Missing data", { description: "Enter item barcode" });
      return;
    }

    setIsLoading(true);
    try {
      const result = await offlineService.checkin(itemBarcode, backdateDate || undefined);

      setSessionItems((prev) => [
        {
          id: result.transactionId || `item-${Date.now()}`,
          type: "checkin",
          barcode: itemBarcode,
          status: result.success ? "success" : "error",
          message: result.message,
          timestamp: new Date(),
        },
        ...prev,
      ]);

      if (result.success) {
        toast.success("Checkin recorded");
        setItemBarcode("");
        await loadSyncStatus();
      } else {
        toast.error("Checkin failed", { description: result.message });
      }
    } catch (_error) {
      toast.error("Error", { description: "Could not process checkin" });
    }
    setIsLoading(false);
    itemInputRef.current?.focus();
  };

  const handleRenewal = async () => {
    if (!itemBarcode.trim()) {
      toast.error("Missing data", { description: "Enter item barcode" });
      return;
    }

    setIsLoading(true);
    try {
      const result = await offlineService.renew(itemBarcode, patronBarcode || undefined);

      setSessionItems((prev) => [
        {
          id: result.transactionId || `item-${Date.now()}`,
          type: "renewal",
          barcode: itemBarcode,
          patronBarcode: patronBarcode || undefined,
          status: result.success ? "success" : "error",
          message: result.message,
          timestamp: new Date(),
        },
        ...prev,
      ]);

      if (result.success) {
        toast.success("Renewal recorded");
        setItemBarcode("");
        await loadSyncStatus();
      } else {
        toast.error("Renewal failed", { description: result.message });
      }
    } catch (_error) {
      toast.error("Error", { description: "Could not process renewal" });
    }
    setIsLoading(false);
    itemInputRef.current?.focus();
  };

  const handleInHouseUse = async () => {
    if (!itemBarcode.trim()) {
      toast.error("Missing data", { description: "Enter item barcode" });
      return;
    }

    setIsLoading(true);
    try {
      const result = await offlineService.recordInHouseUse(itemBarcode, inHouseCount);

      setSessionItems((prev) => [
        {
          id: result.transactionId || `item-${Date.now()}`,
          type: "in_house_use",
          barcode: itemBarcode,
          status: result.success ? "success" : "error",
          message: result.message,
          timestamp: new Date(),
        },
        ...prev,
      ]);

      if (result.success) {
        toast.success("In-house use recorded", { description: `Count: ${inHouseCount}` });
        setItemBarcode("");
        await loadSyncStatus();
      } else {
        toast.error("Recording failed", { description: result.message });
      }
    } catch (_error) {
      toast.error("Error", { description: "Could not record in-house use" });
    }
    setIsLoading(false);
    itemInputRef.current?.focus();
  };

  const clearSession = () => {
    setSessionItems([]);
    setPatronBarcode("");
    setItemBarcode("");
  };

  const handleRetryTransaction = useCallback(
    async (tx: OfflineTransaction) => {
      try {
        // Reset status to pending and retry upload
        await offlineDB.updateTransactionStatus(tx.id, "pending");
        toast.info("Transaction queued for retry");
        await loadPendingTransactions();
        await loadSyncStatus();
      } catch (_error) {
        toast.error("Failed to retry transaction");
      }
    },
    [loadPendingTransactions, loadSyncStatus]
  );

  const doDiscardTransaction = useCallback(
    async (tx: OfflineTransaction) => {
      try {
        await offlineDB.updateTransactionStatus(tx.id, "processed");
        toast.success("Transaction discarded");
        await loadPendingTransactions();
        await loadSyncStatus();
      } catch (_error) {
        toast.error("Failed to discard transaction");
      }
    },
    [loadPendingTransactions, loadSyncStatus]
  );

  const handleDiscardTransaction = useCallback(
    async (tx: OfflineTransaction) => {
      setDiscardConfirmDialog({
        open: true,
        onConfirm: () => doDiscardTransaction(tx),
      });
    },
    [doDiscardTransaction]
  );

  const viewErrorDetails = useCallback((tx: OfflineTransaction) => {
    setSelectedErrorTx(tx);
    setShowErrorDialog(true);
  }, []);
  const sessionColumns = useMemo<ColumnDef<SessionItem>[]>(
    () => [
      {
        accessorKey: "type",
        header: "Type",
        cell: ({ row }) => (
          <Badge variant="outline" className="text-[10px]">
            {row.original.type.replace("_", " ")}
          </Badge>
        ),
      },
      {
        accessorKey: "barcode",
        header: "Item",
        cell: ({ row }) => <span className="font-mono text-xs">{row.original.barcode}</span>,
      },
      {
        accessorKey: "patronBarcode",
        header: "Patron",
        cell: ({ row }) => (
          <span className="font-mono text-xs">{row.original.patronBarcode || "—"}</span>
        ),
      },
      {
        accessorKey: "dueDate",
        header: "Due",
        cell: ({ row }) =>
          row.original.dueDate ? new Date(row.original.dueDate).toLocaleDateString() : "—",
      },
      {
        accessorKey: "message",
        header: "Message",
        cell: ({ row }) => (
          <span className="text-xs text-muted-foreground">{row.original.message}</span>
        ),
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => {
          if (row.original.status === "success") {
            return <StatusBadge label="Success" status="success" />;
          }
          if (row.original.status === "blocked") {
            return <StatusBadge label="Blocked" status="warning" />;
          }
          return <StatusBadge label="Error" status="error" />;
        },
      },
      {
        accessorKey: "timestamp",
        header: "Time",
        cell: ({ row }) => (
          <span className="text-xs">{row.original.timestamp.toLocaleTimeString()}</span>
        ),
      },
    ],
    []
  );

  const pendingColumns = useMemo<ColumnDef<OfflineTransaction>[]>(
    () => [
      {
        accessorKey: "type",
        header: "Type",
        cell: ({ row }) => (
          <Badge variant="outline" className="text-[10px]">
            {row.original.type.replace("_", " ")}
          </Badge>
        ),
      },
      {
        id: "itemBarcode",
        header: "Item",
        cell: ({ row }) => (
          <span className="font-mono text-xs">{row.original.data.itemBarcode}</span>
        ),
      },
      {
        id: "patronBarcode",
        header: "Patron",
        cell: ({ row }) => (
          <span className="font-mono text-xs">{row.original.data.patronBarcode || "—"}</span>
        ),
      },
      {
        accessorKey: "workstation",
        header: "Workstation",
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => {
          if (row.original.status === "pending") {
            return <StatusBadge label="Pending" status="pending" />;
          }
          return <StatusBadge label={row.original.errorMessage || "Error"} status="error" />;
        },
      },
      {
        accessorKey: "timestamp",
        header: "Timestamp",
        cell: ({ row }) => (
          <span className="text-xs">{formatDateTime(row.original.timestamp)}</span>
        ),
      },
      {
        id: "actions",
        header: "Actions",
        cell: ({ row }) => {
          const tx = row.original;
          if (tx.status === "error") {
            return (
              <div className="flex gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2"
                  onClick={() => viewErrorDetails(tx)}
                >
                  Details
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2"
                  onClick={() => handleRetryTransaction(tx)}
                >
                  Retry
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  className="h-7 px-2"
                  onClick={() => handleDiscardTransaction(tx)}
                >
                  Discard
                </Button>
              </div>
            );
          }
          return null;
        },
      },
    ],
    [viewErrorDetails, handleRetryTransaction, handleDiscardTransaction]
  );

  const filteredSessionItems = useMemo(() => {
    if (activeTab === "pending") return [];
    return sessionItems.filter((item) => item.type === activeTab);
  }, [activeTab, sessionItems]);

  return (
    <PageContainer>
      <PageHeader
        title="Offline Circulation"
        subtitle="Run circulation workflows offline and sync when connectivity returns."
        breadcrumbs={[
          { label: "Circulation", href: "/staff/circulation/checkout" },
          { label: "Offline" },
        ]}
        actions={[
          {
            label: "Sync Data",
            onClick: handleDownloadData,
            icon: Download,
            disabled: !isOnline || isSyncing,
            loading: isSyncing,
          },
          {
            label: "Upload",
            onClick: handleUploadTransactions,
            icon: Upload,
            disabled: !isOnline || isUploading || syncStatus.pendingTransactions === 0,
            loading: isUploading,
          },
        ]}
      >
        <div className="flex flex-wrap items-center gap-3">
          <StatusBadge
            label={isOnline ? "Online" : "Offline"}
            status={isOnline ? "success" : "error"}
            showIcon
          />
          <Badge variant="outline" className="gap-1">
            <Clock className="h-3 w-3" />
            {syncStatus.pendingTransactions} pending
          </Badge>
        </div>
      </PageHeader>

      <PageContent>
        {(syncStatus.blockList.count === 0 || syncStatus.policies.count === 0) && (
          <Card className="mb-6 border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/20">
            <CardContent className="pt-6">
              <EmptyState
                icon={Download}
                title="Offline cache not synced"
                description="Download policies and block lists before relying on offline circulation. You can still record transactions, but you may miss blocks/policy checks without cached data."
                action={{
                  label: "Sync offline data",
                  onClick: () => void handleDownloadData(),
                }}
                secondaryAction={{
                  label: "Offline help",
                  onClick: () => router.push("/staff/help#runbook"),
                }}
              />
            </CardContent>
          </Card>
        )}

        <div className="grid gap-6 lg:grid-cols-[320px,1fr]">
          <div className="space-y-6">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Connection</CardTitle>
                <CardDescription>Offline cache health</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    {isOnline ? <Wifi className="h-4 w-4" /> : <WifiOff className="h-4 w-4" />}
                    Status
                  </span>
                  <StatusBadge
                    label={isOnline ? "Online" : "Offline"}
                    status={isOnline ? "success" : "error"}
                  />
                </div>
                <div className="space-y-2 text-xs text-muted-foreground">
                  <div className="flex items-center justify-between">
                    <span>Block list</span>
                    <span>{syncStatus.blockList.count}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Patrons</span>
                    <span>{syncStatus.patrons.count}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Policies</span>
                    <span>{syncStatus.policies.count}</span>
                  </div>
                  <div className="pt-2 text-[11px]">
                    Last sync: {formatDateTime(syncStatus.blockList.lastSync)}
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Session Stats</CardTitle>
                <CardDescription>Local-only actions</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="flex items-center justify-between">
                  <span>Total</span>
                  <span className="font-medium">{sessionItems.length}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Checkouts</span>
                  <span>{sessionItems.filter((i) => i.type === "checkout").length}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Checkins</span>
                  <span>{sessionItems.filter((i) => i.type === "checkin").length}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Renewals</span>
                  <span>{sessionItems.filter((i) => i.type === "renewal").length}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>In-house</span>
                  <span>{sessionItems.filter((i) => i.type === "in_house_use").length}</span>
                </div>
                <div className="pt-2">
                  <Button variant="outline" size="sm" onClick={clearSession} className="w-full">
                    Clear Session
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="space-y-6">
            <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
              <TabsList className="flex flex-wrap">
                <TabsTrigger value="checkout" className="gap-1">
                  <BookOpen className="h-4 w-4" /> Checkout
                </TabsTrigger>
                <TabsTrigger value="checkin" className="gap-1">
                  <Package className="h-4 w-4" /> Checkin
                </TabsTrigger>
                <TabsTrigger value="renewal" className="gap-1">
                  <RefreshCw className="h-4 w-4" /> Renew
                </TabsTrigger>
                <TabsTrigger value="in_house_use" className="gap-1">
                  <Home className="h-4 w-4" /> In-House
                </TabsTrigger>
                <TabsTrigger value="pending" className="gap-1">
                  <Clock className="h-4 w-4" /> Pending
                  {syncStatus.pendingTransactions > 0 && (
                    <Badge variant="secondary" className="ml-1 h-5 px-1.5">
                      {syncStatus.pendingTransactions}
                    </Badge>
                  )}
                </TabsTrigger>
              </TabsList>

              <TabsContent value="checkout" className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Offline Checkout</CardTitle>
                    <CardDescription>Scan patron and item barcodes.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <BarcodeInput
                      label="Patron Barcode"
                      value={patronBarcode}
                      onChange={setPatronBarcode}
                      onSubmit={() => handleCheckout()}
                      isLoading={isLoading}
                      autoFocus
                    />
                    <BarcodeInput
                      label="Item Barcode"
                      value={itemBarcode}
                      onChange={setItemBarcode}
                      onSubmit={() => handleCheckout()}
                      isLoading={isLoading}
                    />
                    <div className="space-y-2">
                      <label htmlFor="custom-due-date" className="text-sm font-medium">
                        Custom Due Date (optional)
                      </label>
                      <Input
                        id="custom-due-date"
                        type="date"
                        value={customDueDate}
                        onChange={(e) => setCustomDueDate(e.target.value)}
                      />
                    </div>
                    <Button onClick={() => handleCheckout()} disabled={isLoading}>
                      {isLoading ? "Processing..." : "Record Checkout"}
                    </Button>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Session Checkouts</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <DataTable
                      columns={sessionColumns}
                      data={filteredSessionItems}
                      searchable={false}
                      paginated={false}
                      emptyState={
                        <EmptyState
                          title="No checkouts"
                          description="No offline checkouts recorded."
                        />
                      }
                    />
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="checkin" className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Offline Checkin</CardTitle>
                    <CardDescription>Scan item barcode.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <BarcodeInput
                      label="Item Barcode"
                      value={itemBarcode}
                      onChange={setItemBarcode}
                      onSubmit={() => handleCheckin()}
                      isLoading={isLoading}
                    />
                    <div className="space-y-2">
                      <label htmlFor="backdate" className="text-sm font-medium">
                        Backdate (optional)
                      </label>
                      <Input
                        id="backdate"
                        type="date"
                        value={backdateDate}
                        onChange={(e) => setBackdateDate(e.target.value)}
                      />
                    </div>
                    <Button onClick={handleCheckin} disabled={isLoading}>
                      {isLoading ? "Processing..." : "Record Checkin"}
                    </Button>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Session Checkins</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <DataTable
                      columns={sessionColumns}
                      data={filteredSessionItems}
                      searchable={false}
                      paginated={false}
                      emptyState={
                        <EmptyState
                          title="No checkins"
                          description="No offline checkins recorded."
                        />
                      }
                    />
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="renewal" className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Offline Renewals</CardTitle>
                    <CardDescription>Scan item barcode, optional patron.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <BarcodeInput
                      label="Item Barcode"
                      value={itemBarcode}
                      onChange={setItemBarcode}
                      onSubmit={() => handleRenewal()}
                      isLoading={isLoading}
                    />
                    <BarcodeInput
                      label="Patron Barcode (optional)"
                      value={patronBarcode}
                      onChange={setPatronBarcode}
                      onSubmit={() => handleRenewal()}
                      isLoading={isLoading}
                    />
                    <Button onClick={handleRenewal} disabled={isLoading}>
                      {isLoading ? "Processing..." : "Record Renewal"}
                    </Button>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Session Renewals</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <DataTable
                      columns={sessionColumns}
                      data={filteredSessionItems}
                      searchable={false}
                      paginated={false}
                      emptyState={
                        <EmptyState
                          title="No renewals"
                          description="No offline renewals recorded."
                        />
                      }
                    />
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="in_house_use" className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle>In-House Use</CardTitle>
                    <CardDescription>Track in-library usage when offline.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <BarcodeInput
                      label="Item Barcode"
                      value={itemBarcode}
                      onChange={setItemBarcode}
                      onSubmit={() => handleInHouseUse()}
                      isLoading={isLoading}
                    />
                    <div className="space-y-2">
                      <label htmlFor="use-count" className="text-sm font-medium">
                        Use Count
                      </label>
                      <Input
                        id="use-count"
                        type="number"
                        min={1}
                        value={inHouseCount}
                        onChange={(e) => setInHouseCount(parseInt(e.target.value, 10) || 1)}
                      />
                    </div>
                    <Button onClick={handleInHouseUse} disabled={isLoading}>
                      {isLoading ? "Processing..." : "Record In-House"}
                    </Button>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Session In-House Use</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <DataTable
                      columns={sessionColumns}
                      data={filteredSessionItems}
                      searchable={false}
                      paginated={false}
                      emptyState={
                        <EmptyState
                          title="No in-house use"
                          description="No in-house usage recorded."
                        />
                      }
                    />
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="pending" className="space-y-6">
                <Card>
                  <CardHeader className="flex items-center justify-between gap-4">
                    <div>
                      <CardTitle>Pending Transactions</CardTitle>
                      <CardDescription>
                        {syncStatus.pendingTransactions} transactions waiting to upload.
                      </CardDescription>
                    </div>
                    <Button
                      onClick={handleUploadTransactions}
                      disabled={!isOnline || isUploading || syncStatus.pendingTransactions === 0}
                    >
                      {isUploading ? "Uploading..." : "Upload All"}
                    </Button>
                  </CardHeader>
                  <CardContent>
                    <DataTable
                      columns={pendingColumns}
                      data={pendingTransactions}
                      searchable={false}
                      paginated={false}
                      emptyState={
                        <EmptyState
                          title="No pending transactions"
                          description="All transactions are synced."
                        />
                      }
                    />
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </PageContent>

      <ConfirmDialog
        open={showBlockDialog}
        onOpenChange={setShowBlockDialog}
        title="Patron Block Detected"
        description="This patron has a block on their account. Override to proceed?"
        variant="warning"
        confirmText="Override & Checkout"
        onConfirm={async () => {
          setShowBlockDialog(false);
          await handleCheckout(true);
        }}
      >
        <div className="rounded-lg border bg-muted/40 p-3 text-sm">
          <p>
            <strong>Patron:</strong> {blockedPatronInfo?.barcode}
          </p>
          <p>
            <strong>Reason:</strong> {blockedPatronInfo?.reason}
          </p>
        </div>
      </ConfirmDialog>

      <Dialog open={showErrorDialog} onOpenChange={setShowErrorDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Transaction Error Details</DialogTitle>
            <DialogDescription>Review the error and choose how to proceed.</DialogDescription>
          </DialogHeader>
          {selectedErrorTx && (
            <div className="space-y-4">
              <div className="rounded-lg border bg-muted/40 p-3 space-y-2 text-sm">
                <div>
                  <strong>Type:</strong> {selectedErrorTx.type.replace("_", " ")}
                </div>
                <div>
                  <strong>Item:</strong>{" "}
                  <span className="font-mono">{selectedErrorTx.data.itemBarcode}</span>
                </div>
                {selectedErrorTx.data.patronBarcode && (
                  <div>
                    <strong>Patron:</strong>{" "}
                    <span className="font-mono">{selectedErrorTx.data.patronBarcode}</span>
                  </div>
                )}
                <div>
                  <strong>Workstation:</strong> {selectedErrorTx.workstation}
                </div>
                <div>
                  <strong>Time:</strong> {formatDateTime(selectedErrorTx.timestamp)}
                </div>
              </div>
              <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
                <strong>Error:</strong> {selectedErrorTx.errorMessage || "Unknown error"}
              </div>
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setShowErrorDialog(false)}>
              Close
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                handleRetryTransaction(selectedErrorTx!);
                setShowErrorDialog(false);
              }}
            >
              Retry
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                handleDiscardTransaction(selectedErrorTx!);
                setShowErrorDialog(false);
              }}
            >
              Discard
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <ConfirmDialog
        open={discardConfirmDialog.open}
        onOpenChange={(open) => setDiscardConfirmDialog((s) => ({ ...s, open }))}
        title="Discard Transaction"
        description="Discard this transaction? This cannot be undone."
        variant="danger"
        onConfirm={discardConfirmDialog.onConfirm}
      />
    </PageContainer>
  );
}
