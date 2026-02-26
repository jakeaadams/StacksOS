"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { PageContainer, PageContent, PageHeader, EmptyState } from "@/components/shared";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { fetchWithAuth } from "@/lib/client-fetch";
import { featureFlags } from "@/lib/feature-flags";
import Link from "next/link";
import {
  AlertTriangle,
  BarChart3,
  BookOpen,
  Download,
  GraduationCap,
  Loader2,
  RefreshCw,
  RotateCcw,
  School,
  Trophy,
  Upload,
  UserPlus,
  Barcode,
} from "lucide-react";

type ClassOverview = {
  id: number;
  name: string;
  teacherName: string;
  gradeLevel: string | null;
  homeOu: number;
  studentCount: number;
  activeCheckoutCount: number;
};

type Student = {
  id: number;
  classId: number;
  firstName: string;
  lastName: string;
  studentIdentifier: string | null;
  patronId: number | null;
};

type ClassStats = {
  totalCheckouts: number;
  booksPerStudent: number;
  avgCheckoutDurationDays: number;
  overdueCount: number;
  mostActiveReader: string | null;
};

type RosterPreviewRow = {
  name: string;
  student_id?: string;
  grade?: string;
  patron_barcode?: string;
};

type ActiveCheckout = {
  id: number;
  classId: number;
  studentId: number | null;
  studentName: string | null;
  copyBarcode: string;
  copyId: number | null;
  title: string | null;
  checkoutTs: string;
  dueTs: string | null;
  notes: string | null;
};

type ApiState = {
  classes: ClassOverview[];
  selectedClassId: number | null;
  students: Student[];
  activeCheckouts: ActiveCheckout[];
};

const EMPTY_STATE: ApiState = {
  classes: [],
  selectedClassId: null,
  students: [],
  activeCheckouts: [],
};

export default function K12ClassCirculationPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [state, setState] = useState<ApiState>(EMPTY_STATE);
  const [selectedClassId, setSelectedClassId] = useState<number | null>(null);
  const [selectedCheckoutIds, setSelectedCheckoutIds] = useState<number[]>([]);

  const [classForm, setClassForm] = useState({
    name: "",
    teacherName: "",
    gradeLevel: "",
  });
  const [studentForm, setStudentForm] = useState({
    firstName: "",
    lastName: "",
    studentIdentifier: "",
  });
  const [checkoutForm, setCheckoutForm] = useState({
    copyBarcode: "",
    title: "",
    studentId: "",
    dueTs: "",
    notes: "",
  });

  // Stats state
  const [classStats, setClassStats] = useState<ClassStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);

  // Roster import state
  const [showRosterImport, setShowRosterImport] = useState(false);
  const [rosterPreview, setRosterPreview] = useState<RosterPreviewRow[]>([]);
  const [rosterImporting, setRosterImporting] = useState(false);

  const selectedClass = useMemo(
    () => state.classes.find((item) => item.id === selectedClassId) || null,
    [state.classes, selectedClassId]
  );

  async function loadData(classId?: number | null) {
    setLoading(true);
    try {
      const query = classId ? `?classId=${classId}` : "";
      const response = await fetchWithAuth(`/api/staff/k12/class-circulation${query}`, {
        cache: "no-store",
      });
      const json = await response.json();
      if (!response.ok || json.ok !== true) {
        throw new Error(json.error || `HTTP ${response.status}`);
      }
      const nextState: ApiState = {
        classes: Array.isArray(json.classes) ? (json.classes as ClassOverview[]) : [],
        selectedClassId:
          typeof json.selectedClassId === "number" ? (json.selectedClassId as number) : null,
        students: Array.isArray(json.students) ? (json.students as Student[]) : [],
        activeCheckouts: Array.isArray(json.activeCheckouts)
          ? (json.activeCheckouts as ActiveCheckout[])
          : [],
      };
      setState(nextState);
      setSelectedClassId(nextState.selectedClassId);
      setSelectedCheckoutIds([]);
      if (nextState.selectedClassId) {
        void loadStats(nextState.selectedClassId);
      } else {
        setClassStats(null);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      toast.error(`Failed to load class circulation: ${message}`);
      setState(EMPTY_STATE);
      setSelectedClassId(null);
      setSelectedCheckoutIds([]);
    } finally {
      setLoading(false);
    }
  }

  const loadStats = useCallback(async (classId: number) => {
    setStatsLoading(true);
    try {
      const response = await fetchWithAuth(`/api/staff/k12/stats?classId=${classId}`, {
        cache: "no-store",
      });
      const json = await response.json();
      if (!response.ok || json.ok !== true) {
        setClassStats(null);
        return;
      }
      setClassStats(json.stats as ClassStats);
    } catch {
      setClassStats(null);
    } finally {
      setStatsLoading(false);
    }
  }, []);

  function parseCSV(text: string): RosterPreviewRow[] {
    const lines = text.split(/\r?\n/).filter((line) => line.trim());
    if (lines.length < 2) return [];

    const header = lines[0]!.split(",").map((h) => h.trim().toLowerCase());
    const nameIdx = header.indexOf("name");
    if (nameIdx < 0) return [];

    const studentIdIdx = header.indexOf("student_id");
    const gradeIdx = header.indexOf("grade");
    const barcodeIdx = header.indexOf("patron_barcode");

    const rows: RosterPreviewRow[] = [];
    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i]!.split(",").map((c) => c.trim());
      const name = cols[nameIdx] || "";
      if (!name) continue;
      rows.push({
        name,
        student_id: studentIdIdx >= 0 ? cols[studentIdIdx] : undefined,
        grade: gradeIdx >= 0 ? cols[gradeIdx] : undefined,
        patron_barcode: barcodeIdx >= 0 ? cols[barcodeIdx] : undefined,
      });
    }
    return rows;
  }

  function handleFileUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result;
      if (typeof text !== "string") return;
      const rows = parseCSV(text);
      if (rows.length === 0) {
        toast.error("No valid rows found. CSV must have a 'name' column header.");
        return;
      }
      setRosterPreview(rows);
      setShowRosterImport(true);
    };
    reader.readAsText(file);
  }

  async function onConfirmImport() {
    if (!selectedClassId || rosterPreview.length === 0) return;
    setRosterImporting(true);
    try {
      const response = await fetchWithAuth("/api/staff/k12/roster-import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          classId: selectedClassId,
          rows: rosterPreview,
        }),
      });
      const json = await response.json();
      if (!response.ok || json.ok !== true) {
        throw new Error(json.error || `HTTP ${response.status}`);
      }
      const imported = json.imported as number;
      const errors = json.errors as Array<{ row: number; error: string }>;
      toast.success(
        `Imported ${imported} student(s)${errors.length > 0 ? `, ${errors.length} error(s)` : ""}`
      );
      setShowRosterImport(false);
      setRosterPreview([]);
      await loadData(selectedClassId);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      toast.error(`Import failed: ${message}`);
    } finally {
      setRosterImporting(false);
    }
  }

  useEffect(() => {
    void loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function runAction(payload: Record<string, any>, successMessage: string) {
    setSaving(true);
    try {
      const response = await fetchWithAuth("/api/staff/k12/class-circulation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await response.json();
      if (!response.ok || json.ok !== true) {
        throw new Error(json.error || `HTTP ${response.status}`);
      }
      toast.success(successMessage);
      const classIdFromPayload =
        typeof payload.classId === "number" ? (payload.classId as number) : selectedClassId;
      await loadData(classIdFromPayload);
      return json;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      toast.error(message);
      throw error;
    } finally {
      setSaving(false);
    }
  }

  async function onCreateClass() {
    if (!classForm.name.trim() || !classForm.teacherName.trim()) return;
    const json = await runAction(
      {
        action: "createClass",
        name: classForm.name.trim(),
        teacherName: classForm.teacherName.trim(),
        gradeLevel: classForm.gradeLevel.trim() || undefined,
      },
      "Class created"
    );
    const createdClassId =
      json?.createdClass && typeof json.createdClass.id === "number" ? json.createdClass.id : null;
    if (createdClassId) setSelectedClassId(createdClassId);
    setClassForm({ name: "", teacherName: "", gradeLevel: "" });
  }

  async function onCreateStudent() {
    if (!selectedClassId) return;
    if (!studentForm.firstName.trim() || !studentForm.lastName.trim()) return;
    await runAction(
      {
        action: "createStudent",
        classId: selectedClassId,
        firstName: studentForm.firstName.trim(),
        lastName: studentForm.lastName.trim(),
        studentIdentifier: studentForm.studentIdentifier.trim() || undefined,
      },
      "Student added"
    );
    setStudentForm({ firstName: "", lastName: "", studentIdentifier: "" });
  }

  async function onCheckout() {
    if (!selectedClassId) return;
    if (!checkoutForm.copyBarcode.trim()) return;
    await runAction(
      {
        action: "checkout",
        classId: selectedClassId,
        copyBarcode: checkoutForm.copyBarcode.trim(),
        title: checkoutForm.title.trim() || undefined,
        studentId: checkoutForm.studentId ? Number(checkoutForm.studentId) : undefined,
        dueTs: checkoutForm.dueTs || undefined,
        notes: checkoutForm.notes.trim() || undefined,
      },
      "Class checkout recorded"
    );
    setCheckoutForm({
      copyBarcode: "",
      title: "",
      studentId: "",
      dueTs: "",
      notes: "",
    });
  }

  async function onReturnSelected() {
    if (!selectedCheckoutIds.length) return;
    await runAction(
      {
        action: "returnByIds",
        checkoutIds: selectedCheckoutIds,
      },
      `Returned ${selectedCheckoutIds.length} item(s)`
    );
  }

  async function onReturnAllForClass() {
    if (!selectedClassId) return;
    await runAction(
      {
        action: "returnAllForClass",
        classId: selectedClassId,
      },
      "Returned all active class checkouts"
    );
  }

  function toggleCheckoutSelection(id: number) {
    setSelectedCheckoutIds((prev) =>
      prev.includes(id) ? prev.filter((v) => v !== id) : [...prev, id]
    );
  }

  if (!featureFlags.k12ClassCirculation) {
    return (
      <PageContainer>
        <PageHeader
          title="Class Circulation"
          subtitle="School profile workflow for teacher/class set circulation."
          breadcrumbs={[{ label: "Circulation" }, { label: "Class Circulation" }]}
        />
        <PageContent>
          <EmptyState
            title="Class circulation is profile-gated"
            description="Enable the School profile (or k12ClassCirculation feature flag) for this tenant."
          />
        </PageContent>
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <PageHeader
        title="Class Circulation"
        subtitle="Teacher/class set workflows: roster-linked checkouts, classroom returns, and queue visibility."
        breadcrumbs={[{ label: "Circulation" }, { label: "Class Circulation" }]}
        actions={[
          {
            label: loading ? "Refreshing..." : "Refresh",
            onClick: () => void loadData(selectedClassId),
            icon: loading ? Loader2 : RefreshCw,
            variant: "outline",
          },
        ]}
      />

      <PageContent className="space-y-6">
        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <School className="h-4 w-4" />
                Classes
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold">{state.classes.length}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <UserPlus className="h-4 w-4" />
                Students
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold">
                {state.classes.reduce((sum, value) => sum + value.studentCount, 0)}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <GraduationCap className="h-4 w-4" />
                Active Class Checkouts
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold">
                {state.classes.reduce((sum, value) => sum + value.activeCheckoutCount, 0)}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Sub-page navigation + Export */}
        <div className="flex flex-wrap items-center gap-2">
          <Link href="/staff/circulation/class-circulation/challenges">
            <Button variant="outline" size="sm">
              <Trophy className="mr-2 h-4 w-4" />
              Reading Challenges
            </Button>
          </Link>
          <Link href="/staff/circulation/class-circulation/overdue">
            <Button variant="outline" size="sm">
              <AlertTriangle className="mr-2 h-4 w-4" />
              Overdue
            </Button>
          </Link>
          <Link href="/staff/circulation/class-circulation/barcodes">
            <Button variant="outline" size="sm">
              <Barcode className="mr-2 h-4 w-4" />
              Barcodes
            </Button>
          </Link>
          {selectedClassId ? (
            <a href={`/api/staff/k12/export?classId=${selectedClassId}&format=csv`} download>
              <Button variant="outline" size="sm">
                <Download className="mr-2 h-4 w-4" />
                Export CSV
              </Button>
            </a>
          ) : null}
        </div>

        {/* Class-level reading stats */}
        {selectedClassId && classStats ? (
          <div className="grid gap-4 md:grid-cols-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <BookOpen className="h-4 w-4" />
                  Total Checkouts
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-semibold">{classStats.totalCheckouts}</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <BarChart3 className="h-4 w-4" />
                  Avg Books/Student
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-semibold">{classStats.booksPerStudent}</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4" />
                  Overdue Items
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-semibold">{classStats.overdueCount}</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <GraduationCap className="h-4 w-4" />
                  Most Active Reader
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-lg font-semibold truncate">
                  {classStats.mostActiveReader || "N/A"}
                </p>
              </CardContent>
            </Card>
          </div>
        ) : selectedClassId && statsLoading ? (
          <div className="text-sm text-muted-foreground flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading class stats...
          </div>
        ) : null}

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Create Class</CardTitle>
            <CardDescription>
              Create a teacher-owned class set circulation workspace.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-4">
            <div className="space-y-1.5">
              <Label htmlFor="class-name">Class Name</Label>
              <Input
                id="class-name"
                value={classForm.name}
                onChange={(event) =>
                  setClassForm((prev) => ({ ...prev, name: event.target.value }))
                }
                placeholder="Grade 5 - Homeroom A"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="teacher-name">Teacher</Label>
              <Input
                id="teacher-name"
                value={classForm.teacherName}
                onChange={(event) =>
                  setClassForm((prev) => ({ ...prev, teacherName: event.target.value }))
                }
                placeholder="Ms. Rivera"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="grade-level">Grade</Label>
              <Input
                id="grade-level"
                value={classForm.gradeLevel}
                onChange={(event) =>
                  setClassForm((prev) => ({ ...prev, gradeLevel: event.target.value }))
                }
                placeholder="5"
              />
            </div>
            <div className="flex items-end">
              <Button
                onClick={() => void onCreateClass()}
                disabled={saving || loading}
                className="w-full"
              >
                {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Create Class
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Class Workspace</CardTitle>
            <CardDescription>Select a class and run roster + checkout workflows.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="selected-class">Class</Label>
                <Select
                  value={selectedClassId ? String(selectedClassId) : "__none__"}
                  onValueChange={(value) => {
                    const next = value === "__none__" ? null : Number(value);
                    setSelectedClassId(next);
                    void loadData(next);
                  }}
                >
                  <SelectTrigger id="selected-class" className="h-10">
                    <SelectValue placeholder="Select class" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Select class</SelectItem>
                    {state.classes.map((item) => (
                      <SelectItem key={item.id} value={String(item.id)}>
                        {item.name} - {item.teacherName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {selectedClass ? (
                <div className="flex items-end gap-2">
                  <Badge variant="secondary">Students: {selectedClass.studentCount}</Badge>
                  <Badge variant="outline">
                    Active checkouts: {selectedClass.activeCheckoutCount}
                  </Badge>
                </div>
              ) : null}
            </div>

            {selectedClassId ? (
              <div className="grid gap-4 lg:grid-cols-2">
                <div className="rounded-lg border p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold">Add Student</h3>
                    <label>
                      <input
                        type="file"
                        accept=".csv"
                        className="hidden"
                        onChange={handleFileUpload}
                      />
                      <Button variant="outline" size="sm" asChild>
                        <span>
                          <Upload className="mr-1 h-3 w-3" />
                          Import Roster
                        </span>
                      </Button>
                    </label>
                  </div>

                  {/* Roster import preview dialog */}
                  {showRosterImport && rosterPreview.length > 0 ? (
                    <div className="rounded border bg-muted/40 p-3 space-y-3">
                      <h4 className="text-xs uppercase text-muted-foreground tracking-wide">
                        CSV Preview ({rosterPreview.length} rows)
                      </h4>
                      <div className="max-h-48 overflow-auto space-y-1">
                        {rosterPreview.map((row, idx) => (
                          <div
                            key={idx}
                            className="flex items-center justify-between rounded border bg-background px-2 py-1.5 text-xs"
                          >
                            <span className="font-medium">{row.name}</span>
                            <span className="text-muted-foreground">
                              {row.student_id || ""}
                              {row.grade ? ` | Gr. ${row.grade}` : ""}
                            </span>
                          </div>
                        ))}
                      </div>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          onClick={() => void onConfirmImport()}
                          disabled={rosterImporting}
                        >
                          {rosterImporting ? (
                            <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                          ) : null}
                          Confirm Import
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setShowRosterImport(false);
                            setRosterPreview([]);
                          }}
                          disabled={rosterImporting}
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : null}

                  <div className="grid gap-3 md:grid-cols-3">
                    <Input
                      value={studentForm.firstName}
                      onChange={(event) =>
                        setStudentForm((prev) => ({ ...prev, firstName: event.target.value }))
                      }
                      placeholder="First name"
                    />
                    <Input
                      value={studentForm.lastName}
                      onChange={(event) =>
                        setStudentForm((prev) => ({ ...prev, lastName: event.target.value }))
                      }
                      placeholder="Last name"
                    />
                    <Input
                      value={studentForm.studentIdentifier}
                      onChange={(event) =>
                        setStudentForm((prev) => ({
                          ...prev,
                          studentIdentifier: event.target.value,
                        }))
                      }
                      placeholder="Student ID (optional)"
                    />
                  </div>
                  <Button onClick={() => void onCreateStudent()} disabled={saving}>
                    Add Student
                  </Button>

                  <div className="space-y-2 pt-2">
                    <h4 className="text-xs uppercase text-muted-foreground tracking-wide">
                      Roster
                    </h4>
                    {state.students.length === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        No students in this class yet.
                      </p>
                    ) : (
                      <div className="space-y-1">
                        {state.students.map((student) => (
                          <div
                            key={student.id}
                            className="flex items-center justify-between rounded border px-2 py-1.5 text-sm"
                          >
                            <span>
                              {student.firstName} {student.lastName}
                            </span>
                            <div className="flex items-center gap-2">
                              {student.patronId ? (
                                <Badge variant="outline" className="text-xs">
                                  Patron #{student.patronId}
                                </Badge>
                              ) : null}
                              <span className="text-xs text-muted-foreground">
                                {student.studentIdentifier || "No ID"}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                <div className="rounded-lg border p-4 space-y-3">
                  <h3 className="text-sm font-semibold">Class Checkout</h3>
                  <div className="grid gap-3">
                    <Input
                      value={checkoutForm.copyBarcode}
                      onChange={(event) =>
                        setCheckoutForm((prev) => ({ ...prev, copyBarcode: event.target.value }))
                      }
                      placeholder="Copy barcode"
                    />
                    <Input
                      value={checkoutForm.title}
                      onChange={(event) =>
                        setCheckoutForm((prev) => ({ ...prev, title: event.target.value }))
                      }
                      placeholder="Title override (optional)"
                    />
                    <Select
                      value={checkoutForm.studentId || "__class__"}
                      onValueChange={(value) =>
                        setCheckoutForm((prev) => ({
                          ...prev,
                          studentId: value === "__class__" ? "" : value,
                        }))
                      }
                    >
                      <SelectTrigger className="h-10">
                        <SelectValue placeholder="Assign to whole class" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__class__">Assign to whole class</SelectItem>
                        {state.students.map((student) => (
                          <SelectItem key={student.id} value={String(student.id)}>
                            {student.firstName} {student.lastName}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Input
                      type="datetime-local"
                      value={checkoutForm.dueTs}
                      onChange={(event) =>
                        setCheckoutForm((prev) => ({ ...prev, dueTs: event.target.value }))
                      }
                    />
                    <Input
                      value={checkoutForm.notes}
                      onChange={(event) =>
                        setCheckoutForm((prev) => ({ ...prev, notes: event.target.value }))
                      }
                      placeholder="Notes (optional)"
                    />
                  </div>
                  <Button onClick={() => void onCheckout()} disabled={saving}>
                    Record Checkout
                  </Button>
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                Create or select a class to enable roster-linked checkouts.
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Active Class Checkouts</CardTitle>
            <CardDescription>Return selected items or clear the full class queue.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => void onReturnSelected()}
                disabled={saving || selectedCheckoutIds.length === 0}
              >
                <RotateCcw className="mr-2 h-4 w-4" />
                Return Selected
              </Button>
              <Button
                variant="outline"
                onClick={() => void onReturnAllForClass()}
                disabled={saving || !selectedClassId}
              >
                Return All For Class
              </Button>
            </div>

            {loading ? (
              <div className="text-sm text-muted-foreground flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading active checkouts...
              </div>
            ) : state.activeCheckouts.length === 0 ? (
              <p className="text-sm text-muted-foreground">No active class checkouts.</p>
            ) : (
              <div className="space-y-2">
                {state.activeCheckouts.map((checkout) => (
                  <label
                    key={checkout.id}
                    className="flex cursor-pointer items-start gap-3 rounded border px-3 py-2"
                  >
                    <input
                      type="checkbox"
                      checked={selectedCheckoutIds.includes(checkout.id)}
                      onChange={() => toggleCheckoutSelection(checkout.id)}
                      className="mt-1"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium">
                        {checkout.title || "Unknown title"}{" "}
                        <span className="text-muted-foreground">({checkout.copyBarcode})</span>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {checkout.studentName
                          ? `Student: ${checkout.studentName}`
                          : "Assigned to class"}{" "}
                        • Checked out: {new Date(checkout.checkoutTs).toLocaleString()}
                        {checkout.dueTs
                          ? ` • Due: ${new Date(checkout.dueTs).toLocaleString()}`
                          : ""}
                      </div>
                    </div>
                  </label>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </PageContent>
    </PageContainer>
  );
}
