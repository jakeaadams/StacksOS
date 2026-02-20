"use client";

import { BookCard } from "@/components/opac/book-card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Info } from "lucide-react";

export interface RecommendationItem {
  id: number;
  title: string;
  author?: string;
  isbn?: string;
  coverUrl?: string;
  availableCopies?: number;
  totalCopies?: number;
  holdCount?: number;
  reason?: string;
  reasonType?: "because_you_read" | "favorite_author" | "trending" | "popular" | "staff_pick";
  sourceTitle?: string;
  sourceBibId?: number;
  source?: string;
}

interface RecommendationCardProps {
  item: RecommendationItem;
  variant?: "grid" | "compact";
  showReason?: boolean;
}

export function RecommendationCard({
  item,
  variant = "grid",
  showReason = true,
}: RecommendationCardProps) {
  return (
    <div className="relative group/rec">
      <BookCard
        id={item.id}
        title={item.title}
        author={item.author}
        coverUrl={item.coverUrl}
        isbn={item.isbn}
        availableCopies={item.availableCopies ?? 0}
        totalCopies={item.totalCopies ?? 0}
        holdCount={item.holdCount ?? 0}
        variant={variant}
        showFormats={false}
        showRating={variant === "grid"}
      />
      {showReason && item.reason && (
        <div className="absolute top-2 right-2 z-10">
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                }}
                className="inline-flex items-center justify-center rounded-full
                         bg-card/90 border border-border/70 shadow-sm p-1.5
                         text-muted-foreground hover:text-primary-700
                         hover:border-primary-300 transition-colors
                         opacity-0 group-hover/rec:opacity-100 focus:opacity-100"
                aria-label="Why am I seeing this?"
              >
                <Info className="h-3.5 w-3.5" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="max-w-[240px] text-center">
              <p className="text-xs">{item.reason}</p>
            </TooltipContent>
          </Tooltip>
        </div>
      )}
    </div>
  );
}

export default RecommendationCard;
