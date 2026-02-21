"use client";

import { fetchWithAuth } from "@/lib/client-fetch";
import { clientLogger } from "@/lib/client-logger";
import { useCallback, useEffect, useState } from "react";
import { useRouter, notFound } from "next/navigation";
import Link from "next/link";
import { featureFlags } from "@/lib/feature-flags";
import { usePatronSession } from "@/hooks/use-patron-session";
import { RecommendationCard, type RecommendationItem } from "@/components/opac/recommendation-card";
import { Skeleton } from "@/components/ui/skeleton";
import { Sparkles, TrendingUp, Star, BookOpen, ArrowLeft, Settings, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";

interface RecommendationSection {
  title: string;
  icon: React.ElementType;
  iconColor: string;
  iconBg: string;
  items: RecommendationItem[];
  isLoading: boolean;
}

export default function RecommendationsPage() {
  if (!featureFlags.opacPersonalization) {
    notFound();
  }

  const t = useTranslations("recommendationsPage");
  const router = useRouter();
  const { patron, isLoggedIn, isLoading: sessionLoading } = usePatronSession();
  const [personalized, setPersonalized] = useState<RecommendationItem[]>([]);
  const [trending, setTrending] = useState<RecommendationItem[]>([]);
  const [staffPicks, setStaffPicks] = useState<RecommendationItem[]>([]);
  const [genreRecs, setGenreRecs] = useState<RecommendationItem[]>([]);
  const [_isPersonalized, setIsPersonalized] = useState(false);
  const [disabledReason, setDisabledReason] = useState<string | null>(null);
  const [loadingStates, setLoadingStates] = useState({
    personalized: true,
    trending: true,
    staffPicks: true,
    genres: true,
  });

  const fetchPersonalized = useCallback(async () => {
    try {
      const response = await fetchWithAuth("/api/opac/recommendations?type=personalized&limit=12");
      if (response.ok) {
        const data = await response.json();
        setPersonalized(data.recommendations || []);
        setIsPersonalized(data.personalized ?? false);
        setDisabledReason(data.disabledReason || null);
      }
    } catch (err) {
      clientLogger.error("Error fetching personalized recommendations:", err);
    } finally {
      setLoadingStates((prev) => ({ ...prev, personalized: false }));
    }
  }, []);

  const fetchTrending = useCallback(async () => {
    try {
      const response = await fetchWithAuth("/api/opac/recommendations?type=trending&limit=12");
      if (response.ok) {
        const data = await response.json();
        setTrending(data.recommendations || []);
      }
    } catch (err) {
      clientLogger.error("Error fetching trending:", err);
    } finally {
      setLoadingStates((prev) => ({ ...prev, trending: false }));
    }
  }, []);

  const fetchStaffPicks = useCallback(async () => {
    try {
      const response = await fetchWithAuth("/api/opac/staff-picks?limit=12");
      if (response.ok) {
        const data = await response.json();
        const picks = (data.picks || []).map((pick: any) => ({
          id: pick.recordId || pick.id,
          title: pick.title,
          author: pick.author,
          coverUrl: pick.coverUrl,
          reason: `Staff pick from ${pick.staffName} at ${pick.staffBranch}`,
          reasonType: "staff_pick" as const,
          source: "staff_pick",
        }));
        setStaffPicks(picks);
      }
    } catch (err) {
      clientLogger.error("Error fetching staff picks:", err);
    } finally {
      setLoadingStates((prev) => ({ ...prev, staffPicks: false }));
    }
  }, []);

  const fetchGenreRecs = useCallback(async () => {
    try {
      // Use the catalog to find new items in genres the patron might like
      // This leverages the personalized endpoint which already considers genre preferences
      const response = await fetchWithAuth(
        "/api/evergreen/catalog?sort=create_date&limit=12&order=desc"
      );
      if (response.ok) {
        const data = await response.json();
        const records = (data.records || []).map((record: any) => ({
          id: record.id || record.record_id,
          title: record.title || record.simple_record?.title || "Unknown Title",
          author: record.author || record.simple_record?.author || "",
          coverUrl:
            record.isbn || record.simple_record?.isbn
              ? `https://covers.openlibrary.org/b/isbn/${record.isbn || record.simple_record?.isbn}-M.jpg`
              : undefined,
          reason: "New in your library",
          reasonType: "popular" as const,
          source: "new_in_genre",
        }));
        setGenreRecs(records);
      }
    } catch (err) {
      clientLogger.error("Error fetching genre recommendations:", err);
    } finally {
      setLoadingStates((prev) => ({ ...prev, genres: false }));
    }
  }, []);

  useEffect(() => {
    document.title = "Recommendations | Library Catalog";
  }, []);

  useEffect(() => {
    if (!sessionLoading && !isLoggedIn) {
      router.push("/opac/login?redirect=/opac/recommendations");
      return;
    }
    if (isLoggedIn) {
      void Promise.all([fetchPersonalized(), fetchTrending(), fetchStaffPicks(), fetchGenreRecs()]);
    }
  }, [
    sessionLoading,
    isLoggedIn,
    router,
    fetchPersonalized,
    fetchTrending,
    fetchStaffPicks,
    fetchGenreRecs,
  ]);

  if (sessionLoading) {
    return (
      <div className="min-h-screen bg-muted/30 flex items-center justify-center">
        <Loader2 className="h-8 w-8 text-primary-600 animate-spin" />
      </div>
    );
  }

  if (!isLoggedIn) return null;

  // If personalization is disabled, show explanation
  if (!loadingStates.personalized && disabledReason) {
    return (
      <div className="min-h-screen bg-muted/30">
        <div className="bg-card border-b">
          <div className="max-w-7xl mx-auto px-4 py-6">
            <Link
              href="/opac"
              className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground mb-4"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to Catalog
            </Link>
            <h1 className="text-2xl font-bold text-foreground">{t("title")}</h1>
          </div>
        </div>
        <div className="max-w-2xl mx-auto px-4 py-16 text-center">
          <Sparkles className="h-12 w-12 text-primary-400 mx-auto mb-6" />
          <h2 className="text-xl font-semibold text-foreground mb-3">
            Personalized recommendations are not enabled
          </h2>
          <p className="text-muted-foreground mb-8">
            To see books picked just for you based on your reading history and interests, enable
            personalized recommendations in your account settings. Your privacy is always respected
            - you control what data is used.
          </p>
          <Link
            href="/opac/account/settings"
            className="inline-flex items-center gap-2 px-6 py-3 bg-primary-600
                     text-white rounded-lg font-medium hover:bg-primary-700
                     transition-colors"
          >
            <Settings className="h-4 w-4" />
            Go to Account Settings
          </Link>
        </div>
      </div>
    );
  }

  const sections: RecommendationSection[] = [
    {
      title: t("basedOnReads"),
      icon: BookOpen,
      iconColor: "text-blue-600",
      iconBg: "bg-blue-100",
      items: personalized,
      isLoading: loadingStates.personalized,
    },
    {
      title: t("trendingAtLibrary"),
      icon: TrendingUp,
      iconColor: "text-rose-600",
      iconBg: "bg-rose-100",
      items: trending,
      isLoading: loadingStates.trending,
    },
    {
      title: t("staffPicksForYou"),
      icon: Star,
      iconColor: "text-purple-600",
      iconBg: "bg-purple-100",
      items: staffPicks,
      isLoading: loadingStates.staffPicks,
    },
    {
      title: t("newInGenres"),
      icon: Sparkles,
      iconColor: "text-amber-600",
      iconBg: "bg-amber-100",
      items: genreRecs,
      isLoading: loadingStates.genres,
    },
  ];

  function SectionSkeleton() {
    return (
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="space-y-2">
            <Skeleton className="aspect-[2/3] w-full rounded-lg" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-3 w-2/3" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted/30">
      {/* Header */}
      <div className="bg-gradient-to-br from-primary-600 via-primary-700 to-primary-800 text-white">
        <div className="max-w-7xl mx-auto px-4 py-10">
          <Link
            href="/opac"
            className="inline-flex items-center gap-2 text-primary-100 hover:text-white mb-4"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Catalog
          </Link>
          <div className="flex items-center gap-3">
            <Sparkles className="h-8 w-8" />
            <div>
              <h1 className="text-2xl md:text-3xl font-bold">
                {t("recommendationsFor", { name: patron?.firstName || t("you") })}
              </h1>
              <p className="text-primary-100 mt-1">
                Curated picks based on your reading history and library trends
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Sections */}
      <div className="max-w-7xl mx-auto px-4 py-8 space-y-12">
        {sections.map((section) => (
          <section key={section.title}>
            <div className="flex items-center gap-3 mb-6">
              <div className={`p-2 ${section.iconBg} rounded-lg`}>
                <section.icon className={`h-6 w-6 ${section.iconColor}`} />
              </div>
              <h2 className="text-xl md:text-2xl font-bold text-foreground">{section.title}</h2>
            </div>

            {section.isLoading ? (
              <SectionSkeleton />
            ) : section.items.length > 0 ? (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4">
                {section.items.map((item) => (
                  <RecommendationCard key={item.id} item={item} variant="grid" />
                ))}
              </div>
            ) : (
              <div className="py-8 text-center">
                <p className="text-muted-foreground">
                  No recommendations available in this category yet. Check back after you have
                  borrowed a few more items!
                </p>
              </div>
            )}
          </section>
        ))}
      </div>
    </div>
  );
}
