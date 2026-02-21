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

import { Badge } from "@/components/ui/badge";
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
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";

import { FileText, Plus, RefreshCw, Trash2 } from "lucide-react";
import { clientLogger } from "@/lib/client-logger";

interface PatronNote {
  id: number;
  title: string;
  value: string;
  public: boolean;
  createDate: string | null;
  creator: number | null;
}

interface NoteForm {
  title: string;
  value: string;
  public: boolean;
}

function formatDate(value: string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString();
}

export default function PatronNotesPage() {
  const params = useParams();
  const patronId = params?.id ? parseInt(String(params.id), 10) : null;

  const [notes, setNotes] = useState<PatronNote[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Dialog states
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedNote, setSelectedNote] = useState<PatronNote | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Form state
  const [noteForm, setNoteForm] = useState<NoteForm>({
    title: "",
    value: "",
    public: false,
  });

  const loadNotes = useCallback(async () => {
    if (!patronId) return;

    try {
      const response = await fetchWithAuth(`/api/evergreen/patrons/${patronId}/notes`);
      const data = await response.json();

      if (!data.ok) {
        throw new Error(data.error || "Failed to load notes");
      }

      setNotes(data.notes || []);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to load notes";
      clientLogger.error("Failed to load patron notes:", err);
      setError(message);
    }
  }, [patronId]);

  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true);
      setError(null);
      await loadNotes();
      setIsLoading(false);
    };
    fetchData();
  }, [loadNotes]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await loadNotes();
    setIsRefreshing(false);
    toast.success("Notes refreshed");
  };

  const handleAddNote = async () => {
    if (!patronId || !noteForm.value.trim()) return;

    setIsSubmitting(true);
    try {
      const response = await fetchWithAuth(`/api/evergreen/patrons/${patronId}/notes`, {
        method: "POST",
        body: JSON.stringify({
          title: noteForm.title || "Note",
          value: noteForm.value,
          public: noteForm.public,
        }),
      });

      const data = await response.json();
      if (!data.ok) {
        throw new Error(data.error || "Failed to add note");
      }

      toast.success("Note added successfully");
      setAddDialogOpen(false);
      setNoteForm({ title: "", value: "", public: false });
      await loadNotes();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to add note";
      clientLogger.error("Failed to add note:", err);
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteNote = async () => {
    if (!patronId || !selectedNote) return;

    setIsSubmitting(true);
    try {
      const response = await fetchWithAuth(`/api/evergreen/patrons/${patronId}/notes`, {
        method: "DELETE",
        body: JSON.stringify({ noteId: selectedNote.id }),
      });

      const data = await response.json();
      if (!data.ok) {
        throw new Error(data.error || "Failed to delete note");
      }

      toast.success("Note deleted successfully");
      setDeleteDialogOpen(false);
      setSelectedNote(null);
      await loadNotes();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to delete note";
      clientLogger.error("Failed to delete note:", err);
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const openDeleteDialog = (note: PatronNote) => {
    setSelectedNote(note);
    setDeleteDialogOpen(true);
  };

  const columns = useMemo<ColumnDef<PatronNote>[]>(
    () => [
      {
        accessorKey: "title",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Title" />,
        cell: ({ row }) => (
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-muted-foreground" />
            <span className="font-medium">{row.original.title}</span>
            {row.original.public && (
              <Badge variant="outline" className="text-xs">
                Public
              </Badge>
            )}
          </div>
        ),
      },
      {
        accessorKey: "value",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Content" />,
        cell: ({ row }) => (
          <p className="text-sm text-muted-foreground line-clamp-2 max-w-md">
            {row.original.value}
          </p>
        ),
      },
      {
        accessorKey: "createDate",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Created" />,
        cell: ({ row }) => (
          <span className="text-sm text-muted-foreground">
            {formatDate(row.original.createDate)}
          </span>
        ),
      },
      {
        accessorKey: "public",
        header: "Visibility",
        cell: ({ row }) => (
          <StatusBadge
            label={row.original.public ? "Public" : "Staff Only"}
            status={row.original.public ? "info" : "neutral"}
          />
        ),
      },
      {
        id: "actions",
        header: "",
        cell: ({ row }) => (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => openDeleteDialog(row.original)}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        ),
      },
    ],
    []
  );

  if (!patronId) {
    return (
      <PageContainer>
        <PageHeader title="Patron Notes" />
        <PageContent>
          <ErrorState title="Missing patron ID" message="No patron ID was provided." />
        </PageContent>
      </PageContainer>
    );
  }

  if (isLoading) {
    return <LoadingSpinner message="Loading notes..." />;
  }

  if (error) {
    return (
      <PageContainer>
        <PageHeader title="Patron Notes" />
        <PageContent>
          <ErrorState title="Failed to load notes" message={error} />
        </PageContent>
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <PageHeader
        title="Patron Notes"
        subtitle={`Manage notes and messages for patron #${patronId}`}
        breadcrumbs={[
          { label: "Patrons", href: "/staff/patrons" },
          { label: "Details", href: `/staff/patrons/${patronId}` },
          { label: "Notes" },
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
            label: "Add Note",
            onClick: () => setAddDialogOpen(true),
            icon: Plus,
          },
        ]}
      />

      <PageContent>
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Notes ({notes.length})
            </CardTitle>
            <CardDescription>
              Staff notes and messages attached to this patron record
            </CardDescription>
          </CardHeader>
          <CardContent>
            <DataTable
              columns={columns}
              data={notes}
              searchable
              searchPlaceholder="Search notes..."
              emptyState={
                <EmptyState
                  icon={FileText}
                  title="No notes"
                  description="No notes have been added for this patron."
                  action={{
                    label: "Add Note",
                    onClick: () => setAddDialogOpen(true),
                  }}
                />
              }
            />
          </CardContent>
        </Card>
      </PageContent>

      {/* Add Note Dialog */}
      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Note</DialogTitle>
            <DialogDescription>
              Add a new note to this patron record
            </DialogDescription>
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
              <Label htmlFor="noteValue">Message</Label>
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
                <p className="text-xs text-muted-foreground">
                  Visible to patron in their account
                </p>
              </div>
              <Switch id="public"
                checked={noteForm.public}
                onCheckedChange={(checked) => setNoteForm({ ...noteForm, public: checked })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleAddNote}
              disabled={!noteForm.value.trim() || isSubmitting}
            >
              {isSubmitting ? "Adding..." : "Add Note"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        title="Delete Note?"
        description={`Are you sure you want to delete the note "${selectedNote?.title || "Note"}"? This action cannot be undone.`}
        variant="danger"
        confirmText="Delete"
        onConfirm={handleDeleteNote}
        isLoading={isSubmitting}
      />
    </PageContainer>
  );
}
