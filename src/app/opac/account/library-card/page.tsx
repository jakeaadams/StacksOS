"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { usePatronSession } from "@/hooks/use-patron-session";
import { DigitalLibraryCard } from "@/components/opac/digital-library-card";
import {
  ArrowLeft,
  Loader2,
  Download,
  Smartphone,
  Mail,
  WalletCards,
  ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTranslations } from "next-intl";
import { printHtml, escapeHtml } from "@/lib/print";
import { fetchWithAuth } from "@/lib/client-fetch";

type WalletApiData = {
  capabilities: {
    appleConfigured: boolean;
    googleConfigured: boolean;
    emailEnabled: boolean;
  };
  links: {
    apple: string | null;
    google: string | null;
  };
  patron: {
    email: string | null;
  };
  configured: string;
};

export default function LibraryCardPage() {
  const _t = useTranslations("accountDashboard");
  const router = useRouter();
  const { patron, isLoggedIn, isLoading } = usePatronSession();
  const [walletData, setWalletData] = useState<WalletApiData | null>(null);
  const [walletLoading, setWalletLoading] = useState(false);
  const [walletSending, setWalletSending] = useState(false);

  useEffect(() => {
    if (!isLoading && !isLoggedIn) {
      router.push("/opac/login?redirect=/opac/account/library-card");
    }
  }, [isLoading, isLoggedIn, router]);

  useEffect(() => {
    let cancelled = false;
    const loadWallet = async () => {
      if (!isLoggedIn) return;
      setWalletLoading(true);
      try {
        const response = await fetchWithAuth("/api/opac/library-card/wallet");
        const data = await response.json();
        if (!response.ok) {
          throw new Error(String(data?.error || "Unable to load wallet enrollment links."));
        }
        if (!cancelled) setWalletData(data as WalletApiData);
      } catch (error) {
        if (!cancelled) {
          setWalletData(null);
          toast.error(error instanceof Error ? error.message : "Unable to load wallet options.");
        }
      } finally {
        if (!cancelled) setWalletLoading(false);
      }
    };
    void loadWallet();
    return () => {
      cancelled = true;
    };
  }, [isLoggedIn]);

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

  const handleEmailWalletLinks = async () => {
    setWalletSending(true);
    try {
      const response = await fetchWithAuth("/api/opac/library-card/wallet", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "email",
          platform: "both",
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(String(data?.error || "Unable to send wallet email right now."));
      }
      toast.success(`Wallet links sent to ${data.recipient}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to send wallet links.");
    } finally {
      setWalletSending(false);
    }
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
              <WalletCards className="h-5 w-5 text-primary-600" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-foreground">Wallet Enrollment</h2>
              <p className="text-xs text-muted-foreground">
                Add your card to Apple Wallet/Google Wallet when provider links are configured.
              </p>
            </div>
          </div>

          <div className="space-y-5">
            <div className="grid gap-3 sm:grid-cols-2">
              <Button
                type="button"
                asChild={Boolean(walletData?.links?.apple)}
                disabled={!walletData?.links?.apple || walletLoading}
                className="justify-between"
              >
                {walletData?.links?.apple ? (
                  <a href={walletData.links.apple} target="_blank" rel="noopener noreferrer">
                    Add to Apple Wallet
                    <ExternalLink className="h-4 w-4 ml-2" />
                  </a>
                ) : (
                  <span>Add to Apple Wallet</span>
                )}
              </Button>
              <Button
                type="button"
                asChild={Boolean(walletData?.links?.google)}
                disabled={!walletData?.links?.google || walletLoading}
                variant="secondary"
                className="justify-between"
              >
                {walletData?.links?.google ? (
                  <a href={walletData.links.google} target="_blank" rel="noopener noreferrer">
                    Add to Google Wallet
                    <ExternalLink className="h-4 w-4 ml-2" />
                  </a>
                ) : (
                  <span>Add to Google Wallet</span>
                )}
              </Button>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                className="gap-2"
                onClick={handleEmailWalletLinks}
                disabled={walletSending || walletLoading || !walletData?.patron?.email}
              >
                {walletSending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Mail className="h-4 w-4" />
                )}
                Send Wallet Links by Email
              </Button>
              {!walletData?.patron?.email ? (
                <span className="text-xs text-amber-700 dark:text-amber-400">
                  Add an email in Account Settings to send wallet links.
                </span>
              ) : null}
            </div>

            <div className="rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground">
              {walletLoading ? "Loading wallet capabilities..." : walletData?.configured}
            </div>

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
                If your library has not configured wallet links yet, use the QR screenshot method
                above. StacksOS still supports fast desk/self-check scanning using this digital
                card.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
