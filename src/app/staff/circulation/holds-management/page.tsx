"use client";

import { fetchWithAuth } from "@/lib/client-fetch";

import { clientLogger } from "@/lib/client-logger";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/contexts/auth-context";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Search,
  BookMarked,
  Clock,
  Snowflake,
  Sun,
  XCircle,
  RefreshCw,
  MapPin,
  FileText,
  ListChecks,
  Inbox,
  Printer,
  Trash2,
  HelpCircle,
} from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { escapeHtml, printHtml } from "@/lib/print";
import {
  DataTable,
  DataTableColumnHeader,
  EmptyState,
  PageContainer,
  PageContent,
  PageHeader,
  StatusBadge,
  ErrorMessage,
  BarcodeInput,
} from "@/components/shared";
import { ColumnDef } from "@tanstack/react-table";

interface Hold {
  id: number;
  holdType: string;
  target: number;
  requestTime: string;
  captureTime?: string;
  fulfillmentTime?: string;
  expireTime?: string;
  pickupLib: number;
  frozen: boolean;
  frozenUntil?: string;
  shelfExpireTime?: string;
  currentCopy?: number;
  title: string;
  author?: string;
  status?: number;
  queuePosition?: number;
  potentialCopies?: number;

  // Shelf/expired enrichment (from holds shelf endpoints)
  patronName?: string;
  patronBarcode?: string;
  itemBarcode?: string;
  callNumber?: string;
}

interface PullListItem {
  hold_id: number;
  copy_id: number;
  title: string;
  author: string;
  call_number: string;
  barcode: string;
  shelving_location: string;
  patron_barcode: string;
}

type TabKey = "patron" | "title" | "pull" | "shelf" | "expired";

export default function HoldsManagementPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useState<TabKey>("patron");
  const [titleId, setTitleId] = useState("");
  const [titleHolds, setTitleHolds] = useState<Hold[]>([]);
  const [patronBarcode, setPatronBarcode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [patronHolds, setPatronHolds] = useState<Hold[]>([]);
  const [pullList, setPullList] = useState<PullListItem[]>([]);
  const [holdsShelf, setHoldsShelf] = useState<Hold[]>([]);
  const [expiredHolds, setExpiredHolds] = useState<Hold[]>([]);
  const [patronId, setPatronId] = useState<number | null>(null);
  const { user, getOrgName } = useAuth();
  const orgId = user?.activeOrgId ?? user?.homeLibraryId ?? 1;

  const [selectedHold, setSelectedHold] = useState<Hold | null>(null);
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [freezeDialogOpen, setFreezeDialogOpen] = useState(false);
  const [changePickupDialogOpen, setChangePickupDialogOpen] = useState(false);
  const [addNoteDialogOpen, setAddNoteDialogOpen] = useState(false);
  const [clearShelfDialogOpen, setClearShelfDialogOpen] = useState(false);

  const [cancelReason, setCancelReason] = useState("4");
  const [cancelNote, setCancelNote] = useState("");
  const [thawDate, setThawDate] = useState("");
  const [newPickupLib, setNewPickupLib] = useState("");
  const [noteTitle, setNoteTitle] = useState("");
  const [noteBody, setNoteBody] = useState("");
  const [noteStaffOnly, setNoteStaffOnly] = useState(true);

  const lastDeepLinkPatronRef = useRef<string>("");

  const searchPatronHolds = useCallback(async (barcodeOverride?: string) => {
    const barcode = (barcodeOverride ?? patronBarcode).trim();
    if (!barcode) return;

    setLoading(true);
    setError(null);

    try {
      setPatronBarcode(barcode);
      const patronRes = await fetchWithAuth(`/api/evergreen/patrons?barcode=${encodeURIComponent(barcode)}`);
      const patronData = await patronRes.json();

      if (!patronData.ok || !patronData.patron) {
        setError("Patron not found");
        setPatronHolds([]);
        return;
      }

      setPatronId(patronData.patron.id);

      const holdsRes = await fetchWithAuth(`/api/evergreen/holds?action=patron_holds&patron_id=${patronData.patron.id}`);
      const holdsData = await holdsRes.json();

      if (holdsData.ok) {
        setPatronHolds(holdsData.holds || []);
      } else {
        setError(holdsData.error || "Failed to load holds");
      }
    } catch (error) {
      setError("Failed to search patron");
      clientLogger.error(error);
    } finally {
      setLoading(false);
    }
  }, [patronBarcode]);

  const loadTitleHolds = async (id?: string) => {
    const resolvedTitleId = (id ?? titleId).trim();
    if (!resolvedTitleId) return;

    setLoading(true);
    setError(null);

    try {
      const res = await fetchWithAuth(
        `/api/evergreen/holds?action=title_holds&title_id=${encodeURIComponent(resolvedTitleId)}`
      );
      const data = await res.json();

      if (data.ok) {
        setTitleHolds(data.holds || []);
      } else {
        setError(data.error || "Failed to load title holds");
      }
    } catch (error) {
      setError("Failed to load title holds");
      clientLogger.error(error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const tabParam = searchParams.get("tab");
    const titleParam = searchParams.get("title_id");
    const patronParam = (searchParams.get("patron") || "").trim();

    if (tabParam === "title") {
      setActiveTab("title");
      if (titleParam) {
        setTitleId(titleParam);
        void loadTitleHolds(titleParam);
      }
    }
    if (patronParam) {
      setActiveTab("patron");
      if (lastDeepLinkPatronRef.current !== patronParam) {
        lastDeepLinkPatronRef.current = patronParam;
        void (async () => {
          // Back-compat: allow deep-linking with either a patron barcode or a numeric patron id.
          if (/^\\d+$/.test(patronParam)) {
            try {
              const res = await fetchWithAuth(`/api/evergreen/patrons?id=${patronParam}`);
              const data = await res.json().catch(() => null);
              const resolved =
                data?.ok && data?.patron
                  ? (data.patron?.barcode || data.patron?.card?.barcode || "")
                  : "";
              await searchPatronHolds(resolved || patronParam);
              return;
            } catch {
              await searchPatronHolds(patronParam);
              return;
            }
          }
          await searchPatronHolds(patronParam);
        })();
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadPullList = async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetchWithAuth(`/api/evergreen/holds?action=pull_list&org_id=${orgId}&limit=100`);
      const data = await res.json();

      if (data.ok) {
        setPullList(data.pullList || []);
      } else {
        setError(data.error || "Failed to load pull list");
      }
    } catch (error) {
      setError("Failed to load pull list");
      clientLogger.error(error);
    } finally {
      setLoading(false);
    }
  };

  const loadHoldsShelf = async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetchWithAuth(`/api/evergreen/holds?action=holds_shelf&org_id=${orgId}`);
      const data = await res.json();

      if (data.ok) {
        setHoldsShelf(data.holds || []);
      } else {
        setError(data.error || "Failed to load holds shelf");
      }
    } catch (error) {
      setError("Failed to load holds shelf");
      clientLogger.error(error);
    } finally {
      setLoading(false);
    }
  };

  const loadExpiredHolds = async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetchWithAuth(`/api/evergreen/holds?action=expired_holds&org_id=${orgId}`);
      const data = await res.json();

      if (data.ok) {
        setExpiredHolds(data.holds || []);
      } else {
        setError(data.error || "Failed to load expired holds");
      }
    } catch (error) {
      setError("Failed to load expired holds");
      clientLogger.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleCancelHold = async () => {
    if (!selectedHold) return;

    setLoading(true);
    try {
      const res = await fetchWithAuth("/api/evergreen/holds", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "cancel_hold",
          holdId: selectedHold.id,
          reason: parseInt(cancelReason),
          note: cancelNote || undefined,
        }),
      });

      const data = await res.json();

      if (data.ok) {
        setCancelDialogOpen(false);
        setCancelNote("");
        setSelectedHold(null);
        if (patronId) searchPatronHolds();
      } else {
        setError(data.error || "Failed to cancel hold");
      }
    } catch {
      setError("Failed to cancel hold");
    } finally {
      setLoading(false);
    }
  };

  const handleFreezeHold = async () => {
    if (!selectedHold) return;

    setLoading(true);
    try {
      const res = await fetchWithAuth("/api/evergreen/holds", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "freeze",
          holdId: selectedHold.id,
          thawDate: thawDate || undefined,
        }),
      });

      const data = await res.json();

      if (data.ok) {
        setFreezeDialogOpen(false);
        setThawDate("");
        setSelectedHold(null);
        if (patronId) searchPatronHolds();
      } else {
        setError(data.error || "Failed to freeze hold");
      }
    } catch {
      setError("Failed to freeze hold");
    } finally {
      setLoading(false);
    }
  };

  const handleThawHold = useCallback(async (hold: Hold) => {
    setLoading(true);
    try {
      const res = await fetchWithAuth("/api/evergreen/holds", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "thaw", holdId: hold.id }),
      });

      const data = await res.json();

      if (data.ok) {
        if (patronId) searchPatronHolds();
      } else {
        setError(data.error || "Failed to activate hold");
      }
    } catch {
      setError("Failed to activate hold");
    } finally {
      setLoading(false);
    }
  }, [patronId, searchPatronHolds]);

  const handleChangePickupLib = async () => {
    if (!selectedHold || !newPickupLib) return;

    setLoading(true);
    try {
      const res = await fetchWithAuth("/api/evergreen/holds", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "change_pickup_lib",
          holdId: selectedHold.id,
          pickupLib: parseInt(newPickupLib),
        }),
      });

      const data = await res.json();

      if (data.ok) {
        setChangePickupDialogOpen(false);
        setNewPickupLib("");
        setSelectedHold(null);
        if (patronId) searchPatronHolds();
      } else {
        setError(data.error || "Failed to change pickup library");
      }
    } catch {
      setError("Failed to change pickup library");
    } finally {
      setLoading(false);
    }
  };

  const handleAddNote = async () => {
    if (!selectedHold || !noteBody) return;

    setLoading(true);
    try {
      const res = await fetchWithAuth("/api/evergreen/holds", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "add_note",
          holdId: selectedHold.id,
          title: noteTitle || "Staff Note",
          body: noteBody,
          isStaffNote: noteStaffOnly,
          isPatronVisible: !noteStaffOnly,
        }),
      });

      const data = await res.json();

      if (data.ok) {
        setAddNoteDialogOpen(false);
        setNoteTitle("");
        setNoteBody("");
        setSelectedHold(null);
      } else {
        setError(data.error || "Failed to add note");
      }
    } catch {
      setError("Failed to add note");
    } finally {
      setLoading(false);
    }
  };

  const handleResetHold = useCallback(async (hold: Hold) => {
    setLoading(true);
    try {
      const res = await fetchWithAuth("/api/evergreen/holds", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reset_hold", holdId: hold.id }),
      });

      const data = await res.json();

      if (data.ok) {
        if (patronId) searchPatronHolds();
      } else {
        setError(data.error || "Failed to reset hold");
      }
    } catch {
      setError("Failed to reset hold");
    } finally {
      setLoading(false);
    }
  }, [patronId, searchPatronHolds]);

  const holdStatusBadge = (hold: Hold) => {
    if (hold.fulfillmentTime) {
      return <StatusBadge label="Fulfilled" status="success" showIcon />;
    }
    if (hold.captureTime) {
      return <StatusBadge label="Ready" status="info" showIcon />;
    }
    if (hold.frozen) {
      return <StatusBadge label="Frozen" status="warning" showIcon />;
    }
    if (hold.queuePosition === 1) {
      return <StatusBadge label="Next" status="pending" showIcon />;
    }
    return <StatusBadge label="Waiting" status="neutral" />;
  };

  const holdsColumns = useMemo<ColumnDef<Hold>[]>(
    () => [
      {
        accessorKey: "title",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Title" />,
        cell: ({ row }) => (
          <div className="space-y-0.5">
            <div className="font-medium">{row.original.title}</div>
            {row.original.author && (
              <div className="text-xs text-muted-foreground">{row.original.author}</div>
            )}
          </div>
        ),
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => holdStatusBadge(row.original),
      },
      {
        accessorKey: "queuePosition",
        header: "Queue",
        cell: ({ row }) =>
          row.original.queuePosition ? (
            <span className="text-xs">#{row.original.queuePosition} of {row.original.potentialCopies || "?"}</span>
          ) : (
            <span className="text-xs text-muted-foreground">-</span>
          ),
      },
      {
        accessorKey: "requestTime",
        header: "Requested",
        cell: ({ row }) => (
          <span className="text-xs">{format(new Date(row.original.requestTime), "MMM d, yyyy")}</span>
        ),
      },
      {
        accessorKey: "pickupLib",
        header: "Pickup",
        cell: ({ row }) => <span className="text-xs">Lib #{row.original.pickupLib}</span>,
      },
      {
        id: "actions",
        header: "Actions",
        cell: ({ row }) => (
          <div className="flex gap-1">
            {row.original.frozen ? (
              <Button variant="ghost" size="sm" onClick={() => handleThawHold(row.original)}>
                <Sun className="h-4 w-4" />
              </Button>
            ) : (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setSelectedHold(row.original);
                  setFreezeDialogOpen(true);
                }}
              >
                <Snowflake className="h-4 w-4" />
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setSelectedHold(row.original);
                setChangePickupDialogOpen(true);
              }}
            >
              <MapPin className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="sm" onClick={() => handleResetHold(row.original)}>
              <RefreshCw className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setSelectedHold(row.original);
                setAddNoteDialogOpen(true);
              }}
            >
              <FileText className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="text-destructive"
              onClick={() => {
                setSelectedHold(row.original);
                setCancelDialogOpen(true);
              }}
            >
              <XCircle className="h-4 w-4" />
            </Button>
          </div>
        ),
      },
    ],
    [handleResetHold, handleThawHold]
  );

  const pullColumns = useMemo<ColumnDef<PullListItem>[]>(
    () => [
      {
        accessorKey: "barcode",
        header: "Barcode",
        cell: ({ row }) => <span className="font-mono text-xs">{row.original.barcode}</span>,
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
          </div>
        ),
      },
      {
        accessorKey: "call_number",
        header: "Call Number",
        cell: ({ row }) => <span className="text-xs">{row.original.call_number}</span>,
      },
      {
        accessorKey: "shelving_location",
        header: "Location",
        cell: ({ row }) => <span className="text-xs">{row.original.shelving_location}</span>,
      },
      {
        accessorKey: "patron_barcode",
        header: "Patron",
        cell: ({ row }) => <span className="font-mono text-xs">{row.original.patron_barcode}</span>,
      },
    ],
    []
  );


  const buildHoldSlipHtml = useCallback(
    (hold: Hold) => {
      const pickup = hold.pickupLib ? getOrgName(hold.pickupLib) : getOrgName(orgId);
      const patron = hold.patronName
        ? `${hold.patronName}${hold.patronBarcode ? ` (${hold.patronBarcode})` : ""}`
        : hold.patronBarcode || "—";

      const lines: Array<[string, string]> = [
        ["Time", new Date().toLocaleString()],
        ["Pickup", pickup],
        ["Hold", `#${hold.id}`],
        ["Patron", patron],
        ["Item", hold.itemBarcode || "—"],
        ["Call Number", hold.callNumber || ""],
        ["Title", hold.title],
      ];

      if (hold.author) lines.push(["Author", hold.author]);
      if (hold.captureTime) lines.push(["Captured", new Date(hold.captureTime).toLocaleString()]);
      if (hold.shelfExpireTime) lines.push(["Shelf Expires", new Date(hold.shelfExpireTime).toLocaleString()]);

      const rendered = lines
        .filter(([, v]) => v && v !== "—")
        .map(
          ([k, v]) =>
            `<div><span class="k">${escapeHtml(k)}:</span> <span class="v">${escapeHtml(v)}</span></div>`
        );

      return [
        '<div class="box pb">',
        `<h1 class="brand">StacksOS</h1>`,
        '<div class="muted">Hold Slip</div>',
        '<div class="meta">',
        ...rendered,
        '</div>',
        '</div>',
      ].join("\n");
    },
    [getOrgName, orgId]
  );

  const handlePrintHoldSlip = useCallback(
    (hold: Hold) => {
      printHtml(buildHoldSlipHtml(hold), { title: "StacksOS Hold Slip", tone: "slip" });
    },
    [buildHoldSlipHtml]
  );

  const handlePrintAllHoldSlips = useCallback(() => {
    const source = activeTab === "expired" ? expiredHolds : holdsShelf;
    if (source.length === 0) {
      toast.message("No hold slips to print");
      return;
    }

    const html = source
      .slice()
      .reverse()
      .map((hold) => buildHoldSlipHtml(hold))
      .join("\n");

    printHtml(html, { title: "StacksOS Hold Slips", tone: "slip" });
  }, [activeTab, expiredHolds, holdsShelf, buildHoldSlipHtml]);

  const handleClearShelf = async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetchWithAuth("/api/evergreen/holds", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "clear_shelf", orgId }),
      });

      const data = await res.json();

      if (data.ok) {
        toast.success("Shelf clearing started", {
          description: "Processed holds will appear in the Expired tab once Evergreen finishes.",
        });
        setClearShelfDialogOpen(false);
        await Promise.all([loadHoldsShelf(), loadExpiredHolds()]);
      } else {
        setError(data.error || "Failed to clear shelf");
      }
    } catch (err) {
      setError("Failed to clear shelf");
      clientLogger.error(err);
    } finally {
      setLoading(false);
    }
  };

  const shelfColumns = useMemo<ColumnDef<Hold>[]>(
    () => [
      {
        accessorKey: "title",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Hold" />,
        cell: ({ row }) => (
          <div className="space-y-0.5">
            <div className="font-medium">{row.original.title}</div>
            <div className="text-xs text-muted-foreground">
              {row.original.author || "—"} • <span className="font-mono">#{row.original.id}</span>
            </div>
          </div>
        ),
      },
      {
        accessorKey: "patronBarcode",
        header: "Patron",
        cell: ({ row }) => (
          <div className="space-y-0.5">
            <div className="text-xs">{row.original.patronName || "—"}</div>
            <div className="text-xs font-mono text-muted-foreground">
              {row.original.patronBarcode || "—"}
            </div>
          </div>
        ),
      },
      {
        accessorKey: "itemBarcode",
        header: "Item",
        cell: ({ row }) => (
          <span className="text-xs font-mono text-muted-foreground">{row.original.itemBarcode || "—"}</span>
        ),
      },
      {
        accessorKey: "callNumber",
        header: "Call Number",
        cell: ({ row }) => <span className="text-xs">{row.original.callNumber || "—"}</span>,
      },
      {
        accessorKey: "captureTime",
        header: "Captured",
        cell: ({ row }) => (
          <span className="text-xs">
            {row.original.captureTime
              ? formatDistanceToNow(new Date(row.original.captureTime), { addSuffix: true })
              : "-"}
          </span>
        ),
      },
      {
        accessorKey: "shelfExpireTime",
        header: "Shelf Expires",
        cell: ({ row }) => (
          <span className="text-xs">
            {row.original.shelfExpireTime
              ? formatDistanceToNow(new Date(row.original.shelfExpireTime), { addSuffix: true })
              : "-"}
          </span>
        ),
      },
      {
        id: "actions",
        header: "",
        enableHiding: false,
        cell: ({ row }) => (
          <div className="flex items-center justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => handlePrintHoldSlip(row.original)}>
              <Printer className="h-4 w-4 mr-1" />
              Print Slip
            </Button>
          </div>
        ),
      },
    ],
    [handlePrintHoldSlip]
  );

  const expiredColumns = useMemo<ColumnDef<Hold>[]>(
    () => [
      {
        accessorKey: "title",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Hold" />,
        cell: ({ row }) => (
          <div className="space-y-0.5">
            <div className="font-medium">{row.original.title}</div>
            <div className="text-xs text-muted-foreground">
              {row.original.author || "—"} • <span className="font-mono">#{row.original.id}</span>
            </div>
          </div>
        ),
      },
      {
        accessorKey: "patronBarcode",
        header: "Patron",
        cell: ({ row }) => (
          <div className="space-y-0.5">
            <div className="text-xs">{row.original.patronName || "—"}</div>
            <div className="text-xs font-mono text-muted-foreground">
              {row.original.patronBarcode || "—"}
            </div>
          </div>
        ),
      },
      {
        accessorKey: "itemBarcode",
        header: "Item",
        cell: ({ row }) => (
          <span className="text-xs font-mono text-muted-foreground">{row.original.itemBarcode || "—"}</span>
        ),
      },
      {
        accessorKey: "shelfExpireTime",
        header: "Expired",
        cell: ({ row }) => (
          <span className="text-xs">
            {row.original.shelfExpireTime
              ? formatDistanceToNow(new Date(row.original.shelfExpireTime), { addSuffix: true })
              : "-"}
          </span>
        ),
      },
      {
        id: "actions",
        header: "",
        enableHiding: false,
        cell: ({ row }) => (
          <div className="flex items-center justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => handlePrintHoldSlip(row.original)}>
              <Printer className="h-4 w-4 mr-1" />
              Print Slip
            </Button>
          </div>
        ),
      },
    ],
    [handlePrintHoldSlip]
  );


  const handleRefreshActive = () => {
    if (activeTab === "title") return loadTitleHolds();
    if (activeTab === "pull") return loadPullList();
    if (activeTab === "shelf") return loadHoldsShelf();
    if (activeTab === "expired") return loadExpiredHolds();
    return searchPatronHolds();
  };

  return (
    <PageContainer>
      <PageHeader
        title="Holds Management"
        subtitle="Manage patron holds, pull lists, and the holds shelf."
        breadcrumbs={[{ label: "Circulation" }, { label: "Holds" }]}
        actions={[
          {
            label: "Refresh",
            onClick: handleRefreshActive,
            icon: RefreshCw,
            loading: loading,
          },
          { label: "Walkthrough", onClick: () => window.location.assign("/staff/training?workflow=holds"), icon: HelpCircle, variant: "outline" as const },
          ...(activeTab === "shelf" || activeTab === "expired"
            ? [
                {
                  label: "Print Slips",
                  onClick: handlePrintAllHoldSlips,
                  icon: Printer,
                  variant: "outline" as const,
                  disabled:
                    activeTab === "expired"
                      ? expiredHolds.length === 0
                      : holdsShelf.length === 0,
                },
                {
                  label: "Clear Shelf",
                  onClick: () => setClearShelfDialogOpen(true),
                  icon: Trash2,
                  variant: "destructive" as const,
                  disabled: loading,
                },
              ]
            : []),
        ]}>
        <div className="flex flex-wrap gap-2">
          <Badge variant="secondary" className="rounded-full">Org: {getOrgName(orgId)} (#{orgId})</Badge>
          <Badge variant="outline" className="rounded-full">{patronHolds.length} active holds</Badge>
        </div>
      </PageHeader>

      <PageContent className="space-y-6">
        {error && (
          <ErrorMessage
            message={error}
            onRetry={() => setError(null)}
            className="border border-destructive/20"
          />
        )}

        <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as TabKey)}>
          <TabsList className="grid w-full grid-cols-5">
            <TabsTrigger value="patron" className="flex items-center gap-2">
              <Search className="h-4 w-4" />
              Patron Holds
            </TabsTrigger>
            <TabsTrigger value="title" className="flex items-center gap-2" onClick={() => loadTitleHolds()}>
              <BookMarked className="h-4 w-4" />
              Title Holds
            </TabsTrigger>
            <TabsTrigger value="pull" className="flex items-center gap-2" onClick={loadPullList}>
              <ListChecks className="h-4 w-4" />
              Pull List
            </TabsTrigger>
            <TabsTrigger value="shelf" className="flex items-center gap-2" onClick={loadHoldsShelf}>
              <Inbox className="h-4 w-4" />
              Holds Shelf
            </TabsTrigger>
            <TabsTrigger value="expired" className="flex items-center gap-2" onClick={loadExpiredHolds}>
              <Clock className="h-4 w-4" />
              Expired
            </TabsTrigger>
          </TabsList>

          <TabsContent value="patron" className="space-y-4">
            <Card className="rounded-2xl border-border/70 shadow-sm">
              <CardHeader>
                <CardTitle>Search Patron</CardTitle>
                <CardDescription>Scan a patron card to view and manage holds.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <BarcodeInput
                  label="Patron Barcode"
                  placeholder="Scan patron barcode"
                  value={patronBarcode}
                  onChange={setPatronBarcode}
                  onSubmit={searchPatronHolds}
                  isLoading={loading}
                />
                <div className="flex gap-2">
                  <Button onClick={() => void searchPatronHolds()} disabled={loading}>
                    <Search className="h-4 w-4 mr-2" />
                    Search
                  </Button>
                  <Button variant="outline" onClick={() => setPatronBarcode("")}>Clear</Button>
                </div>
              </CardContent>
            </Card>

            <DataTable
              columns={holdsColumns}
              data={patronHolds}
              searchable
              searchPlaceholder="Search holds by title or author..."
              emptyState={
                <EmptyState
                  icon={BookMarked}
                  title={patronId ? "No holds found" : "Search for a patron"}
                  description={
                    patronId
                      ? "This patron has no active holds."
                      : "Enter a patron barcode to view holds."
                  }
                  action={
                    patronId
                      ? { label: "Search catalog", onClick: () => router.push("/staff/catalog"), icon: Search }
                      : { label: "Evergreen setup checklist", onClick: () => router.push("/staff/help#evergreen-setup") }
                  }
                  secondaryAction={
                    patronId
                      ? { label: "Hold policies", onClick: () => router.push("/staff/admin/policies/holds") }
                      : undefined
                  }
                >
                  <Button variant="ghost" size="sm" onClick={() => router.push("/staff/help#demo-data")}>
                    Seed demo data
                  </Button>
                </EmptyState>
              }
            />
          </TabsContent>

          <TabsContent value="title" className="space-y-4">
            <Card className="rounded-2xl border-border/70 shadow-sm">
              <CardHeader>
                <CardTitle>Title Holds</CardTitle>
                <CardDescription>Enter a Bib/Title ID to view and manage the hold queue.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex gap-2">
                  <Input
                    placeholder="Bib/Title ID"
                    value={titleId}
                    onChange={(e) => setTitleId(e.target.value)}
                    className="font-mono"
                  />
                  <Button onClick={() => loadTitleHolds()} disabled={loading || !titleId.trim()}>
                    <Search className="h-4 w-4 mr-2" />
                    Load
                  </Button>
                </div>
              </CardContent>
            </Card>

            <DataTable
              columns={holdsColumns}
              data={titleHolds}
              searchable
              searchPlaceholder="Search holds by title or author..."
              emptyState={
                <EmptyState
                  icon={BookMarked}
                  title={titleId.trim() ? "No holds found" : "Enter a Bib/Title ID"}
                  description={
                    titleId.trim()
                      ? "No holds are currently placed on this title."
                      : "Paste a bibliographic record ID to view the queue."
                  }
                  action={
                    titleId.trim()
                      ? { label: "Search catalog", onClick: () => router.push("/staff/catalog"), icon: Search }
                      : { label: "Search catalog", onClick: () => router.push("/staff/catalog"), icon: Search }
                  }
                  secondaryAction={
                    titleId.trim()
                      ? { label: "Hold policies", onClick: () => router.push("/staff/admin/policies/holds") }
                      : undefined
                  }
                >
                  <Button variant="ghost" size="sm" onClick={() => router.push("/staff/help#demo-data")}>
                    Seed demo data
                  </Button>
                </EmptyState>
              }
            />
          </TabsContent>

          <TabsContent value="pull" className="space-y-4">
            <DataTable
              columns={pullColumns}
              data={pullList}
              searchable
              searchPlaceholder="Search pull list..."
              emptyState={
                <EmptyState
                  icon={ListChecks}
                  title="Pull list empty"
                  description="There are no items to pull right now."
                  action={{ label: "Search catalog", onClick: () => router.push("/staff/catalog"), icon: Search }}
                  secondaryAction={{ label: "Hold policies", onClick: () => router.push("/staff/admin/policies/holds") }}
                >
                  <Button variant="ghost" size="sm" onClick={() => router.push("/staff/help#demo-data")}>
                    Seed demo data
                  </Button>
                </EmptyState>
              }
            />
          </TabsContent>

          <TabsContent value="shelf" className="space-y-4">
            <DataTable
              columns={shelfColumns}
              data={holdsShelf}
              searchable
              searchPlaceholder="Search holds shelf..."
              emptyState={
                <EmptyState
                  icon={Inbox}
                  title="Holds shelf is clear"
                  description="No items are waiting on the shelf."
                  action={{ label: "Open pull list", onClick: () => setActiveTab("pull") }}
                  secondaryAction={{ label: "Hold policies", onClick: () => router.push("/staff/admin/policies/holds") }}
                >
                  <Button variant="ghost" size="sm" onClick={() => router.push("/staff/help#demo-data")}>
                    Seed demo data
                  </Button>
                </EmptyState>
              }
            />
          </TabsContent>

          <TabsContent value="expired" className="space-y-4">
            <DataTable
              columns={expiredColumns}
              data={expiredHolds}
              searchable
              searchPlaceholder="Search expired holds..."
              emptyState={
                <EmptyState
                  icon={Clock}
                  title="No expired holds"
                  description="Expired holds will show up here when they occur."
                  action={{ label: "Open holds shelf", onClick: () => setActiveTab("shelf") }}
                  secondaryAction={{ label: "Hold policies", onClick: () => router.push("/staff/admin/policies/holds") }}
                >
                  <Button variant="ghost" size="sm" onClick={() => router.push("/staff/help#demo-data")}>
                    Seed demo data
                  </Button>
                </EmptyState>
              }
            />
          </TabsContent>
        </Tabs>
      </PageContent>

      <Dialog open={clearShelfDialogOpen} onOpenChange={setClearShelfDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Clear Holds Shelf</DialogTitle>
            <DialogDescription>
              Run Evergreen&apos;s clear-shelf process for <span className="font-medium">{getOrgName(orgId)}</span> (Org #{orgId}).
              Use this for expired or wrong-shelf holds.
            </DialogDescription>
          </DialogHeader>

          <div className="rounded-lg border bg-muted/30 p-3 text-sm text-muted-foreground">
            This is a bulk action. Depending on shelf size, it may take a moment.
            Results will appear in the <span className="font-medium">Expired</span> tab when complete.
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setClearShelfDialogOpen(false)} disabled={loading}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleClearShelf} disabled={loading}>
              Clear Shelf
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={cancelDialogOpen} onOpenChange={setCancelDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancel Hold</DialogTitle>
            <DialogDescription>
              Cancel the hold for <span className="font-medium">{selectedHold?.title || "this title"}</span>.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Cancel Reason</Label>
              <Select value={cancelReason} onValueChange={setCancelReason}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="3">Patron Request</SelectItem>
                  <SelectItem value="4">Staff Cancel</SelectItem>
                  <SelectItem value="5">Item Not Found</SelectItem>
                  <SelectItem value="6">Target Deleted</SelectItem>
                  <SelectItem value="7">Item Too Damaged</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Note (optional)</Label>
              <Textarea
                value={cancelNote}
                onChange={(e) => setCancelNote(e.target.value)}
                placeholder="Add a note..."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelDialogOpen(false)}>
              Keep Hold
            </Button>
            <Button variant="destructive" onClick={handleCancelHold} disabled={loading}>
              Cancel Hold
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={freezeDialogOpen} onOpenChange={setFreezeDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Freeze Hold</DialogTitle>
            <DialogDescription>
              Temporarily suspend the hold for <span className="font-medium">{selectedHold?.title || "this title"}</span>.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Thaw Date (optional)</Label>
              <Input type="date" value={thawDate} onChange={(e) => setThawDate(e.target.value)} />
              <p className="text-sm text-muted-foreground">Leave empty to freeze indefinitely</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFreezeDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleFreezeHold} disabled={loading}>
              <Snowflake className="h-4 w-4 mr-2" />
              Freeze Hold
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={changePickupDialogOpen} onOpenChange={setChangePickupDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change Pickup Library</DialogTitle>
            <DialogDescription>
              Change where <span className="font-medium">{selectedHold?.title || "this title"}</span> will be picked up.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>New Pickup Library</Label>
              <Input
                type="number"
                value={newPickupLib}
                onChange={(e) => setNewPickupLib(e.target.value)}
                placeholder="Library ID"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setChangePickupDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleChangePickupLib} disabled={loading || !newPickupLib}>
              <MapPin className="h-4 w-4 mr-2" />
              Change Library
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={addNoteDialogOpen} onOpenChange={setAddNoteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Hold Note</DialogTitle>
            <DialogDescription>
              Add a note to the hold for <span className="font-medium">{selectedHold?.title || "this title"}</span>.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Title</Label>
              <Input value={noteTitle} onChange={(e) => setNoteTitle(e.target.value)} placeholder="Note title..." />
            </div>
            <div className="space-y-2">
              <Label>Note</Label>
              <Textarea value={noteBody} onChange={(e) => setNoteBody(e.target.value)} placeholder="Enter note..." />
            </div>
            <div className="flex items-center space-x-2">
              <Checkbox
                id="staffOnly"
                checked={noteStaffOnly}
                onCheckedChange={(checked) => setNoteStaffOnly(checked as boolean)}
              />
              <Label htmlFor="staffOnly">Staff only (not visible to patron)</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddNoteDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleAddNote} disabled={loading || !noteBody}>
              <FileText className="h-4 w-4 mr-2" />
              Add Note
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageContainer>
  );
}
