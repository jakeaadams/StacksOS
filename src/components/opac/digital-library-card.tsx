"use client";

import { QRCodeSVG } from "qrcode.react";
import { useState } from "react";
import { CreditCard, RotateCcw, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";

interface DigitalLibraryCardProps {
  patronName: string;
  cardNumber: string;
  homeLibrary: string;
  expirationDate?: string;
}

function maskCardNumber(cardNumber: string): string {
  if (cardNumber.length <= 4) return cardNumber;
  const visible = cardNumber.slice(-4);
  const masked = cardNumber.slice(0, -4).replace(/./g, "\u2022");
  return masked + visible;
}

function formatExpirationDate(date?: string): string {
  if (!date) return "No expiration";
  try {
    const parsed = new Date(date);
    if (isNaN(parsed.getTime())) return date;
    return parsed.toLocaleDateString("en-US", {
      month: "long",
      year: "numeric",
    });
  } catch {
    return date;
  }
}

function DigitalLibraryCard({
  patronName,
  cardNumber,
  homeLibrary,
  expirationDate,
}: DigitalLibraryCardProps) {
  const [isFlipped, setIsFlipped] = useState(false);

  const handleFlip = () => {
    setIsFlipped((prev) => !prev);
  };

  return (
    <div className="w-full max-w-md mx-auto">
      {/* Card container with perspective for 3D flip */}
      <div className="relative w-full" style={{ perspective: "1000px" }}>
        <div
          className="relative w-full transition-transform duration-700 ease-in-out"
          style={{
            transformStyle: "preserve-3d",
            transform: isFlipped ? "rotateY(180deg)" : "rotateY(0deg)",
            aspectRatio: "1.586 / 1",
          }}
        >
          {/* Front of card */}
          <div
            className="absolute inset-0 rounded-2xl overflow-hidden shadow-xl border border-border/50"
            style={{ backfaceVisibility: "hidden" }}
          >
            <div className="h-full bg-gradient-to-br from-primary-600 via-primary-700 to-primary-800 p-6 flex flex-col justify-between text-white">
              {/* Top section: branding */}
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <div className="p-1.5 bg-white/20 rounded-lg backdrop-blur-sm">
                      <CreditCard className="h-5 w-5" />
                    </div>
                    <span className="text-sm font-semibold tracking-wide uppercase opacity-90">
                      Library Card
                    </span>
                  </div>
                  <p className="text-xs text-white/70 mt-0.5">{homeLibrary}</p>
                </div>
                <div className="text-right">
                  <div className="w-10 h-10 rounded-full bg-white/15 backdrop-blur-sm flex items-center justify-center">
                    <span className="text-lg font-bold">{patronName.charAt(0).toUpperCase()}</span>
                  </div>
                </div>
              </div>

              {/* Middle section: card number */}
              <div className="mt-auto">
                <p className="font-mono text-lg tracking-[0.15em] mb-1">
                  {maskCardNumber(cardNumber)}
                </p>
              </div>

              {/* Bottom section: name and expiration */}
              <div className="flex items-end justify-between">
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-white/60 mb-0.5">
                    Card Holder
                  </p>
                  <p className="text-sm font-semibold tracking-wide">{patronName}</p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] uppercase tracking-wider text-white/60 mb-0.5">
                    Valid Thru
                  </p>
                  <p className="text-sm font-medium">{formatExpirationDate(expirationDate)}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Back of card */}
          <div
            className="absolute inset-0 rounded-2xl overflow-hidden shadow-xl border border-border/50"
            style={{
              backfaceVisibility: "hidden",
              transform: "rotateY(180deg)",
            }}
          >
            <div className="h-full bg-card flex flex-col">
              {/* Magnetic stripe */}
              <div className="h-10 bg-foreground/80 mt-4" />

              {/* QR code section */}
              <div className="flex-1 flex flex-col items-center justify-center px-6 py-3 gap-2">
                <div className="bg-white p-2.5 rounded-xl shadow-sm border border-border/30">
                  <QRCodeSVG
                    value={cardNumber}
                    size={110}
                    level="M"
                    includeMargin={false}
                    bgColor="#ffffff"
                    fgColor="#000000"
                  />
                </div>
                <p className="font-mono text-xs text-muted-foreground tracking-wider">
                  {cardNumber}
                </p>
              </div>

              {/* Footer */}
              <div className="px-6 pb-4 flex items-center justify-between">
                <p className="text-[10px] text-muted-foreground">
                  Expires: {formatExpirationDate(expirationDate)}
                </p>
                <p className="text-[10px] text-muted-foreground">{homeLibrary}</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Flip button */}
      <div className="mt-6 flex justify-center">
        <Button type="button" variant="outline" onClick={handleFlip} className="gap-2">
          <RotateCcw className="h-4 w-4" />
          {isFlipped ? "Show front" : "Show QR code"}
        </Button>
      </div>

      {/* Save to phone hint */}
      <div className="mt-5 p-4 bg-muted/40 rounded-xl border border-border/50">
        <div className="flex items-start gap-3">
          <div className="p-2 bg-primary-100 rounded-lg shrink-0">
            <Smartphone className="h-4 w-4 text-primary-600" />
          </div>
          <div>
            <p className="text-sm font-medium text-foreground">Save to your phone</p>
            <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
              Take a screenshot of the QR code side to keep your library card handy. Show it at any
              self-checkout station or service desk for quick scanning.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export { DigitalLibraryCard };
export type { DigitalLibraryCardProps };
