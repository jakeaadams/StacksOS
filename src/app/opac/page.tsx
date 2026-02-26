"use client";

import { fetchWithAuth } from "@/lib/client-fetch";
import { clientLogger } from "@/lib/client-logger";
import { featureFlags } from "@/lib/feature-flags";

import Image from "next/image";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useLibrary } from "@/hooks/use-library";
import { usePatronSession } from "@/hooks/use-patron-session";
import { BookCard } from "@/components/opac/book-card";
import { RecommendedForYou } from "@/components/opac/recommended-for-you";
import { SearchAutocomplete } from "@/components/opac/search-autocomplete";
import {
  BookOpen,
  Clock,
  Star,
  TrendingUp,
  Sparkles,
  ArrowRight,
  Smartphone,
  Headphones,
  MonitorPlay,
  MapPin,
  CalendarDays,
} from "lucide-react";

import type { LibraryEvent } from "@/lib/events-data";

import { useTranslations } from "next-intl";

interface FeaturedBook {
  id: number;
  title: string;
  author: string;
  coverUrl?: string;
  availableCopies: number;
  totalCopies: number;
  rating?: number;
}

interface StaffPick {
  id: number;
  title: string;
  author: string;
  coverUrl?: string;
  staffName: string;
  staffBranch: string;
  review: string;
}

function getCoverUrl(record: any): string | undefined {
  const isbn = record.isbn || record.simple_record?.isbn;
  if (isbn) {
    return `https://covers.openlibrary.org/b/isbn/${isbn}-M.jpg`;
  }
  return undefined;
}

function transformCatalogResults(records: any[]): FeaturedBook[] {
  return records.map((record) => ({
    id: record.id || record.record_id,
    title: record.title || record.simple_record?.title || "Unknown Title",
    author: record.author || record.simple_record?.author || "",
    coverUrl: getCoverUrl(record),
    availableCopies: record.available_copies || record.availability?.available || 0,
    totalCopies: record.total_copies || record.availability?.total || 0,
    rating: record.rating,
  }));
}

export default function OPACHomePage() {
  const t = useTranslations("home");
  const { library, currentLocation } = useLibrary();
  const { patron, isLoggedIn, holds } = usePatronSession();
  const browseEnabled = featureFlags.opacBrowseV2;
  const [newArrivals, setNewArrivals] = useState<FeaturedBook[]>([]);
  const [popularItems, setPopularItems] = useState<FeaturedBook[]>([]);
  const [staffPicks, setStaffPicks] = useState<StaffPick[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [featuredEvents, setFeaturedEvents] = useState<LibraryEvent[]>([]);

  const fetchFeaturedContent = useCallback(async () => {
    if (!browseEnabled) {
      setNewArrivals([]);
      setPopularItems([]);
      setStaffPicks([]);
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);

      // Fetch new arrivals from Evergreen catalog
      const [newResponse, popularResponse] = await Promise.all([
        fetchWithAuth("/api/evergreen/catalog?sort=create_date&limit=8&order=desc"),
        fetchWithAuth("/api/evergreen/catalog?sort=popularity&limit=8"),
      ]);

      if (newResponse.ok) {
        const data = await newResponse.json();
        setNewArrivals(transformCatalogResults(data.records || []));
      }

      if (popularResponse.ok) {
        const data = await popularResponse.json();
        setPopularItems(transformCatalogResults(data.records || []));
      }

      // Fetch staff picks from Evergreen public bookbags
      try {
        const staffPicksResponse = await fetchWithAuth("/api/opac/staff-picks?limit=4");
        if (staffPicksResponse.ok) {
          const picksData = await staffPicksResponse.json();
          setStaffPicks(picksData.picks || []);
        }
      } catch (error) {
        // Staff picks are optional - don't fail if unavailable
        clientLogger.warn("Failed to fetch staff picks", { error });
      }

      // Fetch featured events for the home page
      if (featureFlags.opacEvents) {
        try {
          const eventsResponse = await fetch("/api/opac/events?featured=true&limit=4");
          if (eventsResponse.ok) {
            const eventsData = await eventsResponse.json();
            setFeaturedEvents(eventsData.events || []);
          }
        } catch {
          // Events are optional - don't fail if unavailable
        }
      }
    } catch (err) {
      clientLogger.error("Error fetching featured content:", err);
    } finally {
      setIsLoading(false);
    }
  }, [browseEnabled]);

  useEffect(() => {
    void fetchFeaturedContent();
  }, [fetchFeaturedContent]);

  useEffect(() => {
    document.title = library?.name ? `${library.name} | Library Catalog` : "Library Catalog";
  }, [library?.name]);

  const QuickSearchChip = ({ label, href }: { label: string; href: string }) => (
    <Link
      href={href}
      className="rounded-full border border-white/25 bg-white/10 px-4 py-2 text-sm font-medium text-white/90 transition-colors hover:bg-white/20 hover:text-white"
    >
      {label}
    </Link>
  );

  const FormatCard = ({
    icon: Icon,
    label,
    href,
    color,
  }: {
    icon: React.ElementType;
    label: string;
    href: string;
    color: string;
  }) => (
    <Link
      href={href}
      className="stx-surface flex flex-col items-center gap-3 p-6 
               hover:shadow-md hover:border-primary-400/40 transition-all group"
    >
      <div
        className={`p-4 rounded-full ${color} group-hover:scale-110 transition-transform shadow-sm`}
      >
        <Icon className="h-8 w-8 text-white" />
      </div>
      <span className="font-medium text-foreground">{label}</span>
    </Link>
  );

  return (
    <div className="min-h-screen">
      {/* Hero section with search */}
      <section
        className="relative bg-gradient-to-br from-primary-600 via-primary-700 to-primary-800 
                        text-white py-16 md:py-24"
      >
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_15%,hsl(var(--primary-foreground)/0.15)_0%,transparent_45%),radial-gradient(circle_at_80%_80%,hsl(var(--primary-foreground)/0.12)_0%,transparent_44%)]" />

        <div className="relative max-w-4xl mx-auto px-4 text-center">
          <h1 className="text-3xl md:text-5xl font-bold mb-4">Discover Your Next Great Read</h1>
          <p className="text-lg md:text-xl text-primary-100 mb-8 max-w-2xl mx-auto">
            {t("discoverSubtitle")}
          </p>

          {/* Search form with autocomplete and scope selector */}
          <SearchAutocomplete variant="hero" showScopeSelector />

          {/* Quick search suggestions */}
          <div className="mt-6 flex flex-wrap justify-center gap-2">
            <QuickSearchChip
              label={t("newReleases")}
              href={browseEnabled ? "/opac/new-titles" : "/opac/search?sort=create_date&order=desc"}
            />
            <QuickSearchChip label={t("popular")} href="/opac/search?sort=popularity" />
            <QuickSearchChip
              label={t("awardWinners")}
              href={`/opac/search?q=${encodeURIComponent("subject: award winners")}`}
            />
            <QuickSearchChip
              label={t("bookClub")}
              href={`/opac/search?q=${encodeURIComponent("subject: book club")}`}
            />
          </div>
        </div>
      </section>

      {/* Logged in user quick access */}
      {isLoggedIn && patron && (
        <section className="bg-card border-b border-border py-4">
          <div className="max-w-7xl mx-auto px-4">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <span className="text-muted-foreground">
                  Welcome back, <strong>{patron.firstName}</strong>!
                </span>
                {patron.checkoutCount > 0 && (
                  <Link
                    href="/opac/account/checkouts"
                    className="text-sm text-primary-600 hover:underline"
                  >
                    {patron.checkoutCount} {t("itemsCheckedOut", { count: patron.checkoutCount })}
                  </Link>
                )}
                {holds.filter((h) => h.status === "ready").length > 0 && (
                  <span className="rounded-full bg-primary-100 px-3 py-1 text-sm font-medium text-primary-800">
                    {holds.filter((h) => h.status === "ready").length}{" "}
                    {t("holdsReady", { count: holds.filter((h) => h.status === "ready").length })}
                  </span>
                )}
              </div>
              <Link
                href="/opac/account"
                className="text-sm text-primary-600 hover:underline font-medium"
              >
                View My Account →
              </Link>
            </div>
          </div>
        </section>
      )}

      {/* Browse by format */}
      <section className="py-12 md:py-16 bg-muted/30">
        <div className="max-w-7xl mx-auto px-4">
          <h2 className="text-2xl md:text-3xl font-bold text-foreground mb-8 text-center">
            Browse by Format
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6">
            <FormatCard
              icon={BookOpen}
              label={t("books")}
              href="/opac/search?format=book"
              color="bg-primary-600"
            />
            <FormatCard
              icon={Smartphone}
              label={t("eBooks")}
              href="/opac/search?format=ebook"
              color="bg-primary-500"
            />
            <FormatCard
              icon={Headphones}
              label={t("audiobooks")}
              href="/opac/search?format=audiobook"
              color="bg-primary-700"
            />
            <FormatCard
              icon={MonitorPlay}
              label={t("moviesTV")}
              href="/opac/search?format=dvd"
              color="bg-primary-800"
            />
          </div>
        </div>
      </section>

      {/* Upcoming Events */}
      {featureFlags.opacEvents && featuredEvents.length > 0 && (
        <section className="py-12 md:py-16 bg-card">
          <div className="max-w-7xl mx-auto px-4">
            <div className="flex items-center justify-between mb-8">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-primary-100 rounded-lg">
                  <CalendarDays className="h-6 w-6 text-primary-600" />
                </div>
                <h2 className="text-2xl md:text-3xl font-bold text-foreground">Upcoming Events</h2>
              </div>
              <Link
                href="/opac/events"
                className="flex items-center gap-1 text-primary-600 hover:text-primary-700 font-medium"
              >
                View All Events
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>

            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
              {featuredEvents.slice(0, 4).map((event) => {
                const eventDate = new Date(event.date + "T12:00:00");
                const monthAbbr = eventDate
                  .toLocaleDateString("en-US", { month: "short" })
                  .toUpperCase();
                const day = eventDate.getDate().toString();
                return (
                  <div
                    key={event.id}
                    className="bg-muted/30 rounded-xl border border-border p-4 hover:shadow-md transition-shadow"
                  >
                    <div className="flex items-start gap-3 mb-3">
                      <div className="shrink-0 text-center">
                        <div className="stx-action-primary text-[10px] font-bold rounded-t-md py-0.5 px-2">
                          {monthAbbr}
                        </div>
                        <div className="bg-white dark:bg-muted border border-t-0 border-border rounded-b-md py-1 px-2">
                          <span className="text-lg font-bold text-foreground">{day}</span>
                        </div>
                      </div>
                      <div className="min-w-0">
                        <h3 className="font-semibold text-foreground text-sm leading-tight line-clamp-2">
                          {event.title}
                        </h3>
                        <p className="text-xs text-muted-foreground mt-1">
                          {event.startTime} &middot; {event.branch}
                        </p>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground line-clamp-2 mb-3">
                      {event.description}
                    </p>
                    <div className="flex items-center justify-between">
                      <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300">
                        {event.ageGroup}
                      </span>
                      {event.registrationRequired ? (
                        <Link
                          href={`/opac/events/${event.id}`}
                          className="text-xs font-medium text-primary-700 hover:underline"
                        >
                          Register
                        </Link>
                      ) : (
                        <span className="text-xs font-medium text-primary-700 dark:text-primary-300">
                          Drop-in
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      )}

      {/* Recommended for You - only visible to logged-in patrons */}
      <RecommendedForYou isLoggedIn={isLoggedIn} />

      {/* New Arrivals */}
      {browseEnabled ? (
        <section className="py-12 md:py-16 bg-card">
          <div className="max-w-7xl mx-auto px-4">
            <div className="flex items-center justify-between mb-8">
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-primary-100 p-2">
                  <Sparkles className="h-6 w-6 text-primary-600" />
                </div>
                <h2 className="text-2xl md:text-3xl font-bold text-foreground">New Arrivals</h2>
              </div>
              <Link
                href="/opac/new-titles"
                className="flex items-center gap-1 text-primary-600 hover:text-primary-700 font-medium"
              >
                View All
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>

            {isLoading ? (
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-4">
                {[...Array(8)].map((_, i) => (
                  <div key={i} className="animate-pulse">
                    <div className="aspect-[2/3] bg-muted rounded-lg mb-2" />
                    <div className="h-4 bg-muted rounded mb-1" />
                    <div className="h-3 bg-muted rounded w-2/3" />
                  </div>
                ))}
              </div>
            ) : newArrivals.length > 0 ? (
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-4">
                {newArrivals.map((book) => (
                  <BookCard
                    key={book.id}
                    id={book.id}
                    title={book.title}
                    author={book.author}
                    coverUrl={book.coverUrl}
                    availableCopies={book.availableCopies}
                    totalCopies={book.totalCopies}
                    variant="grid"
                    showFormats={false}
                    showRating={false}
                  />
                ))}
              </div>
            ) : (
              <p className="text-center text-muted-foreground py-8">{t("noNewArrivals")}</p>
            )}
          </div>
        </section>
      ) : null}

      {/* Popular This Month */}
      {browseEnabled ? (
        <section className="py-12 md:py-16 bg-muted/30">
          <div className="max-w-7xl mx-auto px-4">
            <div className="flex items-center justify-between mb-8">
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-primary-100 p-2">
                  <TrendingUp className="h-6 w-6 text-primary-600" />
                </div>
                <h2 className="text-2xl md:text-3xl font-bold text-foreground">
                  Popular This Month
                </h2>
              </div>
              <Link
                href="/opac/search?sort=popularity"
                className="flex items-center gap-1 text-primary-600 hover:text-primary-700 font-medium"
              >
                View All
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>

            {isLoading ? (
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-4">
                {[...Array(8)].map((_, i) => (
                  <div key={i} className="animate-pulse">
                    <div className="aspect-[2/3] bg-muted rounded-lg mb-2" />
                    <div className="h-4 bg-muted rounded mb-1" />
                    <div className="h-3 bg-muted rounded w-2/3" />
                  </div>
                ))}
              </div>
            ) : popularItems.length > 0 ? (
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-4">
                {popularItems.map((book) => (
                  <BookCard
                    key={book.id}
                    id={book.id}
                    title={book.title}
                    author={book.author}
                    coverUrl={book.coverUrl}
                    availableCopies={book.availableCopies}
                    totalCopies={book.totalCopies}
                    variant="grid"
                    showFormats={false}
                  />
                ))}
              </div>
            ) : (
              <p className="text-center text-muted-foreground py-8">{t("searchCatalogDiscover")}</p>
            )}
          </div>
        </section>
      ) : null}

      {/* Staff Picks */}
      {browseEnabled && staffPicks.length > 0 && (
        <section className="py-12 md:py-16 bg-card">
          <div className="max-w-7xl mx-auto px-4">
            <div className="flex items-center justify-between mb-8">
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-primary-100 p-2">
                  <Star className="h-6 w-6 text-primary-600" />
                </div>
                <h2 className="text-2xl md:text-3xl font-bold text-foreground">Staff Picks</h2>
              </div>
              <Link
                href="/opac/lists"
                className="flex items-center gap-1 text-primary-600 hover:text-primary-700 font-medium"
              >
                All Lists
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>

            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {staffPicks.map((pick) => (
                <div
                  key={pick.id}
                  className="rounded-xl border border-primary-100 bg-gradient-to-br from-primary-50/40 to-card p-6"
                >
                  <div className="flex gap-4">
                    <div className="w-20 h-28 bg-muted rounded-lg shrink-0 overflow-hidden">
                      {pick.coverUrl ? (
                        <Image
                          src={pick.coverUrl}
                          alt={pick.title}
                          width={80}
                          height={112}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center bg-primary-100">
                          <BookOpen className="h-8 w-8 text-primary-500" />
                        </div>
                      )}
                    </div>
                    <div className="flex-1">
                      <Link
                        href={`/opac/record/${pick.id}`}
                        className="font-semibold text-foreground hover:text-primary-600 line-clamp-2"
                      >
                        {pick.title}
                      </Link>
                      <p className="text-sm text-muted-foreground">{pick.author}</p>
                    </div>
                  </div>
                  <blockquote className="mt-4 text-foreground/80 italic">
                    {`"${pick.review}"`}
                  </blockquote>
                  <p className="mt-3 text-sm font-medium text-primary-700">
                    — {pick.staffName}, {pick.staffBranch}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Library info section */}
      <section className="py-12 md:py-16 bg-foreground text-white">
        <div className="max-w-7xl mx-auto px-4">
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
            {/* Hours */}
            <div>
              <div className="flex items-center gap-2 mb-4">
                <Clock className="h-5 w-5 text-primary-400" />
                <h3 className="font-semibold text-lg">Library Hours</h3>
              </div>
              {library?.hoursDetailed ? (
                <ul className="space-y-1 text-white/70 text-sm">
                  {library.hoursDetailed.map((day) => (
                    <li key={day.day} className="flex justify-between">
                      <span>{day.day}</span>
                      <span>{day.hours}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-muted-foreground/70 text-sm">{t("contactForHours")}</p>
              )}
            </div>

            {/* Location */}
            {currentLocation && (
              <div>
                <div className="flex items-center gap-2 mb-4">
                  <MapPin className="h-5 w-5 text-primary-400" />
                  <h3 className="font-semibold text-lg">Your Library</h3>
                </div>
                <p className="text-white/70 mb-2">{currentLocation.name}</p>
                {currentLocation.address && (
                  <p className="text-muted-foreground/70 text-sm">{currentLocation.address}</p>
                )}
                {currentLocation.phone && (
                  <p className="text-muted-foreground/70 text-sm mt-2">{currentLocation.phone}</p>
                )}
              </div>
            )}

            {/* Quick Links */}
            <div>
              <h3 className="font-semibold text-lg mb-4">{t("quickLinks")}</h3>
              <ul className="space-y-2 text-white/70">
                <li>
                  <Link href="/opac/account" className="hover:text-white transition-colors">
                    My Account
                  </Link>
                </li>
                <li>
                  {featureFlags.opacKids ? (
                    <Link href="/opac/kids" className="hover:text-white transition-colors">
                      Kids Catalog
                    </Link>
                  ) : null}
                </li>
                <li>
                  <Link
                    href="/opac/search?format=ebook"
                    className="hover:text-white transition-colors"
                  >
                    Digital Resources
                  </Link>
                </li>
                <li>
                  <Link href="/opac/help" className="hover:text-white transition-colors">
                    Help & FAQs
                  </Link>
                </li>
              </ul>
            </div>

            {/* Get a Card */}
            <div>
              <h3 className="font-semibold text-lg mb-4">{t("getLibraryCard")}</h3>
              <p className="text-muted-foreground/70 text-sm mb-4">{t("getCardDescription")}</p>
              <Link
                href="/opac/register"
                className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 
                         hover:brightness-110 rounded-lg font-medium transition-colors"
              >
                Apply Online
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
