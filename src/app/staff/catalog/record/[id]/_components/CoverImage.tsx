"use client";

import { useCallback, useEffect, useState } from "react";
import { BookOpen, Edit } from "lucide-react";
import { UnoptimizedImage } from "@/components/shared";

interface CoverImageProps {
  isbn?: string;
  title: string;
  customCoverUrl?: string;
  onClick: () => void;
}

export function CoverImage({ isbn, title, customCoverUrl, onClick }: CoverImageProps) {
  const [error, setError] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [googleFallbackUrl, setGoogleFallbackUrl] = useState<string | null>(null);
  const [googleLookupAttempted, setGoogleLookupAttempted] = useState(false);
  const cleanIsbn = isbn ? isbn.replace(/[^0-9X]/gi, "") : "";
  const openLibraryUrl = cleanIsbn
    ? `https://covers.openlibrary.org/b/isbn/${cleanIsbn}-L.jpg`
    : null;
  const coverUrl = customCoverUrl || googleFallbackUrl || openLibraryUrl;
  const titleLines = title.trim().split(/\s+/).slice(0, 5).join(" ");
  const titleInitial = title.trim().charAt(0).toUpperCase() || "B";

  useEffect(() => {
    setError(false);
    setLoaded(false);
    setGoogleFallbackUrl(null);
    setGoogleLookupAttempted(false);
  }, [customCoverUrl, cleanIsbn, title]);

  const loadGoogleFallback = useCallback(async () => {
    const query = cleanIsbn ? `isbn:${cleanIsbn}` : `intitle:${title}`;
    try {
      const res = await fetch(`/api/google-books?q=${encodeURIComponent(query)}&maxResults=1`, {
        credentials: "include",
      });
      if (!res.ok) {
        setError(true);
        return;
      }
      const data = await res.json().catch(() => null);
      const first = Array.isArray(data?.items) ? data.items[0] : null;
      const fallback =
        (typeof first?.image === "string" && first.image.trim()) ||
        (typeof first?.thumbnail === "string" && first.thumbnail.trim()) ||
        null;
      if (fallback) {
        setGoogleFallbackUrl(fallback);
        setLoaded(false);
        setError(false);
        return;
      }
      setError(true);
    } catch {
      setError(true);
    }
  }, [cleanIsbn, title]);

  const handleImageError = useCallback(() => {
    if (customCoverUrl) {
      setError(true);
      return;
    }
    if (!googleLookupAttempted) {
      setGoogleLookupAttempted(true);
      void loadGoogleFallback();
      return;
    }
    setError(true);
  }, [customCoverUrl, googleLookupAttempted, loadGoogleFallback]);

  if (!coverUrl || error) {
    return (
      <div
        className="w-full max-w-[240px] aspect-[2/3] rounded-xl overflow-hidden cursor-pointer transition-shadow group shadow-sm hover:shadow-md"
        onClick={onClick}
        title="Click to upload cover art"
      >
        <div className="h-full w-full bg-gradient-to-br from-slate-700 via-slate-600 to-zinc-700 text-white p-4 flex flex-col justify-between">
          <span className="text-[10px] uppercase tracking-[0.16em] text-white/70">StacksOS</span>
          <div>
            <div className="flex items-end gap-2">
              <span className="text-4xl font-semibold leading-none">{titleInitial}</span>
              <BookOpen className="h-5 w-5 text-white/70" />
            </div>
            <p className="mt-3 text-sm font-medium leading-snug line-clamp-4 text-white/90">
              {titleLines}
            </p>
          </div>
          <span className="text-[10px] tracking-wide text-white/75">No cover art yet</span>
        </div>
      </div>
    );
  }

  return (
    <div
      className="w-full max-w-[240px] aspect-[2/3] relative group cursor-pointer"
      onClick={onClick}
      title="Click to change cover art"
    >
      {!loaded && <div className="absolute inset-0 bg-muted rounded-xl animate-pulse" />}
      <UnoptimizedImage
        src={coverUrl}
        alt={"Cover of " + title}
        className={
          "absolute inset-0 h-full w-full object-cover bg-muted rounded-xl shadow-md transition-opacity " +
          (loaded ? "opacity-100" : "opacity-0")
        }
        loading="eager"
        onError={handleImageError}
        onLoad={() => setLoaded(true)}
      />
      <div className="absolute inset-0 bg-black/60 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
        <div className="text-white text-center">
          <Edit className="h-8 w-8 mx-auto mb-2" />
          <span className="text-sm font-medium">Change Cover</span>
        </div>
      </div>
    </div>
  );
}
