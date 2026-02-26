"use client";

import { useEffect, useMemo, useState } from "react";
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
import { GraduationCap, Loader2, RefreshCw, RotateCcw, School, UserPlus } from "lucide-react";

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

  useEffect(() => {
    void loadData();
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
                  <h3 className="text-sm font-semibold">Add Student</h3>
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
                            <span className="text-xs text-muted-foreground">
                              {student.studentIdentifier || "No ID"}
                            </span>
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
