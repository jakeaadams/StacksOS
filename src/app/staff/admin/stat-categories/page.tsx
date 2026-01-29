/**
 * Statistical Categories Editor
 * Manage copy and patron statistical categories for reporting
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
  StatusBadge,
  ConfirmDialog,
} from "@/components/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { BarChart3, Plus, Search, Tags, Users, BookCopy, Edit, Trash2, Eye, EyeOff, GripVertical } from "lucide-react";
import type { ColumnDef } from "@tanstack/react-table";

interface StatCategory {
  id: number;
  name: string;
  owner: string;
  type: "copy" | "patron";
  required: boolean;
  opacVisible: boolean;
  entries: StatEntry[];
  usageCount: number;
}

interface StatEntry {
  id: number;
  categoryId: number;
  value: string;
  isDefault: boolean;
  sortOrder: number;
}

const mockCopyStats: StatCategory[] = [
  { id: 1, name: "Funding Source", owner: "CONS", type: "copy", required: false, opacVisible: false, entries: [
    { id: 1, categoryId: 1, value: "General Fund", isDefault: true, sortOrder: 1 },
    { id: 2, categoryId: 1, value: "Grant", isDefault: false, sortOrder: 2 },
    { id: 3, categoryId: 1, value: "Donation", isDefault: false, sortOrder: 3 },
  ], usageCount: 1250 },
  { id: 2, name: "Collection", owner: "CONS", type: "copy", required: true, opacVisible: true, entries: [
    { id: 4, categoryId: 2, value: "Adult Fiction", isDefault: true, sortOrder: 1 },
    { id: 5, categoryId: 2, value: "Adult Non-Fiction", isDefault: false, sortOrder: 2 },
    { id: 6, categoryId: 2, value: "Children", isDefault: false, sortOrder: 3 },
    { id: 7, categoryId: 2, value: "Young Adult", isDefault: false, sortOrder: 4 },
  ], usageCount: 3420 },
  { id: 3, name: "Condition", owner: "STACKSB", type: "copy", required: false, opacVisible: false, entries: [
    { id: 8, categoryId: 3, value: "New", isDefault: true, sortOrder: 1 },
    { id: 9, categoryId: 3, value: "Good", isDefault: false, sortOrder: 2 },
    { id: 10, categoryId: 3, value: "Fair", isDefault: false, sortOrder: 3 },
    { id: 11, categoryId: 3, value: "Poor", isDefault: false, sortOrder: 4 },
  ], usageCount: 890 },
];

const mockPatronStats: StatCategory[] = [
  { id: 101, name: "How did you hear about us?", owner: "CONS", type: "patron", required: false, opacVisible: true, entries: [
    { id: 101, categoryId: 101, value: "Friend/Family", isDefault: false, sortOrder: 1 },
    { id: 102, categoryId: 101, value: "Social Media", isDefault: false, sortOrder: 2 },
    { id: 103, categoryId: 101, value: "Website", isDefault: false, sortOrder: 3 },
    { id: 104, categoryId: 101, value: "Event", isDefault: false, sortOrder: 4 },
  ], usageCount: 450 },
  { id: 102, name: "Patron Type", owner: "CONS", type: "patron", required: true, opacVisible: false, entries: [
    { id: 105, categoryId: 102, value: "Student", isDefault: true, sortOrder: 1 },
    { id: 106, categoryId: 102, value: "Faculty", isDefault: false, sortOrder: 2 },
    { id: 107, categoryId: 102, value: "Staff", isDefault: false, sortOrder: 3 },
    { id: 108, categoryId: 102, value: "Community", isDefault: false, sortOrder: 4 },
  ], usageCount: 2100 },
];

export default function StatCategoriesPage() {
  const [activeTab, setActiveTab] = useState("copy");
  const [searchQuery, setSearchQuery] = useState("");
  const [editCategory, setEditCategory] = useState<StatCategory | null>(null);
  const [newCategoryOpen, setNewCategoryOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [categoryToDelete, setCategoryToDelete] = useState<StatCategory | null>(null);

  const copyCategories = mockCopyStats.filter((c) => c.name.toLowerCase().includes(searchQuery.toLowerCase()));
  const patronCategories = mockPatronStats.filter((c) => c.name.toLowerCase().includes(searchQuery.toLowerCase()));

  const columns: ColumnDef<StatCategory>[] = [
    {
      accessorKey: "name",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Category" />,
      cell: ({ row }) => (
        <div className="flex items-center gap-3">
          <div className={`h-10 w-10 rounded-xl flex items-center justify-center ${row.original.type === "copy" ? "bg-blue-100 dark:bg-blue-900/30" : "bg-purple-100 dark:bg-purple-900/30"}`}>
            {row.original.type === "copy" ? <BookCopy className="h-5 w-5 text-blue-600" /> : <Users className="h-5 w-5 text-purple-600" />}
          </div>
          <div>
            <div className="font-medium">{row.original.name}</div>
            <div className="text-sm text-muted-foreground">{row.original.entries.length} entries</div>
          </div>
        </div>
      ),
    },
    {
      accessorKey: "owner",
      header: "Owner",
      cell: ({ row }) => <Badge variant="outline" className="font-mono">{row.original.owner}</Badge>,
    },
    {
      accessorKey: "required",
      header: "Required",
      cell: ({ row }) => (
        <StatusBadge label={row.original.required ? "Yes" : "No"} status={row.original.required ? "warning" : "neutral"} />
      ),
    },
    {
      accessorKey: "opacVisible",
      header: "OPAC",
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          {row.original.opacVisible ? <Eye className="h-4 w-4 text-emerald-600" /> : <EyeOff className="h-4 w-4 text-muted-foreground" />}
          <span className="text-sm">{row.original.opacVisible ? "Visible" : "Hidden"}</span>
        </div>
      ),
    },
    {
      accessorKey: "usageCount",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Usage" />,
      cell: ({ row }) => <span className="font-mono text-sm">{row.original.usageCount.toLocaleString()}</span>,
    },
    {
      id: "actions",
      cell: ({ row }) => (
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setEditCategory(row.original)}><Edit className="h-4 w-4" /></Button>
          <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => { setCategoryToDelete(row.original); setDeleteOpen(true); }}><Trash2 className="h-4 w-4" /></Button>
        </div>
      ),
    },
  ];

  return (
    <PageContainer>
      <PageHeader
        title="Statistical Categories"
        subtitle="Manage copy and patron statistical categories for reporting"
        breadcrumbs={[{ label: "Admin", href: "/staff/admin" }, { label: "Statistical Categories" }]}
        actions={[{ label: "New Category", onClick: () => setNewCategoryOpen(true), icon: Plus }]}
      />
      <PageContent>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <Card className="bg-gradient-to-br from-blue-50 to-blue-100/50 dark:from-blue-950/50 dark:to-blue-900/20 border-blue-200/50">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-blue-600">Copy Categories</p>
                  <p className="text-3xl font-bold text-blue-700">{mockCopyStats.length}</p>
                </div>
                <div className="h-12 w-12 rounded-xl bg-blue-500/20 flex items-center justify-center"><BookCopy className="h-6 w-6 text-blue-600" /></div>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-gradient-to-br from-purple-50 to-purple-100/50 dark:from-purple-950/50 dark:to-purple-900/20 border-purple-200/50">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-purple-600">Patron Categories</p>
                  <p className="text-3xl font-bold text-purple-700">{mockPatronStats.length}</p>
                </div>
                <div className="h-12 w-12 rounded-xl bg-purple-500/20 flex items-center justify-center"><Users className="h-6 w-6 text-purple-600" /></div>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-gradient-to-br from-emerald-50 to-emerald-100/50 dark:from-emerald-950/50 dark:to-emerald-900/20 border-emerald-200/50">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-emerald-600">Total Entries</p>
                  <p className="text-3xl font-bold text-emerald-700">{[...mockCopyStats, ...mockPatronStats].reduce((s, c) => s + c.entries.length, 0)}</p>
                </div>
                <div className="h-12 w-12 rounded-xl bg-emerald-500/20 flex items-center justify-center"><Tags className="h-6 w-6 text-emerald-600" /></div>
              </div>
            </CardContent>
          </Card>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <div className="flex items-center justify-between mb-4">
            <TabsList>
              <TabsTrigger value="copy" className="gap-2"><BookCopy className="h-4 w-4" />Copy Stat Cats</TabsTrigger>
              <TabsTrigger value="patron" className="gap-2"><Users className="h-4 w-4" />Patron Stat Cats</TabsTrigger>
            </TabsList>
            <div className="relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search categories..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-12 w-[250px]" />
            </div>
          </div>

          <TabsContent value="copy">
            <Card>
              <CardHeader>
                <CardTitle>Copy Statistical Categories</CardTitle>
                <CardDescription>Categories applied to item copies for reporting and filtering</CardDescription>
              </CardHeader>
              <CardContent>
                <DataTable columns={columns} data={copyCategories} emptyState={<EmptyState title="No copy categories" description="Create a statistical category for items." action={{ label: "New Category", onClick: () => setNewCategoryOpen(true), icon: Plus }} />} />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="patron">
            <Card>
              <CardHeader>
                <CardTitle>Patron Statistical Categories</CardTitle>
                <CardDescription>Categories applied to patron records for demographics and reporting</CardDescription>
              </CardHeader>
              <CardContent>
                <DataTable columns={columns} data={patronCategories} emptyState={<EmptyState title="No patron categories" description="Create a statistical category for patrons." action={{ label: "New Category", onClick: () => setNewCategoryOpen(true), icon: Plus }} />} />
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </PageContent>

      <Dialog open={newCategoryOpen} onOpenChange={setNewCategoryOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><BarChart3 className="h-5 w-5" />New Statistical Category</DialogTitle>
            <DialogDescription>Create a new category for statistical reporting.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2"><Label>Category Name</Label><Input placeholder="e.g., Funding Source" /></div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label>Type</Label><Select defaultValue="copy"><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="copy">Copy</SelectItem><SelectItem value="patron">Patron</SelectItem></SelectContent></Select></div>
              <div className="space-y-2"><Label>Owner Library</Label><Select defaultValue="CONS"><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="CONS">CONS</SelectItem><SelectItem value="STACKSB">STACKSB</SelectItem></SelectContent></Select></div>
            </div>
            <div className="flex items-center justify-between"><div><Label>Required</Label><p className="text-sm text-muted-foreground">Must be set when creating records</p></div><Switch /></div>
            <div className="flex items-center justify-between"><div><Label>OPAC Visible</Label><p className="text-sm text-muted-foreground">Show to patrons in public catalog</p></div><Switch /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewCategoryOpen(false)}>Cancel</Button>
            <Button onClick={() => { toast.success("Category created"); setNewCategoryOpen(false); }}>Create Category</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editCategory} onOpenChange={() => setEditCategory(null)}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Edit className="h-5 w-5" />Edit: {editCategory?.name}</DialogTitle>
            <DialogDescription>Manage category settings and entries.</DialogDescription>
          </DialogHeader>
          {editCategory && (
            <div className="grid gap-4 py-4">
              <div className="space-y-2"><Label>Category Name</Label><Input defaultValue={editCategory.name} /></div>
              <div className="flex items-center justify-between"><div><Label>Required</Label></div><Switch defaultChecked={editCategory.required} /></div>
              <div className="flex items-center justify-between"><div><Label>OPAC Visible</Label></div><Switch defaultChecked={editCategory.opacVisible} /></div>
              <div className="space-y-2">
                <div className="flex items-center justify-between"><Label>Entries</Label><Button size="sm" variant="outline"><Plus className="h-4 w-4 mr-1" />Add Entry</Button></div>
                <div className="border rounded-lg divide-y">
                  {editCategory.entries.map((entry) => (
                    <div key={entry.id} className="flex items-center gap-3 p-3">
                      <GripVertical className="h-4 w-4 text-muted-foreground cursor-grab" />
                      <Input defaultValue={entry.value} className="flex-1" />
                      {entry.isDefault && <Badge variant="secondary">Default</Badge>}
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive"><Trash2 className="h-4 w-4" /></Button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditCategory(null)}>Cancel</Button>
            <Button onClick={() => { toast.success("Category updated"); setEditCategory(null); }}>Save Changes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog open={deleteOpen} onOpenChange={setDeleteOpen} title="Delete Category" description={`Delete "${categoryToDelete?.name}"? This cannot be undone.`} variant="danger" onConfirm={() => { toast.success("Category deleted"); setDeleteOpen(false); }} />
    </PageContainer>
  );
}
