"use client";
import { clientLogger } from "@/lib/client-logger";

import { fetchWithAuth } from "@/lib/client-fetch";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  BookOpen,
  Wand2,
  Rocket,
  Ghost,
  Swords,
  Heart,
  Laugh,
  Dog,
  Cat,
  Fish,
  Bug,
  Bird,
  TreePine,
  Microscope,
  Globe,
  Clock,
  Music,
  Palette,
  Gamepad2,
  Car,
  Crown,
  ChevronLeft,
  
  ArrowRight,
} from "lucide-react";
import { LoadingSpinner } from "@/components/shared/loading-state";

interface Category {
  id: string;
  label: string;
  query: string;
  icon: React.ElementType;
  color: string;
  bgColor: string;
  description: string;
}

interface Book {
  id: number;
  title: string;
  author: string;
  coverUrl?: string;
  readingLevel?: string;
}

const categories: Category[] = [
  { id: "fantasy", label: "Magic & Fantasy", query: "subject:fantasy", icon: Wand2, color: "text-purple-600", bgColor: "bg-purple-100", description: "Dragons, wizards, and magical adventures!" },
  { id: "scifi", label: "Space & Sci-Fi", query: "subject:science fiction", icon: Rocket, color: "text-blue-600", bgColor: "bg-blue-100", description: "Explore space and the future!" },
  { id: "horror", label: "Spooky Stories", query: "subject:horror", icon: Ghost, color: "text-muted-foreground", bgColor: "bg-muted/50", description: "Thrilling and scary tales!" },
  { id: "adventure", label: "Adventure", query: "subject:adventure", icon: Swords, color: "text-red-600", bgColor: "bg-red-100", description: "Epic quests and exciting journeys!" },
  { id: "friendship", label: "Friendship", query: "subject:friendship", icon: Heart, color: "text-pink-600", bgColor: "bg-pink-100", description: "Stories about friends and relationships!" },
  { id: "humor", label: "Funny Books", query: "subject:humor", icon: Laugh, color: "text-yellow-600", bgColor: "bg-yellow-100", description: "Books that will make you laugh!" },
  { id: "dogs", label: "Dogs", query: "subject:dogs", icon: Dog, color: "text-amber-600", bgColor: "bg-amber-100", description: "All about our furry friends!" },
  { id: "cats", label: "Cats", query: "subject:cats", icon: Cat, color: "text-orange-600", bgColor: "bg-orange-100", description: "Purrfect stories about cats!" },
  { id: "ocean", label: "Ocean Life", query: "subject:ocean", icon: Fish, color: "text-cyan-600", bgColor: "bg-cyan-100", description: "Dive into underwater worlds!" },
  { id: "insects", label: "Bugs & Insects", query: "subject:insects", icon: Bug, color: "text-lime-600", bgColor: "bg-lime-100", description: "Creepy crawly creatures!" },
  { id: "birds", label: "Birds", query: "subject:birds", icon: Bird, color: "text-sky-600", bgColor: "bg-sky-100", description: "Feathered friends that fly!" },
  { id: "nature", label: "Nature", query: "subject:nature", icon: TreePine, color: "text-green-600", bgColor: "bg-green-100", description: "The great outdoors!" },
  { id: "science", label: "Science", query: "subject:science", icon: Microscope, color: "text-teal-600", bgColor: "bg-teal-100", description: "Discover how things work!" },
  { id: "geography", label: "World & Culture", query: "subject:geography", icon: Globe, color: "text-indigo-600", bgColor: "bg-indigo-100", description: "Explore countries and cultures!" },
  { id: "history", label: "History", query: "subject:history", icon: Clock, color: "text-stone-600", bgColor: "bg-stone-100", description: "Learn about the past!" },
  { id: "music", label: "Music & Dance", query: "subject:music", icon: Music, color: "text-fuchsia-600", bgColor: "bg-fuchsia-100", description: "Sing, dance, and play!" },
  { id: "art", label: "Art & Crafts", query: "subject:art", icon: Palette, color: "text-rose-600", bgColor: "bg-rose-100", description: "Get creative!" },
  { id: "sports", label: "Games & Sports", query: "subject:sports", icon: Gamepad2, color: "text-emerald-600", bgColor: "bg-emerald-100", description: "Play and compete!" },
  { id: "vehicles", label: "Things That Go", query: "subject:vehicles", icon: Car, color: "text-slate-600", bgColor: "bg-slate-100", description: "Cars, trucks, trains, and planes!" },
  { id: "princesses", label: "Princesses", query: "subject:princesses", icon: Crown, color: "text-violet-600", bgColor: "bg-violet-100", description: "Royal adventures!" },
];

function BrowseContent() {
  const searchParams = useSearchParams();
  const categoryId = searchParams.get("category");
  
  const [selectedCategory, setSelectedCategory] = useState<Category | null>(null);
  const [books, setBooks] = useState<Book[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (categoryId) {
      const cat = categories.find((c) => c.id === categoryId);
      if (cat) {
        setSelectedCategory(cat);
        fetchBooks(cat.query);
      }
    } else {
      setSelectedCategory(null);
      setBooks([]);
    }
  }, [categoryId]);

  const fetchBooks = async (query: string) => {
    setIsLoading(true);
    try {
      const response = await fetchWithAuth(
        `/api/evergreen/catalog?${query}&audience=juvenile&limit=24`
      );
      if (response.ok) {
        const data = await response.json();
        setBooks(
          (data.records || []).map((r: any) => ({
            id: r.id || r.record_id,
            title: r.title || r.simple_record?.title || "Unknown Title",
            author: r.author || r.simple_record?.author || "",
            coverUrl: (r.isbn || r.simple_record?.isbn)
              ? `https://covers.openlibrary.org/b/isbn/${r.isbn || r.simple_record?.isbn}-M.jpg`
              : undefined,
            readingLevel: r.lexile ? `Lexile ${r.lexile}` : r.ar_level ? `AR ${r.ar_level}` : undefined,
          }))
        );
      }
    } catch (err) {
      clientLogger.error("Error fetching books:", err);
    } finally {
      setIsLoading(false);
    }
  };

  if (selectedCategory) {
    const Icon = selectedCategory.icon;
    return (
      <div className="max-w-6xl mx-auto px-4 py-8">
        {/* Back button and header */}
        <div className="mb-8">
          <Link
            href="/opac/kids/browse"
            className="inline-flex items-center gap-2 text-purple-600 hover:text-purple-700 mb-4"
          >
            <ChevronLeft className="h-5 w-5" />
            <span className="font-medium">All Categories</span>
          </Link>

          <div className="flex items-center gap-4">
            <div className={`p-4 rounded-2xl ${selectedCategory.bgColor}`}>
              <Icon className={`h-10 w-10 ${selectedCategory.color}`} />
            </div>
            <div>
              <h1 className="text-2xl md:text-3xl font-bold text-foreground">
                {selectedCategory.label}
              </h1>
              <p className="text-muted-foreground">{selectedCategory.description}</p>
            </div>
          </div>
        </div>

        {/* Books grid */}
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <LoadingSpinner size="lg" />
          </div>
        ) : books.length > 0 ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
            {books.map((book) => (
              <BookCard key={book.id} book={book} />
            ))}
          </div>
        ) : (
          <div className="text-center py-20 bg-card rounded-3xl">
            <BookOpen className="h-12 w-12 text-muted-foreground/50 mx-auto mb-3" />
            <p className="text-muted-foreground">No books found in this category.</p>
          </div>
        )}
      </div>
    );
  }

  // Category grid view
  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <div className="text-center mb-8">
        <h1 className="text-2xl md:text-3xl font-bold text-foreground mb-2">
          Browse by Category
        </h1>
        <p className="text-muted-foreground">Pick a topic you like!</p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
        {categories.map((category) => {
          const Icon = category.icon;
          return (
            <Link
              key={category.id}
              href={`/opac/kids/browse?category=${category.id}`}
              className="flex flex-col items-center gap-3 p-6 bg-card rounded-2xl shadow-sm 
                       border-2 border-transparent hover:border-purple-200 hover:shadow-md 
                       transition-all group"
            >
              <div className={`p-4 rounded-2xl ${category.bgColor} 
                            group-hover:scale-110 transition-transform`}>
                <Icon className={`h-10 w-10 ${category.color}`} />
              </div>
              <div className="text-center">
                <h3 className="font-bold text-foreground group-hover:text-purple-600 transition-colors">
                  {category.label}
                </h3>
                <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                  {category.description}
                </p>
              </div>
              <div className="flex items-center gap-1 text-purple-600 text-sm font-medium opacity-0 
                           group-hover:opacity-100 transition-opacity">
                Explore
                <ArrowRight className="h-4 w-4" />
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

function BookCard({ book }: { book: Book }) {
  const [imageError, setImageError] = useState(false);

  return (
    <Link href={`/opac/kids/record/${book.id}`} className="group block">
      <div className="relative aspect-[2/3] rounded-xl overflow-hidden bg-gradient-to-br from-purple-100 to-pink-100 
                    shadow-md group-hover:shadow-xl transition-all group-hover:-translate-y-1">
        {book.coverUrl && !imageError ? (
          <img
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

        {book.readingLevel && (
          <div className="absolute top-2 left-2 px-2 py-1 bg-card/90 backdrop-blur-sm 
                        rounded-full text-xs font-medium text-purple-700">
            {book.readingLevel}
          </div>
        )}
      </div>
      <div className="mt-2">
        <h3 className="font-medium text-foreground text-sm line-clamp-2 group-hover:text-purple-600">
          {book.title}
        </h3>
        {book.author && (
          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{book.author}</p>
        )}
      </div>
    </Link>
  );
}

export default function KidsBrowsePage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center py-20">
        <LoadingSpinner size="lg" />
      </div>
    }>
      <BrowseContent />
    </Suspense>
  );
}
