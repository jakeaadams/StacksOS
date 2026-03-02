"use client";

import { useState, useCallback, useEffect } from "react";
import { Share2, Copy, Mail, Printer, QrCode } from "lucide-react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { QRCodeSVG } from "qrcode.react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/* ------------------------------------------------------------------ */
/*  Props                                                              */
/* ------------------------------------------------------------------ */

export interface ShareMenuProps {
  url: string;
  title: string;
  author?: string;
  children: React.ReactNode;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function ShareMenu({ url, title, author, children }: ShareMenuProps) {
  const t = useTranslations("shareMenu");
  const [showQR, setShowQR] = useState(false);
  const [hasNativeShare, setHasNativeShare] = useState(false);

  // Check for Web Share API on mount (SSR-safe)
  useEffect(() => {
    setHasNativeShare(typeof navigator !== "undefined" && typeof navigator.share === "function");
  }, []);

  const handleNativeShare = useCallback(async () => {
    try {
      await navigator.share({
        title,
        text: author ? `${title} by ${author}` : title,
        url,
      });
    } catch (err) {
      // User cancelled or share failed — only toast on real errors
      if (err instanceof Error && err.name !== "AbortError") {
        toast.error(t("shareFailed"));
      }
    }
  }, [url, title, author, t]);

  const handleCopyLink = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(url);
      toast.success(t("linkCopied"));
    } catch {
      toast.error(t("copyFailed"));
    }
  }, [url, t]);

  const handleEmail = useCallback(() => {
    const subject = encodeURIComponent(author ? `${title} by ${author}` : title);
    const body = encodeURIComponent(`${title}\n\n${url}`);
    window.open(`mailto:?subject=${subject}&body=${body}`, "_self");
  }, [url, title, author]);

  const handlePrint = useCallback(() => {
    window.print();
  }, []);

  const handleQRCode = useCallback(() => {
    setShowQR((prev) => !prev);
  }, []);

  return (
    <div>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>{children}</DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-[180px]">
          {hasNativeShare && (
            <DropdownMenuItem onClick={handleNativeShare}>
              <Share2 className="h-4 w-4" />
              {t("share")}
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onClick={handleCopyLink}>
            <Copy className="h-4 w-4" />
            {t("copyLink")}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={handleEmail}>
            <Mail className="h-4 w-4" />
            {t("email")}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={handlePrint}>
            <Printer className="h-4 w-4" />
            {t("print")}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={handleQRCode}>
            <QrCode className="h-4 w-4" />
            {t("qrCode")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {showQR && (
        <div className="mt-3 flex flex-col items-center gap-2 rounded-xl border border-border/70 bg-muted/20 p-4">
          <QRCodeSVG value={url} size={160} />
          <span className="text-xs text-muted-foreground">{t("scanToOpen")}</span>
        </div>
      )}
    </div>
  );
}
