export interface KidsReadingLogEntry {
  id: number;
  bibId: number | null;
  title: string;
  readAt: string; // YYYY-MM-DD
  minutesRead: number;
  pagesRead?: number | null;
}

function toLocalISODate(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function computeCurrentStreak(entries: KidsReadingLogEntry[]): number {
  const days = new Set(entries.map((e) => e.readAt.slice(0, 10)));
  let streak = 0;
  const cursor = new Date();
  while (true) {
    const key = toLocalISODate(cursor);
    if (!days.has(key)) break;
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

export function computeLongestStreak(entries: KidsReadingLogEntry[]): number {
  const uniqueDays = Array.from(new Set(entries.map((e) => e.readAt.slice(0, 10)))).sort();
  if (uniqueDays.length === 0) return 0;

  let best = 1;
  let current = 1;
  for (let i = 1; i < uniqueDays.length; i++) {
    const prev = new Date(uniqueDays[i - 1] + "T00:00:00");
    const next = new Date(uniqueDays[i] + "T00:00:00");
    const diff = Math.round((next.getTime() - prev.getTime()) / (24 * 60 * 60 * 1000));
    if (diff === 1) {
      current += 1;
      best = Math.max(best, current);
    } else {
      current = 1;
    }
  }
  return best;
}

function countUniqueBooks(entries: KidsReadingLogEntry[]): number {
  const key = (e: KidsReadingLogEntry) => (typeof e.bibId === "number" ? `bib:${e.bibId}` : `t:${e.title}`);
  return new Set(entries.map(key)).size;
}

function monthKey(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}

export function computeKidsReadingStats(entries: KidsReadingLogEntry[]) {
  const totalMinutes = entries.reduce((sum, e) => sum + (typeof e.minutesRead === "number" ? e.minutesRead : 0), 0);
  const totalPages = entries.reduce((sum, e) => sum + (typeof e.pagesRead === "number" ? e.pagesRead : 0), 0);
  const totalBooks = countUniqueBooks(entries);

  const now = new Date();
  const currentMonth = monthKey(now);
  const monthEntries = entries.filter((e) => e.readAt.slice(0, 7) === currentMonth);
  const booksThisMonth = countUniqueBooks(monthEntries);
  const minutesThisMonth = monthEntries.reduce((sum, e) => sum + (typeof e.minutesRead === "number" ? e.minutesRead : 0), 0);
  const pagesThisMonth = monthEntries.reduce((sum, e) => sum + (typeof e.pagesRead === "number" ? e.pagesRead : 0), 0);

  const currentStreak = computeCurrentStreak(entries);
  const longestStreak = computeLongestStreak(entries);

  return {
    totalMinutes,
    totalPages,
    totalBooks,
    booksThisMonth,
    minutesThisMonth,
    pagesThisMonth,
    currentStreak,
    longestStreak,
  };
}

export function computeBookBadgeProgress(totalBooks: number) {
  const thresholds = [1, 5, 10, 25, 50, 100];
  const next = thresholds.find((t) => totalBooks < t) ?? thresholds[thresholds.length - 1];
  const prev = thresholds.filter((t) => t <= totalBooks).slice(-1)[0] ?? 0;

  if (totalBooks >= thresholds[thresholds.length - 1]!) {
    return { nextTarget: thresholds[thresholds.length - 1], progressPct: 100 };
  }

  const range = next! - prev;
  const progress = Math.max(0, Math.min(1, range > 0 ? (totalBooks - prev) / range : 0));
  return { nextTarget: next, progressPct: Math.round(progress * 100) };
}
