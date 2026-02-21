"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ClipboardList, Loader2 } from "lucide-react";
import type { RecordTask } from "./patron-types";
import { toDateLabel } from "./patron-types";

export interface TasksNotesCardProps {
  tasks: RecordTask[];
  tasksLoading: boolean;
  tasksError: string | null;
  newTaskTitle: string;
  setNewTaskTitle: (v: string) => void;
  newTaskBody: string;
  setNewTaskBody: (v: string) => void;
  onCreateTask: () => void;
  onLoadTasks: () => void;
  onSetTaskStatus: (taskId: number, status: "open" | "done" | "canceled") => void;
}

export function TasksNotesCard(props: TasksNotesCardProps) {
  const { tasks, tasksLoading, tasksError, newTaskTitle, setNewTaskTitle, newTaskBody, setNewTaskBody, onCreateTask, onLoadTasks, onSetTaskStatus } = props;

  return (
    <Card className="rounded-2xl border-border/70 shadow-sm">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <ClipboardList className="h-4 w-4" />
            <CardTitle className="text-base">Tasks & Notes</CardTitle>
          </div>
          <Button size="sm" variant="outline" onClick={onLoadTasks} disabled={tasksLoading}>
            {tasksLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Refresh"}
          </Button>
        </div>
        <CardDescription>Assignable follow-ups tied to this patron record.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid gap-2 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="task-title">Task title</Label>
            <Input id="task-title" value={newTaskTitle} onChange={(e) => setNewTaskTitle(e.target.value)} placeholder="e.g., Verify address for renewal" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="task-note">Optional note</Label>
            <Input id="task-note" value={newTaskBody} onChange={(e) => setNewTaskBody(e.target.value)} placeholder="Short context (no PII beyond this record)" />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={onCreateTask} disabled={!newTaskTitle.trim()}>Add task</Button>
          {tasksError ? <div className="text-sm text-muted-foreground">Error: {tasksError}</div> : null}
        </div>

        {tasks.length === 0 && !tasksLoading ? (
          <div className="text-sm text-muted-foreground">No tasks yet.</div>
        ) : (
          <div className="space-y-2">
            {tasks.slice(0, 8).map((t) => (
              <div key={t.id} className="rounded-xl border border-border/70 bg-muted/20 px-3 py-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-medium truncate">{t.title}</div>
                    {t.body ? <div className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{t.body}</div> : null}
                  </div>
                  <Badge variant="outline" className="shrink-0">{t.status}</Badge>
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" onClick={() => onSetTaskStatus(t.id, "open")} disabled={t.status === "open"}>Open</Button>
                  <Button size="sm" variant="outline" onClick={() => onSetTaskStatus(t.id, "done")} disabled={t.status === "done"}>Done</Button>
                  <Button size="sm" variant="outline" onClick={() => onSetTaskStatus(t.id, "canceled")} disabled={t.status === "canceled"}>Cancel</Button>
                  <span className="text-[11px] text-muted-foreground ml-auto">{toDateLabel(t.createdAt)}</span>
                </div>
              </div>
            ))}
            {tasks.length > 8 ? <div className="text-xs text-muted-foreground">Showing 8 of {tasks.length}.</div> : null}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
