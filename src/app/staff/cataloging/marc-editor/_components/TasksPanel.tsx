"use client";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ClipboardList, Loader2, X } from "lucide-react";
import type { RecordTask } from "./marc-types";

interface TasksPanelProps {
  recordIdNum: number;
  tasksLoading: boolean;
  tasksError: string | null;
  tasks: RecordTask[];
  newTaskTitle: string;
  newTaskBody: string;
  onNewTaskTitleChange: (v: string) => void;
  onNewTaskBodyChange: (v: string) => void;
  onCreateTask: () => void;
  onSetTaskStatus: (taskId: number, status: "open" | "done" | "canceled") => void;
  onClose: () => void;
}

export function TasksPanel({
  recordIdNum,
  tasksLoading,
  tasksError,
  tasks,
  newTaskTitle,
  newTaskBody,
  onNewTaskTitleChange,
  onNewTaskBodyChange,
  onCreateTask,
  onSetTaskStatus,
  onClose,
}: TasksPanelProps) {
  return (
    <Card>
      <CardHeader className="py-3">
        <CardTitle className="text-base flex items-center justify-between">
          <span className="inline-flex items-center gap-2">
            <ClipboardList className="h-4 w-4" />
            Tasks & notes
          </span>
          <Button
            size="icon"
            variant="ghost"
            className="h-8 w-8"
            onClick={onClose}
            title="Close tasks panel"
            aria-label="Close tasks panel"
          >
            <X className="h-4 w-4" />
            <span className="sr-only">Close tasks panel</span>
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {!recordIdNum ? (
          <div className="text-sm text-muted-foreground">
            Save the record first to attach tasks.
          </div>
        ) : (
          <>
            <div className="space-y-2">
              <Input
                value={newTaskTitle}
                onChange={(e) => onNewTaskTitleChange(e.target.value)}
                placeholder="Task title"
                aria-label="Task title"
              />
              <Input
                value={newTaskBody}
                onChange={(e) => onNewTaskBodyChange(e.target.value)}
                placeholder="Optional note"
                aria-label="Task note"
              />
              <Button size="sm" onClick={onCreateTask} disabled={!newTaskTitle.trim()}>
                Add task
              </Button>
            </div>

            {tasksError ? (
              <div className="text-sm text-muted-foreground">
                Failed to load tasks: {tasksError}
              </div>
            ) : null}

            {tasksLoading ? (
              <div className="text-sm text-muted-foreground flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading...
              </div>
            ) : (
              <div className="space-y-2">
                {tasks.length === 0 ? (
                  <div className="text-sm text-muted-foreground">No tasks yet.</div>
                ) : (
                  tasks.map((t) => (
                    <div key={t.id} className="rounded-lg border bg-background p-3 space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-sm font-medium">{t.title}</div>
                        <Badge variant="outline">{t.status}</Badge>
                      </div>
                      {t.body ? (
                        <div className="text-xs text-muted-foreground whitespace-pre-wrap">
                          {t.body}
                        </div>
                      ) : null}
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => onSetTaskStatus(t.id, "open")}
                          disabled={t.status === "open"}
                        >
                          Open
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => onSetTaskStatus(t.id, "done")}
                          disabled={t.status === "done"}
                        >
                          Done
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => onSetTaskStatus(t.id, "canceled")}
                          disabled={t.status === "canceled"}
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
