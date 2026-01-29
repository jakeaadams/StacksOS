/**
 * Course Reserves Management
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  GraduationCap,
  BookOpen,
  Plus,
  Search,
  Users,
  Link as LinkIcon,
  Trash2,
  Edit,
  Copy,
  ExternalLink,
  Clock,
  CheckCircle,
} from "lucide-react";
import type { ColumnDef } from "@tanstack/react-table";

interface Course {
  id: number;
  name: string;
  courseNumber: string;
  instructor: string;
  department: string;
  term: string;
  isActive: boolean;
  itemCount: number;
}

interface ReserveItem {
  id: number;
  courseId: number;
  type: "catalog" | "electronic" | "personal";
  title: string;
  author?: string;
  barcode?: string;
  url?: string;
  status: "active" | "pending" | "expired";
  loanPeriod: string;
  useCount: number;
}

const mockCourses: Course[] = [
  { id: 1, name: "Introduction to Computer Science", courseNumber: "CS101", instructor: "Dr. Smith", department: "Computer Science", term: "Spring 2024", isActive: true, itemCount: 12 },
  { id: 2, name: "American Literature Survey", courseNumber: "ENG220", instructor: "Prof. Johnson", department: "English", term: "Spring 2024", isActive: true, itemCount: 8 },
  { id: 3, name: "Organic Chemistry I", courseNumber: "CHEM301", instructor: "Dr. Williams", department: "Chemistry", term: "Fall 2023", isActive: false, itemCount: 15 },
];

const mockItems: ReserveItem[] = [
  { id: 1, courseId: 1, type: "catalog", title: "Introduction to Algorithms", author: "Cormen et al.", barcode: "31234567890123", status: "active", loanPeriod: "2 hours", useCount: 45 },
  { id: 2, courseId: 1, type: "electronic", title: "Python Programming Tutorial", url: "https://docs.python.org", status: "active", loanPeriod: "N/A", useCount: 89 },
  { id: 3, courseId: 1, type: "personal", title: "Lecture Notes: Data Structures", author: "Dr. Smith", status: "active", loanPeriod: "In-library", useCount: 23 },
];

export default function CourseReservesPage() {
  const [activeTab, setActiveTab] = useState("courses");
  const [searchQuery, setSearchQuery] = useState("");
  const [termFilter, setTermFilter] = useState<string>("all");
  const [selectedCourse, setSelectedCourse] = useState<Course | null>(null);
  const [newCourseOpen, setNewCourseOpen] = useState(false);
  const [addItemOpen, setAddItemOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [_itemToDelete, setItemToDelete] = useState<ReserveItem | null>(null);

  const filteredCourses = mockCourses.filter((c) => {
    const matchesSearch = c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.courseNumber.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesTerm = termFilter === "all" || c.term === termFilter;
    return matchesSearch && matchesTerm;
  });

  const courseItems = selectedCourse ? mockItems.filter((i) => i.courseId === selectedCourse.id) : mockItems;

  const courseColumns: ColumnDef<Course>[] = [
    {
      accessorKey: "courseNumber",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Course" />,
      cell: ({ row }) => (
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <GraduationCap className="h-5 w-5 text-primary" />
          </div>
          <div>
            <div className="font-medium">{row.original.courseNumber}</div>
            <div className="text-sm text-muted-foreground truncate max-w-[200px]">{row.original.name}</div>
          </div>
        </div>
      ),
    },
    {
      accessorKey: "instructor",
      header: "Instructor",
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-muted-foreground" />
          <span>{row.original.instructor}</span>
        </div>
      ),
    },
    { accessorKey: "department", header: "Department" },
    {
      accessorKey: "term",
      header: "Term",
      cell: ({ row }) => <Badge variant="outline">{row.original.term}</Badge>,
    },
    {
      accessorKey: "isActive",
      header: "Status",
      cell: ({ row }) => (
        <StatusBadge label={row.original.isActive ? "Active" : "Inactive"} status={row.original.isActive ? "success" : "neutral"} />
      ),
    },
    {
      accessorKey: "itemCount",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Items" />,
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          <BookOpen className="h-4 w-4 text-muted-foreground" />
          <span className="font-medium">{row.original.itemCount}</span>
        </div>
      ),
    },
  ];

  const itemColumns: ColumnDef<ReserveItem>[] = [
    {
      accessorKey: "title",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Title" />,
      cell: ({ row }) => (
        <div className="flex items-center gap-3">
          <div className={`h-9 w-9 rounded-lg flex items-center justify-center ${
            row.original.type === "catalog" ? "bg-blue-100 dark:bg-blue-900/30" :
            row.original.type === "electronic" ? "bg-purple-100 dark:bg-purple-900/30" :
            "bg-amber-100 dark:bg-amber-900/30"
          }`}>
            {row.original.type === "catalog" ? <BookOpen className="h-4 w-4 text-blue-600" /> :
             row.original.type === "electronic" ? <LinkIcon className="h-4 w-4 text-purple-600" /> :
             <Copy className="h-4 w-4 text-amber-600" />}
          </div>
          <div>
            <div className="font-medium">{row.original.title}</div>
            {row.original.author && <div className="text-sm text-muted-foreground">{row.original.author}</div>}
          </div>
        </div>
      ),
    },
    {
      accessorKey: "type",
      header: "Type",
      cell: ({ row }) => (
        <Badge variant="secondary" className={
          row.original.type === "catalog" ? "bg-blue-100 text-blue-700" :
          row.original.type === "electronic" ? "bg-purple-100 text-purple-700" :
          "bg-amber-100 text-amber-700"
        }>
          {row.original.type === "catalog" ? "Catalog" : row.original.type === "electronic" ? "Electronic" : "Personal"}
        </Badge>
      ),
    },
    {
      accessorKey: "loanPeriod",
      header: "Loan Period",
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-muted-foreground" />
          <span>{row.original.loanPeriod}</span>
        </div>
      ),
    },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row }) => (
        <StatusBadge label={row.original.status} status={row.original.status === "active" ? "success" : row.original.status === "pending" ? "warning" : "neutral"} />
      ),
    },
    {
      accessorKey: "useCount",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Uses" />,
      cell: ({ row }) => <span className="font-mono text-sm">{row.original.useCount}</span>,
    },
    {
      id: "actions",
      cell: ({ row }) => (
        <div className="flex items-center gap-1">
          {row.original.url && (
            <Button variant="ghost" size="icon" className="h-8 w-8" asChild>
              <a href={row.original.url} target="_blank" rel="noopener noreferrer"><ExternalLink className="h-4 w-4" /></a>
            </Button>
          )}
          <Button variant="ghost" size="icon" className="h-8 w-8"><Edit className="h-4 w-4" /></Button>
          <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => { setItemToDelete(row.original); setDeleteOpen(true); }}>
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <PageContainer>
      <PageHeader
        title="Course Reserves"
        subtitle="Manage course materials and reserve items"
        breadcrumbs={[{ label: "Staff", href: "/staff" }, { label: "Course Reserves" }]}
        actions={[{ label: "New Course", onClick: () => setNewCourseOpen(true), icon: Plus }]}
      />
      <PageContent>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <Card className="bg-gradient-to-br from-blue-50 to-blue-100/50 dark:from-blue-950/50 dark:to-blue-900/20 border-blue-200/50">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-blue-600">Active Courses</p>
                  <p className="text-3xl font-bold text-blue-700">{mockCourses.filter((c) => c.isActive).length}</p>
                </div>
                <div className="h-12 w-12 rounded-xl bg-blue-500/20 flex items-center justify-center">
                  <GraduationCap className="h-6 w-6 text-blue-600" />
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-gradient-to-br from-emerald-50 to-emerald-100/50 dark:from-emerald-950/50 dark:to-emerald-900/20 border-emerald-200/50">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-emerald-600">Total Items</p>
                  <p className="text-3xl font-bold text-emerald-700">{mockCourses.reduce((s, c) => s + c.itemCount, 0)}</p>
                </div>
                <div className="h-12 w-12 rounded-xl bg-emerald-500/20 flex items-center justify-center">
                  <BookOpen className="h-6 w-6 text-emerald-600" />
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-gradient-to-br from-purple-50 to-purple-100/50 dark:from-purple-950/50 dark:to-purple-900/20 border-purple-200/50">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-purple-600">Electronic</p>
                  <p className="text-3xl font-bold text-purple-700">{mockItems.filter((i) => i.type === "electronic").length}</p>
                </div>
                <div className="h-12 w-12 rounded-xl bg-purple-500/20 flex items-center justify-center">
                  <LinkIcon className="h-6 w-6 text-purple-600" />
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-gradient-to-br from-amber-50 to-amber-100/50 dark:from-amber-950/50 dark:to-amber-900/20 border-amber-200/50">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-amber-600">Total Uses</p>
                  <p className="text-3xl font-bold text-amber-700">{mockItems.reduce((s, i) => s + i.useCount, 0)}</p>
                </div>
                <div className="h-12 w-12 rounded-xl bg-amber-500/20 flex items-center justify-center">
                  <CheckCircle className="h-6 w-6 text-amber-600" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="mb-4">
            <TabsTrigger value="courses" className="gap-2"><GraduationCap className="h-4 w-4" />Courses</TabsTrigger>
            <TabsTrigger value="items" className="gap-2"><BookOpen className="h-4 w-4" />Items</TabsTrigger>
          </TabsList>

          <TabsContent value="courses">
            <Card>
              <CardHeader>
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                  <div>
                    <CardTitle>Courses</CardTitle>
                    <CardDescription>Manage courses and their reserve materials</CardDescription>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="relative">
                      <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input placeholder="Search courses..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-12 w-[250px]" />
                    </div>
                    <Select value={termFilter} onValueChange={setTermFilter}>
                      <SelectTrigger className="w-[150px]"><SelectValue placeholder="All terms" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Terms</SelectItem>
                        <SelectItem value="Spring 2024">Spring 2024</SelectItem>
                        <SelectItem value="Fall 2023">Fall 2023</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <DataTable
                  columns={courseColumns}
                  data={filteredCourses}
                  onRowClick={(course) => { setSelectedCourse(course); setActiveTab("items"); }}
                  emptyState={<EmptyState title="No courses found" description="Create a course to start managing reserve materials." action={{ label: "New Course", onClick: () => setNewCourseOpen(true), icon: Plus }} />}
                />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="items">
            <Card>
              <CardHeader>
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      {selectedCourse && <Badge variant="outline" className="font-mono">{selectedCourse.courseNumber}</Badge>}
                      Reserve Items
                    </CardTitle>
                    <CardDescription>{selectedCourse ? selectedCourse.name : "All reserve materials"}</CardDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    {selectedCourse && <Button variant="outline" onClick={() => setSelectedCourse(null)}>View All</Button>}
                    <Button onClick={() => setAddItemOpen(true)}><Plus className="h-4 w-4 mr-2" />Add Item</Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <DataTable columns={itemColumns} data={courseItems} emptyState={<EmptyState title="No items" description="Add items to reserves." action={{ label: "Add Item", onClick: () => setAddItemOpen(true), icon: Plus }} />} />
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </PageContent>

      <Dialog open={newCourseOpen} onOpenChange={setNewCourseOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><GraduationCap className="h-5 w-5" />Create New Course</DialogTitle>
            <DialogDescription>Add a new course for managing reserve materials.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label>Course Number</Label><Input placeholder="e.g., CS101" /></div>
              <div className="space-y-2"><Label>Term</Label><Select defaultValue="Spring 2024"><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="Spring 2024">Spring 2024</SelectItem><SelectItem value="Fall 2024">Fall 2024</SelectItem></SelectContent></Select></div>
            </div>
            <div className="space-y-2"><Label>Course Name</Label><Input placeholder="e.g., Introduction to Computer Science" /></div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label>Instructor</Label><Input placeholder="e.g., Dr. Smith" /></div>
              <div className="space-y-2"><Label>Department</Label><Input placeholder="e.g., Computer Science" /></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label>Start Date</Label><Input type="date" /></div>
              <div className="space-y-2"><Label>End Date</Label><Input /></div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewCourseOpen(false)}>Cancel</Button>
            <Button onClick={() => { toast.success("Course created"); setNewCourseOpen(false); }}>Create Course</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={addItemOpen} onOpenChange={setAddItemOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><BookOpen className="h-5 w-5" />Add Reserve Item</DialogTitle>
            <DialogDescription>Add an item to course reserves.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label>Item Type</Label>
              <Select defaultValue="catalog">
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="catalog">Catalog Item</SelectItem>
                  <SelectItem value="electronic">Electronic Resource</SelectItem>
                  <SelectItem value="personal">Personal Copy</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2"><Label>Barcode or URL</Label><Input placeholder="Scan barcode or enter URL" /></div>
            <div className="space-y-2"><Label>Loan Period</Label><Select defaultValue="2h"><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="2h">2 hours</SelectItem><SelectItem value="4h">4 hours</SelectItem><SelectItem value="1d">1 day</SelectItem><SelectItem value="lib">In-library only</SelectItem></SelectContent></Select></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddItemOpen(false)}>Cancel</Button>
            <Button onClick={() => { toast.success("Item added"); setAddItemOpen(false); }}>Add Item</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog open={deleteOpen} onOpenChange={setDeleteOpen} title="Remove Item" description="Remove this item from reserves?" variant="danger" onConfirm={() => { toast.success("Item removed"); setDeleteOpen(false); }} />
    </PageContainer>
  );
}
