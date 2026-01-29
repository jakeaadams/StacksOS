"use client";

import { fetchWithAuth } from "@/lib/client-fetch";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
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
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";

import { AlertTriangle, Plus, RefreshCw, X } from "lucide-react";
import { clientLogger } from "@/lib/client-logger";

interface PenaltyType {
  id: number;
  name: string;
  label: string;
  blockList: string;
  orgUnit: number | null;
}

interface PatronPenalty {
  id: number;
  patronId: number;
  penaltyType: number;
  orgUnit: number;
  note: string | null;
  staff: number | null;
  setDate: string | null;
  stopDate: string | null;
  penaltyName: string;
  penaltyLabel: string;
}

interface PenaltyForm {
  penaltyType: string;
  note: string;
}

function formatDate(value: string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString();
}

function getPenaltySeverity(penalty: PatronPenalty): "error" | "warning" | "info" {
  const name = penalty.penaltyName.toUpperCase();
  if (name.includes("CIRC") || name.includes("BLOCK")) {
    return "error";
  }
  if (name.includes("HOLD") || name.includes("RENEW")) {
    return "warning";
  }
  return "info";
}

export default function PatronPenaltiesPage() {
  const params = useParams();
  const patronId = params?.id ? parseInt(String(params.id), 10) : null;

  const [penalties, setPenalties] = useState<PatronPenalty[]>([]);
  const [penaltyTypes, setPenaltyTypes] = useState<PenaltyType[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Dialog states
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [removeDialogOpen, setRemoveDialogOpen] = useState(false);
  const [selectedPenalty, setSelectedPenalty] = useState<PatronPenalty | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Form state
  const [penaltyForm, setPenaltyForm] = useState<PenaltyForm>({
    penaltyType: "",
    note: "",
  });

  const loadPenalties = useCallback(async () => {
    if (!patronId) return;

    try {
      const response = await fetchWithAuth(
        `/api/evergreen/patrons/${patronId}/penalties?includeTypes=true`
      );
      const data = await response.json();

      if (!data.ok) {
        throw new Error(data.error || "Failed to load penalties");
      }

      setPenalties(data.penalties || []);
      if (data.penaltyTypes) {
        setPenaltyTypes(data.penaltyTypes);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to load penalties";
      clientLogger.error("Failed to load patron penalties:", err);
      setError(message);
    }
  }, [patronId]);

  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true);
      setError(null);
      await loadPenalties();
      setIsLoading(false);
    };
    fetchData();
  }, [loadPenalties]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await loadPenalties();
    setIsRefreshing(false);
    toast.success("Penalties refreshed");
  };

  const handleAddPenalty = async () => {
    if (!patronId || !penaltyForm.penaltyType) return;

    setIsSubmitting(true);
    try {
      const response = await fetchWithAuth(`/api/evergreen/patrons/${patronId}/penalties`, {
        method: "POST",
        body: JSON.stringify({
          penaltyType: parseInt(penaltyForm.penaltyType, 10),
          note: penaltyForm.note,
        }),
      });

      const data = await response.json();
      if (!data.ok) {
        throw new Error(data.error || "Failed to apply penalty");
      }

      toast.success("Penalty applied successfully");
      setAddDialogOpen(false);
      setPenaltyForm({ penaltyType: "", note: "" });
      await loadPenalties();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to apply penalty";
      clientLogger.error("Failed to apply penalty:", err);
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRemovePenalty = async () => {
    if (!patronId || !selectedPenalty) return;

    setIsSubmitting(true);
    try {
      const response = await fetchWithAuth(`/api/evergreen/patrons/${patronId}/penalties`, {
        method: "DELETE",
        body: JSON.stringify({ penaltyId: selectedPenalty.id }),
      });

      const data = await response.json();
      if (!data.ok) {
        throw new Error(data.error || "Failed to remove penalty");
      }

      toast.success("Penalty removed successfully");
      setRemoveDialogOpen(false);
      setSelectedPenalty(null);
      await loadPenalties();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to remove penalty";
      clientLogger.error("Failed to remove penalty:", err);
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const openRemoveDialog = (penalty: PatronPenalty) => {
    setSelectedPenalty(penalty);
    setRemoveDialogOpen(true);
  };

  const columns = useMemo<ColumnDef<PatronPenalty>[]>(
    () => [
      {
        accessorKey: "penaltyLabel",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Penalty Type" />,
        cell: ({ row }) => (
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-destructive" />
            <span className="font-medium">{row.original.penaltyLabel}</span>
          </div>
        ),
      },
      {
        accessorKey: "note",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Reason" />,
        cell: ({ row }) => (
          <p className="text-sm text-muted-foreground line-clamp-2 max-w-md">
            {row.original.note || "No reason provided"}
          </p>
        ),
      },
      {
        accessorKey: "setDate",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Applied" />,
        cell: ({ row }) => (
          <span className="text-sm text-muted-foreground">
            {formatDate(row.original.setDate)}
          </span>
        ),
      },
      {
        accessorKey: "staff",
        header: "Applied By",
        cell: ({ row }) => (
          <span className="text-sm text-muted-foreground">
            {row.original.staff ? `Staff #${row.original.staff}` : "System"}
          </span>
        ),
      },
      {
        id: "severity",
        header: "Severity",
        cell: ({ row }) => {
          const severity = getPenaltySeverity(row.original);
          const label = severity === "error" ? "Block" : severity === "warning" ? "Alert" : "Note";
          return <StatusBadge label={label} status={severity} />;
        },
      },
      {
        id: "actions",
        header: "",
        cell: ({ row }) => (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => openRemoveDialog(row.original)}
          >
            <X className="h-4 w-4" />
          </Button>
        ),
      },
    ],
    []
  );

  if (!patronId) {
    return (
      <PageContainer>
        <PageHeader title="Standing Penalties" />
        <PageContent>
          <ErrorState title="Missing patron ID" message="No patron ID was provided." />
        </PageContent>
      </PageContainer>
    );
  }

  if (isLoading) {
    return <LoadingSpinner message="Loading penalties..." />;
  }

  if (error) {
    return (
      <PageContainer>
        <PageHeader title="Standing Penalties" />
        <PageContent>
          <ErrorState title="Failed to load penalties" message={error} />
        </PageContent>
      </PageContainer>
    );
  }

  const activePenalties = penalties.filter((p) => !p.stopDate);

  return (
    <PageContainer>
      <PageHeader
        title="Standing Penalties"
        subtitle={`Manage blocks and alerts for patron #${patronId}`}
        breadcrumbs={[
          { label: "Patrons", href: "/staff/patrons" },
          { label: "Details", href: `/staff/patrons/${patronId}` },
          { label: "Penalties" },
        ]}
        actions={[
          {
            label: "Refresh",
            onClick: handleRefresh,
            icon: RefreshCw,
            variant: "outline",
            loading: isRefreshing,
          },
          {
            label: "Add Penalty",
            onClick: () => setAddDialogOpen(true),
            icon: Plus,
          },
        ]}
      />

      <PageContent>
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-destructive" />
              Active Penalties ({activePenalties.length})
            </CardTitle>
            <CardDescription>
              Standing penalties prevent certain actions like checkout, holds, or renewals
            </CardDescription>
          </CardHeader>
          <CardContent>
            <DataTable
              columns={columns}
              data={activePenalties}
              searchable
              searchPlaceholder="Search penalties..."
              emptyState={
                <EmptyState
                  icon={AlertTriangle}
                  title="No active penalties"
                  description="This patron has no standing penalties or blocks."
                />
              }
            />
          </CardContent>
        </Card>
      </PageContent>

      {/* Add Penalty Dialog */}
      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Penalty</DialogTitle>
            <DialogDescription>
              Apply a standing penalty to this patron
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="penaltyType">Penalty Type</Label>
              <Select
                value={penaltyForm.penaltyType}
                onValueChange={(value) =>
                  setPenaltyForm({ ...penaltyForm, penaltyType: value })
                }
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
              <Label htmlFor="penaltyNote">Note (optional)</Label>
              <Textarea
                id="penaltyNote"
                value={penaltyForm.note}
                onChange={(e) => setPenaltyForm({ ...penaltyForm, note: e.target.value })}
                placeholder="Reason for this penalty..."
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleAddPenalty}
              disabled={!penaltyForm.penaltyType || isSubmitting}
            >
              {isSubmitting ? "Applying..." : "Apply Penalty"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Remove Confirmation Dialog */}
      <ConfirmDialog
        open={removeDialogOpen}
        onOpenChange={setRemoveDialogOpen}
        title="Remove Penalty?"
        description={`Are you sure you want to remove the penalty "${selectedPenalty?.penaltyLabel || "Penalty"}"? This will allow the patron to resume blocked activities.`}
        variant="warning"
        confirmText="Remove"
        onConfirm={handleRemovePenalty}
        isLoading={isSubmitting}
      />
    </PageContainer>
  );
}
