"use client";

import Image from "next/image";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { usePatronSession } from "@/hooks/use-patron-session";
import { fetchWithAuth } from "@/lib/client-fetch";
import { featureFlags } from "@/lib/feature-flags";
import { computeBookBadgeProgress, computeKidsReadingStats, type KidsReadingLogEntry } from "@/lib/kids-engagement";
import {
  BookOpen,
  Star,
  Trophy,
  Flame,
  Clock,
  CalendarDays,
  ChevronRight,
  BookmarkCheck,
  AlertCircle,
  Sparkles,
  Gift,
} from "lucide-react";
import { useTranslations } from "next-intl";

interface RecentBook {
  id: number;
  title: string;
  author: string;
  coverUrl?: string;
  dueDate?: string;
  isOverdue?: boolean;
}

export default function KidsAccountPage() {
  const t = useTranslations("kidsAccountPage");
  const router = useRouter();
  const { patron, isLoggedIn, checkouts, holds, fetchCheckouts, fetchHolds } = usePatronSession();
  const [recentBooks, setRecentBooks] = useState<RecentBook[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [readingStats, setReadingStats] = useState<{
    booksThisMonth: number;
    currentStreak: number;
    totalBadges: number;
    nextBadgeProgress: number;
  } | null>(null);

  const loadData = useCallback(() => {
    // Transform checkouts to recent books
    const books = checkouts
      .filter((checkout) => typeof checkout.recordId === "number" && checkout.recordId > 0)
      .slice(0, 4)
      .map((checkout) => ({
        id: checkout.recordId!,
        title: checkout.title,
        author: checkout.author,
        coverUrl: checkout.coverUrl,
        dueDate: formatMaybeDate(checkout.dueDate),
        isOverdue: checkout.isOverdue,
      }));
    setRecentBooks(books);
  }, [checkouts]);

  useEffect(() => {
    if (!isLoggedIn) {
      router.push("/opac/login?redirect=/opac/kids/account");
      return;
    }
    setIsLoading(true);
    void Promise.all([fetchCheckouts(), fetchHolds()]).finally(() => setIsLoading(false));
  }, [fetchCheckouts, fetchHolds, isLoggedIn, router]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (!isLoggedIn || !featureFlags.kidsEngagementV1) return;
    let cancelled = false;
    void (async () => {
      const res = await fetchWithAuth("/api/opac/kids/reading-log?limit=400");
      const data = await res.json().catch(() => ({}));
      const raw = Array.isArray((data as any)?.entries) ? (data as any).entries : [];
      const entries: KidsReadingLogEntry[] = raw
        .filter((e: any) => e && typeof e.id === "number")
        .map((e: any) => ({
          id: e.id,
          bibId: typeof e.bibId === "number" ? e.bibId : null,
          title: String(e.title || "Untitled"),
          readAt: String(e.readAt || e.read_at || ""),
          minutesRead: typeof e.minutesRead === "number" ? e.minutesRead : 0,
          pagesRead: typeof e.pagesRead === "number" ? e.pagesRead : null,
        }));

      const stats = computeKidsReadingStats(entries);
      const bookBadgeCount = [1, 5, 10, 25, 50, 100].filter((t) => stats.totalBooks >= t).length;
      const streakBadgeCount = (stats.currentStreak >= 7 ? 1 : 0) + (stats.currentStreak >= 30 ? 1 : 0);
      const progress = computeBookBadgeProgress(stats.totalBooks);

      if (!cancelled) {
        setReadingStats({
          booksThisMonth: stats.booksThisMonth,
          currentStreak: stats.currentStreak,
          totalBadges: bookBadgeCount + streakBadgeCount,
          nextBadgeProgress: progress.progressPct,
        });
      }
    })().catch(() => {
      if (!cancelled) setReadingStats(null);
    });
    return () => {
      cancelled = true;
    };
  }, [isLoggedIn]);

  if (!isLoggedIn) {
    return null; // Will redirect
  }

  if (isLoading) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-20 text-center">
        <div className="flex items-center justify-center gap-3 text-muted-foreground">
          <Sparkles className="h-6 w-6 animate-pulse" />
          Loading your account…
        </div>
      </div>
    );
  }

  const overdueCount = checkouts.filter((c) => c.isOverdue).length;
  const readyHoldsCount = holds.filter((h) => h.status === "ready").length;

  const safeStats = readingStats || {
    booksThisMonth: 0,
    currentStreak: 0,
    totalBadges: 0,
    nextBadgeProgress: 0,
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      {/* Welcome header */}
      <div className="bg-gradient-to-r from-purple-500 via-pink-500 to-orange-400 rounded-3xl p-6 mb-8 text-white">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 bg-card/20 rounded-full flex items-center justify-center text-3xl">
            {patron?.firstName?.[0] || "🌟"}
          </div>
          <div>
            <h1 className="text-2xl font-bold">{t("hi", { name: patron?.firstName ?? "" })}</h1>
            <p className="text-white/90">{t("whatsHappening")}</p>
          </div>
        </div>

        {/* Quick stats */}
        <div className="grid grid-cols-3 gap-4 mt-6">
          <div className="bg-card/10 rounded-2xl p-3 text-center">
            <div className="flex items-center justify-center gap-1 mb-1">
              <Flame className="h-5 w-5 text-orange-300" />
              <span className="text-2xl font-bold">{safeStats.currentStreak}</span>
            </div>
            <p className="text-xs text-white/80">{t("dayStreak")}</p>
          </div>
          <div className="bg-card/10 rounded-2xl p-3 text-center">
            <div className="flex items-center justify-center gap-1 mb-1">
              <BookOpen className="h-5 w-5 text-blue-300" />
              <span className="text-2xl font-bold">{safeStats.booksThisMonth}</span>
            </div>
            <p className="text-xs text-white/80">{t("booksThisMonth")}</p>
          </div>
          <div className="bg-card/10 rounded-2xl p-3 text-center">
            <div className="flex items-center justify-center gap-1 mb-1">
              <Trophy className="h-5 w-5 text-yellow-300" />
              <span className="text-2xl font-bold">{safeStats.totalBadges}</span>
            </div>
            <p className="text-xs text-white/80">{t("badges")}</p>
          </div>
        </div>
      </div>

      {/* Alerts */}
      {(overdueCount > 0 || readyHoldsCount > 0) && (
        <div className="space-y-3 mb-8">
          {overdueCount > 0 && (
            <div className="flex items-center gap-3 p-4 bg-red-50 border-2 border-red-200 rounded-2xl">
              <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center shrink-0">
                <AlertCircle className="h-5 w-5 text-red-500" />
              </div>
              <div className="flex-1">
                <p className="font-medium text-red-700">
                  {t("booksOverdue", { count: overdueCount })}
                </p>
                <p className="text-sm text-red-600">{t("returnSoon")}</p>
              </div>
              <Link
                href="/opac/kids/account/checkouts"
                className="px-4 py-2 bg-red-100 text-red-700 rounded-xl font-medium hover:bg-red-200"
              >
                View
              </Link>
            </div>
          )}

          {readyHoldsCount > 0 && (
            <div className="flex items-center gap-3 p-4 bg-green-50 border-2 border-green-200 rounded-2xl">
              <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center shrink-0">
                <Gift className="h-5 w-5 text-green-500" />
              </div>
              <div className="flex-1">
                <p className="font-medium text-green-700">
                  {t("booksReady", { count: readyHoldsCount })}
                </p>
                <p className="text-sm text-green-600">{t("goGetThem")}</p>
              </div>
              <Link
                href="/opac/kids/account/holds"
                className="px-4 py-2 bg-green-100 text-green-700 rounded-xl font-medium hover:bg-green-200"
              >
                View
              </Link>
            </div>
          )}
        </div>
      )}

      {/* Quick actions */}
      <div className="grid grid-cols-2 gap-4 mb-8">
        <Link
          href="/opac/kids/account/reading-log"
          className="flex items-center gap-3 p-4 bg-gradient-to-br from-green-50 to-emerald-50 
                   rounded-2xl border-2 border-green-100 hover:border-green-300 transition-colors"
        >
          <div className="w-12 h-12 bg-green-100 rounded-xl flex items-center justify-center">
            <BookOpen className="h-6 w-6 text-green-600" />
          </div>
          <div>
            <p className="font-bold text-green-800">{t("logReading")}</p>
            <p className="text-sm text-green-600">{t("recordReading")}</p>
          </div>
        </Link>

        <Link
          href="/opac/kids/challenges"
          className="flex items-center gap-3 p-4 bg-gradient-to-br from-purple-50 to-pink-50 
                   rounded-2xl border-2 border-purple-100 hover:border-purple-300 transition-colors"
        >
          <div className="w-12 h-12 bg-purple-100 rounded-xl flex items-center justify-center">
            <Trophy className="h-6 w-6 text-purple-600" />
          </div>
          <div>
            <p className="font-bold text-purple-800">{t("challenges")}</p>
            <p className="text-sm text-purple-600">{t("earnBadges")}</p>
          </div>
        </Link>
      </div>

      {/* Currently reading */}
      <section className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
            <BookmarkCheck className="h-5 w-5 text-blue-500" />
            Your Books
          </h2>
          <Link
            href="/opac/kids/account/checkouts"
            className="text-purple-600 hover:text-purple-700 font-medium text-sm flex items-center gap-1"
          >
            See All
            <ChevronRight className="h-4 w-4" />
          </Link>
        </div>

        {recentBooks.length > 0 ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {recentBooks.map((book) => (
              <BookCard key={book.id} book={book} />
            ))}
          </div>
        ) : (
          <div className="text-center py-8 bg-card rounded-2xl">
            <BookOpen className="h-12 w-12 text-muted-foreground/50 mx-auto mb-3" />
            <p className="text-muted-foreground mb-4">{t("noBooksYet")}</p>
            <Link
              href="/opac/kids"
              className="inline-flex items-center gap-2 px-4 py-2 bg-purple-100 text-purple-700 
                       rounded-xl font-medium hover:bg-purple-200"
            >
              <Sparkles className="h-4 w-4" />
              Find Books
            </Link>
          </div>
        )}
      </section>

      {/* Menu items */}
      <section>
        <h2 className="text-lg font-bold text-foreground mb-4">{t("myStuff")}</h2>
        <div className="bg-card rounded-2xl shadow-sm overflow-hidden divide-y divide-border/50">
          <MenuLink
            href="/opac/kids/account/checkouts"
            icon={BookOpen}
            label={t("checkedOutBooks")}
            count={checkouts?.length || 0}
            color="text-blue-500"
          />
          <MenuLink
            href="/opac/kids/account/holds"
            icon={Clock}
            label={t("booksOnHold")}
            count={holds?.length || 0}
            color="text-orange-500"
          />
          <MenuLink
            href="/opac/kids/account/reading-log"
            icon={CalendarDays}
            label={t("readingLog")}
            color="text-green-500"
          />
          <MenuLink
            href="/opac/kids/challenges"
            icon={Star}
            label={t("badgesAchievements")}
            color="text-yellow-500"
          />
        </div>
      </section>
    </div>
  );
}

function BookCard({ book }: { book: RecentBook }) {
  const [imageError, setImageError] = useState(false);

  return (
    <Link href={`/opac/kids/record/${book.id}`} className="group block">
      <div className="relative aspect-[2/3] rounded-xl overflow-hidden bg-gradient-to-br from-purple-100 to-pink-100 
                    shadow-sm group-hover:shadow-md transition-all">
        {book.coverUrl && !imageError ? (
          <Image
            src={book.coverUrl}
            alt={book.title}
            fill
            sizes="200px"
            className="object-cover"
            onError={() => setImageError(true)}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <BookOpen className="h-10 w-10 text-purple-300" />
          </div>
        )}

        {/* Due date badge */}
        {book.dueDate && (
          <div className={`absolute bottom-2 left-2 right-2 px-2 py-1 rounded-lg text-xs font-medium text-center
                        ${book.isOverdue 
                          ? "bg-red-100 text-red-700" 
                          : "bg-card/90 text-foreground/80"
                        }`}>
            {book.isOverdue ? "Overdue!" : `Due ${book.dueDate}`}
          </div>
        )}
      </div>
      <div className="mt-2">
        <h3 className="font-medium text-foreground text-sm line-clamp-2 group-hover:text-purple-600">
          {book.title}
        </h3>
      </div>
    </Link>
  );
}

function MenuLink({
  href,
  icon: Icon,
  label,
  count,
  color,
}: {
  href: string;
  icon: React.ElementType;
  label: string;
  count?: number;
  color: string;
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-4 p-4 hover:bg-muted/30 transition-colors"
    >
      <div className={`w-10 h-10 rounded-xl bg-muted/50 flex items-center justify-center`}>
        <Icon className={`h-5 w-5 ${color}`} />
      </div>
      <span className="flex-1 font-medium text-foreground">{label}</span>
      {count !== undefined && count > 0 && (
        <span className="px-2 py-0.5 bg-purple-100 text-purple-700 rounded-full text-sm font-medium">
          {count}
        </span>
      )}
      <ChevronRight className="h-5 w-5 text-muted-foreground/70" />
    </Link>
  );
}

function formatMaybeDate(value: string): string {
  if (!value) return "Unknown";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
