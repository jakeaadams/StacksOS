/**
 * FacetedSearch - World-class search interface with filters
 * Features: collapsible facet groups, multi-select, clear filters, sticky sidebar
 */

"use client";

import { useState, useCallback, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  ChevronDown,
  ChevronUp,
  X,
  SlidersHorizontal,
  Filter,
  BookOpen,
  Smartphone,
  Headphones,
  MonitorPlay,
  Music,
  Newspaper,
  Calendar,
} from "lucide-react";
import { cn } from "@/lib/utils";

export interface FacetValue {
  value: string;
  label: string;
  count: number;
  selected?: boolean;
}

export interface Facet {
  id: string;
  name: string;
  type: "checkbox" | "radio" | "range" | "location";
  values: FacetValue[];
  icon?: React.ElementType;
  expanded?: boolean;
}

interface FacetedSearchProps {
  facets: Facet[];
  onFilterChange: (facetId: string, values: string[]) => void;
  onClearAll: () => void;
  totalResults?: number;
  className?: string;
}

const FORMAT_ICONS: Record<string, React.ElementType> = {
  book: BookOpen,
  ebook: Smartphone,
  audiobook: Headphones,
  dvd: MonitorPlay,
  cd: Music,
  magazine: Newspaper,
};

function FacetGroup({ facet, onValueToggle }: { facet: Facet; onValueToggle: (value: string) => void }) {
  const [isOpen, setIsOpen] = useState(facet.expanded !== false);
  const [showAll, setShowAll] = useState(false);
  
  const displayValues = showAll ? facet.values : facet.values.slice(0, 5);
  const hasMore = facet.values.length > 5;
  const selectedCount = facet.values.filter(v => v.selected).length;
  const Icon = facet.icon;

  return (
    <div className="border-b border-border/50 pb-4">
      <button type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center justify-between w-full py-2 text-left hover:text-primary transition-colors"
      >
        <div className="flex items-center gap-2">
          {Icon && <Icon className="h-4 w-4 text-muted-foreground" />}
          <span className="font-medium text-sm">{facet.name}</span>
          {selectedCount > 0 && (
            <Badge variant="secondary" className="rounded-full px-2 py-0 text-[10px]">{selectedCount}</Badge>
          )}
        </div>
        {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
      </button>
      
      {isOpen && (
        <div className="pt-2 space-y-1">
          {displayValues.map((value) => {
            const FormatIcon = FORMAT_ICONS[value.value.toLowerCase()];
            return (
              <label
                key={value.value}
                className={cn(
                  "flex items-center gap-3 py-1.5 px-2 rounded-md cursor-pointer transition-colors hover:bg-muted/50",
                  value.selected && "bg-primary/5"
                )}
              >
                <Checkbox checked={value.selected} onCheckedChange={() => onValueToggle(value.value)} className="h-4 w-4" />
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  {FormatIcon && <FormatIcon className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />}
                  <span className="text-sm truncate">{value.label}</span>
                </div>
                <span className="text-xs text-muted-foreground tabular-nums">{value.count.toLocaleString()}</span>
              </label>
            );
          })}
          {hasMore && (
            <button type="button" onClick={() => setShowAll(!showAll)} className="text-xs text-primary hover:underline mt-2 pl-2">
              {showAll ? "Show less" : `Show ${facet.values.length - 5} more`}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function YearRangeFacet({ onRangeChange }: { onRangeChange: (range: [number, number]) => void }) {
  const currentYear = new Date().getFullYear();
  const [startYear, setStartYear] = useState("1900");
  const [endYear, setEndYear] = useState(currentYear.toString());

  const handleApply = () => {
    const start = parseInt(startYear) || 1900;
    const end = parseInt(endYear) || currentYear;
    onRangeChange([Math.min(start, end), Math.max(start, end)]);
  };

  return (
    <div className="border-b border-border/50 pb-4">
      <div className="flex items-center gap-2 py-2">
        <Calendar className="h-4 w-4 text-muted-foreground" />
        <span className="font-medium text-sm">Publication Year</span>
      </div>
      <div className="flex items-center gap-2 mt-2">
        <Input type="number" value={startYear} onChange={(e) => setStartYear(e.target.value)} placeholder="From" className="h-8 text-sm" min={1800} max={currentYear} />
        <span className="text-muted-foreground">—</span>
        <Input value={endYear} onChange={(e) => setEndYear(e.target.value)} placeholder="To" className="h-8 text-sm" min={1800} max={currentYear} />
        <Button size="sm" variant="secondary" onClick={handleApply} className="h-8">Apply</Button>
      </div>
    </div>
  );
}

export function FacetedSearch({ facets, onFilterChange, onClearAll, totalResults, className }: FacetedSearchProps) {
  const activeFilters = useMemo(() => {
    return facets.flatMap(facet => facet.values.filter(v => v.selected).map(v => ({ facetId: facet.id, facetName: facet.name, ...v })));
  }, [facets]);

  const handleValueToggle = useCallback((facetId: string, value: string) => {
    const facet = facets.find(f => f.id === facetId);
    if (!facet) return;
    const currentSelected = facet.values.filter(v => v.selected).map(v => v.value);
    const newSelected = currentSelected.includes(value) ? currentSelected.filter(v => v !== value) : [...currentSelected, value];
    onFilterChange(facetId, newSelected);
  }, [facets, onFilterChange]);

  const FacetContent = (
    <div className={cn("space-y-4", className)}>
      {activeFilters.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Active Filters</span>
            <button type="button" onClick={onClearAll} className="text-xs text-primary hover:underline">Clear all</button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {activeFilters.map((filter) => (
              <Badge key={`${filter.facetId}-${filter.value}`} variant="secondary" className="pr-1 gap-1">
                <span className="text-[10px] text-muted-foreground mr-0.5">{filter.facetName}:</span>
                {filter.label}
                <button type="button" onClick={() => handleValueToggle(filter.facetId, filter.value)} className="ml-1 hover:bg-background/50 rounded-full p-0.5">
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}
          </div>
        </div>
      )}

      {totalResults !== undefined && (
        <div className="text-sm text-muted-foreground border-b border-border/50 pb-3">
          <strong className="text-foreground">{totalResults.toLocaleString()}</strong> results
        </div>
      )}

      <ScrollArea className="h-[calc(100vh-300px)] pr-4">
        <div className="space-y-2">
          {facets.map((facet) => (
            <FacetGroup key={facet.id} facet={facet} onValueToggle={(value) => handleValueToggle(facet.id, value)} />
          ))}
          <YearRangeFacet onRangeChange={(range) => onFilterChange("year", [`${range[0]}-${range[1]}`])} />
        </div>
      </ScrollArea>
    </div>
  );

  return (
    <>
      <aside className="hidden lg:block w-64 flex-shrink-0 sticky top-20 self-start">
        <div className="bg-card rounded-xl border border-border/70 p-4 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <Filter className="h-4 w-4" />
            <h2 className="font-semibold">Filters</h2>
          </div>
          {FacetContent}
        </div>
      </aside>

      <Sheet>
        <SheetTrigger asChild>
          <Button variant="outline" size="sm" className="lg:hidden">
            <SlidersHorizontal className="h-4 w-4 mr-2" />
            Filters
            {activeFilters.length > 0 && <Badge variant="secondary" className="ml-2 rounded-full">{activeFilters.length}</Badge>}
          </Button>
        </SheetTrigger>
        <SheetContent side="left" className="w-[300px] sm:w-[400px]">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2"><Filter className="h-4 w-4" />Filters</SheetTitle>
            <SheetDescription>Narrow down your search results</SheetDescription>
          </SheetHeader>
          <div className="mt-6">{FacetContent}</div>
        </SheetContent>
      </Sheet>
    </>
  );
}

export type { FacetedSearchProps };
