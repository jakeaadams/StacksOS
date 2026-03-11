"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, notFound } from "next/navigation";
import { featureFlags } from "@/lib/feature-flags";
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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getEContentProviders, type EContentProvider } from "@/lib/econtent-providers";
import { fetchWithAuth } from "@/lib/client-fetch";
import { useLocale, useTranslations } from "next-intl";

const TYPE_LABELS: Record<string, { labelKey: string; icon: React.ElementType }> = {
  ebook: { labelKey: "ebooks", icon: BookOpen },
  eaudiobook: { labelKey: "eaudiobooks", icon: Headphones },
  streaming: { labelKey: "streamingShort", icon: MonitorPlay },
  emagazine: { labelKey: "eMagazines", icon: Tablet },
};

const PROVIDER_THEME: Record<string, { shell: string; icon: string }> = {
  overdrive: { shell: "bg-teal-500/10", icon: "text-teal-700" },
  hoopla: { shell: "bg-orange-500/10", icon: "text-orange-700" },
  cloudlibrary: { shell: "bg-sky-500/10", icon: "text-sky-700" },
  kanopy: { shell: "bg-emerald-500/10", icon: "text-emerald-700" },
};

type EContentProviderView = EContentProvider & {
  enabled?: boolean;
  mode?: string;
  appUrl?: string;
  supportsPatronTransactions?: {
    checkout: boolean;
    hold: boolean;
  };
  source?: "default" | "tenant_config";
};

function ProviderCard({ provider }: { provider: EContentProviderView }) {
  const t = useTranslations("digitalPage");
  const locale = useLocale();
  const theme = PROVIDER_THEME[provider.id] ?? { shell: "bg-muted", icon: "text-muted-foreground" };

  return (
    <div className="bg-card rounded-xl border border-border p-6 hover:shadow-lg transition-shadow">
      <div className="flex items-start gap-4 mb-4">
        {/* Logo placeholder */}
        <div
          className={`w-16 h-16 rounded-xl flex items-center justify-center shrink-0 ${theme.shell}`}
        >
          <Library className={`h-8 w-8 ${theme.icon}`} />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-xl font-semibold text-foreground">{provider.name}</h3>
          <div className="flex flex-wrap gap-1.5 mt-1.5">
            {provider.types.map((type) => {
              const info = TYPE_LABELS[type];
              return info ? (
                <Badge key={type} variant="secondary" className="text-xs gap-1">
                  <info.icon className="h-3 w-3" />
                  {t(info.labelKey)}
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
          {t("alwaysAvailableTitles", {
            count: provider.alwaysAvailableTitles.toLocaleString(locale),
          })}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button asChild>
          <a href={provider.browseUrl} target="_blank" rel="noopener noreferrer">
            {t("browseCollection")}
            <ExternalLink className="h-4 w-4 ml-2" />
          </a>
        </Button>
        {provider.appUrl ? (
          <Button asChild variant="outline">
            <a href={provider.appUrl} target="_blank" rel="noopener noreferrer">
              {t("openApp")}
              <ExternalLink className="h-4 w-4 ml-2" />
            </a>
          </Button>
        ) : null}
      </div>

      {/* Patron-friendly capability hints */}
      <div className="mt-4 flex flex-wrap gap-2 text-xs">
        {provider.supportsPatronTransactions?.checkout &&
        provider.supportsPatronTransactions?.hold ? (
          <Badge variant="secondary">{t("borrowAndHoldInApp")}</Badge>
        ) : provider.supportsPatronTransactions?.checkout ? (
          <Badge variant="secondary">{t("borrowInApp")}</Badge>
        ) : null}
      </div>
    </div>
  );
}

export default function DigitalLibraryPage() {
  if (!featureFlags.opacDigitalLibrary) {
    notFound();
  }

  const t = useTranslations("digitalPage");
  const router = useRouter();
  const { library } = useLibrary();
  const [providers, setProviders] = useState<EContentProviderView[]>(getEContentProviders());
  const [providersLoading, setProvidersLoading] = useState(true);
  const [providersError, setProvidersError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const gettingStartedSteps = useMemo(
    () => [
      {
        step: 1,
        title: t("getStartedStep1Title"),
        description: t("getStartedStep1Description"),
        icon: Library,
      },
      {
        step: 2,
        title: t("getStartedStep2Title"),
        description: t("getStartedStep2Description"),
        icon: Smartphone,
      },
      {
        step: 3,
        title: t("getStartedStep3Title"),
        description: t("getStartedStep3Description"),
        icon: Download,
      },
      {
        step: 4,
        title: t("getStartedStep4Title"),
        description: t("getStartedStep4Description"),
        icon: CheckCircle2,
      },
      {
        step: 5,
        title: t("getStartedStep5Title"),
        description: t("getStartedStep5Description"),
        icon: BookOpen,
      },
    ],
    [t]
  );

  useEffect(() => {
    let cancelled = false;
    const loadProviders = async () => {
      setProvidersLoading(true);
      setProvidersError(null);
      try {
        const response = await fetchWithAuth("/api/opac/econtent/providers");
        const data = await response.json();
        if (!response.ok) {
          throw new Error(String(data?.error || "Unable to load digital providers"));
        }
        const nextProviders = Array.isArray(data?.providers)
          ? (data.providers as EContentProviderView[])
          : [];
        if (!cancelled && nextProviders.length > 0) {
          setProviders(nextProviders);
        }
      } catch (error) {
        if (!cancelled) {
          setProvidersError("unavailable");
          setProviders(getEContentProviders());
        }
      } finally {
        if (!cancelled) setProvidersLoading(false);
      }
    };
    void loadProviders();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      router.push(`/opac/search?q=${encodeURIComponent(searchQuery)}&format=ebook`);
    }
  };

  return (
    <div className="min-h-screen bg-muted/30">
      {/* Page header */}
      <div className="bg-gradient-to-r from-primary-600 to-primary-800 text-white py-10 md:py-14">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex items-center gap-2 mb-2">
            <Link
              href="/opac"
              className="text-white hover:text-white transition-colors text-sm inline-flex items-center gap-1"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to Catalog
            </Link>
          </div>
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-white/10 rounded-lg">
              <Smartphone className="h-8 w-8" />
            </div>
            <h1 className="text-3xl md:text-4xl font-bold">{t("title")}</h1>
          </div>
          <p className="text-white/90 text-lg max-w-2xl mb-6">
            {t("heroSubtitle", { libraryName: library?.name || t("libraryCardFallback") })}
          </p>

          {/* Search bar */}
          <form onSubmit={handleSearch} className="max-w-xl">
            <div className="relative">
              <Input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t("searchPlaceholder")}
                aria-label={t("searchDigitalContent")}
                className="h-12 rounded-full border-0 bg-white dark:bg-card pl-5 pr-14 text-foreground shadow-lg focus-visible:ring-4 focus-visible:ring-white/30"
              />
              <Button
                type="submit"
                size="icon"
                className="absolute right-2 top-1/2 h-9 w-9 -translate-y-1/2 rounded-full"
                aria-label={t("searchDigitalLibrary")}
              >
                <Search className="h-5 w-5" />
              </Button>
            </div>
          </form>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-10">
        {/* Provider cards */}
        <section className="mb-16">
          <h2 className="text-2xl md:text-3xl font-bold text-foreground mb-2">
            {t("digitalProviders")}
          </h2>
          <p className="text-muted-foreground mb-8">{t("digitalProvidersDesc")}</p>

          {providersLoading ? (
            <p className="text-sm text-muted-foreground">{t("loadingServices")}</p>
          ) : null}
          {providersError ? (
            <p className="text-sm text-amber-700 dark:text-amber-400">
              {t("servicesTemporarilyUnavailable")}
            </p>
          ) : null}
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
              <h2 className="text-2xl md:text-3xl font-bold text-foreground">
                {t("alwaysAvailable")}
              </h2>
            </div>
            <p className="text-muted-foreground mb-6 max-w-2xl">
              {t("alwaysAvailableDescription")}
            </p>

            <div className="grid sm:grid-cols-3 gap-4 mb-6">
              <div className="bg-white dark:bg-card rounded-lg p-4 border border-green-200 dark:border-green-800/50">
                <BookOpen className="h-6 w-6 text-green-600 dark:text-green-400 mb-2" />
                <h3 className="font-semibold text-foreground">{t("ebooks")}</h3>
                <p className="text-sm text-muted-foreground">{t("ebooksDescription")}</p>
              </div>
              <div className="bg-white dark:bg-card rounded-lg p-4 border border-green-200 dark:border-green-800/50">
                <Headphones className="h-6 w-6 text-green-600 dark:text-green-400 mb-2" />
                <h3 className="font-semibold text-foreground">{t("eaudiobooks")}</h3>
                <p className="text-sm text-muted-foreground">{t("eaudiobooksDescription")}</p>
              </div>
              <div className="bg-white dark:bg-card rounded-lg p-4 border border-green-200 dark:border-green-800/50">
                <MonitorPlay className="h-6 w-6 text-green-600 dark:text-green-400 mb-2" />
                <h3 className="font-semibold text-foreground">{t("streamingVideo")}</h3>
                <p className="text-sm text-muted-foreground">{t("streamingVideoDescription")}</p>
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
            {t("howToGetStarted")}
          </h2>
          <p className="text-muted-foreground mb-8">{t("howToGetStartedDesc")}</p>

          <div className="grid md:grid-cols-5 gap-4">
            {gettingStartedSteps.map(({ step, title, description, icon: Icon }) => (
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
            <p className="text-muted-foreground mb-4">{t("needHelp")}</p>
            <div className="flex flex-wrap justify-center gap-3">
              <Button asChild>
                <Link href="/opac/register">
                  Get a Library Card
                  <ArrowRight className="h-4 w-4 ml-2" />
                </Link>
              </Button>
              <Button variant="outline" asChild>
                <Link href="/opac/help">{t("helpFaq")}</Link>
              </Button>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
