"use client";

import { ChevronDown, ChevronUp, Check } from "lucide-react";
import { featureFlags } from "@/lib/feature-flags";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

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

export interface SearchFiltersPanelProps {
  formatFilters: FormatFilter[];
  audienceFilters: AudienceFilter[];
  languageLabels: Record<string, string>;
  languageOptions: string[];
  facets: any;
  selectedFormats: string[];
  selectedAudiences: string[];
  selectedLanguages: string[];
  pubdateFrom: string;
  pubdateTo: string;
  available: boolean;
  location: string;
  locations: LocationOption[] | undefined;
  expandedFacets: string[];
  onToggleFacet: (facetName: string) => void;
  onToggleCsvParam: (key: string, value: string) => void;
  onUpdateSearchParams: (updates: Record<string, string | null>) => void;
  t: (key: string) => string;
}

export function SearchFiltersPanel({
  formatFilters,
  audienceFilters,
  languageLabels,
  languageOptions,
  facets,
  selectedFormats,
  selectedAudiences,
  selectedLanguages,
  pubdateFrom,
  pubdateTo,
  available,
  location,
  locations,
  expandedFacets,
  onToggleFacet,
  onToggleCsvParam,
  onUpdateSearchParams,
  t,
}: SearchFiltersPanelProps) {
  const facetToggleClass =
    "w-full justify-between px-0 py-0 text-left text-foreground hover:bg-transparent";
  const optionButtonClass = "h-auto w-full justify-start rounded-lg px-3 py-2 text-sm font-normal";

  return (
    <>
      {/* Format filter */}
      <div className="border-b border-border pb-4 mb-4">
        <Button
          type="button"
          variant="ghost"
          onClick={() => onToggleFacet("format")}
          className={facetToggleClass}
        >
          Format
          {expandedFacets.includes("format") ? (
            <ChevronUp className="h-4 w-4" />
          ) : (
            <ChevronDown className="h-4 w-4" />
          )}
        </Button>
        {expandedFacets.includes("format") ? (
          <div className="mt-3 space-y-2">
            {formatFilters.map((f) => {
              const Icon = f.icon;
              const isSelected = selectedFormats.includes(f.value);
              return (
                <Button
                  type="button"
                  variant="ghost"
                  key={f.value}
                  onClick={() => {
                    if (featureFlags.opacFacetsV2) {
                      onToggleCsvParam("format", f.value);
                    } else {
                      onUpdateSearchParams({ format: isSelected ? null : f.value });
                    }
                  }}
                  className={`${optionButtonClass} ${
                    isSelected
                      ? "bg-primary-100 text-primary-800"
                      : "hover:bg-muted/50 text-foreground/80"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {f.label}
                  {isSelected ? <Check className="h-4 w-4 ml-auto" /> : null}
                </Button>
              );
            })}
          </div>
        ) : null}
      </div>

      {/* Availability filter */}
      <div className="border-b border-border pb-4 mb-4">
        <Button
          type="button"
          variant="ghost"
          onClick={() => onToggleFacet("availability")}
          className={facetToggleClass}
        >
          Availability
          {expandedFacets.includes("availability") ? (
            <ChevronUp className="h-4 w-4" />
          ) : (
            <ChevronDown className="h-4 w-4" />
          )}
        </Button>
        {expandedFacets.includes("availability") ? (
          <div className="mt-3">
            <label htmlFor="cb-availablenow" className="flex items-center gap-2 cursor-pointer">
              <input
                id="cb-availablenow"
                type="checkbox"
                checked={available}
                onChange={(e) =>
                  onUpdateSearchParams({ available: e.target.checked ? "true" : null })
                }
                className="rounded border-border text-primary-600 focus:ring-primary-500"
              />
              <span className="text-sm text-foreground/80">{t("availableNow")}</span>
            </label>
          </div>
        ) : null}
      </div>

      {/* Location filter (if consortium) */}
      {locations && locations.length > 1 ? (
        <div className="border-b border-border pb-4 mb-4">
          <Button
            type="button"
            variant="ghost"
            onClick={() => onToggleFacet("location")}
            className={facetToggleClass}
          >
            Location
            {expandedFacets.includes("location") ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </Button>
          {expandedFacets.includes("location") ? (
            <div className="mt-3">
              <Select
                value={location || "__all__"}
                onValueChange={(value) =>
                  onUpdateSearchParams({ location: value === "__all__" ? null : value })
                }
              >
                <SelectTrigger id="t-location" className="h-10 rounded-lg bg-background text-sm">
                  <SelectValue placeholder="All Locations" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">All Locations</SelectItem>
                  {locations.map((loc) => (
                    <SelectItem key={loc.id} value={loc.id.toString()}>
                      {loc.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}
        </div>
      ) : null}

      {featureFlags.opacFacetsV2 ? (
        <>
          {/* Audience filter */}
          <div className="border-b border-border pb-4 mb-4">
            <Button
              type="button"
              variant="ghost"
              onClick={() => onToggleFacet("audience")}
              className={facetToggleClass}
            >
              Audience
              {expandedFacets.includes("audience") ? (
                <ChevronUp className="h-4 w-4" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )}
            </Button>
            {expandedFacets.includes("audience") ? (
              <div className="mt-3 space-y-2">
                {audienceFilters.map((a) => {
                  const isSelected = selectedAudiences.includes(a.value);
                  return (
                    <Button
                      key={a.value}
                      type="button"
                      variant="ghost"
                      onClick={() => onToggleCsvParam("audience", a.value)}
                      className={`${optionButtonClass} ${
                        isSelected
                          ? "bg-primary-100 text-primary-800"
                          : "hover:bg-muted/50 text-foreground/80"
                      }`}
                    >
                      {a.label}
                      {isSelected ? <Check className="h-4 w-4 ml-auto" /> : null}
                    </Button>
                  );
                })}
              </div>
            ) : null}
          </div>

          {/* Language filter */}
          <div className="border-b border-border pb-4 mb-4">
            <Button
              type="button"
              variant="ghost"
              onClick={() => onToggleFacet("language")}
              className={facetToggleClass}
            >
              Language
              {expandedFacets.includes("language") ? (
                <ChevronUp className="h-4 w-4" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )}
            </Button>
            {expandedFacets.includes("language") ? (
              <div className="mt-3 space-y-2">
                {languageOptions.map((code) => {
                  const isSelected = selectedLanguages.includes(code);
                  const count =
                    facets?.languages && typeof facets.languages === "object"
                      ? (facets.languages as Record<string, number>)[code] ||
                        (facets.languages as Record<string, number>)[code.toUpperCase()]
                      : null;
                  return (
                    <Button
                      key={code}
                      type="button"
                      variant="ghost"
                      onClick={() => onToggleCsvParam("language", code)}
                      className={`${optionButtonClass} ${
                        isSelected
                          ? "bg-primary-100 text-primary-800"
                          : "hover:bg-muted/50 text-foreground/80"
                      }`}
                    >
                      <span className="min-w-0 flex-1 truncate">
                        {languageLabels[code] || code}
                      </span>
                      {typeof count === "number" ? (
                        <span className="text-xs text-muted-foreground tabular-nums">{count}</span>
                      ) : null}
                      {isSelected ? <Check className="h-4 w-4" /> : null}
                    </Button>
                  );
                })}
              </div>
            ) : null}
          </div>

          {/* Publication year */}
          <div className="border-b border-border pb-4 mb-4">
            <Button
              type="button"
              variant="ghost"
              onClick={() => onToggleFacet("pubdate")}
              className={facetToggleClass}
            >
              Publication year
              {expandedFacets.includes("pubdate") ? (
                <ChevronUp className="h-4 w-4" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )}
            </Button>
            {expandedFacets.includes("pubdate") ? (
              <div className="mt-3 grid grid-cols-2 gap-2">
                <div>
                  <label htmlFor="t-from" className="block text-xs text-muted-foreground mb-1">
                    {t("from")}
                  </label>
                  <Input
                    id="t-from"
                    type="number"
                    inputMode="numeric"
                    value={pubdateFrom}
                    onChange={(e) => onUpdateSearchParams({ pubdate_from: e.target.value || null })}
                    className="h-9 rounded-lg bg-background px-3 text-sm"
                    placeholder="e.g. 2000"
                  />
                </div>
                <div>
                  <label htmlFor="t-to" className="block text-xs text-muted-foreground mb-1">
                    {t("to")}
                  </label>
                  <Input
                    id="t-to"
                    type="number"
                    inputMode="numeric"
                    value={pubdateTo}
                    onChange={(e) => onUpdateSearchParams({ pubdate_to: e.target.value || null })}
                    className="h-9 rounded-lg bg-background px-3 text-sm"
                    placeholder="e.g. 2026"
                  />
                </div>
              </div>
            ) : null}
          </div>
        </>
      ) : null}
    </>
  );
}
