"use client";
import { fetchWithAuth } from "@/lib/client-fetch";
import { clientLogger } from "@/lib/client-logger";

import * as React from "react";
import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Loader2, Upload, ExternalLink, Check, ImageOff } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";

export interface CoverArtPickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isbn?: string;
  title: string;
  author?: string;
  recordId: number;
  currentCoverUrl?: string;
  onCoverSelected: (url: string, source: string) => void;
}

interface CoverOption {
  url: string;
  source: string;
  thumbnail: string;
  provider: "openlibrary" | "google" | "custom" | "current";
}

function getCoverProviderOrder(): CoverOption["provider"][] {
  const raw = String(process.env.NEXT_PUBLIC_STACKSOS_COVER_PROVIDER_ORDER || "").trim();
  if (!raw) return ["current", "openlibrary", "google", "custom"];

  const normalized = raw
    .split(",")
    .map((p) => p.trim().toLowerCase())
    .filter(Boolean);

  const supported = new Set<CoverOption["provider"]>(["current", "openlibrary", "google", "custom"]);
  const ordered = normalized
    .filter((p): p is CoverOption["provider"] => supported.has(p as CoverOption["provider"]));

  // Ensure all providers exist in the list (preserve configured order first).
  for (const p of ["current", "openlibrary", "google", "custom"] as const) {
    if (!ordered.includes(p)) ordered.push(p);
  }

  return ordered;
}

export function CoverArtPicker({
  open,
  onOpenChange,
  isbn,
  title,
  author,
  recordId,
  currentCoverUrl,
  onCoverSelected,
}: CoverArtPickerProps) {
  const [covers, setCovers] = useState<CoverOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [customUrl, setCustomUrl] = useState("");
  const [selectedCover, setSelectedCover] = useState<CoverOption | null>(null);
  const [uploadFile, setUploadFile] = useState<File | null>(null);

  useEffect(() => {
    if (open) {
      fetchCoverOptions();
    }
  }, [open, isbn, title, author]);

  const fetchCoverOptions = async () => {
    setLoading(true);
    const options: CoverOption[] = [];
    const providerOrder = getCoverProviderOrder();
    const rank = (provider: CoverOption["provider"]) => {
      const idx = providerOrder.indexOf(provider);
      return idx === -1 ? providerOrder.length : idx;
    };

    try {
      const cleanIsbn = isbn ? isbn.replace(/[^0-9X]/gi, "") : "";

      // Add current cover if exists
      if (currentCoverUrl) {
        options.push({
          url: currentCoverUrl,
          source: "Current Cover",
          thumbnail: currentCoverUrl,
          provider: "current",
        });
      }

      // OpenLibrary covers (multiple sizes/editions)
      if (cleanIsbn) {
        // Try ISBN-13
        options.push({
          url: `https://covers.openlibrary.org/b/isbn/${cleanIsbn}-L.jpg`,
          source: "OpenLibrary (ISBN)",
          thumbnail: `https://covers.openlibrary.org/b/isbn/${cleanIsbn}-M.jpg`,
          provider: "openlibrary",
        });

        // Try ISBN-10 if applicable (convert)
        if (cleanIsbn.length === 13 && cleanIsbn.startsWith("978")) {
          const isbn10 = convertToISBN10(cleanIsbn);
          if (isbn10) {
            options.push({
              url: `https://covers.openlibrary.org/b/isbn/${isbn10}-L.jpg`,
              source: "OpenLibrary (ISBN-10)",
              thumbnail: `https://covers.openlibrary.org/b/isbn/${isbn10}-M.jpg`,
              provider: "openlibrary",
            });
          }
        }
      }

      // Google Books API
      if (cleanIsbn || title) {
        try {
          const googleQueryByTitle =
            title?.trim()
              ? `intitle:${title}${author?.trim() ? ` inauthor:${author}` : ""}`
              : "";

          const fetchGoogle = async (q: string) => {
            const params = new URLSearchParams({ q, maxResults: "10" });
            const response = await fetch(`/api/google-books?${params.toString()}`);
            return response.json().catch(() => null);
          };

          // Prefer ISBN lookup, but Google Books often lacks/normalizes ISBNs for
          // specific editions. Fallback to title/author search when ISBN returns nothing.
          const primaryQuery = cleanIsbn ? `isbn:${cleanIsbn}` : googleQueryByTitle;
          const primary = primaryQuery ? await fetchGoogle(primaryQuery) : null;
          const primaryItems = primary?.ok && Array.isArray(primary.items) ? primary.items : [];

          const fallback =
            cleanIsbn && primaryItems.length === 0 && googleQueryByTitle
              ? await fetchGoogle(googleQueryByTitle)
              : null;
          const fallbackItems =
            fallback?.ok && Array.isArray(fallback.items) ? fallback.items : [];

          const allItems = [...primaryItems, ...fallbackItems];

          allItems.forEach((item: any, idx: number) => {
            const imageUrl = item.image || item.thumbnail;
            const thumbnailUrl = item.thumbnail || item.image;
            if (!imageUrl || !thumbnailUrl) return;

            options.push({
              url: imageUrl,
              source: item.title ? `Google Books — ${item.title}` : `Google Books ${idx + 1}`,
              thumbnail: thumbnailUrl,
              provider: "google",
            });
          });
        } catch (err) {
          clientLogger.error("Google Books API error:", err);
        }
      }

      // Remove duplicates by URL
      const uniqueCovers = options.filter(
        (cover, index, self) =>
          index === self.findIndex((c) => c.thumbnail === cover.thumbnail)
      ).map((cover, index) => ({ cover, index }))
        .sort((a, b) => rank(a.cover.provider) - rank(b.cover.provider) || a.index - b.index)
        .map(({ cover }) => cover);

      setCovers(uniqueCovers);
    } catch (err) {
      clientLogger.error("Error fetching covers:", err);
      toast.error("Failed to fetch cover options");
    } finally {
      setLoading(false);
    }
  };

  const convertToISBN10 = (isbn13: string): string | null => {
    if (isbn13.length !== 13 || !isbn13.startsWith("978")) return null;
    const base = isbn13.substring(3, 12);
    let checksum = 0;
    for (let i = 0; i < 9; i++) {
      checksum += parseInt(base[i]) * (10 - i);
    }
    const check = (11 - (checksum % 11)) % 11;
    return base + (check === 10 ? "X" : check.toString());
  };

  const handleSelectCover = (cover: CoverOption) => {
    setSelectedCover(cover);
  };

  const handleConfirmSelection = () => {
    if (selectedCover) {
      onCoverSelected(selectedCover.url, selectedCover.source);
      toast.success(`Cover updated from ${selectedCover.source}`);
      onOpenChange(false);
    }
  };

  const handleCustomUrl = () => {
    if (!customUrl.trim()) {
      toast.error("Please enter a valid URL");
      return;
    }

    try {
      new URL(customUrl); // Validate URL
      const customCover: CoverOption = {
        url: customUrl,
        source: "Custom URL",
        thumbnail: customUrl,
        provider: "custom",
      };
      setSelectedCover(customCover);
      onCoverSelected(customUrl, "Custom URL");
      toast.success("Custom cover URL set");
      onOpenChange(false);
    } catch {
      toast.error("Invalid URL format");
    }
  };

  const handleFileUpload = async () => {
    if (!uploadFile) {
      toast.error("Please select a file");
      return;
    }

    try {
      setLoading(true);

      // Create form data
      const formData = new FormData();
      formData.append("file", uploadFile);
      formData.append("recordId", recordId.toString());

	      // Upload to server
	      const response = await fetchWithAuth("/api/upload-cover", {
	        method: "POST",
	        body: formData,
	      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Upload failed");
      }

      const data = await response.json();

      const uploadedCover: CoverOption = {
        url: data.url,
        source: "Uploaded File",
        thumbnail: data.url,
        provider: "custom",
      };

      setSelectedCover(uploadedCover);
      setCovers([uploadedCover, ...covers]);

      toast.success("Cover uploaded successfully!");

      // Automatically select and apply the uploaded cover
      onCoverSelected(data.url, "Uploaded File");
      onOpenChange(false);
    } catch (error) {
      clientLogger.error("Upload error:", error);
      toast.error(error instanceof Error ? error.message : "Failed to upload cover");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh]">
        <DialogHeader>
          <DialogTitle>Choose Cover Art</DialogTitle>
          <DialogDescription>
            Select a cover from multiple sources or upload your own
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="browse" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="browse">Browse Sources</TabsTrigger>
            <TabsTrigger value="url">Custom URL</TabsTrigger>
            <TabsTrigger value="upload">Upload File</TabsTrigger>
          </TabsList>

          <TabsContent value="browse" className="space-y-4">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                <span className="ml-2 text-muted-foreground">Loading cover options...</span>
              </div>
            ) : (
              <ScrollArea className="h-[400px] w-full rounded-md border p-4">
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                  {covers.map((cover, idx) => (
                    <CoverThumbnail
                      key={idx}
                      cover={cover}
                      selected={selectedCover?.url === cover.url}
                      onSelect={() => handleSelectCover(cover)}
                    />
                  ))}
                  {covers.length === 0 && (
                    <div className="col-span-full text-center py-8 text-muted-foreground">
                      <ImageOff className="h-12 w-12 mx-auto mb-2" />
                      <p>No cover art found</p>
                      <p className="text-sm">Try adding a custom URL or uploading a file</p>
                    </div>
                  )}
                </div>
              </ScrollArea>
            )}

            {selectedCover && (
              <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                <div className="flex items-center gap-2">
                  <Check className="h-5 w-5 text-green-600" />
                  <span className="text-sm font-medium">Selected: {selectedCover.source}</span>
                </div>
                <Button onClick={handleConfirmSelection}>Apply Cover</Button>
              </div>
            )}
          </TabsContent>

          <TabsContent value="url" className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="custom-url">Image URL</Label>
              <Input
                id="custom-url"
                placeholder="https://example.com/cover.jpg"
                value={customUrl}
                onChange={(e) => setCustomUrl(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleCustomUrl()}
              autoFocus
              />
              <p className="text-xs text-muted-foreground">
                Enter a direct link to an image file (JPG, PNG, etc.)
              </p>
            </div>
            {customUrl && (
              <div className="border rounded-lg p-4 flex items-center justify-center bg-muted/50">
                <img
                  src={customUrl}
                  alt="Preview"
                  className="max-h-64 object-contain"
                  onError={() => toast.error("Failed to load image from URL")}
                />
              </div>
            )}
            <Button onClick={handleCustomUrl} className="w-full">
              <ExternalLink className="h-4 w-4 mr-2" />
              Use This URL
            </Button>
          </TabsContent>

          <TabsContent value="upload" className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="file-upload">Upload Image File</Label>
              <Input
                id="file-upload"
                type="file"
                accept="image/*"
                onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
              autoFocus
              />
              <p className="text-xs text-muted-foreground">
                Supported formats: JPG, PNG, GIF, WEBP (max 5MB)
              </p>
            </div>
            {uploadFile && (
              <div className="border rounded-lg p-4 flex items-center justify-center bg-muted/50">
                <img
                  src={URL.createObjectURL(uploadFile)}
                  alt="Preview"
                  className="max-h-64 object-contain"
                />
              </div>
            )}
            <Button onClick={handleFileUpload} disabled={!uploadFile} className="w-full">
              <Upload className="h-4 w-4 mr-2" />
              Upload and Use This Image
            </Button>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

function CoverThumbnail({
  cover,
  selected,
  onSelect,
}: {
  cover: CoverOption;
  selected: boolean;
  onSelect: () => void;
}) {
  const [error, setError] = useState(false);
  const [loaded, setLoaded] = useState(false);

  if (error) {
    return (
      <div className="aspect-[2/3] bg-muted rounded-lg flex flex-col items-center justify-center p-2 border-2 border-transparent">
        <ImageOff className="h-8 w-8 text-muted-foreground mb-1" />
        <span className="text-xs text-muted-foreground text-center">{cover.source}</span>
      </div>
    );
  }

  return (
    <div
      className={`aspect-[2/3] relative rounded-lg overflow-hidden cursor-pointer transition-all hover:scale-105 border-2 ${
        selected ? "border-primary ring-2 ring-primary" : "border-transparent hover:border-muted-foreground/50"
      }`}
      onClick={onSelect}
    >
      {!loaded && (
        <div className="absolute inset-0 bg-muted animate-pulse" />
      )}
      <img
        src={cover.thumbnail}
        alt={cover.source}
        className={`w-full h-full object-contain bg-muted ${loaded ? "opacity-100" : "opacity-0"}`}
        onError={() => setError(true)}
        onLoad={() => setLoaded(true)}
      />
      {selected && (
        <div className="absolute top-2 right-2 bg-primary text-primary-foreground rounded-full p-1">
          <Check className="h-4 w-4" />
        </div>
      )}
      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-2">
        <p className="text-xs text-white font-medium truncate">{cover.source}</p>
      </div>
    </div>
  );
}
