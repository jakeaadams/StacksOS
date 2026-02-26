"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { PageContainer, PageContent, PageHeader } from "@/components/shared";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { fetchWithAuth } from "@/lib/client-fetch";
import { useRouter } from "next/navigation";
import { AlertTriangle, ArrowLeft, Bell, Loader2 } from "lucide-react";

type ClassOverview = {
  id: number;
  name: string;
  teacherName: string;
};

type OverdueItem = {
  checkoutId: number;
  studentId: number;
  studentName: string;
  copyBarcode: string;
  title: string | null;
  checkoutTs: string;
  dueTs: string;
  daysOverdue: number;
};

type OverdueGroup = {
  studentId: number;
  studentName: string;
  items: OverdueItem[];
  totalOverdue: number;
};

export default function OverdueDashboardPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [classes, setClasses] = useState<ClassOverview[]>([]);
  const [selectedClassId, setSelectedClassId] = useState<number | null>(null);
  const [groups, setGroups] = useState<OverdueGroup[]>([]);
  const [totalOverdue, setTotalOverdue] = useState(0);
  const [selectedStudentIds, setSelectedStudentIds] = useState<number[]>([]);

  async function loadClasses() {
    setLoading(true);
    try {
      const response = await fetchWithAuth("/api/staff/k12/class-circulation", {
        cache: "no-store",
      });
      const json = await response.json();
      if (!response.ok || json.ok !== true)
        throw new Error(json.error || `HTTP ${response.status}`);
      setClasses(Array.isArray(json.classes) ? json.classes : []);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      toast.error(`Failed to load classes: ${message}`);
    } finally {
      setLoading(false);
    }
  }

  const loadOverdue = useCallback(async (classId: number) => {
    setLoading(true);
    try {
      const response = await fetchWithAuth(`/api/staff/k12/overdue-dashboard?classId=${classId}`, {
        cache: "no-store",
      });
      const json = await response.json();
      if (!response.ok || json.ok !== true)
        throw new Error(json.error || `HTTP ${response.status}`);
      setGroups(Array.isArray(json.groups) ? json.groups : []);
      setTotalOverdue(typeof json.totalOverdueItems === "number" ? json.totalOverdueItems : 0);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      toast.error(`Failed to load overdue data: ${message}`);
      setGroups([]);
      setTotalOverdue(0);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadClasses();
  }, []);

  useEffect(() => {
    if (selectedClassId) {
      void loadOverdue(selectedClassId);
    } else {
      setGroups([]);
      setTotalOverdue(0);
    }
    setSelectedStudentIds([]);
  }, [selectedClassId, loadOverdue]);

  function toggleStudentSelection(studentId: number) {
    setSelectedStudentIds((prev) =>
      prev.includes(studentId) ? prev.filter((id) => id !== studentId) : [...prev, studentId]
    );
  }

  const [sendingNotices, setSendingNotices] = useState(false);

  async function onBulkNotice() {
    if (selectedStudentIds.length === 0 || !selectedClassId || sendingNotices) return;
    setSendingNotices(true);
    try {
      const response = await fetchWithAuth("/api/staff/k12/overdue-dashboard", {
        method: "POST",
        body: JSON.stringify({ classId: selectedClassId, studentIds: selectedStudentIds }),
      });
      const json = await response.json();
      if (!response.ok || json.ok !== true) {
        throw new Error(json.error || `HTTP ${response.status}`);
      }
      const { noticesSent, overdueItemCount } = json.response ?? {};
      toast.success(
        `Overdue notices sent for ${noticesSent ?? 0} student(s) covering ${overdueItemCount ?? 0} item(s).`
      );
      setSelectedStudentIds([]);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      toast.error(`Failed to send notices: ${message}`);
    } finally {
      setSendingNotices(false);
    }
  }

  return (
    <PageContainer>
      <PageHeader
        title="Overdue Dashboard"
        subtitle="View and manage overdue items by student for a class."
        breadcrumbs={[
          { label: "Circulation" },
          { label: "Class Circulation", href: "/staff/circulation/class-circulation" },
          { label: "Overdue Dashboard" },
        ]}
        actions={[
          {
            label: "Back to Class Circulation",
            onClick: () => router.push("/staff/circulation/class-circulation"),
            icon: ArrowLeft,
            variant: "outline" as const,
          },
        ]}
      />

      <PageContent className="space-y-6">
        {/* Class selector */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Select Class</CardTitle>
          </CardHeader>
          <CardContent>
            <Select
              value={selectedClassId ? String(selectedClassId) : "__none__"}
              onValueChange={(v) => setSelectedClassId(v === "__none__" ? null : Number(v))}
            >
              <SelectTrigger className="h-10 max-w-sm" aria-label="Select class">
                <SelectValue placeholder="Select a class" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Select a class</SelectItem>
                {classes.map((c) => (
                  <SelectItem key={c.id} value={String(c.id)}>
                    {c.name} - {c.teacherName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </CardContent>
        </Card>

        {selectedClassId ? (
          <>
            {/* Summary + actions */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-destructive" />
                <span className="text-sm font-medium">
                  {totalOverdue} overdue item(s) across {groups.length} student(s)
                </span>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={onBulkNotice}
                disabled={selectedStudentIds.length === 0 || sendingNotices}
              >
                {sendingNotices ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Bell className="mr-2 h-4 w-4" />
                )}
                {sendingNotices ? "Sending..." : `Send Notice (${selectedStudentIds.length})`}
              </Button>
            </div>

            {/* Overdue groups */}
            {loading ? (
              <div className="text-sm text-muted-foreground flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading overdue data...
              </div>
            ) : groups.length === 0 ? (
              <Card>
                <CardContent className="py-8 text-center text-muted-foreground">
                  No overdue items for this class. All items are on time.
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-4">
                {groups.map((group) => (
                  <Card key={group.studentId}>
                    <CardHeader className="pb-2">
                      <div className="flex items-center gap-3">
                        <label className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={selectedStudentIds.includes(group.studentId)}
                            onChange={() => toggleStudentSelection(group.studentId)}
                            aria-label={`Select ${group.studentName}`}
                          />
                          <CardTitle className="text-sm font-medium">{group.studentName}</CardTitle>
                        </label>
                        <Badge variant="destructive">{group.totalOverdue} overdue</Badge>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-1">
                        {group.items.map((item) => (
                          <div
                            key={item.checkoutId}
                            className="flex items-center justify-between rounded border px-3 py-2 text-sm"
                          >
                            <div className="min-w-0 flex-1">
                              <span className="font-medium">{item.title || "Unknown title"}</span>
                              <span className="text-muted-foreground ml-2">
                                ({item.copyBarcode})
                              </span>
                            </div>
                            <div className="flex items-center gap-2 shrink-0 ml-4">
                              <span className="text-xs text-muted-foreground">
                                Due: {new Date(item.dueTs).toLocaleDateString()}
                              </span>
                              <Badge variant="outline" className="text-xs">
                                {item.daysOverdue} day(s) overdue
                              </Badge>
                            </div>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </>
        ) : (
          <p className="text-sm text-muted-foreground">Select a class to view overdue items.</p>
        )}
      </PageContent>
    </PageContainer>
  );
}
