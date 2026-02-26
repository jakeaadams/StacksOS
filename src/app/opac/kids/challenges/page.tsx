"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { fetchWithAuth } from "@/lib/client-fetch";
import { featureFlags } from "@/lib/feature-flags";
import {
  computeBookBadgeProgress,
  computeKidsReadingStats,
  type KidsReadingLogEntry,
} from "@/lib/kids-engagement";
import { usePatronSession } from "@/hooks/use-patron-session";
import { Button } from "@/components/ui/button";
import {
  Award,
  BookOpen,
  Calendar,
  ChevronLeft,
  Flame,
  Gift,
  Loader2,
  Medal,
  Sparkles,
  Star,
  Target,
  Trophy,
} from "lucide-react";
import { useTranslations } from "next-intl";

type Badge = {
  id: string;
  name: string;
  description: string;
  icon: React.ElementType;
  color: string;
  bgColor: string;
  isEarned: boolean;
  requirement: string;
};

type Challenge = {
  id: string;
  title: string;
  description: string;
  icon: React.ElementType;
  color: string;
  bgColor: string;
  target: number;
  current: number;
  unit: string;
  reward: string;
  endDateLabel: string;
  isCompleted: boolean;
};

function monthEndLabel(d: Date): string {
  const end = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  return end.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function progressWidthClass(current: number, target: number): string {
  if (target <= 0) return "w-0";
  const pct = Math.max(0, Math.min(100, Math.round((current / target) * 100)));
  const step = Math.round(pct / 10) * 10;
  const widthByStep: Record<number, string> = {
    0: "w-0",
    10: "w-[10%]",
    20: "w-[20%]",
    30: "w-[30%]",
    40: "w-[40%]",
    50: "w-1/2",
    60: "w-[60%]",
    70: "w-[70%]",
    80: "w-[80%]",
    90: "w-[90%]",
    100: "w-full",
  };
  return widthByStep[step] || "w-full";
}

export default function KidsChallengesPage() {
  const _t = useTranslations("kidsChallenges");
  const router = useRouter();
  const { isLoggedIn } = usePatronSession();

  const [activeTab, setActiveTab] = React.useState<"challenges" | "badges">("challenges");
  const [entries, setEntries] = React.useState<KidsReadingLogEntry[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);

  React.useEffect(() => {
    if (!isLoggedIn) {
      router.push("/opac/login?redirect=/opac/kids/challenges");
    }
  }, [isLoggedIn, router]);

  React.useEffect(() => {
    if (!isLoggedIn) return;
    if (!featureFlags.kidsEngagementV1) {
      setIsLoading(false);
      return;
    }

    let cancelled = false;
    setIsLoading(true);
    void (async () => {
      const res = await fetchWithAuth("/api/opac/kids/reading-log?limit=500");
      const data = await res.json().catch(() => ({}));
      const raw = Array.isArray((data as Record<string, any>)?.entries)
        ? (data as Record<string, any>).entries
        : [];
      const normalized: KidsReadingLogEntry[] = raw
        .filter((e: any) => e && typeof e.id === "number")
        .map((e: any) => ({
          id: e.id,
          bibId: typeof e.bibId === "number" ? e.bibId : null,
          title: String(e.title || "Untitled"),
          readAt: String(e.readAt || e.read_at || ""),
          minutesRead: typeof e.minutesRead === "number" ? e.minutesRead : 0,
          pagesRead: typeof e.pagesRead === "number" ? e.pagesRead : null,
        }));

      if (!cancelled) {
        setEntries(normalized);
        setIsLoading(false);
      }
    })().catch(() => {
      if (!cancelled) {
        setEntries([]);
        setIsLoading(false);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [isLoggedIn]);

  if (!isLoggedIn) return null;

  if (!featureFlags.kidsEngagementV1) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center">
        <div className="w-16 h-16 bg-muted rounded-2xl flex items-center justify-center mx-auto mb-4">
          <Sparkles className="h-8 w-8 text-muted-foreground" />
        </div>
        <h1 className="text-2xl font-bold text-foreground mb-2">Challenges are disabled</h1>
        <p className="text-muted-foreground mb-6">
          Kids engagement features are still rolling out. Check back soon.
        </p>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={() => router.push("/opac/kids")}
          className="h-12 w-auto px-6 text-purple-700 bg-purple-100 hover:bg-purple-200"
        >
          Back to Kids Home
        </Button>
      </div>
    );
  }

  const stats = computeKidsReadingStats(entries);
  const progress = computeBookBadgeProgress(stats.totalBooks);
  const now = new Date();
  const endLabel = monthEndLabel(now);

  const challenges: Challenge[] = [
    {
      id: "books-this-month",
      title: "Books this month",
      description: "Read 10 books this month to earn a prize.",
      icon: Trophy,
      color: "text-purple-600",
      bgColor: "bg-purple-100",
      target: 10,
      current: stats.booksThisMonth,
      unit: "books",
      reward: "Monthly Reader badge",
      endDateLabel: endLabel,
      isCompleted: stats.booksThisMonth >= 10,
    },
    {
      id: "minutes-this-month",
      title: "Reading minutes",
      description: "Read for 300 minutes this month.",
      icon: Target,
      color: "text-emerald-600",
      bgColor: "bg-emerald-100",
      target: 300,
      current: stats.minutesThisMonth,
      unit: "minutes",
      reward: "Time Traveler badge",
      endDateLabel: endLabel,
      isCompleted: stats.minutesThisMonth >= 300,
    },
    {
      id: "streak-7",
      title: "7-day streak",
      description: "Read every day for a week.",
      icon: Flame,
      color: "text-orange-600",
      bgColor: "bg-orange-100",
      target: 7,
      current: stats.currentStreak,
      unit: "days",
      reward: "Week Warrior badge",
      endDateLabel: endLabel,
      isCompleted: stats.currentStreak >= 7,
    },
  ];

  const badges: Badge[] = [
    {
      id: "first-book",
      name: "First Book",
      description: "Log your first book!",
      icon: Star,
      color: "text-yellow-600",
      bgColor: "bg-yellow-100",
      isEarned: stats.totalBooks >= 1,
      requirement: "Read 1 book",
    },
    {
      id: "bookworm",
      name: "Bookworm",
      description: "Read 5 books.",
      icon: BookOpen,
      color: "text-green-600",
      bgColor: "bg-green-100",
      isEarned: stats.totalBooks >= 5,
      requirement: "Read 5 books",
    },
    {
      id: "super-reader",
      name: "Super Reader",
      description: "Read 25 books.",
      icon: Medal,
      color: "text-blue-600",
      bgColor: "bg-blue-100",
      isEarned: stats.totalBooks >= 25,
      requirement: "Read 25 books",
    },
    {
      id: "streak-week",
      name: "Week Warrior",
      description: "Read 7 days in a row.",
      icon: Flame,
      color: "text-orange-600",
      bgColor: "bg-orange-100",
      isEarned: stats.currentStreak >= 7,
      requirement: "7-day streak",
    },
    {
      id: "streak-month",
      name: "Month Master",
      description: "Read 30 days in a row.",
      icon: Award,
      color: "text-rose-600",
      bgColor: "bg-rose-100",
      isEarned: stats.currentStreak >= 30,
      requirement: "30-day streak",
    },
  ];

  const earnedCount = badges.filter((b: any) => b.isEarned).length;

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={() => router.back()}
          className="text-muted-foreground hover:text-foreground/80 hover:bg-muted/50 rounded-xl"
          aria-label="Back"
        >
          <ChevronLeft className="h-6 w-6" />
        </Button>
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-foreground">Challenges & badges</h1>
          <p className="text-muted-foreground">
            Keep a streak and earn rewards by logging reading.
          </p>
        </div>
        <div className="ml-auto">
          <Link
            href="/opac/kids/account/reading-log"
            className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-xl font-medium hover:from-purple-600 hover:to-pink-600 transition-colors shadow-md"
          >
            <Gift className="h-4 w-4" />
            Log reading
          </Link>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-2xl p-4 text-center">
          <div className="flex items-center justify-center gap-1 mb-1">
            <BookOpen className="h-5 w-5 text-blue-500" />
            <span className="text-2xl font-bold text-blue-700">{stats.totalBooks}</span>
          </div>
          <p className="text-sm text-blue-600">Books</p>
        </div>
        <div className="bg-gradient-to-br from-orange-50 to-amber-50 rounded-2xl p-4 text-center">
          <div className="flex items-center justify-center gap-1 mb-1">
            <Flame className="h-5 w-5 text-orange-500" />
            <span className="text-2xl font-bold text-orange-700">{stats.currentStreak}</span>
          </div>
          <p className="text-sm text-orange-600">Day streak</p>
        </div>
        <div className="bg-gradient-to-br from-purple-50 to-pink-50 rounded-2xl p-4 text-center">
          <div className="flex items-center justify-center gap-1 mb-1">
            <Trophy className="h-5 w-5 text-purple-500" />
            <span className="text-2xl font-bold text-purple-700">{earnedCount}</span>
          </div>
          <p className="text-sm text-purple-600">Badges</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 mb-6">
        <Button
          type="button"
          variant={activeTab === "challenges" ? "default" : "outline"}
          size="sm"
          onClick={() => setActiveTab("challenges")}
          className={
            activeTab === "challenges" ? "bg-purple-100 text-purple-700 hover:bg-purple-200" : ""
          }
        >
          Challenges
        </Button>
        <Button
          type="button"
          variant={activeTab === "badges" ? "default" : "outline"}
          size="sm"
          onClick={() => setActiveTab("badges")}
          className={
            activeTab === "badges" ? "bg-purple-100 text-purple-700 hover:bg-purple-200" : ""
          }
        >
          Badges
        </Button>
        <div className="ml-auto text-xs text-muted-foreground">
          Next book badge: {progress.progressPct}% (target {progress.nextTarget})
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 text-purple-500 animate-spin" />
        </div>
      ) : activeTab === "challenges" ? (
        <div className="grid gap-4 md:grid-cols-2">
          {challenges.map((c: any) => (
            <div key={c.id} className="bg-card rounded-3xl border border-border p-5 shadow-sm">
              <div className="flex items-start gap-4">
                <div
                  className={`w-12 h-12 rounded-2xl flex items-center justify-center ${c.bgColor}`}
                >
                  <c.icon className={`h-6 w-6 ${c.color}`} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-3">
                    <h2 className="font-bold text-foreground">{c.title}</h2>
                    {c.isCompleted ? (
                      <span className="px-2 py-1 rounded-full text-xs font-semibold bg-green-100 text-green-700">
                        Completed
                      </span>
                    ) : (
                      <span className="px-2 py-1 rounded-full text-xs font-semibold bg-muted text-muted-foreground">
                        Ends {c.endDateLabel}
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">{c.description}</p>

                  <div className="mt-4">
                    <div className="flex items-center justify-between text-xs text-muted-foreground mb-2">
                      <span>
                        {Math.min(c.current, c.target)} / {c.target} {c.unit}
                      </span>
                      <span className="font-medium text-foreground">{c.reward}</span>
                    </div>
                    <div className="h-3 bg-muted/50 rounded-full overflow-hidden">
                      <div
                        className={`h-full bg-gradient-to-r from-purple-500 to-pink-500 rounded-full transition-all ${progressWidthClass(c.current, c.target)}`}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ))}

          <div className="md:col-span-2 bg-gradient-to-r from-sky-50 to-indigo-50 border border-border rounded-3xl p-6">
            <div className="flex items-start gap-4">
              <Calendar className="h-6 w-6 text-sky-600" />
              <div>
                <div className="font-bold text-foreground">Tip</div>
                <p className="text-sm text-muted-foreground mt-1">
                  Log reading every day to build your streak. Even 5 minutes counts!
                </p>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {badges.map((b: any) => (
            <div
              key={b.id}
              className={`rounded-3xl border p-5 shadow-sm ${
                b.isEarned ? "bg-card border-border" : "bg-muted/20 border-border/60"
              }`}
            >
              <div className="flex items-start gap-4">
                <div
                  className={`w-12 h-12 rounded-2xl flex items-center justify-center ${b.bgColor}`}
                >
                  <b.icon className={`h-6 w-6 ${b.color}`} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-3">
                    <h2 className="font-bold text-foreground">{b.name}</h2>
                    {b.isEarned ? (
                      <span className="px-2 py-1 rounded-full text-xs font-semibold bg-green-100 text-green-700">
                        Earned
                      </span>
                    ) : (
                      <span className="px-2 py-1 rounded-full text-xs font-semibold bg-muted text-muted-foreground">
                        Locked
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">{b.description}</p>
                  <div className="mt-3 text-xs text-muted-foreground">{b.requirement}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
