"use client";

import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Pin, PinOff } from "lucide-react";
import { useWorkforms, WorkformType } from "@/contexts/workforms-context";
import { toast } from "sonner";

interface PinButtonProps {
  type: WorkformType;
  id: string;
  title: string;
  subtitle?: string;
  href: string;
  variant?: "default" | "outline" | "ghost";
  size?: "default" | "sm" | "icon";
}

export function PinButton({ type, id, title, subtitle, href, variant = "outline", size = "default" }: PinButtonProps) {
  const { addPin, removePin, isPinned } = useWorkforms();
  const pinned = isPinned(type, id);

  const handleClick = () => {
    if (pinned) {
      removePin(`${type}:${id}`);
      toast.success("Unpinned from sidebar");
    } else {
      addPin({ type, id, title, subtitle, href });
      toast.success("Pinned to sidebar");
    }
  };

  if (size === "icon") {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant={variant} size="icon" onClick={handleClick}>
              {pinned ? <PinOff className="h-4 w-4" /> : <Pin className="h-4 w-4" />}
            </Button>
          </TooltipTrigger>
          <TooltipContent>{pinned ? "Unpin from sidebar" : "Pin to sidebar"}</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return (
    <Button variant={variant} size={size} onClick={handleClick}>
      {pinned ? <PinOff className="h-4 w-4 mr-2" /> : <Pin className="h-4 w-4 mr-2" />}
      {pinned ? "Unpin" : "Pin"}
    </Button>
  );
}
