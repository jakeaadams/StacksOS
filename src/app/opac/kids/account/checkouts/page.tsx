"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { featureFlags } from "@/lib/feature-flags";
import { usePatronSession, type PatronCheckout } from "@/hooks/use-patron-session";
import { useKidsParentGate } from "@/contexts/kids-parent-gate-context";
import { UnoptimizedImage } from "@/components/shared";
import {
  AlertCircle,
  BookOpen,
  ChevronLeft,
  CheckCircle,
  Loader2,
  RefreshCw,
  Sparkles,
  Star,
} from "lucide-react";
import { useTranslations } from "next-intl";

export default function KidsCheckoutsPage() {
  const t = useTranslations("kidsCheckoutsPage");
  const router = useRouter();
  const gate = useKidsParentGate();
  const {
    isLoggedIn,
    isLoading: sessionLoading,
    checkouts,
    fetchCheckouts,
    renewItem,
    renewAll,
  } = usePatronSession();

  const [isLoading, setIsLoading] = useState(false);
  const [renewingId, setRenewingId] = useState<number | null>(null);
  const [renewAllLoading, setRenewAllLoading] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    if (!sessionLoading && !isLoggedIn) {
      router.push("/opac/login?redirect=/opac/kids/account/checkouts");
    }
  }, [sessionLoading, isLoggedIn, router]);

  useEffect(() => {
    if (!isLoggedIn) return;
    setIsLoading(true);
    void fetchCheckouts().finally(() => setIsLoading(false));
  }, [fetchCheckouts, isLoggedIn]);

  const overdueItems = useMemo(() => checkouts.filter((c) => c.isOverdue), [checkouts]);
  const currentItems = useMemo(() => checkouts.filter((c) => !c.isOverdue), [checkouts]);

  const handleRenew = async (checkoutId: number) => {
    const ok = await gate.requestUnlock({ reason: t("renewReason") });
    if (!ok) {
      setMessage({ type: "error", text: t("parentPinRequired") });
      setTimeout(() => setMessage(null), 4000);
      return;
    }

    setRenewingId(checkoutId);
    setMessage(null);

    const result = await renewItem(checkoutId);
    setMessage({ type: result.success ? "success" : "error", text: result.message });
    setRenewingId(null);
    setTimeout(() => setMessage(null), 5000);
  };

  const handleRenewAll = async () => {
    const ok = await gate.requestUnlock({ reason: t("renewAllReason") });
    if (!ok) {
      setMessage({ type: "error", text: t("parentPinRequired") });
      setTimeout(() => setMessage(null), 4000);
      return;
    }

    setRenewAllLoading(true);
    setMessage(null);

    const result = await renewAll();
    setMessage({
      type: result.success ? "success" : "error",
      text: result.success
        ? t("renewedItems", { count: result.renewed })
        : `Renewed ${result.renewed}, couldn’t renew ${result.failed}.`,
    });
    setRenewAllLoading(false);
    setTimeout(() => setMessage(null), 5000);
  };

  const handleLogReading = (checkout: PatronCheckout) => {
    if (!featureFlags.kidsEngagementV1) {
      router.push("/opac/kids/account/reading-log");
      return;
    }

    if (!checkout.recordId) {
      router.push("/opac/kids/account/reading-log");
      return;
    }

    const params = new URLSearchParams();
    params.set("bibId", String(checkout.recordId));
    params.set("title", checkout.title);
    if (checkout.author) params.set("author", checkout.author);
    if (checkout.isbn) params.set("isbn", checkout.isbn);

    router.push(`/opac/kids/account/reading-log?${params.toString()}`);
  };

  if (sessionLoading || !isLoggedIn) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center">
        <Loader2 className="h-8 w-8 text-purple-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <div className="flex items-center gap-3 mb-6">
        <button
          type="button"
          onClick={() => router.back()}
          className="p-2 rounded-xl text-muted-foreground hover:text-foreground/80 hover:bg-muted/50"
        >
          <ChevronLeft className="h-6 w-6" />
        </button>
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-foreground truncate">{t("title")}</h1>
          <p className="text-sm text-muted-foreground">{t("booksCount", { count: checkouts.length })}</p>
        </div>
        {checkouts.length > 0 ? (
          <button
            type="button"
            onClick={handleRenewAll}
            disabled={renewAllLoading}
            className="ml-auto inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-purple-500 to-pink-500 px-4 py-2 text-white font-bold shadow-md hover:from-purple-600 hover:to-pink-600 disabled:opacity-50"
          >
            {renewAllLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Renew all
          </button>
        ) : null}
      </div>

      {message ? (
        <div
          className={`mb-6 rounded-2xl border-2 p-4 flex items-center gap-3 ${
            message.type === "success" ? "bg-green-50 border-green-200" : "bg-red-50 border-red-200"
          }`}
        >
          {message.type === "success" ? (
            <CheckCircle className="h-5 w-5 text-green-600" />
          ) : (
            <AlertCircle className="h-5 w-5 text-red-600" />
          )}
          <p className={message.type === "success" ? "text-green-800 font-medium" : "text-red-800 font-medium"}>
            {message.text}
          </p>
        </div>
      ) : null}

      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-8 w-8 text-purple-500 animate-spin" />
        </div>
      ) : checkouts.length === 0 ? (
        <div className="rounded-3xl border border-border bg-card p-10 text-center shadow-sm">
          <div className="mx-auto mb-4 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-purple-100">
            <BookOpen className="h-7 w-7 text-purple-600" />
          </div>
          <h2 className="text-xl font-bold text-foreground">{t("noCheckouts")}</h2>
          <p className="mt-2 text-sm text-muted-foreground">Let’s find something awesome to read!</p>
          <div className="mt-6 flex items-center justify-center gap-3">
            <Link
              href="/opac/kids"
              className="inline-flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-sky-500 to-purple-500 px-5 py-3 text-white font-bold shadow-md hover:from-sky-600 hover:to-purple-600"
            >
              <Sparkles className="h-4 w-4" />
              Find books
            </Link>
            <Link
              href="/opac/kids/account"
              className="inline-flex items-center justify-center rounded-2xl border border-border bg-card px-5 py-3 font-medium hover:bg-muted/50"
            >
              Back
            </Link>
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          {overdueItems.length > 0 ? (
            <section>
              <h2 className="text-lg font-bold text-red-700 mb-3 flex items-center gap-2">
                <AlertCircle className="h-5 w-5" />
                {t("overdue", { count: overdueItems.length })}
              </h2>
              <div className="space-y-3">
                {overdueItems.map((checkout) => (
                  <KidsCheckoutCard
                    key={checkout.id}
                    checkout={checkout}
                    isRenewing={renewingId === checkout.id}
                    onRenew={() => handleRenew(checkout.id)}
                    onLogReading={() => handleLogReading(checkout)}
                  />
                ))}
              </div>
            </section>
          ) : null}

          {currentItems.length > 0 ? (
            <section>
              {overdueItems.length > 0 ? (
                <h2 className="text-lg font-bold text-foreground/80 mb-3">{t("notOverdue", { count: currentItems.length })}</h2>
              ) : null}
              <div className="space-y-3">
                {currentItems.map((checkout) => (
                  <KidsCheckoutCard
                    key={checkout.id}
                    checkout={checkout}
                    isRenewing={renewingId === checkout.id}
                    onRenew={() => handleRenew(checkout.id)}
                    onLogReading={() => handleLogReading(checkout)}
                  />
                ))}
              </div>
            </section>
          ) : null}
        </div>
      )}
    </div>
  );
}

function KidsCheckoutCard({
  checkout,
  onRenew,
  onLogReading,
  isRenewing,
}: {
  checkout: PatronCheckout;
  onRenew: () => void;
  onLogReading: () => void;
  isRenewing: boolean;
}) {
  const t = useTranslations("kidsCheckoutsPage");
  const canRenew = checkout.renewalsRemaining === null ? true : checkout.renewalsRemaining > 0;
  const dueDate = formatMaybeDate(checkout.dueDate);
  const renewalsLabel =
    typeof checkout.renewalsRemaining === "number"
      ? checkout.renewalsRemaining === 0
        ? t("noRenewalsLeft")
        : t("renewalsLeft", { count: checkout.renewalsRemaining })
      : t("renewalsUnknown");

  return (
    <div
      className={`rounded-3xl border-2 bg-card p-4 shadow-sm ${
        checkout.isOverdue ? "border-red-200 bg-red-50/40" : "border-border"
      }`}
    >
      <div className="flex gap-4">
        <Link
          href={checkout.recordId ? `/opac/kids/record/${checkout.recordId}` : "/opac/kids"}
          className="shrink-0"
        >
          <div className="h-24 w-16 rounded-2xl bg-muted overflow-hidden">
            {checkout.coverUrl ? (
              <UnoptimizedImage src={checkout.coverUrl} alt={checkout.title} className="h-full w-full object-cover" />
            ) : (
              <div className="h-full w-full flex items-center justify-center bg-gradient-to-br from-purple-100 to-pink-100">
                <BookOpen className="h-8 w-8 text-purple-300" />
              </div>
            )}
          </div>
        </Link>

        <div className="flex-1 min-w-0">
          <Link href={checkout.recordId ? `/opac/kids/record/${checkout.recordId}` : "/opac/kids"}>
            <h3 className="font-bold text-foreground line-clamp-2 hover:text-purple-700 transition-colors">
              {checkout.title}
            </h3>
          </Link>
          {checkout.author ? <p className="text-sm text-muted-foreground truncate">{checkout.author}</p> : null}

          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
            <span className={`font-medium ${checkout.isOverdue ? "text-red-700" : "text-muted-foreground"}`}>
              {checkout.isOverdue ? t("overdueDate", { date: dueDate }) : t("dueDate", { date: dueDate })}
            </span>
            <span className="text-muted-foreground/60">•</span>
            <span className="text-muted-foreground">{renewalsLabel}</span>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onRenew}
              disabled={!canRenew || isRenewing}
              className="inline-flex items-center gap-2 rounded-2xl border border-border bg-card px-4 py-2 text-sm font-bold hover:bg-muted/50 disabled:opacity-50"
            >
              {isRenewing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              {canRenew ? "Renew" : "No renewals"}
            </button>

            {featureFlags.kidsEngagementV1 ? (
              <button
                type="button"
                onClick={onLogReading}
                className="inline-flex items-center gap-2 rounded-2xl bg-purple-100 px-4 py-2 text-sm font-bold text-purple-700 hover:bg-purple-200"
              >
                <Star className="h-4 w-4" />
                I read it!
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

function formatMaybeDate(value: string): string {
  if (!value) return "Unknown";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}
