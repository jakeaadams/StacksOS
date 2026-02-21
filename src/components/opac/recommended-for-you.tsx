"use client";

import { fetchWithAuth } from "@/lib/client-fetch";
import { clientLogger } from "@/lib/client-logger";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { RecommendationCard, type RecommendationItem } from "@/components/opac/recommendation-card";
import { Sparkles, ArrowRight, ChevronLeft, ChevronRight, Settings } from "lucide-react";

interface RecommendedForYouProps {
  isLoggedIn: boolean;
}

interface RecommendationCluster {
  sourceTitle: string;
  sourceBibId: number;
  items: RecommendationItem[];
}

export function RecommendedForYou({ isLoggedIn }: RecommendedForYouProps) {
  const [recommendations, setRecommendations] = useState<RecommendationItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [_isPersonalized, setIsPersonalized] = useState(false);
  const [disabledReason, setDisabledReason] = useState<string | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const fetchRecommendations = useCallback(async () => {
    try {
      setIsLoading(true);
      const response = await fetchWithAuth("/api/opac/recommendations?type=personalized&limit=12");
      if (response.ok) {
        const data = await response.json();
        setRecommendations(data.recommendations || []);
        setIsPersonalized(data.personalized ?? false);
        setDisabledReason(data.disabledReason || null);
      }
    } catch (err) {
      clientLogger.error("Error fetching recommendations:", err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isLoggedIn) {
      void fetchRecommendations();
    } else {
      setIsLoading(false);
    }
  }, [isLoggedIn, fetchRecommendations]);

  const scroll = (direction: "left" | "right") => {
    if (!scrollContainerRef.current) return;
    const scrollAmount = 320;
    scrollContainerRef.current.scrollBy({
      left: direction === "left" ? -scrollAmount : scrollAmount,
      behavior: "smooth",
    });
  };

  if (!isLoggedIn) return null;

  // Personalization disabled prompt
  if (!isLoading && disabledReason) {
    return (
      <section className="py-12 md:py-16 bg-gradient-to-br from-primary-50 to-white">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2 bg-primary-100 rounded-lg">
              <Sparkles className="h-6 w-6 text-primary-600" />
            </div>
            <h2 className="text-2xl md:text-3xl font-bold text-foreground">Recommended for You</h2>
          </div>
          <div className="bg-card rounded-xl border border-border p-8 text-center max-w-2xl mx-auto">
            <Sparkles className="h-10 w-10 text-primary-400 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-foreground mb-2">
              Get personalized recommendations
            </h3>
            <p className="text-muted-foreground mb-6">
              Enable personalized recommendations in your account settings to see books picked just
              for you.
            </p>
            <Link
              href="/opac/account/settings"
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-primary-600
                       text-white rounded-lg font-medium hover:bg-primary-700
                       transition-colors"
            >
              <Settings className="h-4 w-4" />
              Account Settings
            </Link>
          </div>
        </div>
      </section>
    );
  }

  // Group recommendations by sourceTitle for "because you read" clusters
  const clusters: RecommendationCluster[] = [];
  const unclustered: RecommendationItem[] = [];

  for (const rec of recommendations) {
    if (rec.reasonType === "because_you_read" && rec.sourceTitle) {
      const existing = clusters.find((c) => c.sourceBibId === rec.sourceBibId);
      if (existing) {
        existing.items.push(rec);
      } else {
        clusters.push({
          sourceTitle: rec.sourceTitle,
          sourceBibId: rec.sourceBibId!,
          items: [rec],
        });
      }
    } else {
      unclustered.push(rec);
    }
  }

  return (
    <section className="py-12 md:py-16 bg-gradient-to-br from-primary-50 to-white">
      <div className="max-w-7xl mx-auto px-4">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary-100 rounded-lg">
              <Sparkles className="h-6 w-6 text-primary-600" />
            </div>
            <h2 className="text-2xl md:text-3xl font-bold text-foreground">Recommended for You</h2>
          </div>
          <Link
            href="/opac/recommendations"
            className="flex items-center gap-1 text-primary-600
                     hover:text-primary-700 font-medium"
          >
            See All Recommendations
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>

        {isLoading ? (
          <div className="flex gap-4 overflow-hidden">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="animate-pulse shrink-0 w-[180px]">
                <div className="aspect-[2/3] bg-muted rounded-lg mb-2" />
                <div className="h-4 bg-muted rounded mb-1" />
                <div className="h-3 bg-muted rounded w-2/3" />
              </div>
            ))}
          </div>
        ) : recommendations.length > 0 ? (
          <div className="space-y-8">
            {/* "Because you read" clusters */}
            {clusters.map((cluster) => (
              <div key={cluster.sourceBibId}>
                <p className="text-sm font-medium text-muted-foreground mb-3">
                  Because you read{" "}
                  <Link
                    href={`/opac/record/${cluster.sourceBibId}`}
                    className="text-primary-600 hover:underline font-semibold"
                  >
                    {cluster.sourceTitle}
                  </Link>
                </p>
                <div className="relative">
                  <div
                    ref={scrollContainerRef}
                    className="flex gap-4 overflow-x-auto pb-2 scrollbar-thin
                             scrollbar-thumb-muted scrollbar-track-transparent snap-x"
                  >
                    {cluster.items.map((item) => (
                      <div key={item.id} className="shrink-0 w-[180px] snap-start">
                        <RecommendationCard item={item} variant="grid" />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ))}

            {/* Remaining recommendations */}
            {unclustered.length > 0 && (
              <div>
                {clusters.length > 0 && (
                  <p className="text-sm font-medium text-muted-foreground mb-3">
                    More picks for you
                  </p>
                )}
                <div className="relative group/carousel">
                  <button
                    type="button"
                    onClick={() => scroll("left")}
                    className="absolute left-0 top-1/2 -translate-y-1/2 z-10 p-2
                             bg-card/90 border border-border rounded-full shadow-lg
                             opacity-0 group-hover/carousel:opacity-100 transition-opacity
                             hover:bg-card disabled:opacity-0 -ml-3"
                    aria-label="Scroll left"
                  >
                    <ChevronLeft className="h-5 w-5" />
                  </button>
                  <div
                    ref={scrollContainerRef}
                    className="flex gap-4 overflow-x-auto pb-2 scrollbar-thin
                             scrollbar-thumb-muted scrollbar-track-transparent snap-x"
                  >
                    {unclustered.map((item) => (
                      <div key={item.id} className="shrink-0 w-[180px] snap-start">
                        <RecommendationCard item={item} variant="grid" />
                      </div>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={() => scroll("right")}
                    className="absolute right-0 top-1/2 -translate-y-1/2 z-10 p-2
                             bg-card/90 border border-border rounded-full shadow-lg
                             opacity-0 group-hover/carousel:opacity-100 transition-opacity
                             hover:bg-card disabled:opacity-0 -mr-3"
                    aria-label="Scroll right"
                  >
                    <ChevronRight className="h-5 w-5" />
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : null}
      </div>
    </section>
  );
}

export default RecommendedForYou;
