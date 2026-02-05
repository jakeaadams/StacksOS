"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import type { ElementType } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { usePatronSession } from "@/hooks/use-patron-session";
import { featureFlags } from "@/lib/feature-flags";
import { useLibrary } from "@/hooks/use-library";
import {
  User,
  BookOpen,
  Clock,
  DollarSign,
  Heart,
  Settings,
  Award,
  TrendingUp,
  AlertCircle,
  CheckCircle,
  ArrowRight,
  Loader2,
  MapPin,
  Mail,
  Phone,
	  CreditCard,
	} from "lucide-react";

type QuickStatCardProps = {
  title: string;
  value: number | string;
  icon: ElementType;
  href: string;
  color: string;
  alert?: boolean;
};

function QuickStatCard({
  title,
  value,
  icon: Icon,
  href,
  color,
  alert,
}: QuickStatCardProps) {
  return (
    <Link
      href={href}
      className={`block p-6 bg-card rounded-xl shadow-sm border border-border 
                hover:shadow-md hover:border-primary-300 transition-all group
                ${alert ? "ring-2 ring-amber-400 ring-offset-2" : ""}`}
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-muted-foreground mb-1">{title}</p>
          <p className={`text-3xl font-bold ${color}`}>{value}</p>
        </div>
        <div className={`p-3 rounded-lg ${color.replace("text-", "bg-").replace("-600", "-100")}`}>
          <Icon className={`h-6 w-6 ${color}`} />
        </div>
      </div>
      <div className="mt-4 flex items-center text-sm text-primary-600 font-medium 
                    group-hover:gap-2 transition-all">
        View details
        <ArrowRight className="h-4 w-4 ml-1 group-hover:translate-x-1 transition-transform" />
      </div>
    </Link>
  );
}

export default function AccountDashboard() {
  const router = useRouter();
  const { 
    patron, 
    isLoggedIn, 
    isLoading,
    checkouts,
    holds,
    fines,
    fetchCheckouts,
    fetchHolds,
    fetchFines,
  } = usePatronSession();
  const { currentLocation } = useLibrary();
  const [listsCount, setListsCount] = useState<number | null>(null);

  useEffect(() => {
    if (!isLoading && !isLoggedIn) {
      router.push("/opac/login?redirect=/opac/account");
    }
  }, [isLoading, isLoggedIn, router]);

  useEffect(() => {
    if (isLoggedIn) {
      fetchCheckouts();
      fetchHolds();
      fetchFines();
    }
  }, [fetchCheckouts, fetchFines, fetchHolds, isLoggedIn]);

  useEffect(() => {
    if (!isLoggedIn || !featureFlags.opacLists) return;
    let cancelled = false;
    void fetch("/api/opac/lists", { credentials: "include" })
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        const count = Array.isArray(data?.lists) ? data.lists.length : 0;
        setListsCount(count);
      })
      .catch(() => {
        if (cancelled) return;
        setListsCount(null);
      });
    return () => {
      cancelled = true;
    };
  }, [isLoggedIn]);

  if (isLoading || !isLoggedIn) {
    return (
      <div className="min-h-screen bg-muted/30 flex items-center justify-center">
        <Loader2 className="h-8 w-8 text-primary-600 animate-spin" />
      </div>
    );
  }

  const overdueItems = checkouts.filter(c => c.isOverdue);
  const readyHolds = holds.filter(h => h.status === "ready");
  const totalFineBalance = fines.reduce((sum, f) => sum + (f.isPaid ? 0 : f.amount), 0);

  return (
    <div className="min-h-screen bg-muted/30 py-8">
      <div className="max-w-7xl mx-auto px-4">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-foreground">
            Welcome, {patron?.firstName}!
          </h1>
          <p className="text-muted-foreground mt-1">
            Manage your library account
          </p>
        </div>

        {/* Alerts */}
        {(overdueItems.length > 0 || readyHolds.length > 0 || totalFineBalance > 0) && (
          <div className="mb-6 space-y-3">
            {overdueItems.length > 0 && (
              <div className="p-4 bg-red-50 border border-red-200 rounded-lg flex items-center gap-3">
                <AlertCircle className="h-5 w-5 text-red-600 shrink-0" />
                <p className="text-red-800">
                  You have <strong>{overdueItems.length}</strong> overdue item{overdueItems.length !== 1 && "s"}.
                  <Link href="/opac/account/checkouts" className="ml-2 underline">
                    View & renew
                  </Link>
                </p>
              </div>
            )}
            
            {readyHolds.length > 0 && (
              <div className="p-4 bg-green-50 border border-green-200 rounded-lg flex items-center gap-3">
                <CheckCircle className="h-5 w-5 text-green-600 shrink-0" />
                <p className="text-green-800">
                  <strong>{readyHolds.length}</strong> hold{readyHolds.length !== 1 && "s"} ready for pickup!
                  <Link href="/opac/account/holds" className="ml-2 underline">
                    View details
                  </Link>
                </p>
              </div>
            )}

            {totalFineBalance > 0 && (
              <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg flex items-center gap-3">
                <DollarSign className="h-5 w-5 text-amber-600 shrink-0" />
                <p className="text-amber-800">
                  You have <strong>${totalFineBalance.toFixed(2)}</strong> in fines.
                  <Link href="/opac/account/fines" className="ml-2 underline">
                    View & pay
                  </Link>
                </p>
              </div>
            )}
          </div>
        )}

        {/* Quick stats */}
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <QuickStatCard
            title="Items Checked Out"
            value={checkouts.length}
            icon={BookOpen}
            href="/opac/account/checkouts"
            color="text-blue-600"
            alert={overdueItems.length > 0}
          />
          <QuickStatCard
            title="Holds"
            value={holds.length}
            icon={Clock}
            href="/opac/account/holds"
            color="text-purple-600"
            alert={readyHolds.length > 0}
          />
          <QuickStatCard
            title="Fines & Fees"
            value={totalFineBalance > 0 ? `$${totalFineBalance.toFixed(2)}` : "$0.00"}
            icon={DollarSign}
            href="/opac/account/fines"
            color={totalFineBalance > 0 ? "text-amber-600" : "text-green-600"}
          />
          {featureFlags.opacLists ? (
            <QuickStatCard
              title="Saved Lists"
              value={listsCount === null ? "—" : listsCount}
              icon={Heart}
              href="/opac/account/lists"
              color="text-rose-600"
            />
          ) : null}
        </div>

        <div className="grid lg:grid-cols-3 gap-8">
          {/* Account info */}
          <div className="lg:col-span-2 space-y-6">
            {/* Recent checkouts */}
            <div className="bg-card rounded-xl shadow-sm border border-border p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-foreground">Recent Checkouts</h2>
                <Link 
                  href="/opac/account/checkouts"
                  className="text-primary-600 hover:text-primary-700 text-sm font-medium"
                >
                  View all →
                </Link>
              </div>
              
              {checkouts.length > 0 ? (
                <div className="space-y-3">
                  {checkouts.slice(0, 3).map((checkout) => (
                    <div 
                      key={checkout.id}
                      className="flex items-center gap-4 p-3 bg-muted/30 rounded-lg"
                    >
                      <div className="w-12 h-16 bg-muted rounded overflow-hidden shrink-0">
                        {checkout.coverUrl ? (
                          <Image
                            src={checkout.coverUrl}
                            alt={`Cover of ${checkout.title}`}
                            width={48}
                            height={64}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <BookOpen className="h-6 w-6 text-muted-foreground/70" />
                          </div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-foreground truncate">{checkout.title}</p>
                        <p className="text-sm text-muted-foreground truncate">{checkout.author}</p>
                        <p className={`text-sm ${checkout.isOverdue ? "text-red-600 font-medium" : "text-muted-foreground"}`}>
                          {checkout.isOverdue ? "OVERDUE - " : ""}Due {checkout.dueDate}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-muted-foreground text-center py-4">No items currently checked out</p>
              )}
            </div>

            {/* Reading stats (StacksOS enhanced feature) */}
            <div className="bg-gradient-to-br from-primary-600 to-primary-700 rounded-xl shadow-sm p-6 text-white">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2 bg-card/20 rounded-lg">
                  <TrendingUp className="h-6 w-6" />
                </div>
                <h2 className="text-lg font-semibold">Your Reading Stats</h2>
              </div>
              
              <div className="grid grid-cols-3 gap-4">
                <div className="text-center">
                  <p className="text-3xl font-bold">{patron?.booksReadThisYear || 0}</p>
                  <p className="text-sm text-primary-100">Books this year</p>
                </div>
                <div className="text-center">
                  <p className="text-3xl font-bold">{patron?.readingStreak || 0}</p>
                  <p className="text-sm text-primary-100">Day streak</p>
                </div>
                <div className="text-center">
                  <p className="text-3xl font-bold">{patron?.readingGoal || 24}</p>
                  <p className="text-sm text-primary-100">2025 Goal</p>
                </div>
              </div>

              {patron?.readingGoal && (
                <div className="mt-4">
                  <div className="flex justify-between text-sm mb-1">
                    <span>Progress to goal</span>
                    <span>{Math.round(((patron.booksReadThisYear || 0) / patron.readingGoal) * 100)}%</span>
                  </div>
                  <div className="h-2 bg-card/20 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-card rounded-full transition-all"
                      style={{ width: `${Math.min(100, ((patron.booksReadThisYear || 0) / patron.readingGoal) * 100)}%` }}
                    />
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Account info card */}
            <div className="bg-card rounded-xl shadow-sm border border-border p-6">
              <div className="flex items-center gap-4 mb-6">
                <div className="w-16 h-16 bg-primary-100 rounded-full flex items-center justify-center">
                  <User className="h-8 w-8 text-primary-600" />
                </div>
                <div>
                  <p className="font-semibold text-foreground">
                    {patron?.firstName} {patron?.lastName}
                  </p>
                  <p className="text-sm text-muted-foreground">{patron?.cardNumber}</p>
                </div>
              </div>

              <div className="space-y-3 text-sm">
                {patron?.email && (
                  <div className="flex items-center gap-3 text-muted-foreground">
                    <Mail className="h-4 w-4" />
                    {patron.email}
                  </div>
                )}
                {patron?.phone && (
                  <div className="flex items-center gap-3 text-muted-foreground">
                    <Phone className="h-4 w-4" />
                    {patron.phone}
                  </div>
                )}
                {currentLocation && (
                  <div className="flex items-center gap-3 text-muted-foreground">
                    <MapPin className="h-4 w-4" />
                    {currentLocation.name}
                  </div>
                )}
                {patron?.expirationDate && (
                  <div className="flex items-center gap-3 text-muted-foreground">
                    <CreditCard className="h-4 w-4" />
                    Expires: {patron.expirationDate}
                  </div>
                )}
              </div>

              <Link
                href="/opac/account/settings"
                className="mt-6 block w-full py-2 border border-border rounded-lg text-center
                         text-foreground/80 hover:bg-muted/30 transition-colors text-sm font-medium"
              >
                <Settings className="h-4 w-4 inline-block mr-2" />
                Account Settings
              </Link>
            </div>

            {/* Quick links */}
            <div className="bg-card rounded-xl shadow-sm border border-border p-6">
              <h3 className="font-semibold text-foreground mb-4">Quick Links</h3>
              <nav className="space-y-2">
                <Link
                  href="/opac/account/checkouts"
                  className="flex items-center gap-3 px-3 py-2 text-foreground/80 hover:bg-muted/30 
                           rounded-lg transition-colors"
                >
                  <BookOpen className="h-5 w-5 text-muted-foreground/70" />
                  My Checkouts
                </Link>
                <Link
                  href="/opac/account/holds"
                  className="flex items-center gap-3 px-3 py-2 text-foreground/80 hover:bg-muted/30 
                           rounded-lg transition-colors"
                >
                  <Clock className="h-5 w-5 text-muted-foreground/70" />
                  My Holds
                </Link>
                <Link
                  href="/opac/account/fines"
                  className="flex items-center gap-3 px-3 py-2 text-foreground/80 hover:bg-muted/30 
                           rounded-lg transition-colors"
                >
                  <DollarSign className="h-5 w-5 text-muted-foreground/70" />
                  Fines & Fees
                </Link>
                <Link
                  href="/opac/account/lists"
                  className="flex items-center gap-3 px-3 py-2 text-foreground/80 hover:bg-muted/30 
                           rounded-lg transition-colors"
                >
                  <Heart className="h-5 w-5 text-muted-foreground/70" />
                  My Lists
                </Link>
                {featureFlags.opacKids ? (
                  <Link
                    href="/opac/kids/challenges"
                    className="flex items-center gap-3 px-3 py-2 text-foreground/80 hover:bg-muted/30 
                           rounded-lg transition-colors"
                  >
                    <Award className="h-5 w-5 text-muted-foreground/70" />
                    Reading Challenges
                  </Link>
                ) : null}
                <Link
                  href="/opac/account/messages"
                  className="flex items-center gap-3 px-3 py-2 text-foreground/80 hover:bg-muted/30 
                           rounded-lg transition-colors"
                >
                  <Mail className="h-5 w-5 text-muted-foreground/70" />
                  Messages
                </Link>
                <Link
                  href="/opac/account/history"
                  className="flex items-center gap-3 px-3 py-2 text-foreground/80 hover:bg-muted/30 
                           rounded-lg transition-colors"
                >
                  <Clock className="h-5 w-5 text-muted-foreground/70" />
                  Reading History
                </Link>
              </nav>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
