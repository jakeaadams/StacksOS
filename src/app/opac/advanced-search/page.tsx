"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Search, BookOpen, User, Tag, Hash, Filter, X, Plus, ArrowLeft } from "lucide-react";
import { useTranslations } from "next-intl";

interface SearchField {
  id: string;
  type: string;
  value: string;
  operator: "AND" | "OR" | "NOT";
}

function getSEARCH_TYPES(t: (key: string) => string) {
  return [
    { value: "keyword", label: t("keyword"), icon: Search },
    { value: "title", label: t("titleField"), icon: BookOpen },
    { value: "author", label: t("author"), icon: User },
    { value: "subject", label: t("subject"), icon: Tag },
    { value: "series", label: t("series"), icon: BookOpen },
    { value: "isbn", label: t("isbnField"), icon: Hash },
  ];
}

function getFORMATS(t: (key: string) => string) {
  return [
    { value: "", label: t("allFormats") },
    { value: "book", label: t("books") },
    { value: "large_print", label: t("largePrint") },
    { value: "ebook", label: t("eBooks") },
    { value: "audiobook", label: t("audiobooks") },
    { value: "dvd", label: t("dvds") },
    { value: "bluray", label: t("bluray") },
    { value: "music", label: t("musicCDs") },
    { value: "magazine", label: t("magazines") },
  ];
}

function getAUDIENCES(t: (key: string) => string) {
  return [
    { value: "", label: t("allAudiences") },
    { value: "adult", label: t("adult") },
    { value: "young_adult", label: t("youngAdult") },
    { value: "juvenile", label: t("children") },
  ];
}

function getLANGUAGES(t: (key: string) => string) {
  return [
    { value: "", label: t("allLanguages") },
    { value: "eng", label: "English" },
    { value: "spa", label: "Spanish" },
    { value: "fre", label: "French" },
    { value: "ger", label: "German" },
    { value: "chi", label: "Chinese" },
    { value: "jpn", label: "Japanese" },
    { value: "kor", label: "Korean" },
    { value: "vie", label: "Vietnamese" },
    { value: "rus", label: "Russian" },
    { value: "ara", label: "Arabic" },
  ];
}

export default function AdvancedSearchPage() {
  const t = useTranslations("advancedSearch");
  const SEARCH_TYPES = getSEARCH_TYPES(t);
  const FORMATS = getFORMATS(t);
  const AUDIENCES = getAUDIENCES(t);
  const LANGUAGES = getLANGUAGES(t);
  const router = useRouter();

  const [searchFields, setSearchFields] = useState<SearchField[]>([
    { id: "1", type: "keyword", value: "", operator: "AND" },
  ]);

  const [filters, setFilters] = useState({
    format: "",
    audience: "",
    language: "",
    yearFrom: "",
    yearTo: "",
    availableOnly: false,
  });

  const addSearchField = () => {
    setSearchFields([
      ...searchFields,
      { id: Date.now().toString(), type: "keyword", value: "", operator: "AND" },
    ]);
  };

  const removeSearchField = (id: string) => {
    if (searchFields.length > 1) {
      setSearchFields(searchFields.filter((f) => f.id !== id));
    }
  };

  const updateSearchField = (id: string, updates: Partial<SearchField>) => {
    setSearchFields(searchFields.map((f) => (f.id === id ? { ...f, ...updates } : f)));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    // Build query string
    const queryParts: string[] = [];

    searchFields.forEach((field, index) => {
      if (field.value.trim()) {
        const prefix = index > 0 ? ` ${field.operator} ` : "";
        if (field.type === "keyword") {
          queryParts.push(`${prefix}${field.value}`);
        } else {
          queryParts.push(`${prefix}${field.type}:${field.value}`);
        }
      }
    });

    if (queryParts.length === 0) {
      return;
    }

    const params = new URLSearchParams();
    params.set("q", queryParts.join(""));

    if (filters.format) params.set("format", filters.format);
    if (filters.audience) params.set("audience", filters.audience);
    if (filters.language) params.set("language", filters.language);
    if (filters.yearFrom) params.set("year_from", filters.yearFrom);
    if (filters.yearTo) params.set("year_to", filters.yearTo);
    if (filters.availableOnly) params.set("available", "true");

    router.push(`/opac/search?${params.toString()}`);
  };

  const handleClear = () => {
    setSearchFields([{ id: "1", type: "keyword", value: "", operator: "AND" }]);
    setFilters({
      format: "",
      audience: "",
      language: "",
      yearFrom: "",
      yearTo: "",
      availableOnly: false,
    });
  };

  return (
    <div className="min-h-screen bg-muted/30">
      {/* Header */}
      <div className="bg-card border-b">
        <div className="max-w-3xl mx-auto px-4 py-8">
          <Link
            href="/opac/search"
            className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground mb-4"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to simple search
          </Link>
          <h1 className="text-3xl font-bold text-foreground">Advanced Search</h1>
          <p className="mt-2 text-muted-foreground">
            Build a precise search with multiple criteria and filters.
          </p>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-8">
        <form onSubmit={handleSubmit}>
          {/* Search Fields */}
          <div className="bg-card rounded-xl border border-border p-6 mb-6">
            <h2 className="text-lg font-semibold text-foreground mb-4">Search Terms</h2>

            <div className="space-y-4">
              {searchFields.map((field, index) => (
                <div key={field.id} className="flex items-start gap-3">
                  {/* Operator (for fields after the first) */}
                  {index > 0 && (
                    <Select
                      value={field.operator}
                      onValueChange={(value) =>
                        updateSearchField(field.id, { operator: value as "AND" | "OR" | "NOT" })
                      }
                    >
                      <SelectTrigger className="h-10 w-20 rounded-lg text-sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="AND">AND</SelectItem>
                        <SelectItem value="OR">OR</SelectItem>
                        <SelectItem value="NOT">NOT</SelectItem>
                      </SelectContent>
                    </Select>
                  )}

                  {/* Search type dropdown */}
                  <Select
                    value={field.type}
                    onValueChange={(value) => updateSearchField(field.id, { type: value })}
                  >
                    <SelectTrigger className="h-10 w-40 rounded-lg text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {SEARCH_TYPES.map((type) => (
                        <SelectItem key={type.value} value={type.value}>
                          {type.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  {/* Search input */}
                  <Input
                    type="text"
                    value={field.value}
                    onChange={(e) => updateSearchField(field.id, { value: e.target.value })}
                    placeholder={`Enter ${field.type}...`}
                    className="h-10 flex-1 rounded-lg px-4"
                  />

                  {/* Remove button */}
                  {searchFields.length > 1 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => removeSearchField(field.id)}
                      className="h-10 w-10 text-muted-foreground/70 hover:bg-red-50 hover:text-red-600"
                    >
                      <X className="h-5 w-5" />
                    </Button>
                  )}
                </div>
              ))}
            </div>

            <Button
              type="button"
              variant="ghost"
              onClick={addSearchField}
              className="mt-4 inline-flex h-9 items-center gap-2 rounded-lg px-4 text-sm text-primary-600 hover:bg-primary-50"
            >
              <Plus className="h-4 w-4" />
              Add another search term
            </Button>
          </div>

          {/* Filters */}
          <div className="bg-card rounded-xl border border-border p-6 mb-6">
            <h2 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
              <Filter className="h-5 w-5" />
              Filters
            </h2>

            <div className="grid md:grid-cols-2 gap-4">
              {/* Format */}
              <div>
                <label
                  htmlFor="format"
                  className="block text-sm font-medium text-foreground/80 mb-1"
                >
                  Format
                </label>
                <Select
                  value={filters.format || "__all__"}
                  onValueChange={(value) =>
                    setFilters({ ...filters, format: value === "__all__" ? "" : value })
                  }
                >
                  <SelectTrigger id="format" className="h-10 rounded-lg">
                    <SelectValue placeholder="All formats" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">All formats</SelectItem>
                    {FORMATS.filter((format) => format.value).map((format) => (
                      <SelectItem key={format.value} value={format.value}>
                        {format.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Audience */}
              <div>
                <label
                  htmlFor="audience"
                  className="block text-sm font-medium text-foreground/80 mb-1"
                >
                  Audience
                </label>
                <Select
                  value={filters.audience || "__all__"}
                  onValueChange={(value) =>
                    setFilters({ ...filters, audience: value === "__all__" ? "" : value })
                  }
                >
                  <SelectTrigger id="audience" className="h-10 rounded-lg">
                    <SelectValue placeholder="All audiences" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">All audiences</SelectItem>
                    {AUDIENCES.filter((audience) => audience.value).map((audience) => (
                      <SelectItem key={audience.value} value={audience.value}>
                        {audience.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Language */}
              <div>
                <label
                  htmlFor="language"
                  className="block text-sm font-medium text-foreground/80 mb-1"
                >
                  Language
                </label>
                <Select
                  value={filters.language || "__all__"}
                  onValueChange={(value) =>
                    setFilters({ ...filters, language: value === "__all__" ? "" : value })
                  }
                >
                  <SelectTrigger id="language" className="h-10 rounded-lg">
                    <SelectValue placeholder="All languages" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">All languages</SelectItem>
                    {LANGUAGES.filter((lang) => lang.value).map((lang) => (
                      <SelectItem key={lang.value} value={lang.value}>
                        {lang.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Publication Year */}
              <div>
                <label
                  htmlFor="publication-year"
                  className="block text-sm font-medium text-foreground/80 mb-1"
                >
                  Publication Year
                </label>
                <div className="flex items-center gap-2">
                  <Input
                    id="publication-year"
                    type="number"
                    value={filters.yearFrom}
                    onChange={(e) => setFilters({ ...filters, yearFrom: e.target.value })}
                    placeholder="From"
                    min="1800"
                    max="2030"
                    className="h-10 flex-1 rounded-lg px-3"
                  />
                  <span className="text-muted-foreground">to</span>
                  <Input
                    type="number"
                    value={filters.yearTo}
                    onChange={(e) => setFilters({ ...filters, yearTo: e.target.value })}
                    placeholder="To"
                    min="1800"
                    max="2030"
                    className="h-10 flex-1 rounded-lg px-3"
                  />
                </div>
              </div>
            </div>

            {/* Available only checkbox */}
            <label
              htmlFor="show-only-items-currently-available"
              className="flex items-center gap-2 mt-4 cursor-pointer"
            >
              <input
                type="checkbox"
                checked={filters.availableOnly}
                onChange={(e) => setFilters({ ...filters, availableOnly: e.target.checked })}
                className="rounded border-border text-primary-600 focus:ring-primary-500"
              />
              <span className="text-sm text-foreground/80">
                Show only items currently available
              </span>
            </label>
          </div>

          {/* Action buttons */}
          <div className="flex gap-4">
            <Button type="submit" className="flex-1 items-center justify-center gap-2">
              <Search className="h-5 w-5" />
              Search
            </Button>
            <Button type="button" variant="outline" onClick={handleClear} className="px-6">
              Clear
            </Button>
          </div>
        </form>

        {/* Search tips */}
        <div className="mt-8 bg-blue-50 rounded-xl p-6">
          <h3 className="font-semibold text-blue-900 mb-2">Search Tips</h3>
          <ul className="text-sm text-blue-800 space-y-1">
            <li>• Use AND to find items containing all terms</li>
            <li>• Use OR to find items containing any of the terms</li>
            <li>• Use NOT to exclude terms from your search</li>
            <li>• Put phrases in quotes for exact matches: {`"harry potter"`}</li>
            <li>• Use * as a wildcard: garden* finds garden, gardening, gardens</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
