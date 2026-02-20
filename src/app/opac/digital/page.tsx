"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLibrary } from "@/hooks/use-library";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Download,
  ExternalLink,
  Headphones,
  Library,
  MonitorPlay,
  Search,
  Smartphone,
  Tablet,
  Wifi,
  CheckCircle2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { getEContentProviders, type EContentProvider } from "@/lib/econtent-providers";

const TYPE_LABELS: Record<string, { label: string; icon: React.ElementType }> = {
  ebook: { label: "eBooks", icon: BookOpen },
  eaudiobook: { label: "eAudiobooks", icon: Headphones },
  streaming: { label: "Streaming", icon: MonitorPlay },
  emagazine: { label: "eMagazines", icon: Tablet },
};

function ProviderCard({ provider }: { provider: EContentProvider }) {
  return (
    <div className="bg-card rounded-xl border border-border p-6 hover:shadow-lg transition-shadow">
      <div className="flex items-start gap-4 mb-4">
        {/* Logo placeholder */}
        <div
          className="w-16 h-16 rounded-xl flex items-center justify-center shrink-0"
          style={{ backgroundColor: provider.color + "15" }}
        >
          <Library className="h-8 w-8" style={{ color: provider.color }} />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-xl font-semibold text-foreground">{provider.name}</h3>
          <div className="flex flex-wrap gap-1.5 mt-1.5">
            {provider.types.map((type) => {
              const info = TYPE_LABELS[type];
              return info ? (
                <Badge key={type} variant="secondary" className="text-xs gap-1">
                  <info.icon className="h-3 w-3" />
                  {info.label}
                </Badge>
              ) : null;
            })}
          </div>
        </div>
      </div>

      <p className="text-muted-foreground text-sm mb-4 leading-relaxed">{provider.description}</p>

      {provider.alwaysAvailableTitles && (
        <p className="text-sm text-green-600 dark:text-green-400 font-medium mb-4 flex items-center gap-1.5">
          <CheckCircle2 className="h-4 w-4" />
          {provider.alwaysAvailableTitles.toLocaleString()}+ always available titles
        </p>
      )}

      <a
        href={provider.browseUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-2 px-4 py-2.5 bg-primary-600 text-white rounded-lg
                 hover:bg-primary-700 transition-colors font-medium text-sm"
      >
        Browse Collection
        <ExternalLink className="h-4 w-4" />
      </a>
    </div>
  );
}

const GETTING_STARTED_STEPS = [
  {
    step: 1,
    title: "Get a Library Card",
    description: "If you do not have one, sign up for a free library card online or at any branch.",
    icon: Library,
  },
  {
    step: 2,
    title: "Choose a Platform",
    description:
      "Pick a digital service above. Each offers a different selection of eBooks, audiobooks, and streaming content.",
    icon: Smartphone,
  },
  {
    step: 3,
    title: "Download the App",
    description:
      "Install the provider app on your phone, tablet, or computer. Most are available on iOS, Android, and desktop.",
    icon: Download,
  },
  {
    step: 4,
    title: "Sign In with Your Card",
    description:
      "Open the app, search for your library, and sign in with your library card number and PIN.",
    icon: CheckCircle2,
  },
  {
    step: 5,
    title: "Browse & Borrow",
    description:
      "Search or browse the collection, borrow titles instantly, and enjoy on any device. Items return automatically!",
    icon: BookOpen,
  },
];

export default function DigitalLibraryPage() {
  const router = useRouter();
  const { library } = useLibrary();
  const providers = getEContentProviders();
  const [searchQuery, setSearchQuery] = useState("");

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      router.push(`/opac/search?q=${encodeURIComponent(searchQuery)}&format=ebook`);
    }
  };

  return (
    <div className="min-h-screen bg-muted/30">
      {/* Page header */}
      <div className="bg-gradient-to-r from-purple-600 to-indigo-700 text-white py-10 md:py-14">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex items-center gap-2 mb-2">
            <Link
              href="/opac"
              className="text-purple-200 hover:text-white transition-colors text-sm inline-flex items-center gap-1"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to Catalog
            </Link>
          </div>
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-white/10 rounded-lg">
              <Smartphone className="h-8 w-8" />
            </div>
            <h1 className="text-3xl md:text-4xl font-bold">Digital Library</h1>
          </div>
          <p className="text-purple-100 text-lg max-w-2xl mb-6">
            Free eBooks, audiobooks, movies, and more -- all you need is your{" "}
            {library?.name || "library"} card.
          </p>

          {/* Search bar */}
          <form onSubmit={handleSearch} className="max-w-xl">
            <div className="relative">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search for eBooks & digital content..."
                className="w-full pl-5 pr-14 py-3.5 rounded-full text-foreground placeholder:text-muted-foreground
                         bg-white shadow-lg focus:outline-none focus:ring-4 focus:ring-white/30"
              />
              <button
                type="submit"
                className="absolute right-2 top-1/2 -translate-y-1/2 p-2.5 bg-purple-600 text-white
                         rounded-full hover:bg-purple-700 transition-colors"
                aria-label="Search digital library"
              >
                <Search className="h-5 w-5" />
              </button>
            </div>
          </form>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-10">
        {/* Provider cards */}
        <section className="mb-16">
          <h2 className="text-2xl md:text-3xl font-bold text-foreground mb-2">
            Digital Content Providers
          </h2>
          <p className="text-muted-foreground mb-8">
            Browse thousands of free digital titles through these partner platforms.
          </p>

          <div className="grid md:grid-cols-2 gap-6">
            {providers.map((provider) => (
              <ProviderCard key={provider.id} provider={provider} />
            ))}
          </div>
        </section>

        {/* Always Available section */}
        <section className="mb-16">
          <div className="bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-950/20 dark:to-emerald-950/20 rounded-2xl border border-green-200 dark:border-green-800/50 p-8 md:p-10">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-green-100 dark:bg-green-900/30 rounded-lg">
                <Wifi className="h-6 w-6 text-green-600 dark:text-green-400" />
              </div>
              <h2 className="text-2xl md:text-3xl font-bold text-foreground">Always Available</h2>
            </div>
            <p className="text-muted-foreground mb-6 max-w-2xl">
              No waiting, no holds. These titles are available to borrow instantly, anytime. Many
              providers offer large collections of always-available content including self-published
              titles, classics, and indie films.
            </p>

            <div className="grid sm:grid-cols-3 gap-4 mb-6">
              <div className="bg-white dark:bg-card rounded-lg p-4 border border-green-200 dark:border-green-800/50">
                <BookOpen className="h-6 w-6 text-green-600 dark:text-green-400 mb-2" />
                <h3 className="font-semibold text-foreground">eBooks</h3>
                <p className="text-sm text-muted-foreground">
                  Thousands of titles across fiction, nonfiction, romance, mystery, and more.
                </p>
              </div>
              <div className="bg-white dark:bg-card rounded-lg p-4 border border-green-200 dark:border-green-800/50">
                <Headphones className="h-6 w-6 text-green-600 dark:text-green-400 mb-2" />
                <h3 className="font-semibold text-foreground">eAudiobooks</h3>
                <p className="text-sm text-muted-foreground">
                  Listen on the go with instantly available audiobooks on any device.
                </p>
              </div>
              <div className="bg-white dark:bg-card rounded-lg p-4 border border-green-200 dark:border-green-800/50">
                <MonitorPlay className="h-6 w-6 text-green-600 dark:text-green-400 mb-2" />
                <h3 className="font-semibold text-foreground">Streaming Video</h3>
                <p className="text-sm text-muted-foreground">
                  Documentaries, indie films, and educational content available to stream now.
                </p>
              </div>
            </div>

            <Link
              href="/opac/search?format=ebook"
              className="inline-flex items-center gap-2 text-green-700 dark:text-green-400 font-medium hover:underline"
            >
              Browse eBooks in the catalog
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </section>

        {/* How to Get Started */}
        <section>
          <h2 className="text-2xl md:text-3xl font-bold text-foreground mb-2">
            How to Get Started with eBooks
          </h2>
          <p className="text-muted-foreground mb-8">
            New to digital borrowing? Follow these simple steps to start reading today.
          </p>

          <div className="grid md:grid-cols-5 gap-4">
            {GETTING_STARTED_STEPS.map(({ step, title, description, icon: Icon }) => (
              <div key={step} className="relative">
                <div className="bg-card rounded-xl border border-border p-5 h-full">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-8 h-8 bg-primary-100 dark:bg-primary-900/30 rounded-full flex items-center justify-center text-sm font-bold text-primary-700 dark:text-primary-300">
                      {step}
                    </div>
                    <Icon className="h-5 w-5 text-primary-600 dark:text-primary-400" />
                  </div>
                  <h3 className="font-semibold text-foreground mb-1.5">{title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{description}</p>
                </div>
                {step < 5 && (
                  <div className="hidden md:flex absolute top-1/2 -right-2 -translate-y-1/2 z-10">
                    <ArrowRight className="h-4 w-4 text-muted-foreground/40" />
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* CTA */}
          <div className="mt-10 text-center">
            <p className="text-muted-foreground mb-4">
              Need help getting started? Visit any branch or contact us for one-on-one assistance.
            </p>
            <div className="flex flex-wrap justify-center gap-3">
              <Link
                href="/opac/register"
                className="inline-flex items-center gap-2 px-6 py-3 bg-primary-600 text-white rounded-lg
                         hover:bg-primary-700 transition-colors font-medium"
              >
                Get a Library Card
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                href="/opac/help"
                className="inline-flex items-center gap-2 px-6 py-3 bg-card text-foreground rounded-lg
                         border border-border hover:bg-muted/50 transition-colors font-medium"
              >
                Help & FAQs
              </Link>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
