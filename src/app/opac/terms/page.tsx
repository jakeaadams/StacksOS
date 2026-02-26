import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, ShieldCheck, FileText, AlertTriangle } from "lucide-react";
import { useTranslations } from "next-intl";

export const metadata: Metadata = {
  title: "Terms of Use",
  description:
    "Library card terms of use including cardholder responsibilities, fees, loss and damage policies, and account security.",
};

export default function OpacTermsPage() {
  const _t = useTranslations("termsPage");
  return (
    <div className="min-h-screen bg-muted/30">
      <section className="border-b border-border bg-card py-12">
        <div className="mx-auto max-w-4xl px-4">
          <Link
            href="/opac/register"
            className="mb-6 inline-flex items-center gap-2 text-sm text-primary-600 hover:underline"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Registration
          </Link>
          <h1 className="text-3xl font-bold text-foreground">Library Card Terms of Use</h1>
          <p className="mt-3 text-muted-foreground">
            These terms apply when you register for and use a library card through this catalog.
          </p>
        </div>
      </section>

      <main className="mx-auto grid max-w-4xl gap-6 px-4 py-10">
        <article className="rounded-xl border border-border bg-card p-6">
          <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold">
            <FileText className="h-5 w-5 text-primary-600" />
            Cardholder Responsibilities
          </h2>
          <ul className="list-disc space-y-2 pl-5 text-sm text-foreground/90">
            <li>You are responsible for all items borrowed with your card.</li>
            <li>Keep your contact information current so notices reach you on time.</li>
            <li>Report lost cards immediately to prevent unauthorized use.</li>
            <li>Return or renew materials by due dates to avoid fines and service blocks.</li>
          </ul>
        </article>

        <article className="rounded-xl border border-border bg-card p-6">
          <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold">
            <AlertTriangle className="h-5 w-5 text-amber-600" />
            Fees, Loss, and Damage
          </h2>
          <p className="text-sm text-foreground/90">
            Overdue fines, replacement costs, and processing fees may apply according to your
            library&apos;s circulation policy. Accounts with unresolved charges can have borrowing
            limits until balances are resolved.
          </p>
        </article>

        <article className="rounded-xl border border-border bg-card p-6">
          <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold">
            <ShieldCheck className="h-5 w-5 text-emerald-600" />
            Privacy and Account Security
          </h2>
          <p className="text-sm text-foreground/90">
            Your account data is handled under the library privacy policy. Protect your barcode and
            PIN, and sign out on shared devices.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <Link href="/opac/privacy" className="text-sm text-primary-600 hover:underline">
              Review Privacy Policy
            </Link>
            <Link href="/opac/help" className="text-sm text-primary-600 hover:underline">
              Help & FAQ
            </Link>
          </div>
        </article>
      </main>
    </div>
  );
}
