"use client";

import Link from "next/link";
import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { useWorkforms, WorkformEntry, WorkformType } from "@/contexts/workforms-context";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { BookOpen, Barcode, FileEdit, Pin, PinOff, User, X } from "lucide-react";

function iconForType(type: WorkformType) {
  switch (type) {
    case "patron":
      return User;
    case "record":
      return BookOpen;
    case "item":
      return Barcode;
    case "marc":
      return FileEdit;
  }
}

function labelForType(type: WorkformType) {
  switch (type) {
    case "patron":
      return "Patron";
    case "record":
      return "Record";
    case "item":
      return "Item";
    case "marc":
      return "MARC";
  }
}

function WorkformRow({ workform }: { workform: WorkformEntry }) {
  const { pin, close } = useWorkforms();
  const Icon = iconForType(workform.type);
  const typeLabel = labelForType(workform.type);

  return (
    <div className="group flex items-center gap-2 rounded-xl px-2 py-2 hover:bg-muted/60">
      <Link href={workform.href} className="flex min-w-0 flex-1 items-center gap-2">
        <div className="h-8 w-8 rounded-xl bg-muted/70 flex items-center justify-center flex-shrink-0">
          <Icon className="h-4 w-4 text-muted-foreground" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium truncate">{workform.title}</div>
          <div className="text-[11px] text-muted-foreground truncate">
            {workform.subtitle || typeLabel}
          </div>
        </div>
      </Link>

      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8 rounded-full"
              onClick={() => pin(workform.key, !workform.pinned)}
              aria-label={workform.pinned ? "Unpin" : "Pin"}
            >
              {workform.pinned ? <PinOff className="h-4 w-4" /> : <Pin className="h-4 w-4" />}
            </Button>
          </TooltipTrigger>
          <TooltipContent>{workform.pinned ? "Unpin" : "Pin"}</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8 rounded-full"
              onClick={() => close(workform.key)}
              aria-label="Close workform"
            >
              <X className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Close</TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
}

export function WorkformTracker({ className }: { className?: string }) {
  const { workforms, clearUnpinned } = useWorkforms();

  const { pinned, recent } = useMemo(() => {
    const pinned = workforms.filter((w) => w.pinned);
    const recent = workforms.filter((w) => !w.pinned);
    return { pinned, recent };
  }, [workforms]);

  if (workforms.length === 0) return null;

  return (
    <TooltipProvider>
      <div className={cn("mb-3 rounded-2xl border border-border/70 bg-background/50", className)}>
        <div className="flex items-center justify-between px-3 py-2">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-semibold tracking-wider uppercase text-muted-foreground">
              Workforms
            </span>
            {pinned.length > 0 ? (
              <Badge variant="secondary" className="rounded-full px-2 text-[10px]">
                {pinned.length} pinned
              </Badge>
            ) : null}
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 rounded-full text-xs text-muted-foreground"
            onClick={clearUnpinned}
          >
            Clear
          </Button>
        </div>

        <div className="px-1 pb-2">
          {pinned.map((w) => (
            <WorkformRow key={w.key} workform={w} />
          ))}
          {pinned.length > 0 && recent.length > 0 ? (
            <div className="mx-3 my-2 h-px bg-border/70" />
          ) : null}
          {recent.slice(0, 8).map((w) => (
            <WorkformRow key={w.key} workform={w} />
          ))}
        </div>
      </div>
    </TooltipProvider>
  );
}

