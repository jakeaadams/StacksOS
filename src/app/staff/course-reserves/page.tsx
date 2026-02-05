"use client";

import * as React from "react";
import { useEffect, useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { toast } from "sonner";

import { useAuth } from "@/contexts/auth-context";

import {
  PageContainer,
  PageHeader,
  PageContent,
  DataTable,
  DataTableColumnHeader,
  EmptyState,
  DeleteConfirmDialog,
} from "@/components/shared";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { GraduationCap, Plus, RefreshCw, Trash2, Pencil, Archive } from "lucide-react";

type Course = {
  id: number;
  name: string;
  courseNumber: string;
  sectionNumber: string | null;
  owningLibId: number | null;
  owningLibName: string | null;
  isArchived: boolean;
  materialsCount: number;
};

type Term = {
  id: number;
  name: string;
  owningLibId: number | null;
  owningLibName: string | null;
  startDate: string | null;
  endDate: string | null;
};

type Permissions = {
  MANAGE_RESERVES?: boolean;
};

function safeInt(value: string): number | null {
  const num = parseInt(value, 10);
  return Number.isFinite(num) ? num : null;
}

export default function CourseReservesPage() {
  const { orgs, user, getOrgName } = useAuth();

  const [activeTab, setActiveTab] = useState<"courses" | "terms">("courses");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [courses, setCourses] = useState<Course[]>([]);
  const [terms, setTerms] = useState<Term[]>([]);
  const [permissions, setPermissions] = useState<Permissions>({});

  const canManage = permissions.MANAGE_RESERVES === true;

  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogEntity, setDialogEntity] = useState<"course" | "term">("course");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  const [courseForm, setCourseForm] = useState({
    name: "",
    courseNumber: "",
    sectionNumber: "",
    owningLibId: "",
    isArchived: false,
  });

  const [termForm, setTermForm] = useState({
    name: "",
    owningLibId: "",
    startDate: "",
    endDate: "",
  });

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ entity: "course" | "term"; id: number; name: string } | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/evergreen/course-reserves", { cache: "no-store" });
      const json = await res.json();
      if (!res.ok || json?.ok !== true) throw new Error(json?.error || `HTTP ${res.status}`);
      setCourses(Array.isArray(json.courses) ? json.courses : []);
      setTerms(Array.isArray(json.terms) ? json.terms : []);
      setPermissions((json.permissions || {}) as Permissions);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const stats = useMemo(() => {
    const activeCourses = courses.filter((c) => !c.isArchived).length;
    const archivedCourses = courses.length - activeCourses;
    return {
      courses: courses.length,
      terms: terms.length,
      activeCourses,
      archivedCourses,
    };
  }, [courses, terms]);

  const courseColumns: ColumnDef<Course>[] = [
    {
      accessorKey: "name",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Course" />,
      cell: ({ row }) => (
        <div className="space-y-0.5">
          <div className="font-medium">{row.original.name}</div>
          <div className="text-xs text-muted-foreground">
            {row.original.courseNumber}
            {row.original.sectionNumber ? ` • Section ${row.original.sectionNumber}` : ""} • {row.original.materialsCount} materials
          </div>
        </div>
      ),
    },
    {
      accessorKey: "owningLibName",
      header: "Library",
      cell: ({ row }) => {
        const owningId = row.original.owningLibId;
        const label = row.original.owningLibName || (typeof owningId === "number" ? getOrgName(owningId) : "—");
        return (
          <Badge variant="secondary" className="rounded-full">
            {label}
          </Badge>
        );
      },
    },
    {
      accessorKey: "isArchived",
      header: "Status",
      cell: ({ row }) =>
        row.original.isArchived ? (
          <Badge variant="outline" className="rounded-full gap-1 text-muted-foreground">
            <Archive className="h-3 w-3" />
            Archived
          </Badge>
        ) : (
          <Badge variant="secondary" className="rounded-full">
            Active
          </Badge>
        ),
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => {
        const c = row.original;
        return (
          <div className="flex items-center justify-end gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={!canManage}
              onClick={() => openEditCourse(c)}
              aria-label="Edit course"
            >
              <Pencil className="h-4 w-4" />
            </Button>
            <Button
              variant="destructive"
              size="sm"
              disabled={!canManage}
              onClick={() => requestDelete("course", c.id, c.name)}
              aria-label="Delete course"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        );
      },
    },
  ];

  const termColumns: ColumnDef<Term>[] = [
    {
      accessorKey: "name",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Term" />,
      cell: ({ row }) => (
        <div className="space-y-0.5">
          <div className="font-medium">{row.original.name}</div>
          <div className="text-xs text-muted-foreground">
            {row.original.startDate ? `Start: ${row.original.startDate}` : "Start: —"} •{" "}
            {row.original.endDate ? `End: ${row.original.endDate}` : "End: —"}
          </div>
        </div>
      ),
    },
    {
      accessorKey: "owningLibName",
      header: "Library",
      cell: ({ row }) => {
        const owningId = row.original.owningLibId;
        const label = row.original.owningLibName || (typeof owningId === "number" ? getOrgName(owningId) : "—");
        return (
          <Badge variant="secondary" className="rounded-full">
            {label}
          </Badge>
        );
      },
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => {
        const t = row.original;
        return (
          <div className="flex items-center justify-end gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={!canManage}
              onClick={() => openEditTerm(t)}
              aria-label="Edit term"
            >
              <Pencil className="h-4 w-4" />
            </Button>
            <Button
              variant="destructive"
              size="sm"
              disabled={!canManage}
              onClick={() => requestDelete("term", t.id, t.name)}
              aria-label="Delete term"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        );
      },
    },
  ];

  function openCreateCourse() {
    setDialogEntity("course");
    setEditingId(null);
    setCourseForm({
      name: "",
      courseNumber: "",
      sectionNumber: "",
      owningLibId: String(user?.activeOrgId || orgs[0]?.id || ""),
      isArchived: false,
    });
    setDialogOpen(true);
  }

  function openEditCourse(c: Course) {
    setDialogEntity("course");
    setEditingId(c.id);
    setCourseForm({
      name: c.name,
      courseNumber: c.courseNumber,
      sectionNumber: c.sectionNumber || "",
      owningLibId: String(c.owningLibId ?? user?.activeOrgId ?? orgs[0]?.id ?? ""),
      isArchived: c.isArchived,
    });
    setDialogOpen(true);
  }

  function openCreateTerm() {
    setDialogEntity("term");
    setEditingId(null);
    setTermForm({
      name: "",
      owningLibId: String(user?.activeOrgId || orgs[0]?.id || ""),
      startDate: "",
      endDate: "",
    });
    setDialogOpen(true);
  }

  function openEditTerm(t: Term) {
    setDialogEntity("term");
    setEditingId(t.id);
    setTermForm({
      name: t.name,
      owningLibId: String(t.owningLibId ?? user?.activeOrgId ?? orgs[0]?.id ?? ""),
      startDate: t.startDate || "",
      endDate: t.endDate || "",
    });
    setDialogOpen(true);
  }

  function requestDelete(entity: "course" | "term", id: number, name: string) {
    setDeleteTarget({ entity, id, name });
    setDeleteOpen(true);
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await fetch("/api/evergreen/course-reserves", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entity: deleteTarget.entity, id: deleteTarget.id }),
      });
      const json = await res.json();
      if (!res.ok || json?.ok !== true) throw new Error(json?.error || "Delete failed");
      toast.success(`${deleteTarget.entity === "course" ? "Course" : "Term"} deleted`);
      setDeleteOpen(false);
      setDeleteTarget(null);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setDeleting(false);
    }
  }

  async function save() {
    if (!canManage) return;

    setSaving(true);
    try {
      if (dialogEntity === "course") {
        if (!courseForm.name.trim()) throw new Error("Course name is required");
        if (!courseForm.courseNumber.trim()) throw new Error("Course number is required");
        const owningLibId = safeInt(courseForm.owningLibId);
        if (!owningLibId) throw new Error("Owning library is required");

        const res = await fetch("/api/evergreen/course-reserves", {
          method: editingId ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            entity: "course",
            ...(editingId ? { id: editingId } : {}),
            name: courseForm.name.trim(),
            courseNumber: courseForm.courseNumber.trim(),
            sectionNumber: courseForm.sectionNumber.trim() || undefined,
            owningLibId,
            isArchived: courseForm.isArchived,
          }),
        });
        const json = await res.json();
        if (!res.ok || json?.ok !== true) throw new Error(json?.error || "Save failed");
        toast.success(editingId ? "Course updated" : "Course created");
      } else {
        if (!termForm.name.trim()) throw new Error("Term name is required");
        const owningLibId = safeInt(termForm.owningLibId);
        if (!owningLibId) throw new Error("Owning library is required");

        const res = await fetch("/api/evergreen/course-reserves", {
          method: editingId ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            entity: "term",
            ...(editingId ? { id: editingId } : {}),
            name: termForm.name.trim(),
            owningLibId,
            startDate: termForm.startDate.trim() || undefined,
            endDate: termForm.endDate.trim() || undefined,
          }),
        });
        const json = await res.json();
        if (!res.ok || json?.ok !== true) throw new Error(json?.error || "Save failed");
        toast.success(editingId ? "Term updated" : "Term created");
      }

      setDialogOpen(false);
      setEditingId(null);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <PageContainer>
      <PageHeader
        title="Course Reserves"
        subtitle="Manage reserve courses and items (Evergreen-backed)"
        breadcrumbs={[{ label: "Staff", href: "/staff" }, { label: "Course Reserves" }]}
      >
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
          <Badge variant="secondary" className="rounded-full">
            {stats.courses} courses
          </Badge>
          <Badge variant="secondary" className="rounded-full">
            {stats.terms} terms
          </Badge>
          <Badge variant="outline" className="rounded-full">
            {stats.archivedCourses} archived
          </Badge>
        </div>
      </PageHeader>

      <PageContent className="space-y-4">
        {error ? (
          <Card className="border-destructive/30 bg-destructive/5">
            <CardHeader>
              <CardTitle className="text-base">Course Reserves failed to load</CardTitle>
              <CardDescription className="text-destructive">{error}</CardDescription>
            </CardHeader>
            <CardContent>
              <Button variant="outline" onClick={() => void load()}>
                <RefreshCw className="h-4 w-4 mr-2" />
                Try again
              </Button>
            </CardContent>
          </Card>
        ) : null}

        <div className="grid gap-4 md:grid-cols-3">
          <Card className="rounded-2xl md:col-span-1">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">About reserves</CardTitle>
              <CardDescription>Evergreen course module (MANAGE_RESERVES).</CardDescription>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground space-y-2">
              <p>
                Course Reserves helps keep short-loan materials discoverable for students. Courses and terms are
                Evergreen-backed.
              </p>
              {canManage ? (
                <Badge variant="secondary" className="rounded-full w-fit">You can manage reserves</Badge>
              ) : (
                <Badge variant="outline" className="rounded-full w-fit text-muted-foreground">Read-only</Badge>
              )}
              <p className="text-xs text-muted-foreground">
                If you see empty screens, seed demo data: <span className="font-mono">node scripts/seed-sandbox-demo-data.mjs</span>
              </p>
            </CardContent>
          </Card>

          <Card className="rounded-2xl md:col-span-2">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Manage</CardTitle>
              <CardDescription>Courses and terms are editable when you have MANAGE_RESERVES.</CardDescription>
            </CardHeader>
            <CardContent>
              <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)}>
                <TabsList>
                  <TabsTrigger value="courses" className="gap-2">
                    <GraduationCap className="h-4 w-4" />
                    Courses
                  </TabsTrigger>
                  <TabsTrigger value="terms" className="gap-2">
                    <GraduationCap className="h-4 w-4" />
                    Terms
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="courses" className="mt-4">
                  <DataTable
                    columns={courseColumns}
                    data={courses}
                    isLoading={loading}
                    searchPlaceholder="Search courses..."
                    toolbar={
                      <Button onClick={openCreateCourse} disabled={!canManage}>
                        <Plus className="h-4 w-4 mr-2" />
                        New course
                      </Button>
                    }
                    emptyState={
                      terms.length === 0 ? (
                        <EmptyState
                          icon={GraduationCap}
                          title="No course reserves yet"
                          description="Start by creating a term, then add a course. You can also seed demo data for a sandbox."
                          action={
                            canManage
                              ? {
                                  label: "Create term",
                                  onClick: () => {
                                    setActiveTab("terms");
                                    openCreateTerm();
                                  },
                                  icon: Plus,
                                }
                              : undefined
                          }
                          secondaryAction={{ label: "Seed demo data", onClick: () => window.location.assign("/staff/help#demo-data") }}
                        />
                      ) : (
                        <EmptyState
                          icon={GraduationCap}
                          title="No courses"
                          description="Create your first reserve course."
                          action={canManage ? { label: "Create course", onClick: openCreateCourse, icon: Plus } : undefined}
                          secondaryAction={{ label: "Seed demo data", onClick: () => window.location.assign("/staff/help#demo-data") }}
                        />
                      )
                    }
                  />
                </TabsContent>

                <TabsContent value="terms" className="mt-4">
                  <DataTable
                    columns={termColumns}
                    data={terms}
                    isLoading={loading}
                    searchPlaceholder="Search terms..."
                    toolbar={
                      <Button onClick={openCreateTerm} disabled={!canManage}>
                        <Plus className="h-4 w-4 mr-2" />
                        New term
                      </Button>
                    }
                    emptyState={
                      <EmptyState
                        icon={GraduationCap}
                        title="No terms"
                        description="Create a term to start organizing courses."
                        action={canManage ? { label: "Create term", onClick: openCreateTerm, icon: Plus } : undefined}
                        secondaryAction={{ label: "Seed demo data", onClick: () => window.location.assign("/staff/help#demo-data") }}
                      />
                    }
                  />
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        </div>

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="sm:max-w-[560px]">
            <DialogHeader>
              <DialogTitle>
                {editingId
                  ? `Edit ${dialogEntity === "course" ? "course" : "term"}`
                  : `New ${dialogEntity === "course" ? "course" : "term"}`}
              </DialogTitle>
              <DialogDescription>
                {dialogEntity === "course"
                  ? "Reserve courses live in Evergreen (asset.course_module_course)."
                  : "Terms live in Evergreen (asset.course_module_term)."}
              </DialogDescription>
            </DialogHeader>

            {dialogEntity === "course" ? (
              <div className="grid gap-4 py-2">
                <div className="grid gap-2">
                  <Label htmlFor="course-name">Course name</Label>
                  <Input
                    id="course-name"
                    value={courseForm.name}
                    onChange={(e) => setCourseForm((p) => ({ ...p, name: e.target.value }))}
                    placeholder="Intro to Biology"
                  />
                </div>
                <div className="grid gap-2 md:grid-cols-2">
                  <div className="grid gap-2">
                    <Label htmlFor="course-num">Course number</Label>
                    <Input
                      id="course-num"
                      value={courseForm.courseNumber}
                      onChange={(e) => setCourseForm((p) => ({ ...p, courseNumber: e.target.value }))}
                      placeholder="BIO-101"
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="course-section">Section (optional)</Label>
                    <Input
                      id="course-section"
                      value={courseForm.sectionNumber}
                      onChange={(e) => setCourseForm((p) => ({ ...p, sectionNumber: e.target.value }))}
                      placeholder="01"
                    />
                  </div>
                </div>

                <div className="grid gap-2">
                  <Label>Owning library</Label>
                  <Select value={courseForm.owningLibId} onValueChange={(v) => setCourseForm((p) => ({ ...p, owningLibId: v }))}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select a library" />
                    </SelectTrigger>
                    <SelectContent>
                      {orgs.map((o) => (
                        <SelectItem key={`course-owning-${o.id}`} value={String(o.id)}>
                          {o.shortname} — {o.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex items-center justify-between rounded-lg border p-3">
                  <div>
                    <div className="font-medium">Archived</div>
                    <div className="text-xs text-muted-foreground">Hide this course from active reserve workflows.</div>
                  </div>
                  <Switch checked={courseForm.isArchived} onCheckedChange={(v) => setCourseForm((p) => ({ ...p, isArchived: v }))} />
                </div>
              </div>
            ) : (
              <div className="grid gap-4 py-2">
                <div className="grid gap-2">
                  <Label htmlFor="term-name">Term name</Label>
                  <Input
                    id="term-name"
                    value={termForm.name}
                    onChange={(e) => setTermForm((p) => ({ ...p, name: e.target.value }))}
                    placeholder="Spring 2026"
                  />
                </div>

                <div className="grid gap-2">
                  <Label>Owning library</Label>
                  <Select value={termForm.owningLibId} onValueChange={(v) => setTermForm((p) => ({ ...p, owningLibId: v }))}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select a library" />
                    </SelectTrigger>
                    <SelectContent>
                      {orgs.map((o) => (
                        <SelectItem key={`term-owning-${o.id}`} value={String(o.id)}>
                          {o.shortname} — {o.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="grid gap-2">
                    <Label htmlFor="term-start">Start date (optional)</Label>
                    <Input
                      id="term-start"
                      type="date"
                      value={termForm.startDate}
                      onChange={(e) => setTermForm((p) => ({ ...p, startDate: e.target.value }))}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="term-end">End date (optional)</Label>
                    <Input
                      id="term-end"
                      type="date"
                      value={termForm.endDate}
                      onChange={(e) => setTermForm((p) => ({ ...p, endDate: e.target.value }))}
                    />
                  </div>
                </div>
              </div>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>
                Cancel
              </Button>
              <Button onClick={() => void save()} disabled={saving || !canManage}>
                {saving ? "Saving…" : "Save"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <DeleteConfirmDialog
          open={deleteOpen}
          onOpenChange={setDeleteOpen}
          itemName={deleteTarget ? `${deleteTarget.entity} ${deleteTarget.name}` : "item"}
          onConfirm={confirmDelete}
          isLoading={deleting}
        />
      </PageContent>
    </PageContainer>
  );
}
