"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Search,
  BookOpen,
  User,
  Tag,
  Hash,
  Filter,
  X,
  Plus,
  ArrowLeft,
} from "lucide-react";

interface SearchField {
  id: string;
  type: string;
  value: string;
  operator: "AND" | "OR" | "NOT";
}

const SEARCH_TYPES = [
  { value: "keyword", label: "Keyword", icon: Search },
  { value: "title", label: "Title", icon: BookOpen },
  { value: "author", label: "Author", icon: User },
  { value: "subject", label: "Subject", icon: Tag },
  { value: "series", label: "Series", icon: BookOpen },
  { value: "isbn", label: "ISBN", icon: Hash },
];

const FORMATS = [
  { value: "", label: "All Formats" },
  { value: "book", label: "Books" },
  { value: "large_print", label: "Large Print" },
  { value: "ebook", label: "eBooks" },
  { value: "audiobook", label: "Audiobooks" },
  { value: "dvd", label: "DVDs" },
  { value: "bluray", label: "Blu-ray" },
  { value: "music", label: "Music CDs" },
  { value: "magazine", label: "Magazines" },
];

const AUDIENCES = [
  { value: "", label: "All Audiences" },
  { value: "adult", label: "Adult" },
  { value: "young_adult", label: "Young Adult" },
  { value: "juvenile", label: "Children" },
];

const LANGUAGES = [
  { value: "", label: "All Languages" },
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

export default function AdvancedSearchPage() {
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
    setSearchFields(
      searchFields.map((f) => (f.id === id ? { ...f, ...updates } : f))
    );
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
      <div className="bg-white border-b">
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
          <div className="bg-white rounded-xl border border-border p-6 mb-6">
            <h2 className="text-lg font-semibold text-foreground mb-4">Search Terms</h2>
            
            <div className="space-y-4">
              {searchFields.map((field, index) => (
                <div key={field.id} className="flex items-start gap-3">
                  {/* Operator (for fields after the first) */}
                  {index > 0 && (
                    <select
                      value={field.operator}
                      onChange={(e) => updateSearchField(field.id, { operator: e.target.value as "AND" | "OR" | "NOT" })}
                      className="w-20 px-2 py-2 border border-border rounded-lg text-sm focus:outline-none 
                               focus:ring-2 focus:ring-primary-500"
                    >
                      <option value="AND">AND</option>
                      <option value="OR">OR</option>
                      <option value="NOT">NOT</option>
                    </select>
                  )}
                  
                  {/* Search type dropdown */}
                  <select
                    value={field.type}
                    onChange={(e) => updateSearchField(field.id, { type: e.target.value })}
                    className="w-32 px-3 py-2 border border-border rounded-lg text-sm focus:outline-none 
                             focus:ring-2 focus:ring-primary-500"
                  >
                    {SEARCH_TYPES.map((type) => (
                      <option key={type.value} value={type.value}>
                        {type.label}
                      </option>
                    ))}
                  </select>
                  
                  {/* Search input */}
                  <input
                    type="text"
                    value={field.value}
                    onChange={(e) => updateSearchField(field.id, { value: e.target.value })}
                    placeholder={`Enter ${field.type}...`}
                    className="flex-1 px-4 py-2 border border-border rounded-lg focus:outline-none 
                             focus:ring-2 focus:ring-primary-500"
                  />
                  
                  {/* Remove button */}
                  {searchFields.length > 1 && (
                    <button type="button"

                      onClick={() => removeSearchField(field.id)}
                      className="p-2 text-muted-foreground/70 hover:text-red-600 transition-colors"
                    >
                      <X className="h-5 w-5" />
                    </button>
                  )}
                </div>
              ))}
            </div>

            <button type="button"
              onClick={addSearchField}
              className="mt-4 inline-flex items-center gap-2 px-4 py-2 text-sm text-primary-600 
                       hover:bg-primary-50 rounded-lg transition-colors"
            >
              <Plus className="h-4 w-4" />
              Add another search term
            </button>
          </div>

          {/* Filters */}
          <div className="bg-white rounded-xl border border-border p-6 mb-6">
            <h2 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
              <Filter className="h-5 w-5" />
              Filters
            </h2>
            
            <div className="grid md:grid-cols-2 gap-4">
              {/* Format */}
              <div>
                <label className="block text-sm font-medium text-foreground/80 mb-1">
                  Format
                </label>
                <select
                  value={filters.format}
                  onChange={(e) => setFilters({ ...filters, format: e.target.value })}
                  className="w-full px-3 py-2 border border-border rounded-lg focus:outline-none 
                           focus:ring-2 focus:ring-primary-500"
                >
                  {FORMATS.map((format) => (
                    <option key={format.value} value={format.value}>
                      {format.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Audience */}
              <div>
                <label className="block text-sm font-medium text-foreground/80 mb-1">
                  Audience
                </label>
                <select
                  value={filters.audience}
                  onChange={(e) => setFilters({ ...filters, audience: e.target.value })}
                  className="w-full px-3 py-2 border border-border rounded-lg focus:outline-none 
                           focus:ring-2 focus:ring-primary-500"
                >
                  {AUDIENCES.map((audience) => (
                    <option key={audience.value} value={audience.value}>
                      {audience.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Language */}
              <div>
                <label className="block text-sm font-medium text-foreground/80 mb-1">
                  Language
                </label>
                <select
                  value={filters.language}
                  onChange={(e) => setFilters({ ...filters, language: e.target.value })}
                  className="w-full px-3 py-2 border border-border rounded-lg focus:outline-none 
                           focus:ring-2 focus:ring-primary-500"
                >
                  {LANGUAGES.map((lang) => (
                    <option key={lang.value} value={lang.value}>
                      {lang.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Publication Year */}
              <div>
                <label className="block text-sm font-medium text-foreground/80 mb-1">
                  Publication Year
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    value={filters.yearFrom}
                    onChange={(e) => setFilters({ ...filters, yearFrom: e.target.value })}
                    placeholder="From"
                    min="1800"
                    max="2030"
                    className="flex-1 px-3 py-2 border border-border rounded-lg focus:outline-none 
                             focus:ring-2 focus:ring-primary-500"
                  />
                  <span className="text-muted-foreground">to</span>
                  <input
                    type="number"
                    value={filters.yearTo}
                    onChange={(e) => setFilters({ ...filters, yearTo: e.target.value })}
                    placeholder="To"
                    min="1800"
                    max="2030"
                    className="flex-1 px-3 py-2 border border-border rounded-lg focus:outline-none 
                             focus:ring-2 focus:ring-primary-500"
                  />
                </div>
              </div>
            </div>

            {/* Available only checkbox */}
            <label className="flex items-center gap-2 mt-4 cursor-pointer">
              <input
                type="checkbox"
                checked={filters.availableOnly}
                onChange={(e) => setFilters({ ...filters, availableOnly: e.target.checked })}
                className="rounded border-border text-primary-600 focus:ring-primary-500"
              />
              <span className="text-sm text-foreground/80">Show only items currently available</span>
            </label>
          </div>

          {/* Action buttons */}
          <div className="flex gap-4">
            <button type="submit"
              className="flex-1 py-3 bg-primary-600 text-white rounded-lg font-medium
                       hover:bg-primary-700 transition-colors flex items-center justify-center gap-2"
            >
              <Search className="h-5 w-5" />
              Search
            </button>
            <button type="button"
              onClick={handleClear}
              className="px-6 py-3 border border-border text-foreground/80 rounded-lg font-medium
                       hover:bg-muted/30 transition-colors"
            >
              Clear
            </button>
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
