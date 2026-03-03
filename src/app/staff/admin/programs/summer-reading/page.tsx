"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { fetchWithAuth } from "@/lib/client-fetch";
import {
  PageContainer,
  PageHeader,
  PageContent,
  EmptyState,
  LoadingSpinner,
  ConfirmDialog,
} from "@/components/shared";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  BookOpen,
  Plus,
  Pencil,
  Trash2,
  RefreshCw,
  CalendarDays,
  Trophy,
  Loader2,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SummerReadingProgram {
  id: number;
  orgUnit: number;
  programName: string;
  startDate: string;
  endDate: string;
  goalType: "books" | "pages" | "minutes";
  goalValue: number;
  badgeEnabled: boolean;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

type FormData = {
  programName: string;
  startDate: string;
  endDate: string;
  goalType: string;
  goalValue: string;
  badgeEnabled: boolean;
};

const EMPTY_FORM: FormData = {
  programName: "",
  startDate: "",
  endDate: "",
  goalType: "books",
  goalValue: "10",
  badgeEnabled: false,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function programStatus(program: SummerReadingProgram): {
  label: string;
  variant: "default" | "secondary" | "destructive" | "outline";
} {
  if (!program.active) return { label: "Inactive", variant: "outline" };
  const today = new Date().toISOString().slice(0, 10);
  if (today < program.startDate) return { label: "Upcoming", variant: "secondary" };
  if (today > program.endDate) return { label: "Ended", variant: "destructive" };
  return { label: "Active", variant: "default" };
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function SummerReadingAdminPage() {
  const [programs, setPrograms] = useState<SummerReadingProgram[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<FormData>(EMPTY_FORM);
  const [confirmDelete, setConfirmDelete] = useState<{
    open: boolean;
    id: number;
    name: string;
  }>({ open: false, id: 0, name: "" });

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetchWithAuth("/api/staff/programs/summer-reading");
      const json = await res.json();
      if (!res.ok || json.ok === false) throw new Error(json.error || "Failed to load");
      setPrograms(json.programs || []);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to load programs");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const openCreate = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setDialogOpen(true);
  };

  const openEdit = (program: SummerReadingProgram) => {
    setEditingId(program.id);
    setForm({
      programName: program.programName,
      startDate: program.startDate.slice(0, 10),
      endDate: program.endDate.slice(0, 10),
      goalType: program.goalType,
      goalValue: String(program.goalValue),
      badgeEnabled: program.badgeEnabled,
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.programName.trim() || !form.startDate || !form.endDate) {
      toast.error("Program name, start date, and end date are required");
      return;
    }
    setSaving(true);
    try {
      const payload = editingId
        ? {
            action: "update",
            id: editingId,
            programName: form.programName,
            startDate: form.startDate,
            endDate: form.endDate,
            goalType: form.goalType,
            goalValue: Number(form.goalValue) || 10,
            badgeEnabled: form.badgeEnabled,
          }
        : {
            action: "create",
            programName: form.programName,
            startDate: form.startDate,
            endDate: form.endDate,
            goalType: form.goalType,
            goalValue: Number(form.goalValue) || 10,
            badgeEnabled: form.badgeEnabled,
          };

      const res = await fetchWithAuth("/api/staff/programs/summer-reading", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok || json.ok === false) throw new Error(json.error || "Save failed");
      toast.success(editingId ? "Program updated" : "Program created");
      setDialogOpen(false);
      await load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    setSaving(true);
    try {
      const res = await fetchWithAuth("/api/staff/programs/summer-reading", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete", id }),
      });
      const json = await res.json();
      if (!res.ok || json.ok === false) throw new Error(json.error || "Delete failed");
      toast.success("Program deleted");
      await load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (program: SummerReadingProgram) => {
    try {
      const res = await fetchWithAuth("/api/staff/programs/summer-reading", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "update",
          id: program.id,
          active: !program.active,
        }),
      });
      const json = await res.json();
      if (!res.ok || json.ok === false) throw new Error(json.error || "Toggle failed");
      toast.success(program.active ? "Program deactivated" : "Program activated");
      await load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Toggle failed");
    }
  };

  return (
    <PageContainer>
      <PageHeader
        title="Summer Reading Programs"
        subtitle="Manage reading programs with goals, date ranges, and achievement badges."
        breadcrumbs={[
          { label: "Admin", href: "/staff/admin" },
          { label: "Programs" },
          { label: "Summer Reading" },
        ]}
        actions={[
          { label: "Refresh", onClick: load, icon: RefreshCw, variant: "outline" as const },
          { label: "New Program", onClick: openCreate, icon: Plus },
        ]}
      />
      <PageContent className="space-y-4">
        {loading ? (
          <LoadingSpinner message="Loading programs..." />
        ) : programs.length === 0 ? (
          <EmptyState
            title="No summer reading programs"
            description="Create your first reading program to engage patrons with reading goals."
            icon={BookOpen}
            action={{ label: "Create Program", onClick: openCreate }}
          />
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {programs.map((program) => {
              const status = programStatus(program);
              return (
                <Card key={program.id} className="rounded-2xl border-border/70 shadow-sm">
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between gap-2">
                      <CardTitle className="text-base leading-snug">
                        {program.programName}
                      </CardTitle>
                      <Badge variant={status.variant} className="shrink-0 rounded-full text-[10px]">
                        {status.label}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <CalendarDays className="h-4 w-4" />
                      {new Date(program.startDate + "T12:00:00").toLocaleDateString()} —{" "}
                      {new Date(program.endDate + "T12:00:00").toLocaleDateString()}
                    </div>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Trophy className="h-4 w-4" />
                      Goal: {program.goalValue} {program.goalType}
                      {program.badgeEnabled && (
                        <Badge variant="secondary" className="text-[10px] rounded-full ml-1">
                          Badges
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-2 pt-2 border-t border-border/50">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openEdit(program)}
                        className="h-7 text-xs"
                      >
                        <Pencil className="h-3 w-3 mr-1" /> Edit
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => toggleActive(program)}
                        className="h-7 text-xs"
                      >
                        {program.active ? "Deactivate" : "Activate"}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          setConfirmDelete({
                            open: true,
                            id: program.id,
                            name: program.programName,
                          })
                        }
                        className="h-7 text-xs text-destructive hover:text-destructive"
                      >
                        <Trash2 className="h-3 w-3 mr-1" /> Delete
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </PageContent>

      {/* Create / Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit Program" : "New Summer Reading Program"}</DialogTitle>
            <DialogDescription>
              {editingId
                ? "Update the program details below."
                : "Set up a reading program with goals and date range."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label htmlFor="program-name">Program Name</Label>
              <Input
                id="program-name"
                value={form.programName}
                onChange={(e) => setForm((f) => ({ ...f, programName: e.target.value }))}
                placeholder="Summer Reading Challenge 2026"
              />
            </div>
            <div className="grid gap-3 grid-cols-2">
              <div>
                <Label htmlFor="start-date">Start Date</Label>
                <Input
                  id="start-date"
                  type="date"
                  value={form.startDate}
                  onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))}
                />
              </div>
              <div>
                <Label htmlFor="end-date">End Date</Label>
                <Input
                  id="end-date"
                  type="date"
                  value={form.endDate}
                  onChange={(e) => setForm((f) => ({ ...f, endDate: e.target.value }))}
                />
              </div>
            </div>
            <div className="grid gap-3 grid-cols-2">
              <div>
                <Label htmlFor="goal-type">Goal Type</Label>
                <Select
                  value={form.goalType}
                  onValueChange={(v) => setForm((f) => ({ ...f, goalType: v }))}
                >
                  <SelectTrigger id="goal-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="books">Books</SelectItem>
                    <SelectItem value="pages">Pages</SelectItem>
                    <SelectItem value="minutes">Minutes</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="goal-value">Goal Value</Label>
                <Input
                  id="goal-value"
                  type="number"
                  min={1}
                  value={form.goalValue}
                  onChange={(e) => setForm((f) => ({ ...f, goalValue: e.target.value }))}
                />
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Switch
                id="badges"
                checked={form.badgeEnabled}
                onCheckedChange={(v) => setForm((f) => ({ ...f, badgeEnabled: v }))}
              />
              <Label htmlFor="badges">Enable achievement badges</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              {editingId ? "Save Changes" : "Create Program"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={confirmDelete.open}
        onOpenChange={(open) => setConfirmDelete((s) => ({ ...s, open }))}
        title="Delete Program"
        description={`Are you sure you want to delete "${confirmDelete.name}"? This cannot be undone.`}
        onConfirm={() => handleDelete(confirmDelete.id)}
      />
    </PageContainer>
  );
}
