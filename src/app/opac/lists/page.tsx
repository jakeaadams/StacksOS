"use client";

import * as React from "react";
import Link from "next/link";
import { fetchWithAuth } from "@/lib/client-fetch";
import { clientLogger } from "@/lib/client-logger";
import { featureFlags } from "@/lib/feature-flags";
import { usePatronSession } from "@/hooks/usePatronSession";
import { BookCard } from "@/components/opac/BookCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  ArrowRight,
  ChevronRight,
  Heart,
  Library,
  Loader2,
  Sparkles,
  TrendingUp,
} from "lucide-react";

type StaffPick = {
  id: number;
  recordId: number;
  title: string;
  author: string;
  coverUrl?: string;
  staffName?: string;
  staffBranch?: string;
  review?: string;
};

type PublicList = {
  id: number;
  name: string;
  description?: string;
  ownerName?: string | null;
  itemCount?: number | null;
  editTime?: string | null;
};

async function safeGetJson(url: string) {
  try {
    const res = await fetchWithAuth(url);
    const json = await res.json().catch(() => ({}));
    return { ok: res.ok && json?.ok !== false, json };
  } catch (error) {
    return { ok: false, json: { error: String(error) } };
  }
}

function CuratedLinkCard({
  href,
  title,
  description,
  icon: Icon,
  accent,
}: {
  href: string;
  title: string;
  description: string;
  icon: React.ElementType;
  accent: string;
}) {
  return (
    <Link
      href={href}
      className="group rounded-2xl border border-border/70 bg-card p-5 shadow-sm hover:shadow-md hover:border-primary/40 transition-all"
    >
      <div className="flex items-start justify-between gap-4">
        <div className={cn("inline-flex h-11 w-11 items-center justify-center rounded-2xl", accent)}>
          <Icon className="h-5 w-5" />
        </div>
        <ChevronRight className="h-5 w-5 text-muted-foreground group-hover:text-foreground transition-colors" />
      </div>
      <div className="mt-4">
        <div className="font-semibold text-foreground">{title}</div>
        <div className="mt-1 text-sm text-muted-foreground">{description}</div>
      </div>
    </Link>
  );
}

export default function OpacListsPage() {
  const { isLoggedIn } = usePatronSession();
  const browseEnabled = featureFlags.opacBrowseV2;

  const [picks, setPicks] = React.useState<StaffPick[]>([]);
  const [publicLists, setPublicLists] = React.useState<PublicList[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    void (async () => {
      if (!browseEnabled) {
        setPicks([]);
        setPublicLists([]);
        setLoading(false);
        return;
      }
      const [picksRes, listsRes] = await Promise.all([
        safeGetJson("/api/opac/staff-picks?limit=12"),
        safeGetJson("/api/opac/public-lists?limit=24"),
      ]);

      if (cancelled) return;

      if (!picksRes.ok && !listsRes.ok) {
        setError("Could not load curated lists. Please try again.");
        setPicks([]);
        setPublicLists([]);
        setLoading(false);
        return;
      }

      const nextPicks = Array.isArray(picksRes.json?.picks) ? (picksRes.json.picks as StaffPick[]) : [];
      const nextListsRaw = Array.isArray(listsRes.json?.lists) ? (listsRes.json.lists as PublicList[]) : [];

      // Avoid duplicating staff-pick lists in the "Public lists" section.
      const nextLists = nextListsRaw.filter((l) => {
        const name = String(l?.name || "").toLowerCase();
        return !(name.includes("staff pick") || name.includes("staff recommendation"));
      });

      setPicks(nextPicks);
      setPublicLists(nextLists);
      setLoading(false);
    })().catch((e) => {
      if (cancelled) return;
      clientLogger.error("Failed to load OPAC lists:", e);
      setError("Could not load curated lists.");
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [browseEnabled]);

  if (!browseEnabled) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center px-6 py-16 bg-muted/30">
        <div className="max-w-md w-full bg-card rounded-2xl shadow-sm border border-border p-8 text-center">
          <div className="w-16 h-16 bg-primary-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <Library className="h-8 w-8 text-primary-600" />
          </div>
          <h1 className="text-2xl font-bold text-foreground mb-4">Curated lists are disabled</h1>
          <p className="text-muted-foreground mb-6">
            Browse experiences are behind an experimental feature flag.
          </p>
          <Button asChild className="rounded-xl">
            <Link href="/opac/search">Search the catalog</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="py-10">
      <div className="max-w-7xl mx-auto px-4">
        <div className="flex items-start justify-between gap-6 flex-wrap">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Curated lists</h1>
            <p className="mt-2 text-muted-foreground max-w-2xl">
              Browse staff picks and shareable lists curated by your library community.
            </p>
          </div>

          {featureFlags.opacLists ? (
            <Button asChild className="rounded-xl">
              <Link href="/opac/account/lists">
                <Heart className="h-4 w-4 mr-2" />
                My lists
              </Link>
            </Button>
          ) : (
            <div className="text-sm text-muted-foreground">
              Personal lists are currently disabled.
            </div>
          )}
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <CuratedLinkCard
            href="/opac/new-titles"
            title="New titles"
            description="Fresh arrivals and recent additions."
            icon={Sparkles}
            accent="bg-violet-500/10 text-violet-600"
          />
          <CuratedLinkCard
            href="/opac/search?sort=popularity"
            title="Popular right now"
            description="Most requested and trending items."
            icon={TrendingUp}
            accent="bg-emerald-500/10 text-emerald-600"
          />
          <CuratedLinkCard
            href="/opac/browse"
            title="Browse categories"
            description="Explore by subject, format, and more."
            icon={Library}
            accent="bg-sky-500/10 text-sky-600"
          />
        </div>

        {loading ? (
          <div className="mt-10 flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading…
          </div>
        ) : error ? (
          <div className="mt-10 rounded-2xl border border-rose-200 bg-rose-50 p-5 text-rose-900">
            {error}
          </div>
        ) : null}

        <section className="mt-10">
          <div className="flex items-end justify-between gap-4 flex-wrap">
            <div>
              <h2 className="text-xl font-semibold text-foreground">Staff picks</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Hand-picked recommendations from your library staff.
              </p>
            </div>
            <Link href="/opac/search?sort=smart" className="text-sm text-primary hover:underline underline-offset-2">
              Explore more
              <ArrowRight className="inline h-4 w-4 ml-1" />
            </Link>
          </div>

          {picks.length === 0 ? (
            <div className="mt-4 rounded-2xl border border-border/70 bg-card p-6 text-sm text-muted-foreground">
              No staff picks are configured yet. Create a public Evergreen bookbag with “staff pick” in the name to
              enable this section.
            </div>
          ) : (
            <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
              {picks.map((p) => (
                <div key={p.id} className="space-y-2">
                  <BookCard
                    id={p.recordId}
                    title={p.title}
                    author={p.author}
                    coverUrl={p.coverUrl}
                    variant="grid"
                    showAvailability={false}
                    showFormats={false}
                    showRating={false}
                  />
                  {(p.staffBranch || p.staffName) && (
                    <div className="flex flex-wrap gap-1">
                      {p.staffBranch ? <Badge variant="secondary">{p.staffBranch}</Badge> : null}
                      {p.staffName ? <Badge variant="outline">{p.staffName}</Badge> : null}
                    </div>
                  )}
                  {p.review ? (
                    <p className="text-xs text-muted-foreground line-clamp-2">{p.review}</p>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="mt-12">
          <div className="flex items-end justify-between gap-4 flex-wrap">
            <div>
              <h2 className="text-xl font-semibold text-foreground">Public lists</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Shareable lists published from Evergreen.
              </p>
            </div>
            {!isLoggedIn ? (
              <Link href="/opac/login?redirect=/opac/lists" className="text-sm text-primary hover:underline underline-offset-2">
                Log in for personal lists
              </Link>
            ) : null}
          </div>

          {publicLists.length === 0 ? (
            <div className="mt-4 rounded-2xl border border-border/70 bg-card p-6 text-sm text-muted-foreground">
              No public lists found.
            </div>
          ) : (
            <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {publicLists.map((l) => (
                <Link
                  key={l.id}
                  href={`/opac/lists/${l.id}`}
                  className="group rounded-2xl border border-border/70 bg-card p-5 shadow-sm hover:shadow-md hover:border-primary/40 transition-all"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="font-semibold text-foreground truncate">{l.name}</div>
                      {l.description ? (
                        <div className="mt-1 text-sm text-muted-foreground line-clamp-2">{l.description}</div>
                      ) : null}
                    </div>
                    <ChevronRight className="h-5 w-5 text-muted-foreground group-hover:text-foreground transition-colors" />
                  </div>
                  <div className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
                    {typeof l.itemCount === "number" ? <span>{l.itemCount} items</span> : null}
                    {l.ownerName ? <span className="truncate">• {l.ownerName}</span> : null}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
