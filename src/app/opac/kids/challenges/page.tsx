"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { usePatronSession } from "@/hooks/usePatronSession";
import {
  Trophy,
  Star,
  Medal,
  Flame,
  BookOpen,
  Target,
  Gift,
  Clock,
  ChevronRight,
  Lock,
  Check,
  Sparkles,
  Zap,
  Award,
  Crown,
  Rocket,
  Heart,
  Moon,
  Sun,
  Leaf,
  Snowflake,
} from "lucide-react";

interface Challenge {
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
  endDate?: string;
  isActive: boolean;
  isCompleted: boolean;
}

interface Badge {
  id: string;
  name: string;
  description: string;
  icon: React.ElementType;
  color: string;
  bgColor: string;
  earnedDate?: string;
  isEarned: boolean;
  requirement: string;
}

interface ReadingStats {
  booksRead: number;
  pagesRead: number;
  currentStreak: number;
  longestStreak: number;
  totalMinutes: number;
  badgesEarned: number;
  challengesCompleted: number;
}

export default function ReadingChallengesPage() {
  const router = useRouter();
  const { patron, isLoggedIn } = usePatronSession();
  const [activeTab, setActiveTab] = useState<"challenges" | "badges" | "leaderboard">("challenges");
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [badges, setBadges] = useState<Badge[]>([]);
  const [stats, setStats] = useState<ReadingStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, [isLoggedIn, patron]);

  const loadData = async () => {
    setIsLoading(true);
    
    // In a real implementation, this would fetch from the StacksOS API
    // For now, we will show sample challenges and badges
    
    // Sample challenges - these would come from the database
    const sampleChallenges: Challenge[] = [
      {
        id: "summer-2024",
        title: "Summer Reading Challenge",
        description: "Read 10 books this summer and earn awesome prizes!",
        icon: Sun,
        color: "text-orange-600",
        bgColor: "bg-orange-100",
        target: 10,
        current: isLoggedIn ? 3 : 0,
        unit: "books",
        reward: "Free ice cream coupon + Summer Reader badge",
        endDate: "Aug 31, 2024",
        isActive: true,
        isCompleted: false,
      },
      {
        id: "genre-explorer",
        title: "Genre Explorer",
        description: "Read a book from 5 different genres",
        icon: Rocket,
        color: "text-purple-600",
        bgColor: "bg-purple-100",
        target: 5,
        current: isLoggedIn ? 2 : 0,
        unit: "genres",
        reward: "Genre Explorer badge",
        isActive: true,
        isCompleted: false,
      },
      {
        id: "reading-streak",
        title: "30-Day Reading Streak",
        description: "Read every day for 30 days straight",
        icon: Flame,
        color: "text-red-600",
        bgColor: "bg-red-100",
        target: 30,
        current: isLoggedIn ? 7 : 0,
        unit: "days",
        reward: "Streak Champion badge + Bookmark prize",
        isActive: true,
        isCompleted: false,
      },
      {
        id: "page-turner",
        title: "Page Turner",
        description: "Read 500 pages total",
        icon: BookOpen,
        color: "text-blue-600",
        bgColor: "bg-blue-100",
        target: 500,
        current: isLoggedIn ? 234 : 0,
        unit: "pages",
        reward: "Page Turner badge",
        isActive: true,
        isCompleted: false,
      },
      {
        id: "series-starter",
        title: "Series Starter",
        description: "Start and finish a book series",
        icon: Target,
        color: "text-green-600",
        bgColor: "bg-green-100",
        target: 1,
        current: isLoggedIn ? 0 : 0,
        unit: "series",
        reward: "Series Master badge",
        isActive: true,
        isCompleted: false,
      },
    ];

    // Sample badges
    const sampleBadges: Badge[] = [
      {
        id: "first-book",
        name: "First Book",
        description: "Finished your very first book!",
        icon: Star,
        color: "text-yellow-600",
        bgColor: "bg-yellow-100",
        earnedDate: isLoggedIn ? "Jan 15, 2024" : undefined,
        isEarned: isLoggedIn,
        requirement: "Finish 1 book",
      },
      {
        id: "bookworm",
        name: "Bookworm",
        description: "Read 5 books",
        icon: BookOpen,
        color: "text-green-600",
        bgColor: "bg-green-100",
        earnedDate: isLoggedIn ? "Feb 20, 2024" : undefined,
        isEarned: isLoggedIn,
        requirement: "Finish 5 books",
      },
      {
        id: "super-reader",
        name: "Super Reader",
        description: "Read 25 books",
        icon: Zap,
        color: "text-blue-600",
        bgColor: "bg-blue-100",
        isEarned: false,
        requirement: "Finish 25 books",
      },
      {
        id: "reading-champion",
        name: "Reading Champion",
        description: "Read 50 books",
        icon: Trophy,
        color: "text-purple-600",
        bgColor: "bg-purple-100",
        isEarned: false,
        requirement: "Finish 50 books",
      },
      {
        id: "library-legend",
        name: "Library Legend",
        description: "Read 100 books",
        icon: Crown,
        color: "text-amber-600",
        bgColor: "bg-amber-100",
        isEarned: false,
        requirement: "Finish 100 books",
      },
      {
        id: "week-streak",
        name: "Week Warrior",
        description: "7-day reading streak",
        icon: Flame,
        color: "text-orange-600",
        bgColor: "bg-orange-100",
        earnedDate: isLoggedIn ? "Mar 5, 2024" : undefined,
        isEarned: isLoggedIn,
        requirement: "Read for 7 days in a row",
      },
      {
        id: "month-streak",
        name: "Month Master",
        description: "30-day reading streak",
        icon: Medal,
        color: "text-red-600",
        bgColor: "bg-red-100",
        isEarned: false,
        requirement: "Read for 30 days in a row",
      },
      {
        id: "night-owl",
        name: "Night Owl",
        description: "Log reading after 8pm",
        icon: Moon,
        color: "text-indigo-600",
        bgColor: "bg-indigo-100",
        isEarned: false,
        requirement: "Log a reading session after 8pm",
      },
      {
        id: "early-bird",
        name: "Early Bird",
        description: "Log reading before 8am",
        icon: Sun,
        color: "text-yellow-600",
        bgColor: "bg-yellow-100",
        isEarned: false,
        requirement: "Log a reading session before 8am",
      },
      {
        id: "review-writer",
        name: "Review Writer",
        description: "Write your first book review",
        icon: Heart,
        color: "text-pink-600",
        bgColor: "bg-pink-100",
        isEarned: false,
        requirement: "Write a review for a book you read",
      },
      {
        id: "spring-reader",
        name: "Spring Reader",
        description: "Complete Spring Reading Challenge",
        icon: Leaf,
        color: "text-green-600",
        bgColor: "bg-green-100",
        isEarned: false,
        requirement: "Complete the Spring Reading Challenge",
      },
      {
        id: "winter-reader",
        name: "Winter Reader",
        description: "Complete Winter Reading Challenge",
        icon: Snowflake,
        color: "text-cyan-600",
        bgColor: "bg-cyan-100",
        isEarned: false,
        requirement: "Complete the Winter Reading Challenge",
      },
    ];

    // Sample stats
    const sampleStats: ReadingStats = {
      booksRead: isLoggedIn ? 8 : 0,
      pagesRead: isLoggedIn ? 234 : 0,
      currentStreak: isLoggedIn ? 7 : 0,
      longestStreak: isLoggedIn ? 14 : 0,
      totalMinutes: isLoggedIn ? 1240 : 0,
      badgesEarned: isLoggedIn ? 3 : 0,
      challengesCompleted: isLoggedIn ? 1 : 0,
    };

    setChallenges(sampleChallenges);
    setBadges(sampleBadges);
    setStats(sampleStats);
    setIsLoading(false);
  };

  if (!isLoggedIn) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-20 text-center">
        <div className="w-24 h-24 mx-auto mb-6 bg-gradient-to-br from-purple-100 to-pink-100 
                      rounded-full flex items-center justify-center">
          <Trophy className="h-12 w-12 text-purple-500" />
        </div>
        <h1 className="text-2xl md:text-3xl font-bold text-foreground mb-4">
          Join Reading Challenges!
        </h1>
        <p className="text-muted-foreground mb-8 max-w-md mx-auto">
          Log in to track your reading, earn badges, complete challenges, and win awesome prizes!
        </p>
        <Link
          href="/opac/login?redirect=/opac/kids/challenges"
          className="inline-flex items-center gap-2 px-8 py-4 bg-gradient-to-r from-purple-500 to-pink-500 
                   text-white rounded-full font-bold text-lg hover:from-purple-600 hover:to-pink-600 
                   transition-colors shadow-xl"
        >
          <Sparkles className="h-5 w-5" />
          Log In to Start
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      {/* Header with stats */}
      <div className="bg-gradient-to-r from-purple-500 via-pink-500 to-orange-400 rounded-3xl p-6 md:p-8 mb-8 text-white">
        <div className="flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="text-center md:text-left">
            <h1 className="text-2xl md:text-3xl font-bold mb-2">
              Hey {patron?.firstName}! Keep Reading!
            </h1>
            {stats && stats.currentStreak > 0 && (
              <div className="flex items-center justify-center md:justify-start gap-2 text-white/90">
                <Flame className="h-5 w-5 text-orange-300" />
                <span className="font-medium">{stats.currentStreak} day streak!</span>
              </div>
            )}
          </div>

          {/* Quick stats */}
          {stats && (
            <div className="grid grid-cols-3 gap-4 md:gap-8">
              <div className="text-center">
                <div className="text-3xl md:text-4xl font-bold">{stats.booksRead}</div>
                <div className="text-sm text-white/80">Books Read</div>
              </div>
              <div className="text-center">
                <div className="text-3xl md:text-4xl font-bold">{stats.badgesEarned}</div>
                <div className="text-sm text-white/80">Badges</div>
              </div>
              <div className="text-center">
                <div className="text-3xl md:text-4xl font-bold">{stats.challengesCompleted}</div>
                <div className="text-sm text-white/80">Challenges</div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Tab navigation */}
      <div className="flex gap-2 mb-6 overflow-x-auto pb-2">
        {[
          { id: "challenges", label: "Challenges", icon: Target },
          { id: "badges", label: "Badges", icon: Award },
          { id: "leaderboard", label: "Leaderboard", icon: Trophy },
        ].map((tab) => (
          <button type="button"
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`flex items-center gap-2 px-5 py-3 rounded-xl font-medium whitespace-nowrap transition-all
                     ${activeTab === tab.id
                       ? "bg-gradient-to-r from-purple-500 to-pink-500 text-white shadow-lg"
                       : "bg-card text-muted-foreground hover:bg-muted/30"
                     }`}
          >
            <tab.icon className="h-5 w-5" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Challenges tab */}
      {activeTab === "challenges" && (
        <div className="space-y-4">
          {challenges.map((challenge) => (
            <ChallengeCard key={challenge.id} challenge={challenge} />
          ))}
        </div>
      )}

      {/* Badges tab */}
      {activeTab === "badges" && (
        <div>
          {/* Earned badges */}
          <div className="mb-8">
            <h2 className="text-lg font-bold text-foreground mb-4 flex items-center gap-2">
              <Star className="h-5 w-5 text-yellow-500" />
              Your Badges ({badges.filter((b) => b.isEarned).length})
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
              {badges
                .filter((b) => b.isEarned)
                .map((badge) => (
                  <BadgeCard key={badge.id} badge={badge} />
                ))}
              {badges.filter((b) => b.isEarned).length === 0 && (
                <div className="col-span-full text-center py-8 bg-card rounded-2xl">
                  <p className="text-muted-foreground">
                    Complete challenges to earn your first badge!
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Locked badges */}
          <div>
            <h2 className="text-lg font-bold text-foreground mb-4 flex items-center gap-2">
              <Lock className="h-5 w-5 text-muted-foreground/70" />
              Badges to Earn ({badges.filter((b) => !b.isEarned).length})
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
              {badges
                .filter((b) => !b.isEarned)
                .map((badge) => (
                  <BadgeCard key={badge.id} badge={badge} />
                ))}
            </div>
          </div>
        </div>
      )}

      {/* Leaderboard tab */}
      {activeTab === "leaderboard" && (
        <div className="bg-card rounded-3xl p-6 shadow-lg">
          <h2 className="text-lg font-bold text-foreground mb-4 flex items-center gap-2">
            <Trophy className="h-5 w-5 text-yellow-500" />
            Top Readers This Month
          </h2>
          <div className="space-y-3">
            {[
              { rank: 1, name: "Emma S.", books: 15, avatar: "🦊" },
              { rank: 2, name: "Liam T.", books: 12, avatar: "🐻" },
              { rank: 3, name: "Olivia R.", books: 11, avatar: "🐱" },
              { rank: 4, name: patron?.firstName || "You", books: stats?.booksRead || 0, avatar: "⭐", isYou: true },
              { rank: 5, name: "Noah M.", books: 7, avatar: "🐶" },
            ]
              .sort((a, b) => b.books - a.books)
              .map((reader, index) => (
                <div
                  key={reader.rank}
                  className={`flex items-center gap-4 p-4 rounded-2xl transition-colors
                           ${reader.isYou 
                             ? "bg-gradient-to-r from-purple-50 to-pink-50 border-2 border-purple-200" 
                             : "bg-muted/30"
                           }`}
                >
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-lg
                               ${index === 0 ? "bg-yellow-100 text-yellow-600" :
                                 index === 1 ? "bg-muted/50 text-muted-foreground" :
                                 index === 2 ? "bg-orange-100 text-orange-600" :
                                 "bg-muted/50 text-muted-foreground"
                               }`}>
                    {index + 1}
                  </div>
                  <div className="text-2xl">{reader.avatar}</div>
                  <div className="flex-1">
                    <p className={`font-medium ${reader.isYou ? "text-purple-700" : "text-foreground"}`}>
                      {reader.name} {reader.isYou && "(You!)"}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-foreground">{reader.books}</p>
                    <p className="text-xs text-muted-foreground">books</p>
                  </div>
                </div>
              ))}
          </div>
          <p className="text-center text-sm text-muted-foreground mt-4">
            Keep reading to climb the leaderboard!
          </p>
        </div>
      )}

      {/* Log reading button - floating */}
      <Link
        href="/opac/kids/account/reading-log"
        className="fixed bottom-6 right-6 flex items-center gap-2 px-6 py-4 bg-gradient-to-r 
                 from-green-500 to-emerald-500 text-white rounded-full font-bold shadow-2xl
                 hover:from-green-600 hover:to-emerald-600 transition-colors z-40"
      >
        <BookOpen className="h-5 w-5" />
        Log Reading
      </Link>
    </div>
  );
}

function ChallengeCard({ challenge }: { challenge: Challenge }) {
  const progress = Math.min(100, (challenge.current / challenge.target) * 100);
  const Icon = challenge.icon;

  return (
    <div className="bg-card rounded-2xl p-5 shadow-sm border-2 border-transparent 
                  hover:border-purple-200 transition-all">
      <div className="flex items-start gap-4">
        <div className={`p-3 rounded-2xl ${challenge.bgColor} shrink-0`}>
          <Icon className={`h-8 w-8 ${challenge.color}`} />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2 mb-2">
            <div>
              <h3 className="font-bold text-foreground text-lg">{challenge.title}</h3>
              <p className="text-muted-foreground text-sm">{challenge.description}</p>
            </div>
            {challenge.isCompleted && (
              <div className="shrink-0 w-8 h-8 bg-green-100 rounded-full flex items-center justify-center">
                <Check className="h-5 w-5 text-green-600" />
              </div>
            )}
          </div>

          {/* Progress bar */}
          <div className="mb-3">
            <div className="flex items-center justify-between text-sm mb-1">
              <span className="text-muted-foreground">
                {challenge.current} / {challenge.target} {challenge.unit}
              </span>
              <span className="font-medium text-purple-600">{Math.round(progress)}%</span>
            </div>
            <div className="h-3 bg-muted/50 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-purple-500 to-pink-500 rounded-full transition-all duration-500"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>

          {/* Reward and deadline */}
          <div className="flex flex-wrap items-center gap-4 text-sm">
            <div className="flex items-center gap-1 text-amber-600">
              <Gift className="h-4 w-4" />
              <span>{challenge.reward}</span>
            </div>
            {challenge.endDate && (
              <div className="flex items-center gap-1 text-muted-foreground">
                <Clock className="h-4 w-4" />
                <span>Ends {challenge.endDate}</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function BadgeCard({ badge }: { badge: Badge }) {
  const Icon = badge.icon;

  return (
    <div
      className={`relative p-4 rounded-2xl text-center transition-all
                ${badge.isEarned
                  ? "bg-card shadow-md hover:shadow-lg"
                  : "bg-muted/50 opacity-60"
                }`}
    >
      {/* Badge icon */}
      <div className={`w-16 h-16 mx-auto mb-3 rounded-full flex items-center justify-center
                    ${badge.isEarned ? badge.bgColor : "bg-muted"}`}>
        <Icon className={`h-8 w-8 ${badge.isEarned ? badge.color : "text-muted-foreground/70"}`} />
      </div>

      {/* Badge name */}
      <h3 className={`font-bold text-sm mb-1 ${badge.isEarned ? "text-foreground" : "text-muted-foreground"}`}>
        {badge.name}
      </h3>

      {/* Description or requirement */}
      <p className="text-xs text-muted-foreground">
        {badge.isEarned ? badge.description : badge.requirement}
      </p>

      {/* Earned date */}
      {badge.isEarned && badge.earnedDate && (
        <p className="text-xs text-purple-500 mt-2">
          Earned {badge.earnedDate}
        </p>
      )}

      {/* Lock icon for unearned */}
      {!badge.isEarned && (
        <div className="absolute top-2 right-2">
          <Lock className="h-4 w-4 text-muted-foreground/70" />
        </div>
      )}
    </div>
  );
}
