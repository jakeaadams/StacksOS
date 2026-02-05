"use client";

import Link from "next/link";
import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { useWorkforms, WorkformEntry } from "@/contexts/workforms-context";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { BookOpen, Barcode, FileEdit, X, User, Pin } from "lucide-react";

function PinnedRow({ workform }: { workform: WorkformEntry }) {
  const { removePin } = useWorkforms();

  return (
    <div className="group flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-accent/50 transition-colors">
      <Link href={workform.href} className="flex min-w-0 flex-1 items-center gap-2">
        {workform.type === "patron" ? (
          <User className="h-4 w-4 text-muted-foreground flex-shrink-0" />
        ) : workform.type === "record" ? (
          <BookOpen className="h-4 w-4 text-muted-foreground flex-shrink-0" />
        ) : workform.type === "item" ? (
          <Barcode className="h-4 w-4 text-muted-foreground flex-shrink-0" />
        ) : (
          <FileEdit className="h-4 w-4 text-muted-foreground flex-shrink-0" />
        )}
        <span className="text-sm truncate">{workform.title}</span>
      </Link>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
            onClick={(e) => { e.preventDefault(); removePin(workform.key); }}
            aria-label="Unpin"
          >
            <X className="h-3 w-3" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="right">Unpin</TooltipContent>
      </Tooltip>
    </div>
  );
}

export function WorkformTracker({ className }: { className?: string }) {
  const { workforms } = useWorkforms();

  // Only show pinned items
  const pinned = useMemo(() => workforms.filter((w) => w.pinned), [workforms]);

  // Don't render anything if no pinned items
  if (pinned.length === 0) return null;

  return (
    <TooltipProvider>
      <div className={cn("mb-3", className)}>
        <div className="flex items-center gap-1.5 px-2 py-1 mb-1">
          <Pin className="h-3 w-3 text-muted-foreground" />
          <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
            Pinned
          </span>
        </div>
        <div className="space-y-0.5">
          {pinned.map((w) => (
            <PinnedRow key={w.key} workform={w} />
          ))}
        </div>
      </div>
    </TooltipProvider>
  );
}
