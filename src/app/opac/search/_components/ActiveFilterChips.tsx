"use client";

import { X } from "lucide-react";
import { featureFlags } from "@/lib/feature-flags";
import { Button } from "@/components/ui/button";

interface FormatFilter {
  value: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

interface AudienceFilter {
  value: string;
  label: string;
}

interface LocationOption {
  id: number;
  name: string;
}

export interface ActiveFilterChipsProps {
  selectedFormats: string[];
  selectedAudiences: string[];
  selectedLanguages: string[];
  pubdateFrom: string;
  pubdateTo: string;
  available: boolean;
  location: string;
  locations: LocationOption[] | undefined;
  formatFilters: FormatFilter[];
  audienceFilters: AudienceFilter[];
  languageLabels: Record<string, string>;
  onToggleCsvParam: (key: string, value: string) => void;
  onUpdateSearchParams: (updates: Record<string, string | null>) => void;
}

export function ActiveFilterChips({
  selectedFormats,
  selectedAudiences,
  selectedLanguages,
  pubdateFrom,
  pubdateTo,
  available,
  location,
  locations,
  formatFilters,
  audienceFilters,
  languageLabels,
  onToggleCsvParam,
  onUpdateSearchParams,
}: ActiveFilterChipsProps) {
  const hasActiveFilters =
    selectedFormats.length > 0 ||
    selectedAudiences.length > 0 ||
    selectedLanguages.length > 0 ||
    Boolean(pubdateFrom) ||
    Boolean(pubdateTo) ||
    available ||
    Boolean(location);

  if (!hasActiveFilters) return null;

  return (
    <div className="flex flex-wrap gap-2 mt-3">
      {selectedFormats.map((f) => (
        <span
          key={`format:${f}`}
          className="inline-flex items-center gap-1 px-3 py-1 bg-primary-100 text-primary-800 rounded-full text-sm"
        >
          {formatFilters.find((x) => x.value === f)?.label || f}
          <Button
            type="button"
            onClick={() => {
              if (featureFlags.opacFacetsV2) onToggleCsvParam("format", f);
              else onUpdateSearchParams({ format: null });
            }}
            variant="ghost"
            size="icon"
            className="h-4 w-4 rounded-full p-0 hover:bg-transparent hover:text-primary-900"
            aria-label={`Remove format ${f}`}
          >
            <X className="h-4 w-4" />
          </Button>
        </span>
      ))}

      {selectedAudiences.map((a) => (
        <span
          key={`audience:${a}`}
          className="inline-flex items-center gap-1 px-3 py-1 bg-primary-100 text-primary-800 rounded-full text-sm"
        >
          {audienceFilters.find((x) => x.value === a)?.label || a}
          <Button
            type="button"
            onClick={() => onToggleCsvParam("audience", a)}
            variant="ghost"
            size="icon"
            className="h-4 w-4 rounded-full p-0 hover:bg-transparent hover:text-primary-900"
            aria-label={`Remove audience ${a}`}
          >
            <X className="h-4 w-4" />
          </Button>
        </span>
      ))}

      {selectedLanguages.map((code) => (
        <span
          key={`language:${code}`}
          className="inline-flex items-center gap-1 px-3 py-1 bg-muted text-foreground/80 rounded-full text-sm"
        >
          {languageLabels[code] || code}
          <Button
            type="button"
            onClick={() => onToggleCsvParam("language", code)}
            variant="ghost"
            size="icon"
            className="h-4 w-4 rounded-full p-0 hover:bg-transparent hover:text-foreground"
            aria-label={`Remove language ${code}`}
          >
            <X className="h-4 w-4" />
          </Button>
        </span>
      ))}

      {(pubdateFrom || pubdateTo) && (
        <span className="inline-flex items-center gap-1 px-3 py-1 bg-primary-100 text-primary-800 rounded-full text-sm">
          Year {pubdateFrom || "\u2026"}\u2013{pubdateTo || "\u2026"}
          <Button
            type="button"
            onClick={() => onUpdateSearchParams({ pubdate_from: null, pubdate_to: null })}
            variant="ghost"
            size="icon"
            className="h-4 w-4 rounded-full p-0 hover:bg-transparent hover:text-primary-900"
            aria-label="Remove publication year filter"
          >
            <X className="h-4 w-4" />
          </Button>
        </span>
      )}

      {location ? (
        <span className="inline-flex items-center gap-1 px-3 py-1 bg-muted text-foreground/80 rounded-full text-sm">
          {locations?.find((l) => String(l.id) === location)?.name || `Location ${location}`}
          <Button
            type="button"
            onClick={() => onUpdateSearchParams({ location: null })}
            variant="ghost"
            size="icon"
            className="h-4 w-4 rounded-full p-0 hover:bg-transparent hover:text-foreground"
            aria-label="Remove location filter"
          >
            <X className="h-4 w-4" />
          </Button>
        </span>
      ) : null}

      {available && (
        <span className="inline-flex items-center gap-1 px-3 py-1 bg-primary-100 text-primary-800 rounded-full text-sm">
          Available now
          <Button
            type="button"
            onClick={() => onUpdateSearchParams({ available: null })}
            variant="ghost"
            size="icon"
            className="h-4 w-4 rounded-full p-0 hover:bg-transparent hover:text-primary-900"
            aria-label="Remove availability filter"
          >
            <X className="h-4 w-4" />
          </Button>
        </span>
      )}

      <Button
        type="button"
        onClick={() =>
          onUpdateSearchParams({
            format: null,
            audience: null,
            language: null,
            pubdate_from: null,
            pubdate_to: null,
            available: null,
            location: null,
          })
        }
        variant="ghost"
        size="sm"
        className="text-sm text-muted-foreground hover:text-foreground/80"
      >
        Clear all
      </Button>
    </div>
  );
}
