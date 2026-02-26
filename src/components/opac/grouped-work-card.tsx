"use client";

import { useState } from "react";
import Link from "next/link";
import { UnoptimizedImage } from "@/components/shared";
import { Button } from "@/components/ui/button";
import {
  BookOpen,
  Smartphone,
  Headphones,
  MonitorPlay,
  ChevronDown,
  ChevronUp,
  CheckCircle,
  Clock,
  Heart,
} from "lucide-react";

interface FormatInfo {
  type: "book" | "ebook" | "audiobook" | "dvd" | "cd" | "magazine";
  bibId: number;
  available: number;
  total: number;
  callNumber?: string;
  holdable: boolean;
}

interface GroupedWork {
  id: string; // Work ID (could be ISBN or computed hash)
  title: string;
  author: string;
  coverUrl?: string;
  summary?: string;
  rating?: number;
  reviewCount?: number;
  formats: FormatInfo[];
  primaryBibId: number;
  subjects?: string[];
  publicationYear?: string;
}

interface GroupedWorkCardProps {
  work: GroupedWork;
  variant?: "grid" | "list";
  onAddToList?: (bibId: number) => void;
  onPlaceHold?: (bibId: number) => void;
}

const formatIcons: Record<string, React.ElementType> = {
  book: BookOpen,
  ebook: Smartphone,
  audiobook: Headphones,
  dvd: MonitorPlay,
  cd: MonitorPlay,
  magazine: BookOpen,
};

const formatLabels: Record<string, string> = {
  book: "Book",
  ebook: "eBook",
  audiobook: "Audiobook",
  dvd: "DVD",
  cd: "CD",
  magazine: "Magazine",
};

export function GroupedWorkCard({
  work,
  variant = "list",
  onAddToList,
  onPlaceHold,
}: GroupedWorkCardProps) {
  const [showFormats, setShowFormats] = useState(false);
  const [imageError, setImageError] = useState(false);

  // Calculate overall availability
  const totalAvailable = work.formats.reduce((sum, f) => sum + f.available, 0);
  const totalCopies = work.formats.reduce((sum, f) => sum + f.total, 0);

  // Check if any format is available
  const hasAvailable = totalAvailable > 0;

  // Get unique format types
  const formatTypes = [...new Set(work.formats.map((f) => f.type))];

  if (variant === "grid") {
    return (
      <div className="bg-card rounded-xl border border-border overflow-hidden hover:shadow-md transition-shadow">
        <Link href={`/opac/record/${work.primaryBibId}`}>
          <div className="aspect-[2/3] bg-muted/50 relative">
            {work.coverUrl && !imageError ? (
              <UnoptimizedImage
                src={work.coverUrl}
                alt={work.title}
                className="w-full h-full object-cover"
                onError={() => setImageError(true)}
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-primary-100 to-primary-200">
                <BookOpen className="h-12 w-12 text-primary-400" />
              </div>
            )}

            {/* Format badges */}
            <div className="absolute bottom-2 left-2 flex gap-1">
              {formatTypes.slice(0, 3).map((type) => {
                const Icon = formatIcons[type] || BookOpen;
                return (
                  <div
                    key={type}
                    className="p-1.5 bg-card/90 rounded-full shadow-sm"
                    title={formatLabels[type]}
                  >
                    <Icon className="h-3 w-3 text-foreground/80" />
                  </div>
                );
              })}
              {formatTypes.length > 3 && (
                <div className="px-1.5 py-1 bg-card/90 rounded-full shadow-sm text-xs text-muted-foreground">
                  +{formatTypes.length - 3}
                </div>
              )}
            </div>

            {/* Availability indicator */}
            <div
              className={`absolute top-2 right-2 px-2 py-1 rounded-full text-xs font-medium ${
                hasAvailable ? "bg-green-100 text-green-800" : "bg-amber-100 text-amber-800"
              }`}
            >
              {hasAvailable ? "Available" : "On Hold"}
            </div>
          </div>
        </Link>
        <div className="p-3">
          <Link
            href={`/opac/record/${work.primaryBibId}`}
            className="font-medium text-foreground hover:text-primary-600 line-clamp-2 text-sm"
          >
            {work.title}
          </Link>
          {work.author && (
            <p className="text-xs text-muted-foreground mt-1 line-clamp-1">{work.author}</p>
          )}
        </div>
      </div>
    );
  }

  // List variant
  return (
    <div className="bg-card rounded-xl border border-border overflow-hidden">
      <div className="p-4 flex gap-4">
        {/* Cover */}
        <Link href={`/opac/record/${work.primaryBibId}`} className="shrink-0">
          <div className="w-24 h-36 bg-muted/50 rounded-lg overflow-hidden">
            {work.coverUrl && !imageError ? (
              <UnoptimizedImage
                src={work.coverUrl}
                alt={work.title}
                className="w-full h-full object-cover"
                onError={() => setImageError(true)}
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-primary-100 to-primary-200">
                <BookOpen className="h-10 w-10 text-primary-400" />
              </div>
            )}
          </div>
        </Link>

        {/* Details */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div>
              <Link
                href={`/opac/record/${work.primaryBibId}`}
                className="text-lg font-semibold text-foreground hover:text-primary-600 line-clamp-2"
              >
                {work.title}
              </Link>
              {work.author && <p className="text-muted-foreground">{work.author}</p>}
              {work.publicationYear && (
                <p className="text-sm text-muted-foreground">{work.publicationYear}</p>
              )}
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => onAddToList?.(work.primaryBibId)}
              className="text-muted-foreground/70 hover:text-red-500"
              title="Add to list"
            >
              <Heart className="h-5 w-5" />
            </Button>
          </div>

          {/* Rating */}
          {work.rating !== undefined && work.rating > 0 && (
            <div className="flex items-center gap-1 mt-2">
              {[1, 2, 3, 4, 5].map((star) => (
                <svg
                  key={star}
                  className={`h-4 w-4 ${
                    star <= Math.round(work.rating!)
                      ? "fill-amber-400 text-amber-400"
                      : "text-muted-foreground/50"
                  }`}
                  viewBox="0 0 20 20"
                  fill="currentColor"
                >
                  <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                </svg>
              ))}
              {work.reviewCount !== undefined && work.reviewCount > 0 && (
                <span className="text-sm text-muted-foreground ml-1">
                  ({work.reviewCount} reviews)
                </span>
              )}
            </div>
          )}

          {/* Summary */}
          {work.summary && (
            <p className="text-sm text-muted-foreground mt-2 line-clamp-2">{work.summary}</p>
          )}

          {/* Format summary */}
          <div className="flex flex-wrap items-center gap-2 mt-3">
            {formatTypes.map((type) => {
              const Icon = formatIcons[type] || BookOpen;
              const formatsOfType = work.formats.filter((f) => f.type === type);
              const typeAvailable = formatsOfType.reduce((sum, f) => sum + f.available, 0);
              const typeTotal = formatsOfType.reduce((sum, f) => sum + f.total, 0);

              return (
                <div
                  key={type}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-sm ${
                    typeAvailable > 0
                      ? "bg-green-50 text-green-700 border border-green-200"
                      : "bg-muted/50 text-muted-foreground border border-border"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  <span className="font-medium">{formatLabels[type]}</span>
                  <span className="text-xs">
                    ({typeAvailable}/{typeTotal})
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Expandable format details */}
      <div className="border-t border-border/50">
        <Button
          type="button"
          variant="ghost"
          onClick={() => setShowFormats(!showFormats)}
          className="h-auto w-full justify-between rounded-none px-4 py-2 text-sm text-muted-foreground hover:bg-muted/30"
        >
          <span>
            {totalAvailable} of {totalCopies} copies available across {formatTypes.length} format
            {formatTypes.length !== 1 ? "s" : ""}
          </span>
          {showFormats ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </Button>

        {showFormats && (
          <div className="px-4 pb-4 space-y-3">
            {work.formats.map((format, idx) => {
              const Icon = formatIcons[format.type] || BookOpen;
              return (
                <div
                  key={idx}
                  className="flex items-center justify-between p-3 bg-muted/30 rounded-lg"
                >
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-card rounded-lg">
                      <Icon className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <div>
                      <p className="font-medium text-foreground">{formatLabels[format.type]}</p>
                      {format.callNumber && (
                        <p className="text-sm text-muted-foreground">{format.callNumber}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <p
                        className={`font-medium ${
                          format.available > 0 ? "text-green-600" : "text-amber-600"
                        }`}
                      >
                        {format.available > 0 ? (
                          <span className="flex items-center gap-1">
                            <CheckCircle className="h-4 w-4" />
                            {format.available} available
                          </span>
                        ) : (
                          <span className="flex items-center gap-1">
                            <Clock className="h-4 w-4" />
                            All checked out
                          </span>
                        )}
                      </p>
                      <p className="text-xs text-muted-foreground">{format.total} total copies</p>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => onPlaceHold?.(format.bibId)}
                      className="rounded-lg px-3 py-1.5 text-sm"
                    >
                      {format.available > 0 ? "Request" : "Place Hold"}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
