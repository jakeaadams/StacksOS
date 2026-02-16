import Link from "next/link";
import { ArrowLeft, Smartphone, Search, CreditCard, Bell } from "lucide-react";

export default function OpacMobilePage() {
  return (
    <div className="min-h-screen bg-muted/30">
      <section className="border-b border-border bg-card py-12">
        <div className="mx-auto max-w-5xl px-4">
          <Link
            href="/opac/help"
            className="mb-6 inline-flex items-center gap-2 text-sm text-primary-600 hover:underline"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Help
          </Link>
          <div className="flex items-start gap-4">
            <div className="rounded-full bg-primary-100 p-3">
              <Smartphone className="h-6 w-6 text-primary-600" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-foreground">Mobile Access</h1>
              <p className="mt-3 max-w-2xl text-muted-foreground">
                Use the OPAC on phones and tablets for search, holds, and account management.
              </p>
            </div>
          </div>
        </div>
      </section>

      <main className="mx-auto grid max-w-5xl gap-6 px-4 py-10 md:grid-cols-3">
        <article className="rounded-xl border border-border bg-card p-5">
          <h2 className="mb-3 flex items-center gap-2 text-base font-semibold">
            <Search className="h-4 w-4 text-primary-600" />
            Search Anywhere
          </h2>
          <p className="text-sm text-foreground/90">
            Browse titles, filter results, and place holds directly from mobile.
          </p>
          <Link href="/opac/search" className="mt-4 inline-block text-sm text-primary-600 hover:underline">
            Open Mobile Search
          </Link>
        </article>

        <article className="rounded-xl border border-border bg-card p-5">
          <h2 className="mb-3 flex items-center gap-2 text-base font-semibold">
            <CreditCard className="h-4 w-4 text-primary-600" />
            Manage Your Card
          </h2>
          <p className="text-sm text-foreground/90">
            View checkouts, renew items, and monitor fines from your account dashboard.
          </p>
          <Link href="/opac/account" className="mt-4 inline-block text-sm text-primary-600 hover:underline">
            Go to My Account
          </Link>
        </article>

        <article className="rounded-xl border border-border bg-card p-5">
          <h2 className="mb-3 flex items-center gap-2 text-base font-semibold">
            <Bell className="h-4 w-4 text-primary-600" />
            Stay Notified
          </h2>
          <p className="text-sm text-foreground/90">
            Configure email and hold notifications so pickup and due-date reminders are timely.
          </p>
          <Link href="/opac/account/settings" className="mt-4 inline-block text-sm text-primary-600 hover:underline">
            Notification Settings
          </Link>
        </article>
      </main>
    </div>
  );
}
