"use client";

import * as React from "react";
import Link from "next/link";
import { toast } from "sonner";
import { fetchWithAuth } from "@/lib/client-fetch";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Check, Loader2, Plus } from "lucide-react";

type Visibility = "private" | "public";

export interface OpacListSummary {
  id: number | string;
  name: string;
  description?: string;
  visibility?: Visibility;
  itemCount?: number;
  isDefault?: boolean;
  icon?: string;
}

export function AddToListDialog({
  open,
  onOpenChange,
  bibId,
  title,
  onAdded,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bibId: number;
  title?: string;
  onAdded?: () => void;
}) {
  const [lists, setLists] = React.useState<OpacListSummary[]>([]);
  const [isLoading, setIsLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const [mode, setMode] = React.useState<"existing" | "create">("existing");
  const [selectedListId, setSelectedListId] = React.useState<string | null>(null);

  const [newName, setNewName] = React.useState("");
  const [newDescription, setNewDescription] = React.useState("");
  const [newVisibility, setNewVisibility] = React.useState<Visibility>("private");
  const [isSaving, setIsSaving] = React.useState(false);

  const reset = React.useCallback(() => {
    setError(null);
    setMode("existing");
    setSelectedListId(null);
    setNewName("");
    setNewDescription("");
    setNewVisibility("private");
    setIsSaving(false);
  }, []);

  const loadLists = React.useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/opac/lists", { credentials: "include" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data?.ok === false) {
        throw new Error(data?.error || "Could not load lists");
      }
      const next = Array.isArray(data?.lists) ? (data.lists as OpacListSummary[]) : [];
      setLists(next);

      if (next.length === 0) {
        setMode("create");
      } else if (!selectedListId) {
        setSelectedListId(String(next[0]?.id));
      }
    } catch (e) {
      setLists([]);
      setError(e instanceof Error ? e.message : "Could not load lists");
    } finally {
      setIsLoading(false);
    }
  }, [selectedListId]);

  React.useEffect(() => {
    if (!open) return;
    void loadLists();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  React.useEffect(() => {
    if (open) return;
    reset();
  }, [open, reset]);

  const handleAddToExisting = React.useCallback(async () => {
    if (!selectedListId) return;
    setIsSaving(true);
    setError(null);
    try {
      const res = await fetchWithAuth(
        `/api/opac/lists/${encodeURIComponent(selectedListId)}/items`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ bibId }),
        }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data?.ok === false) {
        throw new Error(data?.error || "Could not add item");
      }
      toast.success("Saved to list");
      onAdded?.();
      onOpenChange(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not add item");
    } finally {
      setIsSaving(false);
    }
  }, [bibId, onAdded, onOpenChange, selectedListId]);

  const handleCreateAndAdd = React.useCallback(async () => {
    const name = newName.trim();
    if (!name) return;
    setIsSaving(true);
    setError(null);
    try {
      const createRes = await fetchWithAuth("/api/opac/lists", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          description: newDescription.trim(),
          visibility: newVisibility,
        }),
      });
      const createData = await createRes.json().catch(() => ({}));
      if (!createRes.ok || createData?.ok === false) {
        throw new Error(createData?.error || "Could not create list");
      }
      const createdId = createData?.list?.id;
      if (!createdId) {
        throw new Error("List created but missing id");
      }

      const addRes = await fetchWithAuth(
        `/api/opac/lists/${encodeURIComponent(String(createdId))}/items`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ bibId }),
        }
      );
      const addData = await addRes.json().catch(() => ({}));
      if (!addRes.ok || addData?.ok === false) {
        throw new Error(addData?.error || "List created but item could not be added");
      }

      toast.success("Saved to new list");
      onAdded?.();
      onOpenChange(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save");
    } finally {
      setIsSaving(false);
    }
  }, [bibId, newDescription, newName, newVisibility, onAdded, onOpenChange]);

  const selected = React.useMemo(
    () => lists.find((l) => String(l.id) === String(selectedListId)),
    [lists, selectedListId]
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Save to list</DialogTitle>
          <DialogDescription>
            {title ? (
              <span className="block">
                <span className="font-medium text-foreground">“{title}”</span>
              </span>
            ) : null}
            <span className="block">Choose a list, or create a new one.</span>
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant={mode === "existing" ? "default" : "outline"}
            size="sm"
            onClick={() => setMode("existing")}
            disabled={isLoading || lists.length === 0}
          >
            Existing
          </Button>
          <Button
            type="button"
            variant={mode === "create" ? "default" : "outline"}
            size="sm"
            onClick={() => setMode("create")}
            disabled={isLoading}
          >
            Create
          </Button>
          <div className="ml-auto">
            <Link
              href="/opac/account/lists"
              className="text-xs text-muted-foreground hover:text-foreground underline-offset-2 hover:underline"
            >
              Manage lists
            </Link>
          </div>
        </div>

        {isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading lists…
          </div>
        ) : mode === "existing" ? (
          <>
            {lists.length === 0 ? (
              <div className="rounded-xl border border-border/70 p-4 text-sm text-muted-foreground">
                No lists yet. Create one to start saving books.
              </div>
            ) : (
              <ScrollArea className="h-48 rounded-xl border border-border/70">
                <div className="p-2 space-y-1">
                  {lists.map((l) => {
                    const active = String(l.id) === String(selectedListId);
                    return (
                      <button
                        key={String(l.id)}
                        type="button"
                        onClick={() => setSelectedListId(String(l.id))}
                        className={cn(
                          "w-full rounded-lg px-3 py-2 text-left flex items-center gap-3 hover:bg-muted/50 transition-colors",
                          active ? "bg-muted" : ""
                        )}
                      >
                        <div
                          className={cn(
                            "h-6 w-6 rounded-md border flex items-center justify-center",
                            active ? "border-primary" : "border-border"
                          )}
                        >
                          {active ? <Check className="h-4 w-4 text-primary" /> : null}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <div className="font-medium truncate">{l.name}</div>
                            {l.visibility ? (
                              <Badge variant="secondary" className="text-[10px]">
                                {l.visibility}
                              </Badge>
                            ) : null}
                            {l.isDefault ? (
                              <Badge variant="outline" className="text-[10px]">
                                Default
                              </Badge>
                            ) : null}
                          </div>
                          {l.description ? (
                            <div className="text-xs text-muted-foreground line-clamp-1">
                              {l.description}
                            </div>
                          ) : null}
                        </div>
                        {typeof l.itemCount === "number" ? (
                          <div className="text-xs text-muted-foreground tabular-nums">
                            {l.itemCount}
                          </div>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              </ScrollArea>
            )}
          </>
        ) : (
          <div className="space-y-3 rounded-xl border border-border/70 p-4">
            <div className="grid gap-1.5">
              <Label htmlFor="list-name">List name</Label>
              <Input
                id="list-name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="e.g. Summer reading"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="list-desc">Description (optional)</Label>
              <Input
                id="list-desc"
                value={newDescription}
                onChange={(e) => setNewDescription(e.target.value)}
                placeholder="A short note about this list"
              />
            </div>
            <div className="flex items-center gap-3">
              <Label className="text-sm">Visibility</Label>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setNewVisibility("private")}
                  className={cn(
                    "px-3 py-1.5 rounded-lg border text-sm",
                    newVisibility === "private"
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border text-muted-foreground hover:bg-muted/50"
                  )}
                >
                  Private
                </button>
                <button
                  type="button"
                  onClick={() => setNewVisibility("public")}
                  className={cn(
                    "px-3 py-1.5 rounded-lg border text-sm",
                    newVisibility === "public"
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border text-muted-foreground hover:bg-muted/50"
                  )}
                >
                  Public
                </button>
              </div>
            </div>
          </div>
        )}

        {error ? <div className="text-sm text-rose-600">{error}</div> : null}

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSaving}
          >
            Cancel
          </Button>
          {mode === "existing" ? (
            <Button
              type="button"
              onClick={() => void handleAddToExisting()}
              disabled={isSaving || isLoading || lists.length === 0 || !selectedListId}
            >
              {isSaving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Save
            </Button>
          ) : (
            <Button
              type="button"
              onClick={() => void handleCreateAndAdd()}
              disabled={isSaving || !newName.trim()}
            >
              {isSaving ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Plus className="h-4 w-4 mr-2" />
              )}
              Create & save
            </Button>
          )}
        </DialogFooter>

        {mode === "existing" && selected ? (
          <div className="text-xs text-muted-foreground">
            Saving to <span className="font-medium text-foreground">{selected.name}</span>.
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
