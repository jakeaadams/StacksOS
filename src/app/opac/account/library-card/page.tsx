"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { usePatronSession } from "@/hooks/use-patron-session";
import { DigitalLibraryCard } from "@/components/opac/digital-library-card";
import { ArrowLeft, Loader2, Download, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTranslations } from "next-intl";
import { printHtml, escapeHtml } from "@/lib/print";

export default function LibraryCardPage() {
  const _t = useTranslations("accountDashboard");
  const router = useRouter();
  const { patron, isLoggedIn, isLoading } = usePatronSession();

  useEffect(() => {
    if (!isLoading && !isLoggedIn) {
      router.push("/opac/login?redirect=/opac/account/library-card");
    }
  }, [isLoading, isLoggedIn, router]);

  const handleDownload = () => {
    if (!patron) return;
    const name = escapeHtml(patronFullName);
    const card = escapeHtml(patron.cardNumber);
    const library = escapeHtml(patron.homeLibrary);
    const expires = escapeHtml(patron.expirationDate);

    const html = `
      <div class="box" style="max-width:360px;margin:0 auto;text-align:center;">
        <h1>Library Card</h1>
        <p style="font-size:16px;font-weight:600;margin:12px 0 4px;">${name}</p>
        <p class="mono" style="font-size:18px;letter-spacing:0.08em;margin:8px 0;">${card}</p>
        <div class="meta" style="justify-content:center;">
          <span><span class="k">Library:</span> <span class="v">${library}</span></span>
          <span><span class="k">Expires:</span> <span class="v">${expires}</span></span>
        </div>
      </div>
    `;

    printHtml(html, { title: "Library Card", tone: "slip" });
  };

  if (isLoading || !isLoggedIn || !patron) {
    return (
      <div className="min-h-screen bg-muted/30 flex items-center justify-center">
        <Loader2 className="h-8 w-8 text-primary-600 animate-spin" />
      </div>
    );
  }

  const patronFullName = `${patron.firstName} ${patron.lastName}`;

  return (
    <div className="min-h-screen bg-muted/30">
      {/* Header */}
      <div className="bg-card border-b">
        <div className="max-w-3xl mx-auto px-4 py-6">
          <Link
            href="/opac/account"
            className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground mb-4"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Account
          </Link>
          <h1 className="text-2xl font-bold text-foreground">Your Digital Library Card</h1>
          <p className="text-muted-foreground mt-1">
            Use this card at self-checkout stations or show it at the service desk for quick
            scanning.
          </p>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-3xl mx-auto px-4 py-8">
        {/* Digital card */}
        <div className="mb-8">
          <DigitalLibraryCard
            patronName={patronFullName}
            cardNumber={patron.cardNumber}
            homeLibrary={patron.homeLibrary}
            expirationDate={patron.expirationDate}
          />
        </div>

        {/* Download button */}
        <div className="flex justify-center mb-8">
          <Button type="button" variant="outline" onClick={handleDownload} className="gap-2">
            <Download className="h-4 w-4" />
            Download / Print Card
          </Button>
        </div>

        {/* Wallet instructions */}
        <div className="bg-card rounded-xl border border-border p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-primary-100 rounded-lg">
              <Smartphone className="h-5 w-5 text-primary-600" />
            </div>
            <h2 className="text-lg font-semibold text-foreground">Add to Your Phone</h2>
          </div>

          <div className="space-y-5">
            {/* iOS instructions */}
            <div>
              <h3 className="text-sm font-semibold text-foreground mb-2">iPhone (iOS)</h3>
              <ol className="text-sm text-muted-foreground space-y-1.5 list-decimal list-inside">
                <li>Flip the card above to show the QR code</li>
                <li>Take a screenshot (press Side + Volume Up)</li>
                <li>
                  Open the screenshot and tap the share icon, then select &ldquo;Save to
                  Files&rdquo; or add to a Photos album for easy access
                </li>
              </ol>
            </div>

            {/* Android instructions */}
            <div>
              <h3 className="text-sm font-semibold text-foreground mb-2">Android</h3>
              <ol className="text-sm text-muted-foreground space-y-1.5 list-decimal list-inside">
                <li>Flip the card above to show the QR code</li>
                <li>Take a screenshot (press Power + Volume Down)</li>
                <li>
                  The screenshot is saved to your gallery automatically. You can also add a home
                  screen shortcut for quick access
                </li>
              </ol>
            </div>

            {/* General note */}
            <div className="pt-3 border-t border-border/50">
              <p className="text-xs text-muted-foreground leading-relaxed">
                Apple Wallet and Google Wallet pass generation is not currently supported. You can
                save a screenshot of your QR code for the same quick-scan experience at any library
                location.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
