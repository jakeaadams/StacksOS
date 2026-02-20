"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Globe } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

const LOCALES = [
  { code: "en", label: "English", flag: "EN" },
  { code: "es", label: "Espa\u00f1ol", flag: "ES" },
] as const;

/**
 * Language switcher dropdown for the OPAC header.
 *
 * Sets a "NEXT_LOCALE" cookie so next-intl picks up the preference
 * on subsequent requests, then refreshes the page to load the new locale.
 */
export function LanguageSwitcher() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [currentLocale, setCurrentLocale] = useState<string>(() => {
    if (typeof document !== "undefined") {
      const match = document.cookie.match(/NEXT_LOCALE=(\w+)/);
      return match?.[1] || "en";
    }
    return "en";
  });

  const handleLocaleChange = (locale: string) => {
    // Set cookie with 1-year expiry, accessible to all paths
    document.cookie = `NEXT_LOCALE=${locale};path=/;max-age=${60 * 60 * 24 * 365};SameSite=Lax`;
    setCurrentLocale(locale);
    startTransition(() => {
      router.refresh();
    });
  };

  const current = LOCALES.find((l) => l.code === currentLocale) || LOCALES[0];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          "flex items-center gap-1.5 px-2 py-1.5 rounded-full text-sm",
          "hover:bg-muted/50 text-muted-foreground hover:text-foreground transition-colors",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          isPending && "opacity-60"
        )}
        aria-label="Switch language"
      >
        <Globe className="h-4 w-4" />
        <span className="hidden sm:inline text-xs font-medium">{current.flag}</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[140px]">
        {LOCALES.map((locale) => (
          <DropdownMenuItem
            key={locale.code}
            onClick={() => handleLocaleChange(locale.code)}
            className={cn(
              "flex items-center gap-2 cursor-pointer",
              locale.code === currentLocale && "font-semibold text-primary"
            )}
          >
            <span className="text-xs font-mono w-5">{locale.flag}</span>
            <span>{locale.label}</span>
            {locale.code === currentLocale && (
              <span className="ml-auto text-primary text-xs">\u2713</span>
            )}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
