import type { BookFormat } from "@/components/opac/book-card";
import { BookOpen, Smartphone, Headphones, MonitorPlay } from "lucide-react";

export interface SearchResult {
  id: number;
  title: string;
  author?: string;
  coverUrl?: string;
  publicationYear?: number;
  summary?: string;
  subjects?: string[];
  isbn?: string;
  formats: BookFormat[];
  availableCopies: number;
  totalCopies: number;
  holdCount: number;
  rating?: number;
  reviewCount?: number;
  rankingReason?: string;
  rankingScore?: number;
  aiExplanation?: string;
}

export function getSORT_OPTIONS(t: (key: string) => string) { return [
  { value: "relevance", label: t("relevance") },
  { value: "smart", label: t("smartAI") },
  { value: "title_asc", label: t("titleAZ") },
  { value: "title_desc", label: t("titleZA") },
  { value: "author_asc", label: t("authorAZ") },
  { value: "date_desc", label: t("newestFirst") },
  { value: "date_asc", label: t("oldestFirst") },
  { value: "popularity", label: t("mostPopular") },
]; }

export function getFORMAT_FILTERS(t: (key: string) => string) { return [
  { value: "book", label: t("booksFormat"), icon: BookOpen },
  { value: "ebook", label: t("eBooksFormat"), icon: Smartphone },
  { value: "audiobook", label: t("audiobooksFormat"), icon: Headphones },
  { value: "dvd", label: t("dvdsFormat"), icon: MonitorPlay },
]; }

export function getAUDIENCE_FILTERS(t: (key: string) => string) { return [
  { value: "general", label: t("allAges") },
  { value: "juvenile", label: t("kids") },
  { value: "young_adult", label: t("teens") },
]; }

export const LANGUAGE_LABELS: Record<string, string> = {
  eng: "English",
  spa: "Spanish",
  fre: "French",
  ger: "German",
  ita: "Italian",
  por: "Portuguese",
  rus: "Russian",
  chi: "Chinese",
  jpn: "Japanese",
  kor: "Korean",
  ara: "Arabic",
  hin: "Hindi",
};

export function parseCsvParam(value: string): string[] {
  return (value || "")
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
}

const AI_SEARCH_STORAGE_KEY = "stacksos_ai_search_enabled";

export function getStoredAiSearchEnabled(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(AI_SEARCH_STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

export function storeAiSearchEnabled(enabled: boolean) {
  try {
    localStorage.setItem(AI_SEARCH_STORAGE_KEY, String(enabled));
  } catch {
    // localStorage may be unavailable in private browsing mode
  }
}
