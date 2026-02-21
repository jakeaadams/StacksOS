"use client";

import { useState } from "react";
import { Edit, ImageOff } from "lucide-react";
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
  const cleanIsbn = isbn ? isbn.replace(/[^0-9X]/gi, "") : "";
  const coverUrl = customCoverUrl || (cleanIsbn ? `https://covers.openlibrary.org/b/isbn/${cleanIsbn}-L.jpg` : null);

  if (!coverUrl || error) {
    return (
      <div className="w-full max-w-[240px] aspect-[2/3] bg-muted rounded-xl flex flex-col items-center justify-center cursor-pointer hover:bg-muted/70 transition-colors group" onClick={onClick} title="Click to upload cover art">
        <ImageOff className="h-12 w-12 text-muted-foreground group-hover:text-foreground transition-colors" />
        <span className="text-xs text-muted-foreground group-hover:text-foreground mt-2 transition-colors">Click to upload</span>
      </div>
    );
  }

  return (
    <div className="w-full max-w-[240px] aspect-[2/3] relative group cursor-pointer" onClick={onClick} title="Click to change cover art">
      {!loaded && <div className="absolute inset-0 bg-muted rounded-xl animate-pulse" />}
      <UnoptimizedImage
        src={coverUrl}
        alt={"Cover of " + title}
        className={"absolute inset-0 h-full w-full object-contain bg-muted rounded-xl shadow-md transition-opacity " + (loaded ? "opacity-100" : "opacity-0")}
        onError={() => setError(true)}
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
