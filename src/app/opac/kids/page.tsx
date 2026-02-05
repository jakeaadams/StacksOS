"use client";
import { clientLogger } from "@/lib/client-logger";

import { fetchWithAuth } from "@/lib/client-fetch";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { usePatronSession } from "@/hooks/usePatronSession";
import { UnoptimizedImage } from "@/components/shared";
import {
  Search,
  Sparkles,
  Star,
  Trophy,
  BookOpen,
  Rocket,
  Cat,
  Dog,
  Ghost,
  Wand2,
  Swords,
  Globe,
  Microscope,
  Music,
  Gamepad2,
  Heart,
  Laugh,
  Palette,
  Car,
  Crown,
  Flame,
  TreePine,
  Bug,
  Fish,
  Bird,
  Clock,
  ArrowRight,
  Medal,
} from "lucide-react";

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
  readingLevel?: string;
}

function getCoverUrl(record: any): string | undefined {
  const isbn = record.isbn || record.simple_record?.isbn;
  if (isbn) {
    return `https://covers.openlibrary.org/b/isbn/${isbn}-M.jpg`;
  }
  return undefined;
}

function getReadingLevel(record: any): string | undefined {
  if (record.lexile) return `Lexile ${record.lexile}`;
  if (record.ar_level) return `AR ${record.ar_level}`;
  return undefined;
}

function transformBooks(records: any[]): FeaturedBook[] {
  return records.map((record: any) => ({
    id: record.id || record.record_id,
    title: record.title || record.simple_record?.title || "Unknown Title",
    author: record.author || record.simple_record?.author || "",
    coverUrl: getCoverUrl(record),
    readingLevel: record.reading_level || getReadingLevel(record),
  }));
}

const browseCategories: CategoryItem[] = [
  { icon: Wand2, label: "Magic & Fantasy", query: "fantasy", color: "text-purple-600", bgColor: "bg-purple-100" },
  { icon: Rocket, label: "Space & Sci-Fi", query: "science fiction", color: "text-blue-600", bgColor: "bg-blue-100" },
  { icon: Ghost, label: "Spooky Stories", query: "horror", color: "text-muted-foreground", bgColor: "bg-muted/50" },
  { icon: Swords, label: "Adventure", query: "adventure", color: "text-red-600", bgColor: "bg-red-100" },
  { icon: Heart, label: "Friendship", query: "friendship", color: "text-pink-600", bgColor: "bg-pink-100" },
  { icon: Laugh, label: "Funny Books", query: "humor", color: "text-yellow-600", bgColor: "bg-yellow-100" },
  { icon: Dog, label: "Dogs", query: "dogs", color: "text-amber-600", bgColor: "bg-amber-100" },
  { icon: Cat, label: "Cats", query: "cats", color: "text-orange-600", bgColor: "bg-orange-100" },
  { icon: Fish, label: "Ocean Life", query: "ocean", color: "text-cyan-600", bgColor: "bg-cyan-100" },
  { icon: Bug, label: "Bugs & Insects", query: "insects", color: "text-lime-600", bgColor: "bg-lime-100" },
  { icon: Bird, label: "Birds", query: "birds", color: "text-sky-600", bgColor: "bg-sky-100" },
  { icon: TreePine, label: "Nature", query: "nature", color: "text-green-600", bgColor: "bg-green-100" },
  { icon: Microscope, label: "Science", query: "science", color: "text-teal-600", bgColor: "bg-teal-100" },
  { icon: Globe, label: "World & Culture", query: "geography", color: "text-indigo-600", bgColor: "bg-indigo-100" },
  { icon: Clock, label: "History", query: "history", color: "text-stone-600", bgColor: "bg-stone-100" },
  { icon: Music, label: "Music & Dance", query: "music", color: "text-fuchsia-600", bgColor: "bg-fuchsia-100" },
  { icon: Palette, label: "Art & Crafts", query: "art", color: "text-rose-600", bgColor: "bg-rose-100" },
  { icon: Gamepad2, label: "Games & Sports", query: "sports", color: "text-emerald-600", bgColor: "bg-emerald-100" },
  { icon: Car, label: "Things That Go", query: "vehicles", color: "text-slate-600", bgColor: "bg-slate-100" },
  { icon: Crown, label: "Princesses", query: "princesses", color: "text-violet-600", bgColor: "bg-violet-100" },
];

export default function KidsHomePage() {
  const { patron, isLoggedIn } = usePatronSession();
  const [searchQuery, setSearchQuery] = useState("");
  const [featuredBooks, setFeaturedBooks] = useState<FeaturedBook[]>([]);
  const [newBooks, setNewBooks] = useState<FeaturedBook[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchContent = useCallback(async () => {
    try {
      setIsLoading(true);
      
      // Fetch kids books from catalog (juvenile audience)
      const [featuredRes, newRes] = await Promise.all([
        fetchWithAuth("/api/evergreen/catalog?audience=juvenile&sort=popularity&limit=6"),
        fetchWithAuth("/api/evergreen/catalog?audience=juvenile&sort=create_date&order=desc&limit=6"),
      ]);

      if (featuredRes.ok) {
        const data = await featuredRes.json();
        setFeaturedBooks(transformBooks(data.records || []));
      }

      if (newRes.ok) {
        const data = await newRes.json();
        setNewBooks(transformBooks(data.records || []));
      }
    } catch (err) {
      clientLogger.error("Error fetching kids content:", err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchContent();
  }, [fetchContent]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      window.location.href = `/opac/kids/search?q=${encodeURIComponent(searchQuery)}`;
    }
  };

  return (
    <div className="pb-8">
      {/* Hero Section */}
      <section className="relative py-12 md:py-20 overflow-hidden">
        {/* Animated floating elements */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-10 left-10 animate-bounce" style={{ animationDuration: "3s" }}>
            <Star className="h-8 w-8 text-yellow-400" />
          </div>
          <div className="absolute top-20 right-20 animate-bounce" style={{ animationDuration: "2.5s", animationDelay: "0.5s" }}>
            <Sparkles className="h-10 w-10 text-pink-400" />
          </div>
          <div className="absolute bottom-20 left-1/4 animate-bounce" style={{ animationDuration: "3.5s", animationDelay: "1s" }}>
            <BookOpen className="h-8 w-8 text-blue-400" />
          </div>
          <div className="absolute top-1/3 right-10 animate-bounce" style={{ animationDuration: "2.8s", animationDelay: "0.3s" }}>
            <Rocket className="h-9 w-9 text-purple-400" />
          </div>
        </div>

        <div className="relative max-w-4xl mx-auto px-4 text-center">
          {/* Welcome message for logged in users */}
          {isLoggedIn && patron && (
            <div className="mb-6 inline-flex items-center gap-2 px-6 py-3 bg-card/90 rounded-full shadow-lg">
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-green-400 to-emerald-500 
                            flex items-center justify-center text-white font-bold text-sm">
                {patron.firstName?.[0]}
              </div>
              <span className="font-medium text-foreground">
                Hey {patron.firstName}! Ready to explore?
              </span>
              {patron.readingStreak && patron.readingStreak > 0 && (
                <span className="flex items-center gap-1 ml-2 text-orange-500">
                  <Flame className="h-4 w-4" />
                  {patron.readingStreak} day streak!
                </span>
              )}
            </div>
          )}

          <h1 className="text-4xl md:text-6xl font-bold mb-4">
            <span className="bg-gradient-to-r from-pink-500 via-purple-500 to-blue-500 bg-clip-text text-transparent">
              Find Your Next
            </span>
            <br />
            <span className="bg-gradient-to-r from-blue-500 via-green-500 to-yellow-500 bg-clip-text text-transparent">
              Adventure!
            </span>
          </h1>
          
          <p className="text-lg md:text-xl text-muted-foreground mb-8 max-w-2xl mx-auto">
            Discover amazing books, earn badges, and have fun reading!
          </p>

          {/* Big Search */}
          <form onSubmit={handleSearch} className="max-w-2xl mx-auto">
            <div className="relative group">
              <div className="absolute -inset-1 bg-gradient-to-r from-pink-500 via-purple-500 to-blue-500 
                            rounded-full blur-lg opacity-50 group-hover:opacity-75 transition-opacity" />
              <div className="relative">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="What do you want to read about?"
                  className="w-full pl-6 pr-16 py-5 text-xl rounded-full border-2 border-purple-200 
                           text-foreground placeholder:text-muted-foreground/70 bg-card
                           focus:outline-none focus:border-purple-400"
                />
                <button type="submit"
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-4 bg-gradient-to-r 
                           from-purple-500 to-pink-500 text-white rounded-full 
                           hover:from-purple-600 hover:to-pink-600 transition-colors shadow-lg"
                >
                  <Search className="h-6 w-6" />
                </button>
              </div>
            </div>
          </form>
        </div>
      </section>

      {/* Browse by Category - Icon Grid */}
      <section className="py-8 md:py-12 px-4">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-8">
            <h2 className="text-2xl md:text-3xl font-bold text-foreground mb-2">
              What Do You Like?
            </h2>
            <p className="text-muted-foreground">Pick a topic to explore!</p>
          </div>

          <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-10 gap-3 md:gap-4">
            {browseCategories.map((category) => (
              <Link
                key={category.label}
                href={`/opac/kids/search?type=subject&q=${encodeURIComponent(category.query)}`}
                className="flex flex-col items-center gap-2 p-3 md:p-4 rounded-2xl bg-card 
                         shadow-sm hover:shadow-lg border-2 border-transparent
                         hover:border-purple-200 transition-all group"
              >
                <div className={`p-3 md:p-4 rounded-xl ${category.bgColor} 
                              group-hover:scale-110 transition-transform`}>
                  <category.icon className={`h-6 w-6 md:h-8 md:w-8 ${category.color}`} />
                </div>
                <span className="text-xs md:text-sm font-medium text-foreground/80 text-center line-clamp-2">
                  {category.label}
                </span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Reading Challenges Banner */}
      <section className="py-8 px-4">
        <div className="max-w-6xl mx-auto">
          <Link
            href="/opac/kids/challenges"
            className="block relative overflow-hidden rounded-3xl bg-gradient-to-r from-amber-400 via-orange-400 to-red-400 
                     p-6 md:p-8 shadow-xl hover:shadow-2xl transition-shadow group"
          >
            <div className="absolute inset-0 bg-black/5" />
            <div className="relative flex flex-col md:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="p-4 bg-card/20 backdrop-blur-sm rounded-2xl">
                  <Trophy className="h-10 w-10 md:h-12 md:w-12 text-white" />
                </div>
                <div className="text-white text-center md:text-left">
                  <h3 className="text-xl md:text-2xl font-bold">Reading Challenges</h3>
                  <p className="text-white/90">Complete challenges, earn badges, and win prizes!</p>
                </div>
              </div>
              <div className="flex items-center gap-2 px-6 py-3 bg-card/20 backdrop-blur-sm rounded-full 
                            text-white font-bold group-hover:bg-card/30 transition-colors">
                <Medal className="h-5 w-5" />
                <span>See Challenges</span>
                <ArrowRight className="h-5 w-5 group-hover:translate-x-1 transition-transform" />
              </div>
            </div>
          </Link>
        </div>
      </section>

      {/* Featured Books */}
      <section className="py-8 md:py-12 px-4">
        <div className="max-w-6xl mx-auto">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-yellow-100 rounded-xl">
                <Star className="h-6 w-6 text-yellow-500" />
              </div>
              <h2 className="text-xl md:text-2xl font-bold text-foreground">Popular Right Now</h2>
            </div>
            <Link
              href="/opac/kids/search?sort=popularity"
              className="flex items-center gap-1 text-purple-600 hover:text-purple-700 font-medium"
            >
              See More
              <ArrowRight className="h-4 w-4" />
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
          ) : featuredBooks.length > 0 ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-4">
              {featuredBooks.map((book) => (
                <KidsBookCard key={book.id} book={book} />
              ))}
            </div>
          ) : (
            <div className="text-center py-12 bg-card rounded-2xl">
              <BookOpen className="h-12 w-12 text-muted-foreground/50 mx-auto mb-3" />
              <p className="text-muted-foreground">Search for books to get started!</p>
            </div>
          )}
        </div>
      </section>

      {/* New Books */}
      <section className="py-8 md:py-12 px-4">
        <div className="max-w-6xl mx-auto">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-100 rounded-xl">
                <Sparkles className="h-6 w-6 text-green-500" />
              </div>
              <h2 className="text-xl md:text-2xl font-bold text-foreground">New Books</h2>
            </div>
            <Link
              href="/opac/kids/search?sort=create_date&order=desc"
              className="flex items-center gap-1 text-purple-600 hover:text-purple-700 font-medium"
            >
              See More
              <ArrowRight className="h-4 w-4" />
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
                <KidsBookCard key={book.id} book={book} />
              ))}
            </div>
          ) : (
            <div className="text-center py-12 bg-card rounded-2xl">
              <BookOpen className="h-12 w-12 text-muted-foreground/50 mx-auto mb-3" />
              <p className="text-muted-foreground">Check back for new books!</p>
            </div>
          )}
        </div>
      </section>

      {/* Fun Facts / Reading Tips */}
      <section className="py-8 px-4">
        <div className="max-w-6xl mx-auto">
          <div className="bg-gradient-to-br from-purple-100 via-pink-50 to-blue-100 rounded-3xl p-6 md:p-8">
            <h3 className="text-xl font-bold text-foreground mb-4 text-center">
              Did You Know?
            </h3>
            <div className="grid md:grid-cols-3 gap-4">
              <div className="bg-card/70 backdrop-blur-sm rounded-2xl p-4 text-center">
                <BookOpen className="h-8 w-8 text-purple-500 mx-auto mb-2" />
                <p className="text-sm text-foreground/80">
                  Reading for just 20 minutes a day can help you learn 1.8 million words a year!
                </p>
              </div>
              <div className="bg-card/70 backdrop-blur-sm rounded-2xl p-4 text-center">
                <Trophy className="h-8 w-8 text-yellow-500 mx-auto mb-2" />
                <p className="text-sm text-foreground/80">
                  Complete reading challenges to earn cool badges and prizes!
                </p>
              </div>
              <div className="bg-card/70 backdrop-blur-sm rounded-2xl p-4 text-center">
                <Star className="h-8 w-8 text-pink-500 mx-auto mb-2" />
                <p className="text-sm text-foreground/80">
                  You can request any book in our catalog to be held for you!
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

// Kids-specific Book Card component
function KidsBookCard({ book }: { book: FeaturedBook }) {
  const [imageError, setImageError] = useState(false);

  return (
    <Link
      href={`/opac/kids/record/${book.id}`}
      className="group block"
    >
      <div className="relative aspect-[2/3] rounded-xl overflow-hidden bg-gradient-to-br from-purple-100 to-pink-100 
                    shadow-md group-hover:shadow-xl transition-all group-hover:-translate-y-1">
        {book.coverUrl && !imageError ? (
          <UnoptimizedImage
            src={book.coverUrl}
            alt={book.title}
            className="w-full h-full object-cover"
            onError={() => setImageError(true)}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <BookOpen className="h-12 w-12 text-purple-300" />
          </div>
        )}
        
        {/* Reading level badge */}
        {book.readingLevel && (
          <div className="absolute top-2 left-2 px-2 py-1 bg-card/90 backdrop-blur-sm 
                        rounded-full text-xs font-medium text-purple-700 shadow-sm">
            {book.readingLevel}
          </div>
        )}
      </div>
      
      <div className="mt-2">
        <h3 className="font-medium text-foreground text-sm line-clamp-2 group-hover:text-purple-600 transition-colors">
          {book.title}
        </h3>
        {book.author && (
          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{book.author}</p>
        )}
      </div>
    </Link>
  );
}
