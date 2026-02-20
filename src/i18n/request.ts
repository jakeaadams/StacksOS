import { getRequestConfig } from "next-intl/server";
import { cookies, headers } from "next/headers";

/**
 * next-intl request configuration.
 *
 * Determines the active locale by checking (in order):
 * 1. The "NEXT_LOCALE" cookie (set by the language switcher)
 * 2. The browser Accept-Language header
 * 3. Falls back to "en"
 *
 * Supported locales: en, es
 */

const SUPPORTED_LOCALES = ["en", "es"] as const;
type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];
const DEFAULT_LOCALE: SupportedLocale = "en";

function isSupported(locale: string): locale is SupportedLocale {
  return (SUPPORTED_LOCALES as readonly string[]).includes(locale);
}

function parseAcceptLanguage(header: string): SupportedLocale {
  // Parse Accept-Language header and find the first supported locale
  const parts = header.split(",");
  for (const part of parts) {
    const lang = part.split(";")[0].trim().toLowerCase();
    // Check exact match first (e.g. "es")
    if (isSupported(lang)) return lang;
    // Check language prefix (e.g. "es-MX" -> "es")
    const prefix = lang.split("-")[0];
    if (isSupported(prefix)) return prefix;
  }
  return DEFAULT_LOCALE;
}

export default getRequestConfig(async () => {
  // 1. Check cookie
  const cookieStore = await cookies();
  const cookieLocale = cookieStore.get("NEXT_LOCALE")?.value;
  if (cookieLocale && isSupported(cookieLocale)) {
    const messages = (await import(`./${cookieLocale}.json`)).default;
    return { locale: cookieLocale, messages };
  }

  // 2. Check Accept-Language header
  const headerStore = await headers();
  const acceptLang = headerStore.get("accept-language");
  const detected = acceptLang ? parseAcceptLanguage(acceptLang) : DEFAULT_LOCALE;

  const messages = (await import(`./${detected}.json`)).default;
  return { locale: detected, messages };
});
