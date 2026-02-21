"use client";

import { fetchWithAuth } from "@/lib/client-fetch";

import * as React from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ColumnDef } from "@tanstack/react-table";

import {
  PageContainer,
  PageHeader,
  PageContent,
  LoadingSpinner,
  ErrorState,
  EmptyState,
  DataTable,
  DataTableColumnHeader,
  PatronCard,
  StatusBadge,
  ErrorBoundary,
  PatronPhotoUpload,
} from "@/components/shared";
import { useWorkforms } from "@/contexts/workforms-context";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { PatronNoticesTab } from "@/components/patron/patron-notices-tab";

import {
  Pin,
  PinOff,
  AlertTriangle,
  Ban,
  BookOpen,
  Camera,
  CreditCard,
  Edit,
  FileText,
  Plus,
  RefreshCw,
  Trash2,
  X,
  Users,
  ClipboardList,
  Loader2,
} from "lucide-react";

interface PatronDetails {
  id: number;
  barcode: string;
  first_given_name: string;
  family_name: string;
  email?: string;
  day_phone?: string;
  home_ou?: number;
  profile?: any;
  active: boolean;
  barred: boolean;
  expire_date?: string;
  standing_penalties?: any[];
}

interface CheckoutRow {
  id: string | number;
  title: string;
  barcode: string;
  dueDate?: string;
  status: string;
}

interface HoldRow {
  id: number;
  title: string;
  author?: string;
  status: string;
  pickupLib?: number;
  requestTime?: string;
}

interface BillRow {
  id: number;
  title: string;
  amount: number;
  balance: number;
  billedDate?: string;
}

interface PatronNote {
  id: number;
  title: string;
  value: string;
  public: boolean;
  createDate?: string;
  creator?: number;
}

interface PenaltyType {
  id: number;
  name: string;
  label: string;
  blockList: string;
}

type RecordPresence = {
  actorName: string | null;
  activity: "viewing" | "editing";
  lastSeenAt: string;
};

type RecordTask = {
  id: number;
  title: string;
  body: string | null;
  status: "open" | "done" | "canceled";
  createdAt: string;
};

function toDateLabel(value?: string) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString();
}

export default function PatronDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { addPin, removePin, isPinned } = useWorkforms();
  
  const patronId = params?.id ? parseInt(String(params.id), 10) : null;

  const [patron, setPatron] = useState<PatronDetails | null>(null);
  const [checkouts, setCheckouts] = useState<CheckoutRow[]>([]);
  const [holds, setHolds] = useState<HoldRow[]>([]);
  const [bills, setBills] = useState<BillRow[]>([]);
  const [notes, setNotes] = useState<PatronNote[]>([]);
  const [penaltyTypes, setPenaltyTypes] = useState<PenaltyType[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  const refreshIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const [presence, setPresence] = useState<RecordPresence[]>([]);
  const [tasks, setTasks] = useState<RecordTask[]>([]);
  const [tasksLoading, setTasksLoading] = useState(false);
  const [tasksError, setTasksError] = useState<string | null>(null);
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [newTaskBody, setNewTaskBody] = useState("");

  // Dialog states
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [blockDialogOpen, setBlockDialogOpen] = useState(false);
  const [noteDialogOpen, setNoteDialogOpen] = useState(false);
  const [photoUploadOpen, setPhotoUploadOpen] = useState(false);
  const [patronPhotoUrl, setPatronPhotoUrl] = useState<string | undefined>(undefined);

  // Edit form state
  const [editForm, setEditForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    active: true,
    barred: false,
  });

  // Block form state
  const [blockForm, setBlockForm] = useState({
    penaltyType: "",
    note: "",
  });

  // Note form state
  const [noteForm, setNoteForm] = useState({
    title: "",
    value: "",
    public: false,
  });

  const loadPatronData = useCallback(async () => {
    if (!patronId) return;

    setIsLoading(true);
    setError(null);
    try {
      const [patronRes, circRes, holdsRes, billsRes, notesRes, penaltiesRes, photoRes] = await Promise.all([
        fetchWithAuth(`/api/evergreen/patrons?id=${patronId}`),
        fetchWithAuth(`/api/evergreen/circulation?patron_id=${patronId}`),
        fetchWithAuth(`/api/evergreen/circulation?action=holds&patron_id=${patronId}`),
        fetchWithAuth(`/api/evergreen/circulation?action=bills&patron_id=${patronId}`),
        fetchWithAuth(`/api/evergreen/patrons`, {
          method: "PATCH",
          body: JSON.stringify({ action: "getNotes", patronId }),
        }),
        fetchWithAuth(`/api/evergreen/patrons`, {
          method: "PATCH",
          body: JSON.stringify({ action: "getPenaltyTypes" }),
        }),
        fetchWithAuth(`/api/patron-photos?patronId=${patronId}`),
      ]);

      const patronData = await patronRes.json();
      if (!patronData.ok || !patronData.patron) {
        throw new Error(patronData.error || "Patron not found");
      }
      setPatron(patronData.patron);
      const photoData = await photoRes.json().catch(() => null);
      if (photoData?.success && photoData?.url) {
        setPatronPhotoUrl(photoData.url);
      } else {
        setPatronPhotoUrl(undefined);
      }
      setEditForm({
        firstName: patronData.patron.first_given_name || "",
        lastName: patronData.patron.family_name || "",
        email: patronData.patron.email || "",
        phone: patronData.patron.day_phone || "",
        active: patronData.patron.active,
        barred: patronData.patron.barred,
      });

      const circData = await circRes.json();
      if (circData.ok && circData.checkouts) {
        const mapStatus = (label: string, list: any[]) =>
          (list || []).map((item: any, idx: number) => ({
            id: item.circId || item.id || `${label}:${item.barcode || idx}:${item.dueDate || ""}`,
            title: item.title || "Item",
            barcode: item.barcode || "—",
            dueDate: item.dueDate,
            status: label,
          }));

        const rows = [
          ...mapStatus("Checked out", circData.checkouts.out || []),
          ...mapStatus("Overdue", circData.checkouts.overdue || []),
          ...mapStatus("Claims returned", circData.checkouts.claims_returned || []),
          ...mapStatus("Lost", circData.checkouts.lost || []),
          ...mapStatus("Long overdue", circData.checkouts.long_overdue || []),
        ];
        setCheckouts(rows);
      }

      const holdsData = await holdsRes.json();
      if (holdsData.ok && Array.isArray(holdsData.holds)) {
        setHolds(
          holdsData.holds.map((hold: any) => ({
            id: hold.id,
            title: hold.title || "Hold",
            author: hold.author,
            status: hold.captureTime ? "Ready" : hold.frozen ? "Frozen" : "Active",
            pickupLib: hold.pickupLib,
            requestTime: hold.requestTime,
          }))
        );
      }

      const billsData = await billsRes.json();
      if (billsData.ok && Array.isArray(billsData.bills)) {
        setBills(
          billsData.bills.map((bill: any) => ({
            id: bill.id,
            title:
              bill.xact?.circulation?.target_copy?.call_number?.record?.simple_record?.title ||
              bill.note ||
              bill.billing_type ||
              "Fee",
            amount: parseFloat(bill.amount || 0),
            balance: parseFloat(bill.xact?.balance_owed || bill.balance_owed || bill.amount || 0),
            billedDate: bill.billing_ts,
          }))
        );
      }

      const notesData = await notesRes.json();
      if (notesData.ok && Array.isArray(notesData.notes)) {
        setNotes(notesData.notes);
      }

      const penaltiesData = await penaltiesRes.json();
      if (penaltiesData.ok && Array.isArray(penaltiesData.penaltyTypes)) {
        setPenaltyTypes(penaltiesData.penaltyTypes);
      }
    } catch (err: any) {
      setError(err?.message || "Failed to load patron");
    } finally {
      setIsLoading(false);
    }
  }, [patronId]);

  useEffect(() => {
    loadPatronData();
  }, [loadPatronData]);

  // Auto-refresh interval (every 30 seconds)
  useEffect(() => {
    const REFRESH_INTERVAL_MS = 30000; // 30 seconds

    refreshIntervalRef.current = setInterval(async () => {
      if (!patronId || isLoading) return;
      setIsRefreshing(true);
      try {
        await loadPatronData();
        setLastRefresh(new Date());
      } finally {
        setIsRefreshing(false);
      }
    }, REFRESH_INTERVAL_MS);

    return () => {
      if (refreshIntervalRef.current) {
        clearInterval(refreshIntervalRef.current);
      }
    };
  }, [patronId, isLoading, loadPatronData]);

  const patronIdNum = patronId || 0;

  const loadPresence = useCallback(async () => {
    if (!patronIdNum) return;
    try {
      const res = await fetchWithAuth(`/api/collaboration/presence?recordType=patron&recordId=${patronIdNum}`);
      const json = await res.json();
      if (!res.ok || json.ok === false) return;
      setPresence(Array.isArray(json.presence) ? json.presence : []);
    } catch {
      // Best-effort.
    }
  }, [patronIdNum]);

  const heartbeatPresence = useCallback(
    async (activity: "viewing" | "editing") => {
      if (!patronIdNum) return;
      try {
        await fetchWithAuth("/api/collaboration/presence", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ recordType: "patron", recordId: patronIdNum, activity }),
        });
      } catch {
        // Best-effort.
      }
    },
    [patronIdNum]
  );

  const loadTasks = useCallback(async () => {
    if (!patronIdNum) return;
    setTasksLoading(true);
    setTasksError(null);
    try {
      const res = await fetchWithAuth(`/api/collaboration/tasks?recordType=patron&recordId=${patronIdNum}`);
      const json = await res.json();
      if (!res.ok || json.ok === false) throw new Error(json.error || "Failed to load tasks");
      setTasks(Array.isArray(json.tasks) ? json.tasks : []);
    } catch (e) {
      setTasksError(e instanceof Error ? e.message : String(e));
      setTasks([]);
    } finally {
      setTasksLoading(false);
    }
  }, [patronIdNum]);

  const createTask = useCallback(async () => {
    if (!patronIdNum) return;
    const title = newTaskTitle.trim();
    if (!title) return;
    try {
      const res = await fetchWithAuth("/api/collaboration/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recordType: "patron",
          recordId: patronIdNum,
          title,
          body: newTaskBody.trim() || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok || json.ok === false) throw new Error(json.error || "Failed to create task");
      setNewTaskTitle("");
      setNewTaskBody("");
      await loadTasks();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    }
  }, [loadTasks, newTaskBody, newTaskTitle, patronIdNum]);

  const setTaskStatus = useCallback(
    async (taskId: number, status: "open" | "done" | "canceled") => {
      try {
        const res = await fetchWithAuth("/api/collaboration/tasks", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: taskId, status }),
        });
        const json = await res.json();
        if (!res.ok || json.ok === false) throw new Error(json.error || "Failed to update task");
        await loadTasks();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : String(e));
      }
    },
    [loadTasks]
  );

  useEffect(() => {
    if (!patronIdNum) return;
    const activity: "viewing" | "editing" = editDialogOpen ? "editing" : "viewing";
    void heartbeatPresence(activity);
    void loadPresence();
    const t = window.setInterval(() => {
      void heartbeatPresence(activity);
      void loadPresence();
    }, 20000);
    return () => window.clearInterval(t);
  }, [editDialogOpen, heartbeatPresence, loadPresence, patronIdNum]);

  useEffect(() => {
    if (!patronIdNum) return;
    void loadTasks();
  }, [loadTasks, patronIdNum]);

  const handleManualRefresh = async () => {
    setIsRefreshing(true);
    try {
      await loadPatronData();
      setLastRefresh(new Date());
      toast.success("Data refreshed");
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleSaveEdit = async () => {
    if (!patronId) return;

    try {
      const res = await fetchWithAuth(`/api/evergreen/patrons`, {
        method: "PUT",
        body: JSON.stringify({
          id: patronId,
          firstName: editForm.firstName,
          lastName: editForm.lastName,
          email: editForm.email,
          phone: editForm.phone,
          active: editForm.active,
          barred: editForm.barred,
        }),
      });
      const data = await res.json();
      if (!data.ok) {
        throw new Error(data.error || "Update failed");
      }
      toast.success("Patron updated - changes saved successfully.");
      setEditDialogOpen(false);
      loadPatronData();
    } catch (err: any) {
      toast.error(err?.message || "Failed to update patron");
    }
  };

  const handleAddBlock = async () => {
    if (!patronId || !blockForm.penaltyType) return;

    try {
      const res = await fetchWithAuth(`/api/evergreen/patrons`, {
        method: "PATCH",
        body: JSON.stringify({
          action: "addBlock",
          patronId,
          penaltyType: parseInt(blockForm.penaltyType, 10),
          note: blockForm.note,
        }),
      });
      const data = await res.json();
      if (!data.ok) {
        throw new Error(data.error || "Failed to add block");
      }
      toast.success("Block added - penalty applied to patron.");
      setBlockDialogOpen(false);
      setBlockForm({ penaltyType: "", note: "" });
      loadPatronData();
    } catch (err: any) {
      toast.error(err?.message || "Failed to add block");
    }
  };

  const handleRemoveBlock = async (penaltyId: number) => {
    if (!patronId) return;

    try {
      const res = await fetchWithAuth(`/api/evergreen/patrons`, {
        method: "PATCH",
        body: JSON.stringify({
          action: "removeBlock",
          patronId,
          penaltyId,
        }),
      });
      const data = await res.json();
      if (!data.ok) {
        throw new Error(data.error || "Failed to remove block");
      }
      toast.success("Block removed from patron.");
      loadPatronData();
    } catch (err: any) {
      toast.error(err?.message || "Failed to remove block");
    }
  };

  const handleAddNote = async () => {
    if (!patronId || !noteForm.value) return;

    try {
      const res = await fetchWithAuth(`/api/evergreen/patrons`, {
        method: "PATCH",
        body: JSON.stringify({
          action: "addNote",
          patronId,
          title: noteForm.title || "Note",
          value: noteForm.value,
          public: noteForm.public,
        }),
      });
      const data = await res.json();
      if (!data.ok) {
        throw new Error(data.error || "Failed to add note");
      }
      toast.success("Note added to patron record.");
      setNoteDialogOpen(false);
      setNoteForm({ title: "", value: "", public: false });
      loadPatronData();
    } catch (err: any) {
      toast.error(err?.message || "Failed to add note");
    }
  };

  const handleDeleteNote = async (noteId: number) => {
    if (!patronId) return;

    try {
      const res = await fetchWithAuth(`/api/evergreen/patrons`, {
        method: "PATCH",
        body: JSON.stringify({
          action: "deleteNote",
          patronId,
          noteId,
        }),
      });
      const data = await res.json();
      if (!data.ok) {
        throw new Error(data.error || "Failed to delete note");
      }
      toast.success("Note deleted from patron record.");
      loadPatronData();
    } catch (err: any) {
      toast.error(err?.message || "Failed to delete note");
    }
  };

  const checkoutColumns = useMemo<ColumnDef<CheckoutRow>[]>(
    () => [
      {
        accessorKey: "title",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Item" />,
        cell: ({ row }) => (
          <div className="space-y-1">
            <div className="font-medium">{row.original.title}</div>
            <div className="text-xs text-muted-foreground font-mono">{row.original.barcode}</div>
          </div>
        ),
      },
      {
        accessorKey: "dueDate",
        header: "Due",
        cell: ({ row }) => <span className="text-xs">{toDateLabel(row.original.dueDate)}</span>,
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => <StatusBadge label={row.original.status} status={row.original.status === "Overdue" ? "error" : "info"} />,
      },
    ],
    []
  );

  const holdColumns = useMemo<ColumnDef<HoldRow>[]>(
    () => [
      {
        accessorKey: "title",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Title" />,
        cell: ({ row }) => (
          <div className="space-y-1">
            <div className="font-medium">{row.original.title}</div>
            <div className="text-xs text-muted-foreground">{row.original.author || "—"}</div>
          </div>
        ),
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => <StatusBadge label={row.original.status} status={row.original.status === "Ready" ? "success" : "pending"} />,
      },
      {
        accessorKey: "pickupLib",
        header: "Pickup",
        cell: ({ row }) => <span className="text-xs">{row.original.pickupLib || "—"}</span>,
      },
      {
        accessorKey: "requestTime",
        header: "Requested",
        cell: ({ row }) => <span className="text-xs">{toDateLabel(row.original.requestTime)}</span>,
      },
    ],
    []
  );

  const billColumns = useMemo<ColumnDef<BillRow>[]>(
    () => [
      {
        accessorKey: "title",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Bill" />,
        cell: ({ row }) => <span className="text-sm">{row.original.title}</span>,
      },
      {
        accessorKey: "amount",
        header: "Billed",
        cell: ({ row }) => <span className="text-xs">${row.original.amount.toFixed(2)}</span>,
      },
      {
        accessorKey: "balance",
        header: "Balance",
        cell: ({ row }) => (
          <span className={row.original.balance > 0 ? "text-xs text-destructive" : "text-xs"}>
            ${row.original.balance.toFixed(2)}
          </span>
        ),
      },
      {
        accessorKey: "billedDate",
        header: "Billed",
        cell: ({ row }) => <span className="text-xs">{toDateLabel(row.original.billedDate)}</span>,
      },
    ],
    []
  );

  if (!patronId) {
    return (
      <PageContainer>
        <PageHeader title="Patron" />
        <PageContent>
          <ErrorState title="Missing patron id" message="No patron id supplied." />
        </PageContent>
      </PageContainer>
    );
  }

  if (isLoading) {
    return <LoadingSpinner message="Loading patron..." />;
  }

  if (error || !patron) {
    return (
      <PageContainer>
        <PageHeader title="Patron" />
        <PageContent>
          <ErrorState title="Unable to load patron" message={error || "Unknown error"} />
        </PageContent>
      </PageContainer>
    );
  }

  const displayName = `${patron.family_name || ""}, ${patron.first_given_name || ""}`.trim();
  const penalties = patron.standing_penalties || [];
  const initials =
    patron.first_given_name || patron.family_name
      ? `${patron.first_given_name?.[0] || ""}${patron.family_name?.[0] || ""}`.toUpperCase()
      : "?";

  return (
    <ErrorBoundary onReset={() => router.refresh()}>
      <PageContainer>
	      <PageHeader
        title={
          <span className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              className="group relative inline-flex rounded-full"
              onClick={() => setPhotoUploadOpen(true)}
              title="Change patron photo"
            >
              <Avatar className="h-10 w-10">
                {patronPhotoUrl ? (
                  <AvatarImage
                    src={patronPhotoUrl}
                    alt={`${patron.first_given_name} ${patron.family_name}`.trim() || "Patron photo"}
                    onError={() => setPatronPhotoUrl(undefined)}
                  />
                ) : null}
                <AvatarFallback className="bg-[hsl(var(--brand-1))] text-white text-xs">{initials}</AvatarFallback>
              </Avatar>
              <span className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-full bg-black/50 opacity-0 transition-opacity group-hover:opacity-100">
                <Camera className="h-4 w-4 text-white" />
              </span>
            </button>
            <span className="truncate">{displayName || "Patron"}</span>
          </span>
        }
        subtitle={`Barcode ${patron.barcode}`}
        breadcrumbs={[{ label: "Patrons", href: "/staff/patrons" }, { label: "Details" }]}
        actions={[
          {
            label: "Refresh",
            onClick: handleManualRefresh,
            icon: RefreshCw,
            variant: "outline",
            loading: isRefreshing,
          },
          {
            label: "Edit",
            onClick: () => setEditDialogOpen(true),
            icon: Edit,
          },
          {
            label: "Checkout",
            onClick: () => router.push(`/staff/circulation/checkout?patron=${patron.barcode}`),
            icon: BookOpen,
            variant: "outline",
          },
          {
            label: "Bills",
            onClick: () => router.push(`/staff/circulation/bills?patron=${patron.barcode}`),
            icon: CreditCard,
            variant: "outline",
          },
          {
            label: isPinned("patron", String(patron.id)) ? "Unpin" : "Pin",
            onClick: () => {
              if (isPinned("patron", String(patron.id))) {
                removePin(`patron:${patron.id}`);
                toast.success("Unpinned from sidebar");
              } else {
                addPin({ type: "patron", id: String(patron.id), title: displayName || "Patron", subtitle: patron.barcode, href: `/staff/patrons/${patron.id}` });
                toast.success("Pinned to sidebar");
              }
            },
            icon: isPinned("patron", String(patron.id)) ? PinOff : Pin,
            variant: "outline",
          },
        ]}
	      >
	        <Badge variant="secondary" className="rounded-full">
	          ID {patron.id}
	        </Badge>
          <Badge variant="outline" className="rounded-full text-muted-foreground">
            Updated {lastRefresh.toLocaleTimeString()}
          </Badge>
	        {presence.length > 0 && (
	          <Badge variant="outline" className="rounded-full inline-flex items-center gap-2">
	            <Users className="h-3.5 w-3.5" />
	            {(() => {
              const names = presence
                .map((p) => p.actorName || "Staff")
                .slice(0, 2)
                .join(", ");
              const extra = presence.length > 2 ? ` +${presence.length - 2}` : "";
              const verb = presence.some((p) => p.activity === "editing") ? "editing" : "viewing";
              return `${names}${extra} ${verb}`;
            })()}
          </Badge>
        )}
        {patron.barred && (
          <Badge variant="destructive" className="gap-1">
            <Ban className="h-3 w-3" /> Barred
          </Badge>
        )}
        {!patron.active && (
          <Badge variant="secondary" className="gap-1">
            Inactive
          </Badge>
        )}
      </PageHeader>

      <PageContent className="space-y-6">
        {presence.some((p) => p.activity === "editing") && (
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              {(() => {
                const editing = presence.filter((p) => p.activity === "editing");
                const names = editing
                  .map((p) => p.actorName || "Staff")
                  .slice(0, 2)
                  .join(", ");
                const extra = editing.length > 2 ? ` +${editing.length - 2}` : "";
                return `${names}${extra} is editing this patron record. Changes are not locked; coordinate to avoid overwrites.`;
              })()}
            </AlertDescription>
          </Alert>
        )}

        <PatronCard
          patron={{
            id: patron.id,
            barcode: patron.barcode,
            firstName: patron.first_given_name,
            lastName: patron.family_name,
            displayName: displayName,
            email: patron.email,
            phone: patron.day_phone,
            homeLibrary: String(patron.home_ou || ""),
            profileGroup: patron.profile?.name || "Patron",
            active: patron.active,
            barred: patron.barred,
            hasAlerts: penalties.length > 0,
            alertCount: penalties.length,
            balanceOwed: bills.reduce((sum, b) => sum + b.balance, 0),
            checkoutsCount: checkouts.length,
            holdsCount: holds.length,
            overdueCount: checkouts.filter((c) => c.status === "Overdue").length,
          }}
          variant="detailed"
        />

        <Card className="rounded-2xl border-border/70 shadow-sm">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <ClipboardList className="h-4 w-4" />
                <CardTitle className="text-base">Tasks & Notes</CardTitle>
              </div>
              <Button size="sm" variant="outline" onClick={() => void loadTasks()} disabled={tasksLoading}>
                {tasksLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Refresh"}
              </Button>
            </div>
            <CardDescription>Assignable follow-ups tied to this patron record.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="task-title">Task title</Label>
                <Input
                  id="task-title"
                  value={newTaskTitle}
                  onChange={(e) => setNewTaskTitle(e.target.value)}
                  placeholder="e.g., Verify address for renewal"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="task-note">Optional note</Label>
                <Input
                  id="task-note"
                  value={newTaskBody}
                  onChange={(e) => setNewTaskBody(e.target.value)}
                  placeholder="Short context (no PII beyond this record)"
                />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button onClick={() => void createTask()} disabled={!newTaskTitle.trim()}>
                Add task
              </Button>
              {tasksError ? <div className="text-sm text-muted-foreground">Error: {tasksError}</div> : null}
            </div>

            {tasks.length === 0 && !tasksLoading ? (
              <div className="text-sm text-muted-foreground">No tasks yet.</div>
            ) : (
              <div className="space-y-2">
                {tasks.slice(0, 8).map((t) => (
                  <div key={t.id} className="rounded-xl border border-border/70 bg-muted/20 px-3 py-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="font-medium truncate">{t.title}</div>
                        {t.body ? (
                          <div className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{t.body}</div>
                        ) : null}
                      </div>
                      <Badge variant="outline" className="shrink-0">{t.status}</Badge>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <Button size="sm" variant="outline" onClick={() => void setTaskStatus(t.id, "open")} disabled={t.status === "open"}>
                        Open
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => void setTaskStatus(t.id, "done")} disabled={t.status === "done"}>
                        Done
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => void setTaskStatus(t.id, "canceled")} disabled={t.status === "canceled"}>
                        Cancel
                      </Button>
                      <span className="text-[11px] text-muted-foreground ml-auto">
                        {toDateLabel(t.createdAt)}
                      </span>
                    </div>
                  </div>
                ))}
                {tasks.length > 8 ? (
                  <div className="text-xs text-muted-foreground">Showing 8 of {tasks.length}.</div>
                ) : null}
              </div>
            )}
          </CardContent>
        </Card>

        <Tabs defaultValue="activity" className="w-full">
          <TabsList>
            <TabsTrigger value="activity">Activity</TabsTrigger>
            <TabsTrigger value="blocks" className="gap-2">
              Blocks {penalties.length > 0 && <Badge variant="destructive" className="h-5 w-5 p-0 text-xs">{penalties.length}</Badge>}
            </TabsTrigger>
            <TabsTrigger value="notes" className="gap-2">
              Notes {notes.length > 0 && <Badge variant="secondary" className="h-5 w-5 p-0 text-xs">{notes.length}</Badge>}
            </TabsTrigger>
            <TabsTrigger value="notices">Notices</TabsTrigger>
          </TabsList>

          <TabsContent value="activity" className="space-y-6 mt-4">
            <div className="grid gap-6 lg:grid-cols-2">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Checkouts</CardTitle>
                </CardHeader>
                <CardContent>
                  <DataTable
                    columns={checkoutColumns}
                    data={checkouts}
                    searchable={false}
                    emptyState={
                      <EmptyState
                        title="No checkouts"
                        description="No items currently checked out."
                        action={
                          patron?.barcode
                            ? {
                                label: "Check out an item",
                                onClick: () =>
                                  router.push(`/staff/circulation/checkout?patron=${encodeURIComponent(patron.barcode)}`),
                              }
                            : undefined
                        }
                      />
                    }
                  />
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Holds</CardTitle>
                </CardHeader>
                <CardContent>
                  <DataTable
                    columns={holdColumns}
                    data={holds}
                    searchable={false}
                    emptyState={
                      <EmptyState
                        title="No holds"
                        description="No active holds for this patron."
                        action={
                          patron?.barcode
                            ? {
                                label: "Manage holds",
                                onClick: () =>
                                  router.push(`/staff/circulation/holds-management?patron=${encodeURIComponent(patron.barcode)}`),
                              }
                            : undefined
                        }
                      />
                    }
                  />
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Bills & Fees</CardTitle>
              </CardHeader>
              <CardContent>
                <DataTable
                  columns={billColumns}
                  data={bills}
                  searchable={false}
                  emptyState={
                    <EmptyState
                      title="No bills"
                      description="No outstanding bills."
                      action={
                        patron?.barcode
                          ? {
                              label: "Open Bills & Payments",
                              onClick: () =>
                                router.push(`/staff/circulation/bills?patron=${encodeURIComponent(patron.barcode)}`),
                            }
                          : undefined
                      }
                    />
                  }
                />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="blocks" className="mt-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-3">
                <div>
                  <CardTitle className="text-base">Standing Penalties (Blocks)</CardTitle>
                  <CardDescription>Blocks prevent certain actions like checkout or holds</CardDescription>
                </div>
                <Button size="sm" onClick={() => setBlockDialogOpen(true)}>
                  <Plus className="h-4 w-4 mr-1" /> Add Block
                </Button>
              </CardHeader>
              <CardContent>
                {penalties.length === 0 ? (
                  <EmptyState title="No blocks" description="This patron has no standing penalties." />
                ) : (
                  <div className="space-y-3">
                    {penalties.map((penalty: any, idx: number) => {
                      const penaltyId = penalty.id || penalty.__p?.[0];
                      const penaltyTypeId = penalty.standing_penalty || penalty.__p?.[1];
                      const note = penalty.note || penalty.__p?.[2];
                      const setDate = penalty.set_date || penalty.__p?.[3];
                      const penaltyInfo = penaltyTypes.find(t => t.id === penaltyTypeId);

                      return (
                        <div key={penaltyId || idx} className="flex items-start justify-between p-3 rounded-lg border bg-destructive/5 border-destructive/20">
                          <div className="flex gap-3">
                            <AlertTriangle className="h-5 w-5 text-destructive mt-0.5" />
                            <div>
                              <div className="font-medium text-destructive">{penaltyInfo?.label || `Penalty #${penaltyTypeId}`}</div>
                              {note && <p className="text-sm text-muted-foreground mt-1">{note}</p>}
                              <p className="text-xs text-muted-foreground mt-1">Added {toDateLabel(setDate)}</p>
                            </div>
                          </div>
                          <Button variant="destructive" size="sm" onClick={() => handleRemoveBlock(penaltyId)}>
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="notes" className="mt-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-3">
                <div>
                  <CardTitle className="text-base">Patron Notes</CardTitle>
                  <CardDescription>Staff and public notes attached to this patron</CardDescription>
                </div>
                <Button size="sm" onClick={() => setNoteDialogOpen(true)}>
                  <Plus className="h-4 w-4 mr-1" /> Add Note
                </Button>
              </CardHeader>
              <CardContent>
                {notes.length === 0 ? (
                  <EmptyState title="No notes" description="No notes have been added for this patron." />
                ) : (
                  <div className="space-y-3">
                    {notes.map((note) => (
                      <div key={note.id} className="flex items-start justify-between p-3 rounded-lg border">
                        <div className="flex gap-3">
                          <FileText className="h-5 w-5 text-muted-foreground mt-0.5" />
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-medium">{note.title}</span>
                              {note.public && <Badge variant="outline" className="text-xs">Public</Badge>}
                            </div>
                            <p className="text-sm text-muted-foreground mt-1 whitespace-pre-wrap">{note.value}</p>
                            <p className="text-xs text-muted-foreground mt-1">Created {toDateLabel(note.createDate)}</p>
                          </div>
                        </div>
                        <Button variant="destructive" size="sm" onClick={() => handleDeleteNote(note.id)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="notices" className="mt-4">
            <PatronNoticesTab patronId={patronId || 0} patronEmail={patron?.email} />
          </TabsContent>
        </Tabs>
      </PageContent>

      <PatronPhotoUpload
        open={photoUploadOpen}
        onOpenChange={setPhotoUploadOpen}
        patronId={patron.id}
        patronName={displayName || patron.barcode}
        currentPhotoUrl={patronPhotoUrl}
        onPhotoUploaded={(url) => setPatronPhotoUrl(url)}
      />

      {/* Edit Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Patron</DialogTitle>
            <DialogDescription>Update patron information</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="firstName">First Name</Label>
                <Input
                  id="firstName"
                  value={editForm.firstName}
                  onChange={(e) => setEditForm({ ...editForm, firstName: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="lastName">Last Name</Label>
                <Input
                  id="lastName"
                  value={editForm.lastName}
                  onChange={(e) => setEditForm({ ...editForm, lastName: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={editForm.email}
                onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">Phone</Label>
              <Input
                id="phone"
                value={editForm.phone}
                onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
              />
            </div>
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="active">Active</Label>
                <p className="text-xs text-muted-foreground">Allow patron to use library services</p>
              </div>
              <Switch id="active"
                checked={editForm.active}
                onCheckedChange={(checked) => setEditForm({ ...editForm, active: checked })}
              />
            </div>
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="barred">Barred</Label>
                <p className="text-xs text-muted-foreground">Block all library services</p>
              </div>
              <Switch id="barred"
                checked={editForm.barred}
                onCheckedChange={(checked) => setEditForm({ ...editForm, barred: checked })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSaveEdit}>Save Changes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Block Dialog */}
      <Dialog open={blockDialogOpen} onOpenChange={setBlockDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Block</DialogTitle>
            <DialogDescription>Apply a standing penalty to this patron</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="penaltyType">Penalty Type</Label>
              <Select
                value={blockForm.penaltyType}
                onValueChange={(value) => setBlockForm({ ...blockForm, penaltyType: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select penalty type" />
                </SelectTrigger>
                <SelectContent>
                  {penaltyTypes.map((type) => (
                    <SelectItem key={type.id} value={String(type.id)}>
                      {type.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="blockNote">Note (optional)</Label>
              <Textarea
                id="blockNote"
                value={blockForm.note}
                onChange={(e) => setBlockForm({ ...blockForm, note: e.target.value })}
                placeholder="Reason for this block..."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBlockDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleAddBlock} disabled={!blockForm.penaltyType}>Add Block</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Note Dialog */}
      <Dialog open={noteDialogOpen} onOpenChange={setNoteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Note</DialogTitle>
            <DialogDescription>Add a note to this patron record</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="noteTitle">Title</Label>
              <Input
                id="noteTitle"
                value={noteForm.title}
                onChange={(e) => setNoteForm({ ...noteForm, title: e.target.value })}
                placeholder="Note title..."
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="noteValue">Note</Label>
              <Textarea
                id="noteValue"
                value={noteForm.value}
                onChange={(e) => setNoteForm({ ...noteForm, value: e.target.value })}
                placeholder="Note content..."
                rows={4}
              />
            </div>
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="public">Public</Label>
                <p className="text-xs text-muted-foreground">Visible to patron in their account</p>
              </div>
              <Switch id="public"
                checked={noteForm.public}
                onCheckedChange={(checked) => setNoteForm({ ...noteForm, public: checked })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNoteDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleAddNote} disabled={!noteForm.value}>Add Note</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      </PageContainer>
    </ErrorBoundary>
  );
}
