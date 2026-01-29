"use client";

import { useState } from "react";
import Link from "next/link";
import {
  BookOpen,
  Music,
  Film,
  Gamepad2,
  Heart,
  Sparkles,
  TrendingUp,
  Library,
  GraduationCap,
  Baby,
  Briefcase,
  Plane,
  Palette,
  Dumbbell,
  Leaf,
  Computer,
  ChevronRight,
} from "lucide-react";

interface BrowseCategory {
  name: string;
  icon: React.ElementType;
  color: string;
  bgColor: string;
  subjects: string[];
}

const BROWSE_CATEGORIES: BrowseCategory[] = [
  {
    name: "Fiction",
    icon: BookOpen,
    color: "text-blue-600",
    bgColor: "bg-blue-100",
    subjects: ["General Fiction", "Literary Fiction", "Historical Fiction", "Mystery", "Thriller", "Romance", "Science Fiction", "Fantasy", "Horror"],
  },
  {
    name: "Non-Fiction",
    icon: GraduationCap,
    color: "text-emerald-600",
    bgColor: "bg-emerald-100",
    subjects: ["Biography", "History", "Science", "Philosophy", "Psychology", "Self-Help", "True Crime", "Politics", "Economics"],
  },
  {
    name: "Children",
    icon: Baby,
    color: "text-pink-600",
    bgColor: "bg-pink-100",
    subjects: ["Picture Books", "Early Readers", "Chapter Books", "Middle Grade", "Young Adult", "Educational", "Activity Books"],
  },
  {
    name: "Arts & Entertainment",
    icon: Palette,
    color: "text-purple-600",
    bgColor: "bg-purple-100",
    subjects: ["Art", "Music", "Film", "Photography", "Theater", "Dance", "Architecture", "Design"],
  },
  {
    name: "Health & Wellness",
    icon: Dumbbell,
    color: "text-red-600",
    bgColor: "bg-red-100",
    subjects: ["Fitness", "Nutrition", "Mental Health", "Medicine", "Alternative Health", "Diet", "Yoga", "Sports"],
  },
  {
    name: "Home & Garden",
    icon: Leaf,
    color: "text-green-600",
    bgColor: "bg-green-100",
    subjects: ["Gardening", "Home Improvement", "Interior Design", "Crafts", "DIY", "Cooking", "Pets"],
  },
  {
    name: "Technology",
    icon: Computer,
    color: "text-cyan-600",
    bgColor: "bg-cyan-100",
    subjects: ["Computers", "Programming", "Internet", "Artificial Intelligence", "Gadgets", "Science", "Engineering"],
  },
  {
    name: "Travel",
    icon: Plane,
    color: "text-orange-600",
    bgColor: "bg-orange-100",
    subjects: ["Travel Guides", "Adventure", "World Cultures", "Maps", "Language Learning", "Food & Drink"],
  },
  {
    name: "Business",
    icon: Briefcase,
    color: "text-slate-600",
    bgColor: "bg-slate-100",
    subjects: ["Management", "Marketing", "Finance", "Entrepreneurship", "Investing", "Career", "Leadership"],
  },
];

const FORMATS = [
  { name: "Books", icon: BookOpen, query: "format:book" },
  { name: "eBooks", icon: Computer, query: "format:ebook" },
  { name: "Audiobooks", icon: Music, query: "format:audiobook" },
  { name: "DVDs & Blu-ray", icon: Film, query: "format:dvd" },
  { name: "Music CDs", icon: Music, query: "format:music" },
  { name: "Video Games", icon: Gamepad2, query: "format:game" },
];

const QUICK_LISTS = [
  { name: "New Arrivals", icon: Sparkles, href: "/opac/new-titles" },
  { name: "Most Popular", icon: TrendingUp, href: "/opac/search?sort=popularity" },
  { name: "Staff Picks", icon: Heart, href: "/opac/search?list=staff-picks" },
  { name: "Award Winners", icon: Library, href: "/opac/search?subject=award+winners" },
];

export default function BrowsePage() {
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);

  return (
    <div className="min-h-screen bg-muted/30">
      {/* Header */}
      <div className="bg-white border-b">
        <div className="max-w-6xl mx-auto px-4 py-8">
          <h1 className="text-3xl font-bold text-foreground">Browse the Catalog</h1>
          <p className="mt-2 text-muted-foreground">
            Explore our collection by category, format, or curated lists.
          </p>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-8">
        {/* Quick Lists */}
        <section className="mb-12">
          <h2 className="text-xl font-semibold text-foreground mb-4">Quick Lists</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {QUICK_LISTS.map((list) => (
              <Link
                key={list.name}
                href={list.href}
                className="flex items-center gap-3 p-4 bg-white rounded-xl border border-border 
                         hover:border-primary-300 hover:shadow-md transition-all"
              >
                <div className="p-2 bg-primary-100 rounded-lg">
                  <list.icon className="h-5 w-5 text-primary-600" />
                </div>
                <span className="font-medium text-foreground">{list.name}</span>
              </Link>
            ))}
          </div>
        </section>

        {/* Browse by Format */}
        <section className="mb-12">
          <h2 className="text-xl font-semibold text-foreground mb-4">Browse by Format</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            {FORMATS.map((format) => (
              <Link
                key={format.name}
                href={`/opac/search?${format.query}`}
                className="flex flex-col items-center gap-2 p-4 bg-white rounded-xl border border-border 
                         hover:border-primary-300 hover:shadow-md transition-all text-center"
              >
                <div className="p-3 bg-muted/50 rounded-full">
                  <format.icon className="h-6 w-6 text-muted-foreground" />
                </div>
                <span className="text-sm font-medium text-foreground">{format.name}</span>
              </Link>
            ))}
          </div>
        </section>

        {/* Browse by Subject */}
        <section>
          <h2 className="text-xl font-semibold text-foreground mb-4">Browse by Subject</h2>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {BROWSE_CATEGORIES.map((category) => {
              const isExpanded = expandedCategory === category.name;
              
              return (
                <div
                  key={category.name}
                  className="bg-white rounded-xl border border-border overflow-hidden"
                >
                  <button type="button"
                    onClick={() => setExpandedCategory(isExpanded ? null : category.name)}
                    className="w-full p-4 flex items-center justify-between hover:bg-muted/30 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-lg ${category.bgColor}`}>
                        <category.icon className={`h-5 w-5 ${category.color}`} />
                      </div>
                      <span className="font-medium text-foreground">{category.name}</span>
                    </div>
                    <ChevronRight 
                      className={`h-5 w-5 text-muted-foreground/70 transition-transform ${isExpanded ? "rotate-90" : ""}`} 
                    />
                  </button>
                  
                  {isExpanded && (
                    <div className="px-4 pb-4 border-t border-border/50">
                      <div className="pt-3 space-y-1">
                        {category.subjects.map((subject) => (
                          <Link
                            key={subject}
                            href={`/opac/search?q=subject:${encodeURIComponent(subject)}`}
                            className="block px-3 py-2 text-sm text-muted-foreground hover:bg-muted/30 
                                     hover:text-primary-600 rounded-lg transition-colors"
                          >
                            {subject}
                          </Link>
                        ))}
                        <Link
                          href={`/opac/search?q=subject:${encodeURIComponent(category.name)}`}
                          className="block px-3 py-2 text-sm font-medium text-primary-600 
                                   hover:bg-primary-50 rounded-lg transition-colors"
                        >
                          View all {category.name} →
                        </Link>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        {/* Authors A-Z */}
        <section className="mt-12">
          <h2 className="text-xl font-semibold text-foreground mb-4">Browse Authors A-Z</h2>
          <div className="bg-white rounded-xl border border-border p-4">
            <div className="flex flex-wrap gap-2">
              {"ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("").map((letter) => (
                <Link
                  key={letter}
                  href={`/opac/search?q=author:${letter}*&sort=author`}
                  className="w-10 h-10 flex items-center justify-center rounded-lg border border-border
                           hover:border-primary-300 hover:bg-primary-50 hover:text-primary-600 
                           font-medium text-foreground/80 transition-colors"
                >
                  {letter}
                </Link>
              ))}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
