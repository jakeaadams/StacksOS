"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  PageContainer,
  PageHeader,
  PageContent,
  EmptyState,
  StatusBadge,
  DataTable,
  LoadingInline,
} from "@/components/shared";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ColumnDef } from "@tanstack/react-table";
import { fetchWithAuth } from "@/lib/client-fetch";
import { featureFlags } from "@/lib/feature-flags";
import { Plus, RefreshCw, Send } from "lucide-react";
import { toast } from "sonner";

type IllStatus = "new" | "requested" | "in_transit" | "received" | "completed" | "canceled";

type IllRequest = {
  id: number;
  request_type: "borrow" | "lend";
  status: IllStatus;
  priority: "low" | "normal" | "high";
  patron_barcode: string;
  patron_name?: string | null;
  title: string;
  author?: string | null;
  isbn?: string | null;
  source?: string | null;
  needed_by?: string | null;
  notes?: string | null;
  requested_at: string;
  updated_at: string;
};

function statusBadge(status: IllStatus): { label: string; tone: "success" | "warning" | "error" | "pending" } {
  switch (status) {
    case "completed":
      return { label: "Completed", tone: "success" };
    case "canceled":
      return { label: "Canceled", tone: "error" };
    case "received":
      return { label: "Received", tone: "success" };
    case "in_transit":
      return { label: "In Transit", tone: "warning" };
    case "requested":
      return { label: "Requested", tone: "pending" };
    case "new":
    default:
      return { label: "New", tone: "pending" };
  }
}

function formatDate(value?: string | null): string {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "—";
  return parsed.toLocaleDateString();
}

export default function ILLPage() {
  const enabled = featureFlags.ill;
  const [requests, setRequests] = useState<IllRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<number | null>(null);

  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [requestType, setRequestType] = useState<"borrow" | "lend">("borrow");
  const [priority, setPriority] = useState<"low" | "normal" | "high">("normal");
  const [patronBarcode, setPatronBarcode] = useState("");
  const [patronName, setPatronName] = useState("");
  const [title, setTitle] = useState("");
  const [author, setAuthor] = useState("");
  const [isbn, setIsbn] = useState("");
  const [source, setSource] = useState("");
  const [neededBy, setNeededBy] = useState("");
  const [notes, setNotes] = useState("");

  const loadRequests = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await fetchWithAuth("/api/ill/requests?limit=200");
      const data = await response.json();
      if (response.ok && data.ok && Array.isArray(data.requests)) {
        setRequests(data.requests as IllRequest[]);
      } else {
        toast.error(data.error || "Failed to load ILL requests");
      }
    } catch {
      toast.error("Failed to load ILL requests");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    void loadRequests();
  }, [enabled, loadRequests]);

  const updateStatus = useCallback(
    async (id: number, status: IllStatus) => {
      setUpdatingId(id);
      try {
        const response = await fetchWithAuth("/api/ill/requests", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id, status }),
        });
        const data = await response.json();
        if (response.ok && data.ok) {
          setRequests((prev) => prev.map((request) => (request.id === id ? { ...request, status } : request)));
          toast.success("ILL request updated");
        } else {
          toast.error(data.error || "Failed to update ILL request");
        }
      } catch {
        toast.error("Failed to update ILL request");
      } finally {
        setUpdatingId(null);
      }
    },
    []
  );

  const handleCreate = useCallback(async () => {
    if (!patronBarcode.trim()) {
      toast.error("Patron barcode is required");
      return;
    }
    if (!title.trim()) {
      toast.error("Title is required");
      return;
    }

    setIsCreating(true);
    try {
      const response = await fetchWithAuth("/api/ill/requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requestType,
          priority,
          patronBarcode: patronBarcode.trim(),
          patronName: patronName.trim() || undefined,
          title: title.trim(),
          author: author.trim() || undefined,
          isbn: isbn.trim() || undefined,
          source: source.trim() || undefined,
          neededBy: neededBy.trim() || undefined,
          notes: notes.trim() || undefined,
        }),
      });

      const data = await response.json();
      if (response.ok && data.ok) {
        toast.success("ILL request created");
        setShowCreateDialog(false);
        setPatronBarcode("");
        setPatronName("");
        setTitle("");
        setAuthor("");
        setIsbn("");
        setSource("");
        setNeededBy("");
        setNotes("");
        setRequestType("borrow");
        setPriority("normal");
        await loadRequests();
      } else {
        toast.error(data.error || "Failed to create ILL request");
      }
    } catch {
      toast.error("Failed to create ILL request");
    } finally {
      setIsCreating(false);
    }
  }, [
    author,
    isbn,
    loadRequests,
    neededBy,
    notes,
    patronBarcode,
    patronName,
    priority,
    requestType,
    source,
    title,
  ]);

  const stats = useMemo(() => {
    return {
      total: requests.length,
      open: requests.filter((request) => ["new", "requested", "in_transit", "received"].includes(request.status)).length,
      completed: requests.filter((request) => request.status === "completed").length,
      canceled: requests.filter((request) => request.status === "canceled").length,
    };
  }, [requests]);

  const columns: ColumnDef<IllRequest>[] = useMemo(
    () => [
      {
        accessorKey: "title",
        header: "Title",
        cell: ({ row }) => (
          <div>
            <div className="font-medium">{row.original.title}</div>
            <div className="text-xs text-muted-foreground">
              {row.original.author || "—"} {row.original.isbn ? ` • ${row.original.isbn}` : ""}
            </div>
          </div>
        ),
      },
      {
        accessorKey: "request_type",
        header: "Type",
        cell: ({ row }) => <span className="capitalize">{row.original.request_type}</span>,
      },
      {
        accessorKey: "patron_barcode",
        header: "Patron",
        cell: ({ row }) => (
          <div>
            <div className="font-mono text-xs">{row.original.patron_barcode}</div>
            <div className="text-xs text-muted-foreground">{row.original.patron_name || "—"}</div>
          </div>
        ),
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => {
          const badge = statusBadge(row.original.status);
          return <StatusBadge label={badge.label} status={badge.tone} />;
        },
      },
      {
        accessorKey: "priority",
        header: "Priority",
        cell: ({ row }) => <span className="capitalize">{row.original.priority}</span>,
      },
      {
        accessorKey: "needed_by",
        header: "Need By",
        cell: ({ row }) => formatDate(row.original.needed_by),
      },
      {
        id: "actions",
        header: "Update",
        cell: ({ row }) => (
          <Select
            value={row.original.status}
            onValueChange={(value) => void updateStatus(row.original.id, value as IllStatus)}
            disabled={updatingId === row.original.id}
          >
            <SelectTrigger className="h-8 w-[130px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="new">New</SelectItem>
              <SelectItem value="requested">Requested</SelectItem>
              <SelectItem value="in_transit">In Transit</SelectItem>
              <SelectItem value="received">Received</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="canceled">Canceled</SelectItem>
            </SelectContent>
          </Select>
        ),
      },
    ],
    [updateStatus, updatingId]
  );

  if (!enabled) {
    return (
      <PageContainer>
        <PageHeader
          title="Interlibrary Loan"
          subtitle="Interlibrary loan is behind a feature flag until a provider workflow is enabled."
          breadcrumbs={[{ label: "ILL" }]}
        />
        <PageContent>
          <Card>
            <CardContent className="py-12">
              <EmptyState
                icon={Send}
                title="ILL is disabled"
                description="Enable this when your ILL workflow is active."
              />
            </CardContent>
          </Card>
        </PageContent>
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <PageHeader
        title="Interlibrary Loan"
        subtitle="Track borrowing and lending requests with real request/state workflows."
        breadcrumbs={[{ label: "ILL" }]}
        actions={[
          {
            label: "Refresh",
            icon: RefreshCw,
            onClick: () => void loadRequests(),
            variant: "outline",
            loading: isLoading,
          },
          {
            label: "New Request",
            icon: Plus,
            onClick: () => setShowCreateDialog(true),
          },
        ]}
      />

      <PageContent className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-4">
          <Card>
            <CardContent className="p-4">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Total</p>
              <p className="text-2xl font-semibold mt-1">{stats.total}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Open</p>
              <p className="text-2xl font-semibold mt-1">{stats.open}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Completed</p>
              <p className="text-2xl font-semibold mt-1">{stats.completed}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Canceled</p>
              <p className="text-2xl font-semibold mt-1">{stats.canceled}</p>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Requests</CardTitle>
            <CardDescription>Real request records persisted in Evergreen library schema.</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="py-8 flex justify-center">
                <LoadingInline message="Loading ILL requests..." />
              </div>
            ) : requests.length === 0 ? (
              <EmptyState
                title="No ILL requests"
                description="Create the first request to start managing ILL workflows."
                action={{ label: "New Request", onClick: () => setShowCreateDialog(true), icon: Plus }}
              />
            ) : (
              <DataTable
                columns={columns}
                data={requests}
                searchable={true}
                searchPlaceholder="Search by title, barcode, or author..."
                paginated={requests.length > 12}
              />
            )}
          </CardContent>
        </Card>
      </PageContent>

      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create ILL Request</DialogTitle>
            <DialogDescription>Create a borrowing or lending request.</DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Request Type</Label>
                <Select value={requestType} onValueChange={(value) => setRequestType(value as "borrow" | "lend") }>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="borrow">Borrow</SelectItem>
                    <SelectItem value="lend">Lend</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Priority</Label>
                <Select value={priority} onValueChange={(value) => setPriority(value as "low" | "normal" | "high") }>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="normal">Normal</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Patron Barcode</Label>
                <Input value={patronBarcode} onChange={(event) => setPatronBarcode(event.target.value)} placeholder="Patron barcode" />
              </div>
              <div className="space-y-2">
                <Label>Patron Name (optional)</Label>
                <Input value={patronName} onChange={(event) => setPatronName(event.target.value)} placeholder="Last, First" />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Title</Label>
              <Input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Requested title" />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Author (optional)</Label>
                <Input value={author} onChange={(event) => setAuthor(event.target.value)} placeholder="Author" />
              </div>
              <div className="space-y-2">
                <Label>ISBN (optional)</Label>
                <Input value={isbn} onChange={(event) => setIsbn(event.target.value)} placeholder="ISBN" />
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Source (optional)</Label>
                <Input value={source} onChange={(event) => setSource(event.target.value)} placeholder="Provider/library" />
              </div>
              <div className="space-y-2">
                <Label>Need By (optional)</Label>
                <Input type="date" value={neededBy} onChange={(event) => setNeededBy(event.target.value)} />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Notes (optional)</Label>
              <Textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={3} placeholder="Request notes" />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
              Cancel
            </Button>
            <Button onClick={() => void handleCreate()} disabled={isCreating}>
              {isCreating ? "Creating..." : "Create Request"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageContainer>
  );
}
