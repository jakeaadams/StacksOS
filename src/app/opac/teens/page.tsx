"use client";
import { clientLogger } from "@/lib/client-logger";
import { fetchWithAuth } from "@/lib/client-fetch";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { usePatronSession } from "@/hooks/use-patron-session";
import { UnoptimizedImage } from "@/components/shared";
import {
  Search,
  Sparkles,
  BookOpen,
  Flame,
  ArrowRight,
  TrendingUp,
  Zap,
  Skull,
  Heart,
  Wand2,
  Swords,
  Globe,
  Ghost,
  Rocket,
  Library,
  GraduationCap,
  Image as ImageIcon,
  Star,
} from "lucide-react";
import { useTranslations } from "next-intl";

interface CategoryItem {
  icon: React.ElementType;
  label: string;
  query: string;
  color: string;
  bgColor: string;
}

interface FeaturedBook {
  id: number;
  title: string;
  author: string;
  coverUrl?: string;
}

function getCoverUrl(record: any): string | undefined {
  const isbn = record.isbn || record.simple_record?.isbn;
  if (isbn) {
    return `https://covers.openlibrary.org/b/isbn/${isbn}-M.jpg`;
  }
  return undefined;
}

function transformBooks(records: any[]): FeaturedBook[] {
  return records.map((record: any) => ({
    id: record.id || record.record_id,
    title: record.title || record.simple_record?.title || "Unknown Title",
    author: record.author || record.simple_record?.author || "",
    coverUrl: getCoverUrl(record),
  }));
}

const browseCategories: CategoryItem[] = [
  {
    icon: Skull,
    label: "Dystopian",
    query: "dystopian",
    color: "text-red-600",
    bgColor: "bg-red-100",
  },
  {
    icon: Heart,
    label: "Romance",
    query: "romance young adult",
    color: "text-pink-600",
    bgColor: "bg-pink-100",
  },
  {
    icon: Wand2,
    label: "Fantasy",
    query: "fantasy young adult",
    color: "text-purple-600",
    bgColor: "bg-purple-100",
  },
  {
    icon: ImageIcon,
    label: "Graphic Novels",
    query: "graphic novels",
    color: "text-blue-600",
    bgColor: "bg-blue-100",
  },
  { icon: Star, label: "Manga", query: "manga", color: "text-rose-600", bgColor: "bg-rose-100" },
  {
    icon: Ghost,
    label: "Horror",
    query: "horror young adult",
    color: "text-gray-600",
    bgColor: "bg-gray-100",
  },
  {
    icon: Rocket,
    label: "Sci-Fi",
    query: "science fiction young adult",
    color: "text-cyan-600",
    bgColor: "bg-cyan-100",
  },
  {
    icon: Swords,
    label: "Mystery",
    query: "mystery young adult",
    color: "text-amber-600",
    bgColor: "bg-amber-100",
  },
  {
    icon: Sparkles,
    label: "LGBTQ+",
    query: "lgbtq young adult",
    color: "text-violet-600",
    bgColor: "bg-violet-100",
  },
  {
    icon: GraduationCap,
    label: "College Prep",
    query: "college preparation",
    color: "text-emerald-600",
    bgColor: "bg-emerald-100",
  },
  {
    icon: Zap,
    label: "New Adults",
    query: "new adult fiction",
    color: "text-orange-600",
    bgColor: "bg-orange-100",
  },
];

export default function TeensHomePage() {
  const t = useTranslations("teensPage");
  const { patron, isLoggedIn } = usePatronSession();
  const [searchQuery, setSearchQuery] = useState("");
  const [trendingBooks, setTrendingBooks] = useState<FeaturedBook[]>([]);
  const [newBooks, setNewBooks] = useState<FeaturedBook[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchContent = useCallback(async () => {
    try {
      setIsLoading(true);

      const [trendingRes, newRes] = await Promise.all([
        fetchWithAuth(
          "/api/evergreen/catalog?audience=juvenile,young_adult&sort=popularity&limit=6"
        ),
        fetchWithAuth(
          "/api/evergreen/catalog?audience=juvenile,young_adult&sort=create_date&order=desc&limit=6"
        ),
      ]);

      if (trendingRes.ok) {
        const data = await trendingRes.json();
        setTrendingBooks(transformBooks(data.records || []));
      }

      if (newRes.ok) {
        const data = await newRes.json();
        setNewBooks(transformBooks(data.records || []));
      }
    } catch (err) {
      clientLogger.error("Error fetching teens content:", err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchContent();
  }, [fetchContent]);

  useEffect(() => {
    document.title = "Teen Zone | Library Catalog";
  }, []);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      window.location.href = `/opac/teens/search?q=${encodeURIComponent(searchQuery)}`;
    }
  };

  return (
    <div className="pb-8">
      {/* Hero Section */}
      <section className="relative py-12 md:py-20 overflow-hidden">
        <div className="relative max-w-4xl mx-auto px-4 text-center">
          {isLoggedIn && patron && (
            <div className="mb-6 inline-flex items-center gap-2 px-6 py-3 bg-card/90 rounded-full shadow-lg">
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center text-white font-bold text-sm">
                {patron.firstName?.[0]}
              </div>
              <span className="font-medium text-foreground">
                {t("heyReady", { name: patron.firstName ?? "" })}
              </span>
            </div>
          )}

          <h1 className="text-4xl md:text-6xl font-extrabold mb-4 tracking-tight">
            <span className="text-purple-700 dark:text-purple-300">{t("yourNext")}</span>
            <br />
            <span className="text-purple-700 dark:text-purple-300">{t("greatRead")}</span>
          </h1>

          <p className="text-lg md:text-xl text-muted-foreground mb-8 max-w-2xl mx-auto">
            Discover YA fiction, graphic novels, manga, and more.
          </p>

          <form onSubmit={handleSearch} className="max-w-2xl mx-auto">
            <div className="relative group">
              <div className="absolute -inset-1 bg-gradient-to-r from-purple-600 via-indigo-600 to-violet-600 rounded-full blur-lg opacity-40 group-hover:opacity-60 transition-opacity" />
              <div className="relative">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={t("searchPlaceholder")}
                  aria-label={t("searchTeenBooks")}
                  className="w-full pl-6 pr-16 py-5 text-xl rounded-full border-2 border-indigo-200 text-foreground placeholder:text-muted-foreground/70 bg-card focus:outline-none focus:border-indigo-400"
                />
                <button
                  type="submit"
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-4 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-full hover:from-purple-700 hover:to-indigo-700 transition-colors shadow-lg"
                >
                  <Search className="h-6 w-6" />
                </button>
              </div>
            </div>
          </form>
        </div>
      </section>

      {/* Browse by Category */}
      <section className="py-8 md:py-12 px-4">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-8">
            <h2 className="text-2xl md:text-3xl font-extrabold text-foreground mb-2 tracking-tight">
              Browse by Genre
            </h2>
            <p className="text-muted-foreground">{t("findYourVibe")}</p>
          </div>

          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-11 gap-3 md:gap-4">
            {browseCategories.map((category) => (
              <Link
                key={category.label}
                href={`/opac/teens/search?type=subject&q=${encodeURIComponent(category.query)}`}
                className="flex flex-col items-center gap-2 p-3 md:p-4 rounded-2xl bg-card shadow-sm hover:shadow-lg border-2 border-transparent hover:border-indigo-200 transition-all group"
              >
                <div
                  className={`p-3 md:p-4 rounded-xl ${category.bgColor} group-hover:scale-110 transition-transform`}
                >
                  <category.icon className={`h-6 w-6 md:h-7 md:w-7 ${category.color}`} />
                </div>
                <span className="text-xs md:text-sm font-semibold text-foreground/80 text-center line-clamp-2">
                  {category.label}
                </span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Trending for Teens */}
      <section className="py-8 md:py-12 px-4">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-indigo-100 rounded-xl">
                <TrendingUp className="h-6 w-6 text-indigo-600" />
              </div>
              <h2 className="text-xl md:text-2xl font-extrabold text-foreground tracking-tight">
                Trending for Teens
              </h2>
            </div>
            <Link
              href="/opac/teens/search?sort=popularity"
              className="flex items-center gap-1 text-indigo-600 hover:text-indigo-700 font-semibold"
            >
              See More <ArrowRight className="h-4 w-4" />
            </Link>
          </div>

          {isLoading ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-4">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="animate-pulse">
                  <div className="aspect-[2/3] bg-muted rounded-xl mb-2" />
                  <div className="h-4 bg-muted rounded mb-1" />
                  <div className="h-3 bg-muted rounded w-2/3" />
                </div>
              ))}
            </div>
          ) : trendingBooks.length > 0 ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-4">
              {trendingBooks.map((book) => (
                <TeenBookCard key={book.id} book={book} />
              ))}
            </div>
          ) : (
            <div className="text-center py-12 bg-card rounded-2xl">
              <BookOpen className="h-12 w-12 text-muted-foreground/50 mx-auto mb-3" />
              <p className="text-muted-foreground">{t("searchToGetStarted")}</p>
            </div>
          )}
        </div>
      </section>

      {/* New YA Releases */}
      <section className="py-8 md:py-12 px-4">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-purple-100 rounded-xl">
                <Sparkles className="h-6 w-6 text-purple-600" />
              </div>
              <h2 className="text-xl md:text-2xl font-extrabold text-foreground tracking-tight">
                New YA Releases
              </h2>
            </div>
            <Link
              href="/opac/teens/search?sort=create_date&order=desc"
              className="flex items-center gap-1 text-indigo-600 hover:text-indigo-700 font-semibold"
            >
              See More <ArrowRight className="h-4 w-4" />
            </Link>
          </div>

          {isLoading ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-4">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="animate-pulse">
                  <div className="aspect-[2/3] bg-muted rounded-xl mb-2" />
                  <div className="h-4 bg-muted rounded mb-1" />
                  <div className="h-3 bg-muted rounded w-2/3" />
                </div>
              ))}
            </div>
          ) : newBooks.length > 0 ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-4">
              {newBooks.map((book) => (
                <TeenBookCard key={book.id} book={book} />
              ))}
            </div>
          ) : (
            <div className="text-center py-12 bg-card rounded-2xl">
              <BookOpen className="h-12 w-12 text-muted-foreground/50 mx-auto mb-3" />
              <p className="text-muted-foreground">{t("checkBackNewReleases")}</p>
            </div>
          )}
        </div>
      </section>

      {/* Why Read YA promo */}
      <section className="py-8 px-4">
        <div className="max-w-7xl mx-auto">
          <div className="bg-gradient-to-br from-purple-100 via-indigo-50 to-violet-100 rounded-3xl p-6 md:p-8">
            <h3 className="text-xl font-extrabold text-foreground mb-4 text-center tracking-tight">
              Why Read YA?
            </h3>
            <div className="grid md:grid-cols-3 gap-4">
              <div className="bg-card/70 backdrop-blur-sm rounded-2xl p-4 text-center">
                <Flame className="h-8 w-8 text-purple-600 mx-auto mb-2" />
                <p className="text-sm font-medium text-foreground/80">
                  YA novels tackle real-world issues with stories that resonate.
                </p>
              </div>
              <div className="bg-card/70 backdrop-blur-sm rounded-2xl p-4 text-center">
                <Library className="h-8 w-8 text-indigo-600 mx-auto mb-2" />
                <p className="text-sm font-medium text-foreground/80">
                  Your library card gives you free access to thousands of titles.
                </p>
              </div>
              <div className="bg-card/70 backdrop-blur-sm rounded-2xl p-4 text-center">
                <Globe className="h-8 w-8 text-violet-600 mx-auto mb-2" />
                <p className="text-sm font-medium text-foreground/80">
                  Discover diverse voices and perspectives from around the world.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

function TeenBookCard({ book }: { book: FeaturedBook }) {
  const [imageError, setImageError] = useState(false);

  return (
    <Link href={`/opac/record/${book.id}`} className="group block">
      <div className="relative aspect-[2/3] rounded-xl overflow-hidden bg-gradient-to-br from-purple-100 to-indigo-100 shadow-md group-hover:shadow-xl transition-all group-hover:-translate-y-1">
        {book.coverUrl && !imageError ? (
          <UnoptimizedImage
            src={book.coverUrl}
            alt={book.title}
            className="w-full h-full object-cover"
            onError={() => setImageError(true)}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <BookOpen className="h-12 w-12 text-indigo-300" />
          </div>
        )}
      </div>
      <div className="mt-2">
        <h3 className="font-semibold text-foreground text-sm line-clamp-2 group-hover:text-indigo-600 transition-colors">
          {book.title}
        </h3>
        {book.author && (
          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{book.author}</p>
        )}
      </div>
    </Link>
  );
}
