import type { Metadata } from "next";
import Link from "next/link";
import { HelpCircle, User, CreditCard, Download, Mail, Phone, MapPin } from "lucide-react";
import { HelpFAQ } from "@/components/opac/HelpFAQ";
import { HelpContactPhone } from "@/components/opac/HelpContactPhone";
import { useTranslations } from "next-intl";

export const metadata: Metadata = {
  title: "Help & FAQ",
  description:
    "Find answers to common questions about using the library catalog, your account, borrowing, holds, and digital resources.",
};

export default function HelpPage() {
  const _t = useTranslations("helpPage");
  return (
    <div className="min-h-screen bg-muted/30">
      {/* Header */}
      <section className="bg-card border-b border-border py-12">
        <div className="max-w-4xl mx-auto px-4 text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-primary-100 rounded-full mb-4">
            <HelpCircle className="h-8 w-8 text-primary-600" />
          </div>
          <h1 className="text-3xl font-bold text-foreground mb-4">
            Help & Frequently Asked Questions
          </h1>
          <p className="text-lg text-muted-foreground mb-6">
            Find answers to common questions about using the library catalog and your account.
          </p>
        </div>
      </section>

      {/* Interactive FAQ (client component): search, category filter, accordion */}
      <HelpFAQ />

      {/* Quick links (static) */}
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="pt-4 border-t border-border">
          <h2 className="font-semibold text-foreground mb-4">Quick Links</h2>
          <ul className="flex flex-wrap gap-6 text-sm">
            <li>
              <Link
                href="/opac/account"
                className="text-primary-600 hover:underline flex items-center gap-2"
              >
                <User className="h-4 w-4" />
                My Account
              </Link>
            </li>
            <li>
              <Link
                href="/opac/register"
                className="text-primary-600 hover:underline flex items-center gap-2"
              >
                <CreditCard className="h-4 w-4" />
                Get a Library Card
              </Link>
            </li>
            <li>
              <Link
                href="/opac/mobile"
                className="text-primary-600 hover:underline flex items-center gap-2"
              >
                <Download className="h-4 w-4" />
                Mobile Access
              </Link>
            </li>
          </ul>
        </div>
      </div>

      {/* Contact section */}
      <section className="max-w-6xl mx-auto px-4 pb-16">
        <div className="bg-card rounded-xl border border-border p-8">
          <h2 className="text-2xl font-bold text-foreground mb-6 text-center">Still Need Help?</h2>
          <div className="grid md:grid-cols-3 gap-8">
            <div className="text-center">
              <div className="inline-flex items-center justify-center w-12 h-12 bg-blue-100 rounded-full mb-4">
                <Mail className="h-6 w-6 text-blue-600" />
              </div>
              <h3 className="font-semibold text-foreground mb-2">Email Us</h3>
              <p className="text-muted-foreground text-sm mb-2">
                Send us a message and we will respond within 1 business day.
              </p>
              <a href="mailto:help@library.org" className="text-primary-600 hover:underline">
                help@library.org
              </a>
            </div>
            <div className="text-center">
              <div className="inline-flex items-center justify-center w-12 h-12 bg-green-100 rounded-full mb-4">
                <Phone className="h-6 w-6 text-green-600" />
              </div>
              <h3 className="font-semibold text-foreground mb-2">Call Us</h3>
              <p className="text-muted-foreground text-sm mb-2">
                Speak with a librarian during library hours.
              </p>
              <HelpContactPhone />
            </div>
            <div className="text-center">
              <div className="inline-flex items-center justify-center w-12 h-12 bg-indigo-100 rounded-full mb-4">
                <MapPin className="h-6 w-6 text-indigo-600" />
              </div>
              <h3 className="font-semibold text-foreground mb-2">Visit Us</h3>
              <p className="text-muted-foreground text-sm mb-2">
                Stop by any branch for in-person assistance.
              </p>
              <Link href="/locations" className="text-primary-600 hover:underline">
                Find a Branch
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
