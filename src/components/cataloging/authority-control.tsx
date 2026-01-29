"use client";

import * as React from "react";
import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { clientLogger } from "@/lib/client-logger";
import {
  Search,
  CheckCircle,
  ExternalLink,
  Loader2,
  Link as LinkIcon,
  Unlink,
  Globe,
  BookOpen,
  User,
  Tag,
  AlertTriangle,
} from "lucide-react";

interface AuthorityRecord {
  id: string;
  source: "lc" | "viaf" | "local";
  heading: string;
  variants?: string[];
  uri?: string;
  type: "personal" | "corporate" | "subject" | "geographic" | "genre";
}

interface AuthorityLinkProps {
  marcTag: string;
  currentValue: string;
  fieldType: "author" | "subject" | "series";
  onLink: (authority: AuthorityRecord) => void;
  onUnlink: () => void;
  linkedAuthority?: AuthorityRecord | null;
}

const TYPE_ICONS: Record<string, React.ComponentType<{className?: string}>> = {
  personal: User,
  corporate: BookOpen,
  subject: Tag,
  geographic: Globe,
  genre: Tag,
};

/**
 * Search Library of Congress authorities via their public API
 * https://id.loc.gov/
 */
async function searchLC(query: string, type: string): Promise<AuthorityRecord[]> {
  try {
    // Determine which LC vocabulary to search based on type
    const scheme = type === "author" ? "names" : type === "subject" ? "subjects" : "names";
    
    // LC API endpoint for suggest/autocomplete
    const url = `https://id.loc.gov/authorities/${scheme}/suggest2?q=${encodeURIComponent(query)}&count=10`;
    
    const response = await fetch(url, {
      headers: { "Accept": "application/json" },
    });

    if (!response.ok) {
      clientLogger.warn("LC API error:", response.status);
      return [];
    }

    const data = await response.json();
    
    // Parse LC suggest2 response format
    if (!data.hits || !Array.isArray(data.hits)) {
      return [];
    }

    return data.hits.map((hit: any) => ({
      id: `lc-${hit.uri?.split("/").pop() || Date.now()}`,
      source: "lc" as const,
      heading: hit.aLabel || hit.suggestLabel || query,
      variants: hit.vLabel ? [hit.vLabel] : [],
      uri: hit.uri || `https://id.loc.gov/authorities/${scheme}/${encodeURIComponent(query)}`,
      type: type === "author" ? "personal" : "subject",
    }));
  } catch (err) {
    clientLogger.error("LC search error:", err);
    return [];
  }
}

/**
 * Search VIAF (Virtual International Authority File) via their public API
 * https://viaf.org/
 */
async function searchVIAF(query: string, type: string): Promise<AuthorityRecord[]> {
  try {
    // VIAF AutoSuggest API
    // Using JSONP-style callback for CORS, but we can also use their JSON API
    const searchType = type === "author" ? "personalNames" : type === "subject" ? "uniformTitleWorks" : "all";
    
    const url = `https://viaf.org/viaf/AutoSuggest?query=${encodeURIComponent(query)}`;
    
    const response = await fetch(url, {
      headers: { "Accept": "application/json" },
    });

    if (!response.ok) {
      clientLogger.warn("VIAF API error:", response.status);
      return [];
    }

    const data = await response.json();
    
    // Parse VIAF response
    if (!data.result || !Array.isArray(data.result)) {
      return [];
    }

    return data.result.slice(0, 10).map((item: any) => ({
      id: `viaf-${item.viafid || Date.now()}`,
      source: "viaf" as const,
      heading: item.displayForm || item.term || query,
      variants: [],
      uri: item.viafid ? `https://viaf.org/viaf/${item.viafid}` : undefined,
      type: item.nametype === "personal" ? "personal" : 
            item.nametype === "corporate" ? "corporate" : 
            type === "author" ? "personal" : "subject",
    }));
  } catch (err) {
    clientLogger.error("VIAF search error:", err);
    return [];
  }
}

export function AuthorityLink({
  marcTag,
  currentValue,
  fieldType,
  onLink,
  onUnlink,
  linkedAuthority,
}: AuthorityLinkProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState(currentValue);
  const [isSearching, setIsSearching] = useState(false);
  const [results, setResults] = useState<AuthorityRecord[]>([]);
  const [selectedSource, setSelectedSource] = useState<"lc" | "viaf" | "all">("all");
  const [searchError, setSearchError] = useState<string | null>(null);

  const searchAuthorities = useCallback(async () => {
    if (!searchQuery.trim()) return;
    
    setIsSearching(true);
    setResults([]);
    setSearchError(null);

    try {
      // Search both LC and VIAF in parallel
      const [lcResults, viafResults] = await Promise.all([
        selectedSource !== "viaf" ? searchLC(searchQuery, fieldType) : Promise.resolve([]),
        selectedSource !== "lc" ? searchVIAF(searchQuery, fieldType) : Promise.resolve([]),
      ]);
      
      const combined = [...lcResults, ...viafResults];
      
      // Sort by relevance (exact matches first)
      combined.sort((a, b) => {
        const aExact = a.heading.toLowerCase() === searchQuery.toLowerCase();
        const bExact = b.heading.toLowerCase() === searchQuery.toLowerCase();
        if (aExact && !bExact) return -1;
        if (!aExact && bExact) return 1;
        return 0;
      });
      
      setResults(combined);
      
      if (combined.length === 0) {
        toast.info("No matching authorities found", {
          description: "Try a different search term or check the spelling",
        });
      }
    } catch (err) {
      clientLogger.error("Authority search failed:", err);
      setSearchError("Search failed. Please try again.");
      toast.error("Search failed. Please try again.");
    } finally {
      setIsSearching(false);
    }
  }, [searchQuery, fieldType, selectedSource]);

  const handleLink = (authority: AuthorityRecord) => {
    onLink(authority);
    setIsOpen(false);
    toast.success("Authority linked", {
      description: authority.heading,
    });
  };

  return (
    <div className="flex items-center gap-2">
      {linkedAuthority ? (
        <div className="flex items-center gap-2 px-3 py-1.5 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
          <CheckCircle className="h-4 w-4 text-green-600" />
          <span className="text-sm font-medium">{linkedAuthority.heading}</span>
          <Badge variant="outline" className="text-xs">
            {linkedAuthority.source.toUpperCase()}
          </Badge>
          {linkedAuthority.uri && (
            <a href={linkedAuthority.uri} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          )}
          <Button variant="ghost" size="sm" className="h-6 px-2" onClick={onUnlink}>
            <Unlink className="h-3.5 w-3.5" />
          </Button>
        </div>
      ) : (
        <Button variant="outline" size="sm" onClick={() => setIsOpen(true)}>
          <LinkIcon className="h-4 w-4 mr-2" />
          Link Authority
        </Button>
      )}

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Globe className="h-5 w-5" />
              Link to Authority Record
            </DialogTitle>
            <DialogDescription>
              Search Library of Congress or VIAF for matching authority records.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="flex gap-2">
              <Input
                placeholder="Search authorities..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && searchAuthorities()}
                className="flex-1"
              />
              <div className="flex rounded-lg border overflow-hidden">
                <Button 
                  variant={selectedSource === "all" ? "default" : "ghost"} 
                  size="sm" 
                  className="rounded-none" 
                  onClick={() => setSelectedSource("all")}
                >
                  All
                </Button>
                <Button 
                  variant={selectedSource === "lc" ? "default" : "ghost"} 
                  size="sm" 
                  className="rounded-none" 
                  onClick={() => setSelectedSource("lc")}
                >
                  LC
                </Button>
                <Button 
                  variant={selectedSource === "viaf" ? "default" : "ghost"} 
                  size="sm" 
                  className="rounded-none" 
                  onClick={() => setSelectedSource("viaf")}
                >
                  VIAF
                </Button>
              </div>
              <Button onClick={searchAuthorities} disabled={isSearching}>
                {isSearching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              </Button>
            </div>

            <ScrollArea className="h-80 border rounded-lg">
              {searchError ? (
                <div className="p-8 text-center text-destructive">
                  <AlertTriangle className="h-8 w-8 mx-auto mb-2" />
                  <p>{searchError}</p>
                </div>
              ) : results.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground">
                  {isSearching ? (
                    <div className="flex flex-col items-center gap-2">
                      <Loader2 className="h-8 w-8 animate-spin" />
                      <p>Searching LC and VIAF...</p>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-2">
                      <Globe className="h-8 w-8 opacity-50" />
                      <p>Enter a search term to find authority records</p>
                      <p className="text-xs">Results from Library of Congress and VIAF</p>
                    </div>
                  )}
                </div>
              ) : (
                <div className="divide-y">
                  {results.map((auth) => {
                    const TypeIcon = TYPE_ICONS[auth.type] || Tag;
                    return (
                      <div 
                        key={auth.id} 
                        className="p-4 hover:bg-muted/50 cursor-pointer transition-colors" 
                        onClick={() => handleLink(auth)}
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex items-start gap-3">
                            <TypeIcon className="h-4 w-4 text-muted-foreground mt-0.5" />
                            <div>
                              <p className="font-medium">{auth.heading}</p>
                              {auth.variants && auth.variants.length > 0 && (
                                <p className="text-sm text-muted-foreground">
                                  Also: {auth.variants.slice(0, 3).join("; ")}
                                </p>
                              )}
                              {auth.uri && (
                                <p className="text-xs text-muted-foreground truncate max-w-md">
                                  {auth.uri}
                                </p>
                              )}
                            </div>
                          </div>
                          <Badge 
                            variant="outline" 
                            className={auth.source === "lc" ? "bg-blue-50 text-blue-700" : "bg-purple-50 text-purple-700"}
                          >
                            {auth.source.toUpperCase()}
                          </Badge>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </ScrollArea>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsOpen(false)}>Cancel</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function AuthorityValidation({ unlinkedCount }: { unlinkedCount: number }) {
  if (unlinkedCount === 0) {
    return (
      <div className="flex items-center gap-2 p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
        <CheckCircle className="h-5 w-5 text-green-600" />
        <span className="text-sm font-medium text-green-700 dark:text-green-400">All headings linked to authorities</span>
      </div>
    );
  }

  return (
    <div className="p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
      <div className="flex items-center gap-2">
        <AlertTriangle className="h-5 w-5 text-amber-600" />
        <span className="text-sm font-medium text-amber-700 dark:text-amber-400">
          {unlinkedCount} heading{unlinkedCount !== 1 ? "s" : ""} not linked to authorities
        </span>
      </div>
    </div>
  );
}

export default AuthorityLink;
