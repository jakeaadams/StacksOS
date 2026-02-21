"use client";

import * as React from "react";
import { useMemo, useState } from "react";
import Link from "next/link";
import { fetchWithAuth } from "@/lib/client-fetch";
import { clientLogger } from "@/lib/client-logger";
import { toast } from "sonner";
import { EmptyState } from "@/components/shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Building, Check, ChevronDown, ChevronRight, Loader2, MapPin, Pencil, Plus, Trash2, X,
} from "lucide-react";
import type { CopyInfo, CopyLocationOption, CopyStatusOption } from "./record-types";
import { isCopyAvailable, getStatusColor } from "./record-utils";

interface LibraryGroup {
  library: string;
  totalCopies: number;
  availableCopies: number;
  copies: CopyInfo[];
}

interface EditingRowState {
  callNumber: string;
  statusId: string;
  locationId: string;
}

interface ItemsTabProps {
  copies: CopyInfo[];
  statuses: CopyStatusOption[];
  locations: CopyLocationOption[];
  recordId: string;
  onRefresh: () => void;
  onAddItem: () => void;
}

export function ItemsTab({ copies, statuses, locations, recordId: itemsRecordId, onRefresh, onAddItem }: ItemsTabProps) {
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [editingState, setEditingState] = useState<Record<number, EditingRowState>>({});
  const [savingIds, setSavingIds] = useState<Set<number>>(new Set());
  const [collapsedLibraries, setCollapsedLibraries] = useState<Set<string>>(new Set());
  const [bulkAction, setBulkAction] = useState<"status" | "location" | null>(null);
  const [bulkValue, setBulkValue] = useState("");
  const [bulkProcessing, setBulkProcessing] = useState(false);

  const libraryGroups = useMemo<LibraryGroup[]>(() => {
    const groupMap = new Map<string, LibraryGroup>();
    for (const copy of copies) {
      const lib = copy.circLib || "-";
      const existing = groupMap.get(lib);
      if (existing) {
        existing.copies.push(copy); existing.totalCopies += 1;
        if (isCopyAvailable(copy.statusId)) existing.availableCopies += 1;
      } else {
        groupMap.set(lib, { library: lib, totalCopies: 1, availableCopies: isCopyAvailable(copy.statusId) ? 1 : 0, copies: [copy] });
      }
    }
    return Array.from(groupMap.values())
      .map((g) => ({ ...g, copies: [...g.copies].sort((a, b) => a.barcode.localeCompare(b.barcode)) }))
      .sort((a, b) => a.library.localeCompare(b.library));
  }, [copies]);

  const allSelected = copies.length > 0 && selectedIds.size === copies.length;
  const someSelected = selectedIds.size > 0 && selectedIds.size < copies.length;

  const toggleSelectAll = () => { if (allSelected) setSelectedIds(new Set()); else setSelectedIds(new Set(copies.map((c) => c.id))); };
  const toggleSelect = (id: number) => { setSelectedIds((prev) => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; }); };
  const toggleLibraryCollapse = (library: string) => { setCollapsedLibraries((prev) => { const next = new Set(prev); if (next.has(library)) next.delete(library); else next.add(library); return next; }); };

  const startEditing = (copy: CopyInfo) => { setEditingState((prev) => ({ ...prev, [copy.id]: { callNumber: copy.callNumber, statusId: String(copy.statusId), locationId: String(copy.locationId ?? "") } })); };
  const cancelEditing = (copyId: number) => { setEditingState((prev) => { const next = { ...prev }; delete next[copyId]; return next; }); };
  const updateEditField = (copyId: number, field: keyof EditingRowState, value: string) => { setEditingState((prev) => ({ ...prev, [copyId]: { ...prev[copyId]!, [field]: value } })); };

  const saveItem = async (copyId: number) => {
    const edit = editingState[copyId]; if (!edit) return;
    setSavingIds((prev) => new Set(prev).add(copyId));
    try {
      const originalCopy = copies.find((c) => c.id === copyId); if (!originalCopy) return;
      const body: Record<string, unknown> = {};
      if (edit.callNumber !== originalCopy.callNumber) body.callNumber = edit.callNumber;
      if (edit.locationId && edit.locationId !== String(originalCopy.locationId ?? "")) body.locationId = parseInt(edit.locationId, 10);
      if (edit.statusId !== String(originalCopy.statusId)) body.statusId = parseInt(edit.statusId, 10);
      const res = await fetchWithAuth(`/api/evergreen/items/${copyId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await res.json();
      if (data.ok) { toast.success(`Item ${originalCopy.barcode} updated`); clientLogger.info("Item edited", { itemId: copyId, recordId: itemsRecordId, changes: Object.keys(body), action: "item_inline_edit" }); cancelEditing(copyId); onRefresh(); }
      else toast.error(data.error || "Failed to update item");
    } catch { toast.error("Failed to update item"); }
    finally { setSavingIds((prev) => { const next = new Set(prev); next.delete(copyId); return next; }); }
  };

  const executeBulkAction = async () => {
    if (!bulkAction || !bulkValue || selectedIds.size === 0) return;
    setBulkProcessing(true);
    const ids = Array.from(selectedIds);
    const body: Record<string, unknown> = {};
    if (bulkAction === "status") body.statusId = parseInt(bulkValue, 10);
    else if (bulkAction === "location") body.locationId = parseInt(bulkValue, 10);
    let successCount = 0; let failCount = 0;
    const results = await Promise.allSettled(ids.map(async (id) => { const res = await fetchWithAuth(`/api/evergreen/items/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }); const data = await res.json(); if (!data.ok) throw new Error(data.error || "Failed"); return data; }));
    for (const result of results) { if (result.status === "fulfilled") successCount++; else failCount++; }
    if (successCount > 0) { toast.success(`Updated ${successCount} item${successCount > 1 ? "s" : ""}`); clientLogger.info("Bulk item operation", { recordId: itemsRecordId, action: bulkAction, itemCount: ids.length, itemIds: ids, operation: "bulk_item_action" }); }
    if (failCount > 0) toast.error(`Failed to update ${failCount} item${failCount > 1 ? "s" : ""}`);
    setBulkProcessing(false); setBulkAction(null); setBulkValue(""); setSelectedIds(new Set()); onRefresh();
  };

  if (copies.length === 0) return <EmptyState title="No copies" description="No copies are attached to this record." action={{ label: "Add Item", onClick: onAddItem, icon: Plus }} />;

  return (
    <div className="space-y-4">
      {selectedIds.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/50 p-3">
          <span className="text-sm font-medium">{selectedIds.size} item{selectedIds.size > 1 ? "s" : ""} selected</span>
          <Separator orientation="vertical" className="h-6" />
          <Button size="sm" variant="outline" onClick={() => { setBulkAction("status"); setBulkValue(""); }}>Change Status</Button>
          <Button size="sm" variant="outline" onClick={() => { setBulkAction("location"); setBulkValue(""); }}>Change Location</Button>
          <Button size="sm" variant="outline" className="text-destructive border-destructive/50 hover:bg-destructive/10" onClick={() => toast.error("Bulk delete is not yet supported from this view")}>
            <Trash2 className="h-3.5 w-3.5 mr-1" /> Delete
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setSelectedIds(new Set())} className="ml-auto">Clear Selection</Button>
        </div>
      )}

      <Dialog open={bulkAction !== null} onOpenChange={(open) => { if (!open) { setBulkAction(null); setBulkValue(""); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{bulkAction === "status" ? "Change Status" : "Change Location"}</DialogTitle>
            <DialogDescription>Apply to {selectedIds.size} selected item{selectedIds.size > 1 ? "s" : ""}</DialogDescription>
          </DialogHeader>
          <div className="py-4">
            {bulkAction === "status" && (<Select value={bulkValue} onValueChange={setBulkValue}><SelectTrigger><SelectValue placeholder="Select new status" /></SelectTrigger><SelectContent>{statuses.map((s) => (<SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>))}</SelectContent></Select>)}
            {bulkAction === "location" && (<Select value={bulkValue} onValueChange={setBulkValue}><SelectTrigger><SelectValue placeholder="Select new location" /></SelectTrigger><SelectContent>{locations.map((loc) => (<SelectItem key={loc.id} value={String(loc.id)}>{loc.name}</SelectItem>))}</SelectContent></Select>)}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setBulkAction(null); setBulkValue(""); }}>Cancel</Button>
            <Button onClick={executeBulkAction} disabled={!bulkValue || bulkProcessing}>
              {bulkProcessing ? (<><Loader2 className="h-4 w-4 mr-2 animate-spin" />Applying...</>) : "Apply"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th scope="col" className="w-10 px-3 py-2"><Checkbox checked={allSelected ? true : someSelected ? "indeterminate" : false} onCheckedChange={toggleSelectAll} aria-label="Select all items" /></th>
              <th scope="col" className="px-3 py-2 text-left">Barcode</th>
              <th scope="col" className="px-3 py-2 text-left">Call Number</th>
              <th scope="col" className="px-3 py-2 text-left">Location</th>
              <th scope="col" className="px-3 py-2 text-left">Status</th>
              <th scope="col" className="px-3 py-2 text-left">Due Date</th>
              <th scope="col" className="w-24 px-3 py-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {libraryGroups.map((group) => {
              const isCollapsed = collapsedLibraries.has(group.library);
              const groupCopyIds = group.copies.map((c) => c.id);
              const allGroupSelected = groupCopyIds.length > 0 && groupCopyIds.every((id) => selectedIds.has(id));
              const someGroupSelected = !allGroupSelected && groupCopyIds.some((id) => selectedIds.has(id));

              return (
                <React.Fragment key={`group-${group.library}`}>
                  <tr className="bg-muted/20 border-t cursor-pointer hover:bg-muted/40 transition-colors" onClick={() => toggleLibraryCollapse(group.library)}>
                    <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                      <Checkbox checked={allGroupSelected ? true : someGroupSelected ? "indeterminate" : false} onCheckedChange={() => { setSelectedIds((prev) => { const next = new Set(prev); if (allGroupSelected) { for (const id of groupCopyIds) next.delete(id); } else { for (const id of groupCopyIds) next.add(id); } return next; }); }} aria-label={`Select all items in ${group.library}`} />
                    </td>
                    <td colSpan={6} className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        {isCollapsed ? <ChevronRight className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                        <Building className="h-4 w-4 text-muted-foreground" />
                        <span className="font-medium">{group.library}</span>
                        <Badge variant={group.availableCopies > 0 ? "default" : "secondary"} className="ml-2">{group.availableCopies} / {group.totalCopies} available</Badge>
                      </div>
                    </td>
                  </tr>
                  {!isCollapsed && group.copies.map((copy) => {
                    const isEditing = editingState[copy.id] !== undefined;
                    const isSaving = savingIds.has(copy.id);
                    const edit = editingState[copy.id];
                    return (
                      <tr key={`copy-${copy.id}`} className={"border-t transition-colors " + (isEditing ? "bg-blue-50/50 dark:bg-blue-950/20" : "hover:bg-muted/30")}>
                        <td className="px-3 py-2"><Checkbox checked={selectedIds.has(copy.id)} onCheckedChange={() => toggleSelect(copy.id)} aria-label={`Select item ${copy.barcode}`} /></td>
                        <td className="px-3 py-2"><Link href={`/staff/catalog/item/${copy.id}`} className="font-mono text-sm text-primary hover:underline">{copy.barcode}</Link></td>
                        <td className="px-3 py-2">{isEditing ? <Input value={edit!.callNumber} onChange={(e) => updateEditField(copy.id, "callNumber", e.target.value)} className="h-8 text-sm font-mono" disabled={isSaving} /> : <span className="text-sm">{copy.callNumber}</span>}</td>
                        <td className="px-3 py-2">{isEditing ? <Select value={edit!.locationId} onValueChange={(val) => updateEditField(copy.id, "locationId", val)} disabled={isSaving}><SelectTrigger className="h-8 text-sm"><SelectValue placeholder={copy.location} /></SelectTrigger><SelectContent>{locations.map((loc) => (<SelectItem key={loc.id} value={String(loc.id)}>{loc.name}</SelectItem>))}</SelectContent></Select> : <div className="flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5 text-muted-foreground" /><span className="text-sm">{copy.location}</span></div>}</td>
                        <td className="px-3 py-2">{isEditing ? <Select value={edit!.statusId} onValueChange={(val) => updateEditField(copy.id, "statusId", val)} disabled={isSaving}><SelectTrigger className="h-8 text-sm"><SelectValue placeholder={copy.status} /></SelectTrigger><SelectContent>{statuses.map((s) => (<SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>))}</SelectContent></Select> : <Badge variant="outline" className={getStatusColor(copy.statusId)}>{copy.status}</Badge>}</td>
                        <td className="px-3 py-2"><span className="text-sm text-muted-foreground">{copy.dueDate ? new Date(copy.dueDate).toLocaleDateString() : "-"}</span></td>
                        <td className="px-3 py-2 text-right">
                          {isEditing ? (
                            <div className="flex items-center justify-end gap-1">
                              <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => saveItem(copy.id)} disabled={isSaving} title="Save">{isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5 text-green-600" />}</Button>
                              <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => cancelEditing(copy.id)} disabled={isSaving} title="Cancel"><X className="h-3.5 w-3.5 text-muted-foreground" /></Button>
                            </div>
                          ) : (
                            <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => startEditing(copy)} title="Edit item"><Pencil className="h-3.5 w-3.5 text-muted-foreground" /></Button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
