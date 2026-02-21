"use client";

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { toast } from "sonner";
import { BookCard } from "@/components/opac/book-card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { featureFlags } from "@/lib/feature-flags";
import { ArrowLeft, Library, Loader2, Share2 } from "lucide-react";
import { useTranslations } from "next-intl";

type PublicListDetail = {
  list: {
    id: number;
    name: string;
    description?: string;
    ownerName?: string | null;
    createTime?: string | null;
    editTime?: string | null;
  } | null;
  items: Array<{
    bibId: number;
    title: string;
    author?: string;
    coverUrl?: string;
    isbn?: string;
  }>;
  message?: string;
};

export default function PublicListPage() {
  const t = useTranslations("sharedList");
  const params = useParams<{ listId: string }>();
  const listId = params.listId;
  const enabled = featureFlags.opacBrowseV2;

  const [data, setData] = React.useState<PublicListDetail | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setError(null);

    void (async () => {
      if (!enabled) {
        setData(null);
        setIsLoading(false);
        return;
      }
      const res = await fetch(`/api/opac/public-lists/${encodeURIComponent(listId)}?limit=120`, {
        credentials: "include",
      });
      const json = (await res.json().catch(() => ({}))) as PublicListDetail;

      if (cancelled) return;

      if (!res.ok || (json as Record<string, any>)?.ok === false) {
        setError((json as Record<string, any>)?.error || t("listNotFound"));
        setData(null);
        setIsLoading(false);
        return;
      }

      if (!json.list) {
        setError(json.message || "Public lists are unavailable.");
        setData(json);
        setIsLoading(false);
        return;
      }

      setData(json);
      setIsLoading(false);
    })().catch((e: any) => {
      if (cancelled) return;
      setError(e instanceof Error ? e.message : "Failed to load list");
      setIsLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [enabled, listId]);

  const handleShare = React.useCallback(async () => {
    const url = window.location.href;
    try {
      if (navigator.share && data?.list) {
        await navigator.share({ title: data.list.name, text: data.list.name, url });
        toast.success("Shared");
        return;
      }
    } catch {
      // Fall back to clipboard.
    }

    try {
      await navigator.clipboard.writeText(url);
      toast.success("Link copied");
    } catch {
      toast.error("Could not copy link");
    }
  }, [data?.list]);

  if (!enabled) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center px-6 py-16 bg-muted/30">
        <div className="max-w-md w-full bg-card rounded-2xl shadow-sm border border-border p-8 text-center">
          <div className="w-16 h-16 bg-primary-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <Library className="h-8 w-8 text-primary-600" />
          </div>
          <h1 className="text-2xl font-bold text-foreground mb-4">Public lists are disabled</h1>
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

  if (isLoading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin mr-2" />
        Loading…
      </div>
    );
  }

  if (error) {
    return (
      <div className="py-10">
        <div className="max-w-5xl mx-auto px-4">
          <div className="rounded-2xl border border-border/70 bg-card p-6">
            <div className="text-lg font-semibold text-foreground">{error}</div>
            <div className="mt-4">
              <Button asChild variant="outline" className="rounded-xl">
                <Link href="/opac/lists">
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Back to lists
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const list = data?.list ?? null;
  const items = Array.isArray(data?.items) ? data.items : [];

  if (!list) {
    return (
      <div className="py-10">
        <div className="max-w-5xl mx-auto px-4">
          <div className="rounded-2xl border border-border/70 bg-card p-6">
            <div className="text-lg font-semibold text-foreground">List unavailable</div>
            <div className="mt-2 text-sm text-muted-foreground">
              This public list could not be loaded.
            </div>
            <div className="mt-4">
              <Button asChild variant="outline" className="rounded-xl">
                <Link href="/opac/lists">
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Back to lists
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="py-10">
      <div className="max-w-7xl mx-auto px-4">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <Button asChild variant="outline" className="rounded-xl">
            <Link href="/opac/lists">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Link>
          </Button>
          <Button
            type="button"
            variant="outline"
            className="rounded-xl"
            onClick={() => void handleShare()}
          >
            <Share2 className="h-4 w-4 mr-2" />
            Share
          </Button>
        </div>

        <div className="mt-6 rounded-2xl border border-border/70 bg-card p-6 shadow-sm">
          <div className="flex items-start justify-between gap-6 flex-wrap">
            <div className="min-w-0">
              <h1 className="text-2xl font-bold text-foreground">{list.name}</h1>
              {list.description ? (
                <p className="mt-2 text-muted-foreground">{list.description}</p>
              ) : null}
              <div className="mt-3 flex flex-wrap gap-2">
                {list.ownerName ? <Badge variant="secondary">{list.ownerName}</Badge> : null}
                <Badge variant="outline">{items.length} items</Badge>
              </div>
            </div>
          </div>
        </div>

        {items.length === 0 ? (
          <div className="mt-6 rounded-2xl border border-border/70 bg-card p-6 text-sm text-muted-foreground">
            This list has no items.
          </div>
        ) : (
          <div className="mt-6 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
            {items.map((item: any) => (
              <BookCard
                key={item.bibId}
                id={item.bibId}
                title={item.title}
                author={item.author}
                coverUrl={item.coverUrl}
                isbn={item.isbn}
                variant="grid"
                showAvailability={false}
                showFormats={false}
                showRating={false}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
