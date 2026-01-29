/**
 * Item Status Editor
 * Configure and manage copy status definitions
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
import { Switch } from "@/components/ui/switch";
import { CircleDot, Plus, Edit, Trash2, Check, X, Lock, Eye, EyeOff,  Calendar, AlertTriangle } from "lucide-react";
import type { ColumnDef } from "@tanstack/react-table";

interface ItemStatus {
  id: number;
  name: string;
  holdable: boolean;
  opacVisible: boolean;
  copyActive: boolean;
  isAvailable: boolean;
  restrictCopyDelete: boolean;
  hopelessProne: boolean;
  color: string;
}

const mockStatuses: ItemStatus[] = [
  { id: 0, name: "Available", holdable: true, opacVisible: true, copyActive: true, isAvailable: true, restrictCopyDelete: false, hopelessProne: false, color: "emerald" },
  { id: 1, name: "Checked out", holdable: true, opacVisible: true, copyActive: true, isAvailable: false, restrictCopyDelete: true, hopelessProne: false, color: "blue" },
  { id: 2, name: "Bindery", holdable: false, opacVisible: true, copyActive: false, isAvailable: false, restrictCopyDelete: false, hopelessProne: false, color: "amber" },
  { id: 3, name: "Lost", holdable: false, opacVisible: true, copyActive: false, isAvailable: false, restrictCopyDelete: false, hopelessProne: true, color: "red" },
  { id: 4, name: "Missing", holdable: false, opacVisible: true, copyActive: false, isAvailable: false, restrictCopyDelete: false, hopelessProne: true, color: "orange" },
  { id: 5, name: "In process", holdable: false, opacVisible: false, copyActive: false, isAvailable: false, restrictCopyDelete: false, hopelessProne: false, color: "purple" },
  { id: 6, name: "In transit", holdable: true, opacVisible: true, copyActive: true, isAvailable: false, restrictCopyDelete: true, hopelessProne: false, color: "cyan" },
  { id: 7, name: "Reshelving", holdable: true, opacVisible: true, copyActive: true, isAvailable: true, restrictCopyDelete: false, hopelessProne: false, color: "teal" },
  { id: 8, name: "On holds shelf", holdable: false, opacVisible: true, copyActive: true, isAvailable: false, restrictCopyDelete: true, hopelessProne: false, color: "violet" },
  { id: 9, name: "On order", holdable: true, opacVisible: true, copyActive: false, isAvailable: false, restrictCopyDelete: false, hopelessProne: false, color: "slate" },
  { id: 10, name: "ILL", holdable: false, opacVisible: true, copyActive: false, isAvailable: false, restrictCopyDelete: false, hopelessProne: false, color: "pink" },
  { id: 11, name: "Cataloging", holdable: false, opacVisible: false, copyActive: false, isAvailable: false, restrictCopyDelete: false, hopelessProne: false, color: "indigo" },
  { id: 12, name: "Reserves", holdable: false, opacVisible: true, copyActive: true, isAvailable: false, restrictCopyDelete: true, hopelessProne: false, color: "sky" },
  { id: 13, name: "Discard/Weed", holdable: false, opacVisible: false, copyActive: false, isAvailable: false, restrictCopyDelete: false, hopelessProne: false, color: "stone" },
  { id: 14, name: "Damaged", holdable: false, opacVisible: true, copyActive: false, isAvailable: false, restrictCopyDelete: false, hopelessProne: false, color: "rose" },
  { id: 15, name: "On display", holdable: true, opacVisible: true, copyActive: true, isAvailable: false, restrictCopyDelete: false, hopelessProne: false, color: "lime" },
];

const colorMap: Record<string, string> = {
  emerald: "bg-emerald-500",
  blue: "bg-blue-500",
  amber: "bg-amber-500",
  red: "bg-red-500",
  orange: "bg-orange-500",
  purple: "bg-purple-500",
  cyan: "bg-cyan-500",
  teal: "bg-teal-500",
  violet: "bg-violet-500",
  slate: "bg-slate-500",
  pink: "bg-pink-500",
  indigo: "bg-indigo-500",
  sky: "bg-sky-500",
  stone: "bg-stone-500",
  rose: "bg-rose-500",
  lime: "bg-lime-500",
};

export default function ItemStatusPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [editStatus, setEditStatus] = useState<ItemStatus | null>(null);
  const [newStatusOpen, setNewStatusOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [statusToDelete, setStatusToDelete] = useState<ItemStatus | null>(null);

  const filteredStatuses = mockStatuses.filter((s) => s.name.toLowerCase().includes(searchQuery.toLowerCase()));

  const BoolIcon = ({ value }: { value: boolean }) => value ? <Check className="h-4 w-4 text-emerald-600" /> : <X className="h-4 w-4 text-muted-foreground/50" />;

  const columns: ColumnDef<ItemStatus>[] = [
    {
      accessorKey: "id",
      header: "ID",
      cell: ({ row }) => <span className="font-mono text-sm text-muted-foreground">{row.original.id}</span>,
    },
    {
      accessorKey: "name",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Status" />,
      cell: ({ row }) => (
        <div className="flex items-center gap-3">
          <div className={`h-3 w-3 rounded-full ${colorMap[row.original.color]}`} />
          <span className="font-medium">{row.original.name}</span>
        </div>
      ),
    },
    {
      accessorKey: "holdable",
      header: "Holdable",
      cell: ({ row }) => <BoolIcon value={row.original.holdable} />,
    },
    {
      accessorKey: "opacVisible",
      header: "OPAC",
      cell: ({ row }) => row.original.opacVisible ? <Eye className="h-4 w-4 text-emerald-600" /> : <EyeOff className="h-4 w-4 text-muted-foreground/50" />,
    },
    {
      accessorKey: "copyActive",
      header: "Active",
      cell: ({ row }) => <BoolIcon value={row.original.copyActive} />,
    },
    {
      accessorKey: "isAvailable",
      header: "Available",
      cell: ({ row }) => (
        <Badge variant={row.original.isAvailable ? "default" : "secondary"} className={row.original.isAvailable ? "bg-emerald-100 text-emerald-700" : ""}>
          {row.original.isAvailable ? "Yes" : "No"}
        </Badge>
      ),
    },
    {
      accessorKey: "restrictCopyDelete",
      header: "Protect",
      cell: ({ row }) => row.original.restrictCopyDelete ? <Lock className="h-4 w-4 text-amber-600" /> : <span className="text-muted-foreground/50">-</span>,
    },
    {
      accessorKey: "hopelessProne",
      header: "Hopeless",
      cell: ({ row }) => row.original.hopelessProne ? <AlertTriangle className="h-4 w-4 text-red-600" /> : <span className="text-muted-foreground/50">-</span>,
    },
    {
      id: "actions",
      cell: ({ row }) => (
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setEditStatus(row.original)}><Edit className="h-4 w-4" /></Button>
          {row.original.id >= 100 && (
            <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => { setStatusToDelete(row.original); setDeleteOpen(true); }}><Trash2 className="h-4 w-4" /></Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <PageContainer>
      <PageHeader
        title="Item Statuses"
        subtitle="Configure copy status definitions and behaviors"
        breadcrumbs={[{ label: "Admin", href: "/staff/admin" }, { label: "Item Statuses" }]}
        actions={[{ label: "New Status", onClick: () => setNewStatusOpen(true), icon: Plus }]}
      />
      <PageContent>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <Card className="bg-gradient-to-br from-emerald-50 to-emerald-100/50 dark:from-emerald-950/50 dark:to-emerald-900/20 border-emerald-200/50">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div><p className="text-sm font-medium text-emerald-600">Available</p><p className="text-3xl font-bold text-emerald-700">{mockStatuses.filter((s) => s.isAvailable).length}</p></div>
                <div className="h-12 w-12 rounded-xl bg-emerald-500/20 flex items-center justify-center"><Check className="h-6 w-6 text-emerald-600" /></div>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-gradient-to-br from-blue-50 to-blue-100/50 dark:from-blue-950/50 dark:to-blue-900/20 border-blue-200/50">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div><p className="text-sm font-medium text-blue-600">Holdable</p><p className="text-3xl font-bold text-blue-700">{mockStatuses.filter((s) => s.holdable).length}</p></div>
                <div className="h-12 w-12 rounded-xl bg-blue-500/20 flex items-center justify-center"><Calendar className="h-6 w-6 text-blue-600" /></div>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-gradient-to-br from-purple-50 to-purple-100/50 dark:from-purple-950/50 dark:to-purple-900/20 border-purple-200/50">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div><p className="text-sm font-medium text-purple-600">OPAC Visible</p><p className="text-3xl font-bold text-purple-700">{mockStatuses.filter((s) => s.opacVisible).length}</p></div>
                <div className="h-12 w-12 rounded-xl bg-purple-500/20 flex items-center justify-center"><Eye className="h-6 w-6 text-purple-600" /></div>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-gradient-to-br from-amber-50 to-amber-100/50 dark:from-amber-950/50 dark:to-amber-900/20 border-amber-200/50">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div><p className="text-sm font-medium text-amber-600">Total Statuses</p><p className="text-3xl font-bold text-amber-700">{mockStatuses.length}</p></div>
                <div className="h-12 w-12 rounded-xl bg-amber-500/20 flex items-center justify-center"><CircleDot className="h-6 w-6 text-amber-600" /></div>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div><CardTitle>Copy Statuses</CardTitle><CardDescription>System and custom item statuses with their properties</CardDescription></div>
              <div className="relative">
                <CircleDot className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Search statuses..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-12 w-[250px]" />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <DataTable columns={columns} data={filteredStatuses} emptyState={<EmptyState title="No statuses found" description="Adjust your search or create a new status." />} />
          </CardContent>
        </Card>
      </PageContent>

      <Dialog open={newStatusOpen || !!editStatus} onOpenChange={() => { setNewStatusOpen(false); setEditStatus(null); }}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><CircleDot className="h-5 w-5" />{editStatus ? "Edit Status" : "New Status"}</DialogTitle>
            <DialogDescription>{editStatus ? "Modify status properties" : "Create a new copy status"}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2"><Label>Status Name</Label><Input placeholder="e.g., On Display" defaultValue={editStatus?.name} /></div>
            <div className="grid grid-cols-2 gap-4">
              <div className="flex items-center justify-between p-3 border rounded-lg"><div className="space-y-0.5"><Label>Holdable</Label><p className="text-xs text-muted-foreground">Can be placed on hold</p></div><Switch defaultChecked={editStatus?.holdable} /></div>
              <div className="flex items-center justify-between p-3 border rounded-lg"><div className="space-y-0.5"><Label>OPAC Visible</Label><p className="text-xs text-muted-foreground">Show in catalog</p></div><Switch defaultChecked={editStatus?.opacVisible} /></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="flex items-center justify-between p-3 border rounded-lg"><div className="space-y-0.5"><Label>Copy Active</Label><p className="text-xs text-muted-foreground">Item is in circulation</p></div><Switch defaultChecked={editStatus?.copyActive} /></div>
              <div className="flex items-center justify-between p-3 border rounded-lg"><div className="space-y-0.5"><Label>Is Available</Label><p className="text-xs text-muted-foreground">Shows as available</p></div><Switch defaultChecked={editStatus?.isAvailable} /></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="flex items-center justify-between p-3 border rounded-lg"><div className="space-y-0.5"><Label>Protect Delete</Label><p className="text-xs text-muted-foreground">Prevent deletion</p></div><Switch defaultChecked={editStatus?.restrictCopyDelete} /></div>
              <div className="flex items-center justify-between p-3 border rounded-lg"><div className="space-y-0.5"><Label>Hopeless Prone</Label><p className="text-xs text-muted-foreground">Mark for review</p></div><Switch defaultChecked={editStatus?.hopelessProne} /></div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setNewStatusOpen(false); setEditStatus(null); }}>Cancel</Button>
            <Button onClick={() => { toast.success(editStatus ? "Status updated" : "Status created"); setNewStatusOpen(false); setEditStatus(null); }}>{editStatus ? "Save Changes" : "Create Status"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog open={deleteOpen} onOpenChange={setDeleteOpen} title="Delete Status" description={`Delete "${statusToDelete?.name}"? Items using this status will need reassignment.`} variant="danger" onConfirm={() => { toast.success("Status deleted"); setDeleteOpen(false); }} />
    </PageContainer>
  );
}
