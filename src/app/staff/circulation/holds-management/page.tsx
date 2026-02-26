"use client";

import { fetchWithAuth } from "@/lib/client-fetch";

import { clientLogger } from "@/lib/client-logger";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/contexts/auth-context";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import {
  BookMarked,
  Clock,
  HelpCircle,
  Inbox,
  ListChecks,
  Loader2,
  Printer,
  RefreshCw,
  Search,
  Sparkles,
  ThumbsDown,
  ThumbsUp,
  Trash2,
} from "lucide-react";
import { featureFlags } from "@/lib/feature-flags";

import {
  BarcodeInput,
  DataTable,
  EmptyState,
  ErrorMessage,
  PageContainer,
  PageContent,
  PageHeader,
} from "@/components/shared";
import { escapeHtml, printHtml } from "@/lib/print";

import type { Hold, PullListItem, TabKey } from "./_components/holds-types";
import {
  useHoldsColumns,
  usePullColumns,
  useShelfColumns,
  useExpiredColumns,
} from "./_components/holds-columns";
import { HoldsDialogs } from "./_components/HoldsDialogs";

type HoldsCopilotAction = {
  id: string;
  title: string;
  why: string;
  impact: "high" | "medium" | "low";
  etaMinutes: number;
  steps: string[];
  deepLink: string;
};

type HoldsCopilotData = {
  summary: string;
  highlights: string[];
  actions: HoldsCopilotAction[];
  caveats?: string[];
  drilldowns: Array<{ label: string; url: string }>;
};

function HoldsCopilotWidget({ orgId }: { orgId: number }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draftId, setDraftId] = useState<string | null>(null);
  const [data, setData] = useState<HoldsCopilotData | null>(null);
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
      const res = await fetchWithAuth("/api/ai/holds-copilot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orgId,
          holds: { available: 0, pending: 0, in_transit: 0, total: 0 },
        }),
      });
      const json = await res.json();
      if (!res.ok || json.ok === false) {
        throw new Error(json.error || "Holds copilot failed");
      }
      const response = (json.response || null) as HoldsCopilotData | null;
      if (!response) throw new Error("Holds copilot returned an empty payload");
      setData(response);
      setDraftId(typeof json.draftId === "string" ? json.draftId : null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  const submitFeedback = useCallback(
    async (decision: "accepted" | "rejected") => {
      if (!draftId) return;
      setFeedback(decision);
      try {
        await fetchWithAuth(`/api/ai/drafts/${draftId}/decision`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ decision, suggestionId: "holds_copilot" }),
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
              Holds Copilot (Kimi 2.5 Pro)
            </CardTitle>
            <CardDescription>AI-powered hold queue prioritization guidance.</CardDescription>
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
            Analyzing hold queues...
          </div>
        )}
        {error && (
          <div className="text-sm text-muted-foreground">Assistant unavailable: {error}</div>
        )}
        {!loading && !error && !data && (
          <div className="text-sm text-muted-foreground">
            Refresh to generate prioritized hold management actions.
          </div>
        )}
        {data && (
          <div className="space-y-3">
            <div className="text-sm">{data.summary}</div>
            <div className="grid gap-2">
              {data.highlights.slice(0, 4).map((highlight, idx) => (
                <div key={idx} className="rounded-lg border bg-muted/20 px-3 py-2 text-sm">
                  {highlight}
                </div>
              ))}
            </div>
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
            {data.actions.length > 0 ? (
              <div className="space-y-2">
                <div className="text-xs uppercase tracking-wide text-muted-foreground">
                  Recommended Actions
                </div>
                {data.actions.slice(0, 4).map((action) => (
                  <div key={action.id} className="rounded-lg border bg-muted/15 px-3 py-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="text-sm font-semibold">{action.title}</div>
                      <Badge
                        variant={action.impact === "high" ? "destructive" : "outline"}
                        className="capitalize"
                      >
                        {action.impact} impact
                      </Badge>
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">{action.why}</div>
                    <div className="mt-2 text-xs">
                      {action.steps.slice(0, 3).map((step, index) => (
                        <div key={`${action.id}-step-${index}`} className="text-muted-foreground">
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

  const searchPatronHolds = useCallback(
    async (barcodeOverride?: string) => {
      const barcode = (barcodeOverride ?? patronBarcode).trim();
      if (!barcode) return;
      setLoading(true);
      setError(null);
      try {
        setPatronBarcode(barcode);
        const patronRes = await fetchWithAuth(
          `/api/evergreen/patrons?barcode=${encodeURIComponent(barcode)}`
        );
        const patronData = await patronRes.json();
        if (!patronData.ok || !patronData.patron) {
          setError("Patron not found");
          setPatronHolds([]);
          return;
        }
        setPatronId(patronData.patron.id);
        const holdsRes = await fetchWithAuth(
          `/api/evergreen/holds?action=patron_holds&patron_id=${patronData.patron.id}`
        );
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
    },
    [patronBarcode]
  );

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
          if (/^\d+$/.test(patronParam)) {
            try {
              const res = await fetchWithAuth(`/api/evergreen/patrons?id=${patronParam}`);
              const data = await res.json().catch(() => null);
              const resolved =
                data?.ok && data?.patron
                  ? data.patron?.barcode || data.patron?.card?.barcode || ""
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
      const res = await fetchWithAuth(
        `/api/evergreen/holds?action=pull_list&org_id=${orgId}&limit=100`
      );
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

  const handleThawHold = useCallback(
    async (hold: Hold) => {
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
    },
    [patronId, searchPatronHolds]
  );

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

  const handleResetHold = useCallback(
    async (hold: Hold) => {
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
    },
    [patronId, searchPatronHolds]
  );

  const buildHoldSlipHtml = useCallback(
    (hold: Hold) => {
      const pickup = hold.pickupLib ? getOrgName(hold.pickupLib) : getOrgName(orgId);
      const patron = hold.patronName
        ? `${hold.patronName}${hold.patronBarcode ? ` (${hold.patronBarcode})` : ""}`
        : hold.patronBarcode || "\u2014";
      const lines: Array<[string, string]> = [
        ["Time", new Date().toLocaleString()],
        ["Pickup", pickup],
        ["Hold", `#${hold.id}`],
        ["Patron", patron],
        ["Item", hold.itemBarcode || "\u2014"],
        ["Call Number", hold.callNumber || ""],
        ["Title", hold.title],
      ];
      if (hold.author) lines.push(["Author", hold.author]);
      if (hold.captureTime) lines.push(["Captured", new Date(hold.captureTime).toLocaleString()]);
      if (hold.shelfExpireTime)
        lines.push(["Shelf Expires", new Date(hold.shelfExpireTime).toLocaleString()]);
      const rendered = lines
        .filter(([, v]) => v && v !== "\u2014")
        .map(
          ([k, v]) =>
            `<div><span class="k">${escapeHtml(k)}:</span> <span class="v">${escapeHtml(v)}</span></div>`
        );
      return [
        '<div class="box pb">',
        '<h1 class="brand">StacksOS</h1>',
        '<div class="muted">Hold Slip</div>',
        '<div class="meta">',
        ...rendered,
        "</div>",
        "</div>",
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

  // Column hooks
  const holdsColumns = useHoldsColumns({
    onFreeze: (h) => {
      setSelectedHold(h);
      setFreezeDialogOpen(true);
    },
    onThaw: handleThawHold,
    onChangePickup: (h) => {
      setSelectedHold(h);
      setChangePickupDialogOpen(true);
    },
    onReset: handleResetHold,
    onAddNote: (h) => {
      setSelectedHold(h);
      setAddNoteDialogOpen(true);
    },
    onCancel: (h) => {
      setSelectedHold(h);
      setCancelDialogOpen(true);
    },
  });
  const pullColumns = usePullColumns();
  const shelfColumns = useShelfColumns({ onPrintSlip: handlePrintHoldSlip });
  const expiredColumns = useExpiredColumns({ onPrintSlip: handlePrintHoldSlip });

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
          { label: "Refresh", onClick: handleRefreshActive, icon: RefreshCw, loading },
          {
            label: "Walkthrough",
            onClick: () => window.location.assign("/staff/training?workflow=holds"),
            icon: HelpCircle,
            variant: "outline" as const,
          },
          ...(activeTab === "shelf" || activeTab === "expired"
            ? [
                {
                  label: "Print Slips",
                  onClick: handlePrintAllHoldSlips,
                  icon: Printer,
                  variant: "outline" as const,
                  disabled:
                    activeTab === "expired" ? expiredHolds.length === 0 : holdsShelf.length === 0,
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
        ]}
      >
        <div className="flex flex-wrap gap-2">
          <Badge variant="secondary" className="rounded-full">
            Org: {getOrgName(orgId)} (#{orgId})
          </Badge>
          <Badge variant="outline" className="rounded-full">
            {patronHolds.length} active holds
          </Badge>
        </div>
      </PageHeader>

      <PageContent className="space-y-6">
        <HoldsCopilotWidget orgId={orgId} />

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
            <TabsTrigger
              value="title"
              className="flex items-center gap-2"
              onClick={() => loadTitleHolds()}
            >
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
            <TabsTrigger
              value="expired"
              className="flex items-center gap-2"
              onClick={loadExpiredHolds}
            >
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
                  <Button variant="outline" onClick={() => setPatronBarcode("")}>
                    Clear
                  </Button>
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
                      ? {
                          label: "Search catalog",
                          onClick: () => router.push("/staff/catalog"),
                          icon: Search,
                        }
                      : {
                          label: "Evergreen setup checklist",
                          onClick: () => router.push("/staff/help#evergreen-setup"),
                        }
                  }
                  secondaryAction={
                    patronId
                      ? {
                          label: "Hold policies",
                          onClick: () => router.push("/staff/admin/policies/holds"),
                        }
                      : undefined
                  }
                >
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => router.push("/staff/help#evergreen-setup")}
                  >
                    Evergreen setup checklist
                  </Button>
                </EmptyState>
              }
            />
          </TabsContent>

          <TabsContent value="title" className="space-y-4">
            <Card className="rounded-2xl border-border/70 shadow-sm">
              <CardHeader>
                <CardTitle>Title Holds</CardTitle>
                <CardDescription>
                  Enter a Bib/Title ID to view and manage the hold queue.
                </CardDescription>
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
                  action={{
                    label: "Search catalog",
                    onClick: () => router.push("/staff/catalog"),
                    icon: Search,
                  }}
                  secondaryAction={
                    titleId.trim()
                      ? {
                          label: "Hold policies",
                          onClick: () => router.push("/staff/admin/policies/holds"),
                        }
                      : undefined
                  }
                >
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => router.push("/staff/help#evergreen-setup")}
                  >
                    Evergreen setup checklist
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
                  action={{
                    label: "Search catalog",
                    onClick: () => router.push("/staff/catalog"),
                    icon: Search,
                  }}
                  secondaryAction={{
                    label: "Hold policies",
                    onClick: () => router.push("/staff/admin/policies/holds"),
                  }}
                >
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => router.push("/staff/help#evergreen-setup")}
                  >
                    Evergreen setup checklist
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
                  secondaryAction={{
                    label: "Hold policies",
                    onClick: () => router.push("/staff/admin/policies/holds"),
                  }}
                >
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => router.push("/staff/help#evergreen-setup")}
                  >
                    Evergreen setup checklist
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
                  secondaryAction={{
                    label: "Hold policies",
                    onClick: () => router.push("/staff/admin/policies/holds"),
                  }}
                >
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => router.push("/staff/help#evergreen-setup")}
                  >
                    Evergreen setup checklist
                  </Button>
                </EmptyState>
              }
            />
          </TabsContent>
        </Tabs>
      </PageContent>

      <HoldsDialogs
        selectedHold={selectedHold}
        loading={loading}
        clearShelfDialogOpen={clearShelfDialogOpen}
        setClearShelfDialogOpen={setClearShelfDialogOpen}
        onClearShelf={handleClearShelf}
        orgName={getOrgName(orgId)}
        orgId={orgId}
        cancelDialogOpen={cancelDialogOpen}
        setCancelDialogOpen={setCancelDialogOpen}
        cancelReason={cancelReason}
        setCancelReason={setCancelReason}
        cancelNote={cancelNote}
        setCancelNote={setCancelNote}
        onCancelHold={handleCancelHold}
        freezeDialogOpen={freezeDialogOpen}
        setFreezeDialogOpen={setFreezeDialogOpen}
        thawDate={thawDate}
        setThawDate={setThawDate}
        onFreezeHold={handleFreezeHold}
        changePickupDialogOpen={changePickupDialogOpen}
        setChangePickupDialogOpen={setChangePickupDialogOpen}
        newPickupLib={newPickupLib}
        setNewPickupLib={setNewPickupLib}
        onChangePickupLib={handleChangePickupLib}
        addNoteDialogOpen={addNoteDialogOpen}
        setAddNoteDialogOpen={setAddNoteDialogOpen}
        noteTitle={noteTitle}
        setNoteTitle={setNoteTitle}
        noteBody={noteBody}
        setNoteBody={setNoteBody}
        noteStaffOnly={noteStaffOnly}
        setNoteStaffOnly={setNoteStaffOnly}
        onAddNote={handleAddNote}
      />
    </PageContainer>
  );
}
