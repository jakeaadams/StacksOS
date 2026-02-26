"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { PageContainer, PageContent, PageHeader } from "@/components/shared";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { fetchWithAuth } from "@/lib/client-fetch";
import { ArrowLeft, Loader2, Plus, Trophy } from "lucide-react";
import { useRouter } from "next/navigation";

type ClassOverview = {
  id: number;
  name: string;
  teacherName: string;
};

type Challenge = {
  id: number;
  classId: number;
  title: string;
  description: string | null;
  goalType: string;
  goalValue: number;
  startDate: string;
  endDate: string;
};

type LeaderboardEntry = {
  studentId: number;
  studentName: string;
  progressValue: number;
  completed: boolean;
  rank: number;
};

type ChallengeStats = {
  totalStudents: number;
  completedCount: number;
  avgProgress: number;
  goalValue: number;
};

type Student = {
  id: number;
  firstName: string;
  lastName: string;
};

export default function ReadingChallengesPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [classes, setClasses] = useState<ClassOverview[]>([]);
  const [selectedClassId, setSelectedClassId] = useState<number | null>(null);
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [selectedChallengeId, setSelectedChallengeId] = useState<number | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [stats, setStats] = useState<ChallengeStats | null>(null);
  const [students, setStudents] = useState<Student[]>([]);

  const [form, setForm] = useState({
    title: "",
    description: "",
    goalType: "books",
    goalValue: "10",
    startDate: "",
    endDate: "",
  });

  // Progress update form
  const [progressStudentId, setProgressStudentId] = useState("");
  const [progressDelta, setProgressDelta] = useState("1");

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

  const loadChallenges = useCallback(async (classId: number) => {
    try {
      const response = await fetchWithAuth(`/api/staff/k12/challenges?classId=${classId}`, {
        cache: "no-store",
      });
      const json = await response.json();
      if (!response.ok || json.ok !== true)
        throw new Error(json.error || `HTTP ${response.status}`);
      setChallenges(Array.isArray(json.challenges) ? json.challenges : []);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      toast.error(`Failed to load challenges: ${message}`);
    }
  }, []);

  const loadStudents = useCallback(async (classId: number) => {
    try {
      const response = await fetchWithAuth(`/api/staff/k12/class-circulation?classId=${classId}`, {
        cache: "no-store",
      });
      const json = await response.json();
      if (!response.ok || json.ok !== true) return;
      setStudents(Array.isArray(json.students) ? json.students : []);
    } catch {
      // non-critical
    }
  }, []);

  const loadChallengeDetails = useCallback(async (challengeId: number) => {
    try {
      const response = await fetchWithAuth(`/api/staff/k12/challenges?challengeId=${challengeId}`, {
        cache: "no-store",
      });
      const json = await response.json();
      if (!response.ok || json.ok !== true)
        throw new Error(json.error || `HTTP ${response.status}`);
      setLeaderboard(Array.isArray(json.leaderboard) ? json.leaderboard : []);
      setStats(json.stats || null);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      toast.error(`Failed to load challenge details: ${message}`);
    }
  }, []);

  useEffect(() => {
    void loadClasses();
  }, []);

  useEffect(() => {
    if (selectedClassId) {
      void loadChallenges(selectedClassId);
      void loadStudents(selectedClassId);
    } else {
      setChallenges([]);
      setStudents([]);
    }
    setSelectedChallengeId(null);
    setLeaderboard([]);
    setStats(null);
  }, [selectedClassId, loadChallenges, loadStudents]);

  useEffect(() => {
    if (selectedChallengeId) {
      void loadChallengeDetails(selectedChallengeId);
    } else {
      setLeaderboard([]);
      setStats(null);
    }
  }, [selectedChallengeId, loadChallengeDetails]);

  async function onCreateChallenge() {
    if (!selectedClassId || !form.title.trim() || !form.startDate || !form.endDate) return;
    setSaving(true);
    try {
      const response = await fetchWithAuth("/api/staff/k12/challenges", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "createChallenge",
          classId: selectedClassId,
          title: form.title.trim(),
          description: form.description.trim() || undefined,
          goalType: form.goalType,
          goalValue: Number(form.goalValue) || 10,
          startDate: form.startDate,
          endDate: form.endDate,
        }),
      });
      const json = await response.json();
      if (!response.ok || json.ok !== true)
        throw new Error(json.error || `HTTP ${response.status}`);
      toast.success("Challenge created");
      setForm({
        title: "",
        description: "",
        goalType: "books",
        goalValue: "10",
        startDate: "",
        endDate: "",
      });
      void loadChallenges(selectedClassId);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      toast.error(`Failed to create challenge: ${message}`);
    } finally {
      setSaving(false);
    }
  }

  async function onUpdateProgress() {
    if (!selectedChallengeId || !progressStudentId) return;
    setSaving(true);
    try {
      const response = await fetchWithAuth("/api/staff/k12/challenges", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "updateProgress",
          challengeId: selectedChallengeId,
          studentId: Number(progressStudentId),
          delta: Number(progressDelta) || 1,
        }),
      });
      const json = await response.json();
      if (!response.ok || json.ok !== true)
        throw new Error(json.error || `HTTP ${response.status}`);
      toast.success("Progress updated");
      void loadChallengeDetails(selectedChallengeId);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      toast.error(`Failed to update progress: ${message}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <PageContainer>
      <PageHeader
        title="Reading Challenges"
        subtitle="Create and manage class reading challenges with leaderboards."
        breadcrumbs={[
          { label: "Circulation" },
          { label: "Class Circulation", href: "/staff/circulation/class-circulation" },
          { label: "Reading Challenges" },
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
            {/* Create challenge form */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Plus className="h-4 w-4" />
                  Create Challenge
                </CardTitle>
                <CardDescription>Set a reading goal for the class.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="challenge-title">Title</Label>
                    <Input
                      id="challenge-title"
                      value={form.title}
                      onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
                      placeholder="March Reading Marathon"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="challenge-desc">Description</Label>
                    <Input
                      id="challenge-desc"
                      value={form.description}
                      onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
                      placeholder="Read as many books as you can!"
                    />
                  </div>
                </div>
                <div className="grid gap-3 md:grid-cols-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="goal-type">Goal Type</Label>
                    <Select
                      value={form.goalType}
                      onValueChange={(v) => setForm((p) => ({ ...p, goalType: v }))}
                    >
                      <SelectTrigger id="goal-type" className="h-10">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="books">Books</SelectItem>
                        <SelectItem value="pages">Pages</SelectItem>
                        <SelectItem value="minutes">Minutes</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="goal-value">Goal</Label>
                    <Input
                      id="goal-value"
                      type="number"
                      min={1}
                      value={form.goalValue}
                      onChange={(e) => setForm((p) => ({ ...p, goalValue: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="start-date">Start Date</Label>
                    <Input
                      id="start-date"
                      type="date"
                      value={form.startDate}
                      onChange={(e) => setForm((p) => ({ ...p, startDate: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="end-date">End Date</Label>
                    <Input
                      id="end-date"
                      type="date"
                      value={form.endDate}
                      onChange={(e) => setForm((p) => ({ ...p, endDate: e.target.value }))}
                    />
                  </div>
                </div>
                <Button onClick={() => void onCreateChallenge()} disabled={saving || loading}>
                  {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Create Challenge
                </Button>
              </CardContent>
            </Card>

            {/* Active challenges list */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Trophy className="h-4 w-4" />
                  Active Challenges
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {challenges.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No active challenges for this class.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {challenges.map((ch) => (
                      <button
                        key={ch.id}
                        type="button"
                        className={`w-full text-left rounded border px-3 py-2 transition-colors ${
                          selectedChallengeId === ch.id
                            ? "border-primary bg-primary/5"
                            : "hover:bg-muted/50"
                        }`}
                        onClick={() => setSelectedChallengeId(ch.id)}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium">{ch.title}</span>
                          <Badge variant="secondary">
                            {ch.goalValue} {ch.goalType}
                          </Badge>
                        </div>
                        {ch.description ? (
                          <p className="text-xs text-muted-foreground mt-1">{ch.description}</p>
                        ) : null}
                        <p className="text-xs text-muted-foreground mt-1">
                          {ch.startDate} to {ch.endDate}
                        </p>
                      </button>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Selected challenge details */}
            {selectedChallengeId && stats ? (
              <>
                <div className="grid gap-4 md:grid-cols-3">
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium">Completed</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-2xl font-semibold">
                        {stats.completedCount} / {stats.totalStudents}
                      </p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium">Average Progress</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-2xl font-semibold">{stats.avgProgress}</p>
                      <Progress
                        value={
                          stats.goalValue > 0
                            ? Math.min(100, (stats.avgProgress / stats.goalValue) * 100)
                            : 0
                        }
                        className="mt-2"
                      />
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium">Update Progress</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      <Select value={progressStudentId} onValueChange={setProgressStudentId}>
                        <SelectTrigger className="h-9" aria-label="Select student">
                          <SelectValue placeholder="Select student" />
                        </SelectTrigger>
                        <SelectContent>
                          {students.map((s) => (
                            <SelectItem key={s.id} value={String(s.id)}>
                              {s.firstName} {s.lastName}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <div className="flex gap-2">
                        <Input
                          type="number"
                          min={1}
                          value={progressDelta}
                          onChange={(e) => setProgressDelta(e.target.value)}
                          className="w-20"
                          aria-label="Progress amount"
                        />
                        <Button
                          size="sm"
                          onClick={() => void onUpdateProgress()}
                          disabled={saving || !progressStudentId}
                        >
                          +Add
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                </div>

                {/* Leaderboard */}
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">Leaderboard</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {leaderboard.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No progress recorded yet.</p>
                    ) : (
                      <div className="space-y-2">
                        {leaderboard.map((entry) => (
                          <div
                            key={entry.studentId}
                            className="flex items-center gap-3 rounded border px-3 py-2"
                          >
                            <span className="text-sm font-bold w-8 text-center">#{entry.rank}</span>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between">
                                <span className="text-sm font-medium truncate">
                                  {entry.studentName}
                                </span>
                                <span className="text-sm text-muted-foreground">
                                  {entry.progressValue} / {stats.goalValue}
                                </span>
                              </div>
                              <Progress
                                value={
                                  stats.goalValue > 0
                                    ? Math.min(100, (entry.progressValue / stats.goalValue) * 100)
                                    : 0
                                }
                                className="mt-1"
                              />
                            </div>
                            {entry.completed ? (
                              <Badge variant="default" className="shrink-0">
                                Done
                              </Badge>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </>
            ) : null}
          </>
        ) : (
          <p className="text-sm text-muted-foreground">
            Select a class to manage reading challenges.
          </p>
        )}
      </PageContent>
    </PageContainer>
  );
}
