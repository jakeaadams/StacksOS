/**
 * Copy Tags Management
 * Digital bookplates and item labeling system
 */

"use client";

import * as React from "react";
import { useState } from "react";
import { toast } from "sonner";
import {
  PageContainer,
  PageHeader,
  PageContent,
  DataTable,
  DataTableColumnHeader,
  EmptyState,
  ConfirmDialog,
} from "@/components/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Tag, Plus, Search, Edit, Trash2, Eye, EyeOff, Bookmark, Gift, Award, Heart, Star, BookMarked } from "lucide-react";
import type { ColumnDef } from "@tanstack/react-table";

interface CopyTagType {
  id: number;
  label: string;
  code: string;
  owner: string;
  opacVisible: boolean;
  staffNote?: string;
  tagCount: number;
  icon: string;
  color: string;
}

interface CopyTag {
  id: number;
  typeId: number;
  copyId: number;
  barcode: string;
  title: string;
  note?: string;
  url?: string;
  addedDate: string;
}

const mockTagTypes: CopyTagType[] = [
  { id: 1, label: "Digital Bookplate", code: "BOOKPLATE", owner: "CONS", opacVisible: true, staffNote: "Donor recognition bookplates", tagCount: 234, icon: "bookmark", color: "amber" },
  { id: 2, label: "Staff Pick", code: "STAFFPICK", owner: "CONS", opacVisible: true, staffNote: "Monthly staff recommendations", tagCount: 45, icon: "star", color: "yellow" },
  { id: 3, label: "Award Winner", code: "AWARD", owner: "CONS", opacVisible: true, staffNote: "Literary award winners", tagCount: 89, icon: "award", color: "purple" },
  { id: 4, label: "Donated By", code: "DONATED", owner: "STACKSB", opacVisible: true, staffNote: "Items from donors", tagCount: 156, icon: "gift", color: "rose" },
  { id: 5, label: "Local Interest", code: "LOCAL", owner: "CONS", opacVisible: true, staffNote: "Local history and authors", tagCount: 67, icon: "heart", color: "red" },
  { id: 6, label: "Processing Note", code: "PROCNOTE", owner: "CONS", opacVisible: false, staffNote: "Internal processing notes", tagCount: 23, icon: "tag", color: "slate" },
];

const mockTags: CopyTag[] = [
  { id: 1, typeId: 1, copyId: 1001, barcode: "31234567890001", title: "The Great Gatsby", note: "In memory of John Smith", url: "https://example.com/donor/smith", addedDate: "2024-01-15" },
  { id: 2, typeId: 2, copyId: 1002, barcode: "31234567890002", title: "Where the Crawdads Sing", note: "January 2024 Staff Pick - Sarah", addedDate: "2024-01-01" },
  { id: 3, typeId: 3, copyId: 1003, barcode: "31234567890003", title: "All the Light We Cannot See", note: "Pulitzer Prize Winner 2015", addedDate: "2023-11-20" },
];

const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  bookmark: Bookmark,
  star: Star,
  award: Award,
  gift: Gift,
  heart: Heart,
  tag: Tag,
};

const colorMap: Record<string, { bg: string; text: string; icon: string }> = {
  amber: { bg: "bg-amber-100 dark:bg-amber-900/30", text: "text-amber-700 dark:text-amber-400", icon: "text-amber-600" },
  yellow: { bg: "bg-yellow-100 dark:bg-yellow-900/30", text: "text-yellow-700 dark:text-yellow-400", icon: "text-yellow-600" },
  purple: { bg: "bg-purple-100 dark:bg-purple-900/30", text: "text-purple-700 dark:text-purple-400", icon: "text-purple-600" },
  rose: { bg: "bg-rose-100 dark:bg-rose-900/30", text: "text-rose-700 dark:text-rose-400", icon: "text-rose-600" },
  red: { bg: "bg-red-100 dark:bg-red-900/30", text: "text-red-700 dark:text-red-400", icon: "text-red-600" },
  slate: { bg: "bg-slate-100 dark:bg-slate-900/30", text: "text-slate-700 dark:text-slate-400", icon: "text-slate-600" },
};

export default function CopyTagsPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedType, setSelectedType] = useState<CopyTagType | null>(null);
  const [newTypeOpen, setNewTypeOpen] = useState(false);
  const [addTagOpen, setAddTagOpen] = useState(false);
  const [editType, setEditType] = useState<CopyTagType | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [typeToDelete, setTypeToDelete] = useState<CopyTagType | null>(null);

  const filteredTypes = mockTagTypes.filter((t) => t.label.toLowerCase().includes(searchQuery.toLowerCase()) || t.code.toLowerCase().includes(searchQuery.toLowerCase()));

  const typeTags = selectedType ? mockTags.filter((t) => t.typeId === selectedType.id) : [];

  const typeColumns: ColumnDef<CopyTagType>[] = [
    {
      accessorKey: "label",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Tag Type" />,
      cell: ({ row }) => {
        const Icon = iconMap[row.original.icon] || Tag;
        const colors = colorMap[row.original.color] || colorMap.slate;
        return (
          <div className="flex items-center gap-3">
            <div className={`h-10 w-10 rounded-xl flex items-center justify-center ${colors.bg}`}>
              <Icon className={`h-5 w-5 ${colors.icon}`} />
            </div>
            <div>
              <div className="font-medium">{row.original.label}</div>
              <div className="text-sm text-muted-foreground font-mono">{row.original.code}</div>
            </div>
          </div>
        );
      },
    },
    {
      accessorKey: "owner",
      header: "Owner",
      cell: ({ row }) => <Badge variant="outline" className="font-mono">{row.original.owner}</Badge>,
    },
    {
      accessorKey: "opacVisible",
      header: "OPAC",
      cell: ({ row }) => row.original.opacVisible ? <Eye className="h-4 w-4 text-emerald-600" /> : <EyeOff className="h-4 w-4 text-muted-foreground/50" />,
    },
    {
      accessorKey: "tagCount",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Tags" />,
      cell: ({ row }) => <span className="font-mono text-sm">{row.original.tagCount}</span>,
    },
    {
      accessorKey: "staffNote",
      header: "Description",
      cell: ({ row }) => <span className="text-sm text-muted-foreground truncate max-w-[200px]">{row.original.staffNote}</span>,
    },
    {
      id: "actions",
      cell: ({ row }) => (
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setSelectedType(row.original)}><BookMarked className="h-4 w-4" /></Button>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setEditType(row.original)}><Edit className="h-4 w-4" /></Button>
          <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => { setTypeToDelete(row.original); setDeleteOpen(true); }}><Trash2 className="h-4 w-4" /></Button>
        </div>
      ),
    },
  ];

  const tagColumns: ColumnDef<CopyTag>[] = [
    {
      accessorKey: "barcode",
      header: "Barcode",
      cell: ({ row }) => <span className="font-mono text-sm">{row.original.barcode}</span>,
    },
    {
      accessorKey: "title",
      header: "Title",
      cell: ({ row }) => <span className="font-medium">{row.original.title}</span>,
    },
    {
      accessorKey: "note",
      header: "Note",
      cell: ({ row }) => <span className="text-sm text-muted-foreground">{row.original.note || "-"}</span>,
    },
    {
      accessorKey: "addedDate",
      header: "Added",
      cell: ({ row }) => <span className="text-sm">{new Date(row.original.addedDate).toLocaleDateString()}</span>,
    },
    {
      id: "actions",
      cell: ({ row }) => (
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-8 w-8"><Edit className="h-4 w-4" /></Button>
          <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive"><Trash2 className="h-4 w-4" /></Button>
        </div>
      ),
    },
  ];

  return (
    <PageContainer>
      <PageHeader
        title="Copy Tags"
        subtitle="Digital bookplates and item labeling"
        breadcrumbs={[{ label: "Admin", href: "/staff/admin" }, { label: "Copy Tags" }]}
        actions={[{ label: "New Tag Type", onClick: () => setNewTypeOpen(true), icon: Plus }]}
      />
      <PageContent>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <Card className="bg-gradient-to-br from-amber-50 to-amber-100/50 dark:from-amber-950/50 dark:to-amber-900/20 border-amber-200/50">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div><p className="text-sm font-medium text-amber-600">Tag Types</p><p className="text-3xl font-bold text-amber-700">{mockTagTypes.length}</p></div>
                <div className="h-12 w-12 rounded-xl bg-amber-500/20 flex items-center justify-center"><Tag className="h-6 w-6 text-amber-600" /></div>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-gradient-to-br from-emerald-50 to-emerald-100/50 dark:from-emerald-950/50 dark:to-emerald-900/20 border-emerald-200/50">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div><p className="text-sm font-medium text-emerald-600">Total Tags</p><p className="text-3xl font-bold text-emerald-700">{mockTagTypes.reduce((s, t) => s + t.tagCount, 0)}</p></div>
                <div className="h-12 w-12 rounded-xl bg-emerald-500/20 flex items-center justify-center"><Bookmark className="h-6 w-6 text-emerald-600" /></div>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-gradient-to-br from-purple-50 to-purple-100/50 dark:from-purple-950/50 dark:to-purple-900/20 border-purple-200/50">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div><p className="text-sm font-medium text-purple-600">OPAC Visible</p><p className="text-3xl font-bold text-purple-700">{mockTagTypes.filter((t) => t.opacVisible).length}</p></div>
                <div className="h-12 w-12 rounded-xl bg-purple-500/20 flex items-center justify-center"><Eye className="h-6 w-6 text-purple-600" /></div>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-gradient-to-br from-rose-50 to-rose-100/50 dark:from-rose-950/50 dark:to-rose-900/20 border-rose-200/50">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div><p className="text-sm font-medium text-rose-600">Bookplates</p><p className="text-3xl font-bold text-rose-700">{mockTagTypes.find((t) => t.code === "BOOKPLATE")?.tagCount || 0}</p></div>
                <div className="h-12 w-12 rounded-xl bg-rose-500/20 flex items-center justify-center"><Gift className="h-6 w-6 text-rose-600" /></div>
              </div>
            </CardContent>
          </Card>
        </div>

        {selectedType ? (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Badge variant="outline" className="font-mono">{selectedType.code}</Badge>
                    {selectedType.label} Tags
                  </CardTitle>
                  <CardDescription>{selectedType.staffNote}</CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="outline" onClick={() => setSelectedType(null)}>Back to Types</Button>
                  <Button onClick={() => setAddTagOpen(true)}><Plus className="h-4 w-4 mr-2" />Add Tag</Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <DataTable columns={tagColumns} data={typeTags} emptyState={<EmptyState title="No tags" description="Add tags to items of this type." action={{ label: "Add Tag", onClick: () => setAddTagOpen(true), icon: Plus }} />} />
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div><CardTitle>Tag Types</CardTitle><CardDescription>Manage copy tag categories and their properties</CardDescription></div>
                <div className="relative">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input placeholder="Search tag types..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-12 w-[250px]" />
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <DataTable columns={typeColumns} data={filteredTypes} emptyState={<EmptyState title="No tag types" description="Create a tag type to start labeling items." action={{ label: "New Tag Type", onClick: () => setNewTypeOpen(true), icon: Plus }} />} />
            </CardContent>
          </Card>
        )}
      </PageContent>

      <Dialog open={newTypeOpen || !!editType} onOpenChange={() => { setNewTypeOpen(false); setEditType(null); }}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Tag className="h-5 w-5" />{editType ? "Edit Tag Type" : "New Tag Type"}</DialogTitle>
            <DialogDescription>Configure a tag type for categorizing items</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label>Label</Label><Input placeholder="e.g., Digital Bookplate" defaultValue={editType?.label} /></div>
              <div className="space-y-2"><Label>Code</Label><Input placeholder="e.g., BOOKPLATE" className="font-mono" defaultValue={editType?.code} /></div>
            </div>
            <div className="space-y-2"><Label>Description</Label><Textarea placeholder="Internal description for staff" defaultValue={editType?.staffNote} /></div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label>Owner Library</Label><Select defaultValue={editType?.owner || "CONS"}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="CONS">CONS</SelectItem><SelectItem value="STACKSB">STACKSB</SelectItem></SelectContent></Select></div>
              <div className="space-y-2"><Label>Icon</Label><Select defaultValue={editType?.icon || "tag"}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="bookmark">Bookmark</SelectItem><SelectItem value="star">Star</SelectItem><SelectItem value="award">Award</SelectItem><SelectItem value="gift">Gift</SelectItem><SelectItem value="heart">Heart</SelectItem><SelectItem value="tag">Tag</SelectItem></SelectContent></Select></div>
            </div>
            <div className="flex items-center justify-between p-3 border rounded-lg"><div><Label>OPAC Visible</Label><p className="text-sm text-muted-foreground">Show tags of this type in public catalog</p></div><Switch defaultChecked={editType?.opacVisible ?? true} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setNewTypeOpen(false); setEditType(null); }}>Cancel</Button>
            <Button onClick={() => { toast.success(editType ? "Tag type updated" : "Tag type created"); setNewTypeOpen(false); setEditType(null); }}>{editType ? "Save Changes" : "Create Type"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={addTagOpen} onOpenChange={setAddTagOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Bookmark className="h-5 w-5" />Add Tag to Item</DialogTitle>
            <DialogDescription>Tag an item with {selectedType?.label}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2"><Label>Item Barcode</Label><Input placeholder="Scan or enter barcode" /></div>
            <div className="space-y-2"><Label>Note</Label><Textarea placeholder="e.g., In memory of..." /></div>
            <div className="space-y-2"><Label>URL (optional)</Label><Input placeholder="https://..." /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddTagOpen(false)}>Cancel</Button>
            <Button onClick={() => { toast.success("Tag added"); setAddTagOpen(false); }}>Add Tag</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog open={deleteOpen} onOpenChange={setDeleteOpen} title="Delete Tag Type" description={`Delete "${typeToDelete?.label}"? All tags of this type will be removed.`} variant="danger" onConfirm={() => { toast.success("Tag type deleted"); setDeleteOpen(false); }} />
    </PageContainer>
  );
}
