import type { Metadata } from "next";
import Link from "next/link";
import { useTranslations } from "next-intl";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description:
    "Learn how the library catalog handles your data, including session cookies, account information, and reading history.",
};

export default function PrivacyPage() {
  const t = useTranslations("privacyPage");
  return (
    <div className="min-h-screen bg-muted/30">
      <section className="bg-card border-b border-border py-12">
        <div className="max-w-4xl mx-auto px-4">
          <h1 className="text-3xl font-bold text-foreground">Privacy Policy</h1>
          <p className="mt-3 text-muted-foreground">
            This page explains, in plain language, what information the catalog uses to provide core
            features like sign-in, holds, and account pages.
          </p>
        </div>
      </section>

      <div className="max-w-4xl mx-auto px-4 py-12 space-y-8">
        <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-foreground">What we store</h2>
          <ul className="mt-3 list-disc pl-5 text-sm text-muted-foreground space-y-2">
            <li>Session cookies to keep you signed in.</li>
            <li>Basic account data needed to display checkouts, holds, fines, and messages.</li>
            <li>Optional features (like lists) may store additional preferences.</li>
          </ul>
        </div>

        <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-foreground">Reading history</h2>
          <p className="mt-3 text-sm text-muted-foreground">
            Reading history should be treated as sensitive. If your library enables it, it should be
            opt-in and provide clear controls to view or clear history.
          </p>
        </div>

        <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-foreground">Questions</h2>
          <p className="mt-3 text-sm text-muted-foreground">
            Contact your library for policy details. You can also see{" "}
            <Link className="text-primary underline" href="/opac/help">
              Help
            </Link>{" "}
            for common account questions.
          </p>
        </div>
      </div>
    </div>
  );
}
