"use client";

import { fetchWithAuth } from "@/lib/client-fetch";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";

import {
  PageContainer,
  PageHeader,
  PageContent,
  LoadingSpinner,
  ErrorState,
  PatronCard,
  ErrorBoundary,
  PatronPhotoUpload,
} from "@/components/shared";
import { useWorkforms } from "@/contexts/workforms-context";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { toast } from "sonner";
import {
  Pin,
  PinOff,
  AlertTriangle,
  Ban,
  BookOpen,
  Camera,
  CreditCard,
  Edit,
  Loader2,
  RefreshCw,
  Sparkles,
  ThumbsDown,
  ThumbsUp,
  Users,
} from "lucide-react";
import { featureFlags } from "@/lib/feature-flags";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

import type {
  PatronDetails,
  CheckoutRow,
  HoldRow,
  BillRow,
  PatronNote,
  PenaltyType,
  RecordPresence,
  RecordTask,
} from "./_components/patron-types";
import { toDateLabel as _toDateLabel } from "./_components/patron-types";
import { useCheckoutColumns, useHoldColumns, useBillColumns } from "./_components/patron-columns";
import { PatronDialogs } from "./_components/PatronDialogs";
import { TasksNotesCard } from "./_components/TasksNotesCard";
import { PatronActivityTabs } from "./_components/PatronActivityTabs";

type PatronCopilotGuidance = {
  id: string;
  title: string;
  why: string;
  impact: "high" | "medium" | "low";
  steps: string[];
  deepLink: string;
};

type PatronCopilotData = {
  summary: string;
  riskFactors: string[];
  guidance: PatronCopilotGuidance[];
  caveats?: string[];
  drilldowns: Array<{ label: string; url: string }>;
};

function PatronCopilotWidget({
  patronId,
  checkoutsCount,
  holdsCount,
  overdueCount,
  balanceOwed,
  alertCount,
  active,
  barred,
  profileGroup,
}: {
  patronId: number;
  checkoutsCount: number;
  holdsCount: number;
  overdueCount: number;
  balanceOwed: number;
  alertCount: number;
  active: boolean;
  barred: boolean;
  profileGroup?: string;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draftId, setDraftId] = useState<string | null>(null);
  const [data, setData] = useState<PatronCopilotData | null>(null);
  const [feedback, setFeedback] = useState<null | "accepted" | "rejected">(null);
  const autoRequested = useRef(false);

  const generate = useCallback(async () => {
    if (!featureFlags.ai) return;
    setLoading(true);
    setError(null);
    setData(null);
    setDraftId(null);
    setFeedback(null);
    try {
      const res = await fetchWithAuth("/api/ai/patron-copilot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          patronId,
          checkoutsCount,
          holdsCount,
          overdueCount,
          balanceOwed,
          alertCount,
          active,
          barred,
          profileGroup,
        }),
      });
      const json = await res.json();
      if (!res.ok || json.ok === false) {
        throw new Error(json.error || "Patron copilot failed");
      }
      const response = (json.response || null) as PatronCopilotData | null;
      if (!response) throw new Error("Patron copilot returned an empty payload");
      setData(response);
      setDraftId(typeof json.draftId === "string" ? json.draftId : null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [
    patronId,
    checkoutsCount,
    holdsCount,
    overdueCount,
    balanceOwed,
    alertCount,
    active,
    barred,
    profileGroup,
  ]);

  const submitFeedback = useCallback(
    async (decision: "accepted" | "rejected") => {
      if (!draftId) return;
      setFeedback(decision);
      try {
        await fetchWithAuth(`/api/ai/drafts/${draftId}/decision`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ decision, suggestionId: "patron_copilot" }),
        });
      } catch {
        // Best-effort only.
      }
    },
    [draftId]
  );

  useEffect(() => {
    if (!featureFlags.ai || autoRequested.current) return;
    autoRequested.current = true;
    void generate();
  }, [generate]);

  if (!featureFlags.ai) return null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-3">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <Sparkles className="h-4 w-4" />
              Patron Copilot (Kimi 2.5 Pro)
            </CardTitle>
            <CardDescription>AI-powered patron interaction guidance.</CardDescription>
          </div>
          <div className="flex items-center gap-1">
            <Button size="sm" variant="outline" onClick={() => void generate()} disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              Refresh
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => void submitFeedback("accepted")}
              disabled={!draftId || feedback !== null}
              title="Useful"
            >
              <ThumbsUp className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => void submitFeedback("rejected")}
              disabled={!draftId || feedback !== null}
              title="Not useful"
            >
              <ThumbsDown className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {loading && (
          <div className="text-sm text-muted-foreground flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            Analyzing patron context...
          </div>
        )}
        {error && (
          <div className="text-sm text-muted-foreground">Assistant unavailable: {error}</div>
        )}
        {!loading && !error && !data && (
          <div className="text-sm text-muted-foreground">
            Refresh to generate patron interaction guidance.
          </div>
        )}
        {data && (
          <div className="space-y-3">
            <div className="text-sm">{data.summary}</div>
            {data.riskFactors.length > 0 ? (
              <div className="grid gap-2">
                {data.riskFactors.slice(0, 4).map((factor, idx) => (
                  <div key={idx} className="rounded-lg border bg-muted/20 px-3 py-2 text-sm">
                    {factor}
                  </div>
                ))}
              </div>
            ) : null}
            {Array.isArray(data.caveats) && data.caveats.length > 0 ? (
              <div className="rounded-lg border bg-muted/20 px-3 py-2 text-sm text-muted-foreground">
                <div className="font-medium text-foreground/80 mb-1">Caveats</div>
                <ul className="list-disc list-inside space-y-1">
                  {data.caveats.slice(0, 3).map((caveat, idx) => (
                    <li key={idx}>{caveat}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            {data.guidance.length > 0 ? (
              <div className="space-y-2">
                <div className="text-xs uppercase tracking-wide text-muted-foreground">
                  Guidance
                </div>
                {data.guidance.slice(0, 4).map((item) => (
                  <div key={item.id} className="rounded-lg border bg-muted/15 px-3 py-2">
                    <div className="text-sm font-semibold">{item.title}</div>
                    <div className="mt-1 text-xs text-muted-foreground">{item.why}</div>
                    <div className="mt-2 text-xs">
                      {item.steps.slice(0, 3).map((step, index) => (
                        <div key={`${item.id}-step-${index}`} className="text-muted-foreground">
                          {index + 1}. {step}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        )}
      </CardContent>
    </Card>
  );
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

  const [editForm, setEditForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    active: true,
    barred: false,
  });
  const [blockForm, setBlockForm] = useState({ penaltyType: "", note: "" });
  const [noteForm, setNoteForm] = useState({ title: "", value: "", public: false });

  // Column hooks
  const checkoutColumns = useCheckoutColumns();
  const holdColumns = useHoldColumns();
  const billColumns = useBillColumns();

  const loadPatronData = useCallback(async () => {
    if (!patronId) return;
    setIsLoading(true);
    setError(null);
    try {
      const [patronRes, circRes, holdsRes, billsRes, notesRes, penaltiesRes, photoRes] =
        await Promise.all([
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
      if (!patronData.ok || !patronData.patron)
        throw new Error(patronData.error || "Patron not found");
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
            barcode: item.barcode || "\u2014",
            dueDate: item.dueDate,
            status: label,
          }));
        setCheckouts([
          ...mapStatus("Checked out", circData.checkouts.out || []),
          ...mapStatus("Overdue", circData.checkouts.overdue || []),
          ...mapStatus("Claims returned", circData.checkouts.claims_returned || []),
          ...mapStatus("Lost", circData.checkouts.lost || []),
          ...mapStatus("Long overdue", circData.checkouts.long_overdue || []),
        ]);
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
      if (notesData.ok && Array.isArray(notesData.notes)) setNotes(notesData.notes);

      const penaltiesData = await penaltiesRes.json();
      if (penaltiesData.ok && Array.isArray(penaltiesData.penaltyTypes))
        setPenaltyTypes(penaltiesData.penaltyTypes);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message || "Failed to load patron");
    } finally {
      setIsLoading(false);
    }
  }, [patronId]);

  useEffect(() => {
    loadPatronData();
  }, [loadPatronData]);

  useEffect(() => {
    refreshIntervalRef.current = setInterval(async () => {
      if (!patronId || isLoading) return;
      setIsRefreshing(true);
      try {
        await loadPatronData();
        setLastRefresh(new Date());
      } finally {
        setIsRefreshing(false);
      }
    }, 30000);
    return () => {
      if (refreshIntervalRef.current) clearInterval(refreshIntervalRef.current);
    };
  }, [patronId, isLoading, loadPatronData]);

  const patronIdNum = patronId || 0;

  const loadPresence = useCallback(async () => {
    if (!patronIdNum) return;
    try {
      const res = await fetchWithAuth(
        `/api/collaboration/presence?recordType=patron&recordId=${patronIdNum}`
      );
      const json = await res.json();
      if (!res.ok || json.ok === false) return;
      setPresence(Array.isArray(json.presence) ? json.presence : []);
    } catch {
      /* Best-effort. */
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
        /* Best-effort. */
      }
    },
    [patronIdNum]
  );

  const loadTasks = useCallback(async () => {
    if (!patronIdNum) return;
    setTasksLoading(true);
    setTasksError(null);
    try {
      const res = await fetchWithAuth(
        `/api/collaboration/tasks?recordType=patron&recordId=${patronIdNum}`
      );
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
      if (!data.ok) throw new Error(data.error || "Update failed");
      toast.success("Patron updated - changes saved successfully.");
      setEditDialogOpen(false);
      loadPatronData();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      toast.error(message || "Failed to update patron");
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
      if (!data.ok) throw new Error(data.error || "Failed to add block");
      toast.success("Block added - penalty applied to patron.");
      setBlockDialogOpen(false);
      setBlockForm({ penaltyType: "", note: "" });
      loadPatronData();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      toast.error(message || "Failed to add block");
    }
  };

  const handleRemoveBlock = async (penaltyId: number) => {
    if (!patronId) return;
    try {
      const res = await fetchWithAuth(`/api/evergreen/patrons`, {
        method: "PATCH",
        body: JSON.stringify({ action: "removeBlock", patronId, penaltyId }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "Failed to remove block");
      toast.success("Block removed from patron.");
      loadPatronData();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      toast.error(message || "Failed to remove block");
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
      if (!data.ok) throw new Error(data.error || "Failed to add note");
      toast.success("Note added to patron record.");
      setNoteDialogOpen(false);
      setNoteForm({ title: "", value: "", public: false });
      loadPatronData();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      toast.error(message || "Failed to add note");
    }
  };

  const handleDeleteNote = async (noteId: number) => {
    if (!patronId) return;
    try {
      const res = await fetchWithAuth(`/api/evergreen/patrons`, {
        method: "PATCH",
        body: JSON.stringify({ action: "deleteNote", patronId, noteId }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "Failed to delete note");
      toast.success("Note deleted from patron record.");
      loadPatronData();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      toast.error(message || "Failed to delete note");
    }
  };

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
  if (isLoading) return <LoadingSpinner message="Loading patron..." />;
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
                      alt={
                        `${patron.first_given_name} ${patron.family_name}`.trim() || "Patron photo"
                      }
                      onError={() => setPatronPhotoUrl(undefined)}
                    />
                  ) : null}
                  <AvatarFallback className="bg-[hsl(var(--brand-1))] text-white text-xs">
                    {initials}
                  </AvatarFallback>
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
            { label: "Edit", onClick: () => setEditDialogOpen(true), icon: Edit },
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
                  addPin({
                    type: "patron",
                    id: String(patron.id),
                    title: displayName || "Patron",
                    subtitle: patron.barcode,
                    href: `/staff/patrons/${patron.id}`,
                  });
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
              displayName,
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

          <PatronCopilotWidget
            patronId={patronId}
            checkoutsCount={checkouts.length}
            holdsCount={holds.length}
            overdueCount={checkouts.filter((c) => c.status === "Overdue").length}
            balanceOwed={bills.reduce((sum, b) => sum + b.balance, 0)}
            alertCount={penalties.length}
            active={patron.active}
            barred={patron.barred}
            profileGroup={patron.profile?.name}
          />

          <TasksNotesCard
            tasks={tasks}
            tasksLoading={tasksLoading}
            tasksError={tasksError}
            newTaskTitle={newTaskTitle}
            setNewTaskTitle={setNewTaskTitle}
            newTaskBody={newTaskBody}
            setNewTaskBody={setNewTaskBody}
            onCreateTask={() => void createTask()}
            onLoadTasks={() => void loadTasks()}
            onSetTaskStatus={(id, status) => void setTaskStatus(id, status)}
          />

          <PatronActivityTabs
            patron={patron}
            patronId={patronId}
            checkouts={checkouts}
            holds={holds}
            bills={bills}
            notes={notes}
            penaltyTypes={penaltyTypes}
            checkoutColumns={checkoutColumns}
            holdColumns={holdColumns}
            billColumns={billColumns}
            onSetBlockDialogOpen={setBlockDialogOpen}
            onSetNoteDialogOpen={setNoteDialogOpen}
            onRemoveBlock={handleRemoveBlock}
            onDeleteNote={handleDeleteNote}
          />
        </PageContent>

        <PatronPhotoUpload
          open={photoUploadOpen}
          onOpenChange={setPhotoUploadOpen}
          patronId={patron.id}
          patronName={displayName || patron.barcode}
          currentPhotoUrl={patronPhotoUrl}
          onPhotoUploaded={(url) => setPatronPhotoUrl(url)}
        />

        <PatronDialogs
          editDialogOpen={editDialogOpen}
          setEditDialogOpen={setEditDialogOpen}
          editForm={editForm}
          setEditForm={setEditForm}
          onSaveEdit={handleSaveEdit}
          blockDialogOpen={blockDialogOpen}
          setBlockDialogOpen={setBlockDialogOpen}
          blockForm={blockForm}
          setBlockForm={setBlockForm}
          penaltyTypes={penaltyTypes}
          onAddBlock={handleAddBlock}
          noteDialogOpen={noteDialogOpen}
          setNoteDialogOpen={setNoteDialogOpen}
          noteForm={noteForm}
          setNoteForm={setNoteForm}
          onAddNote={handleAddNote}
        />
      </PageContainer>
    </ErrorBoundary>
  );
}
