import Link from "next/link";
import { useTranslations } from "next-intl";

export const metadata = {
  title: "Kids Help",
};

export default function KidsHelpPage() {
  const t = useTranslations("kidsHelpPage");
  return (
    <div className="px-4 py-10">
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
          <h1 className="text-2xl font-bold text-foreground">{t("title")}</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Tips for searching, saving books, and tracking your reading.
          </p>
        </div>

        <div className="rounded-2xl border border-border bg-card p-6 shadow-sm space-y-3">
          <h2 className="text-lg font-semibold text-foreground">{t("howFindBooks")}</h2>
          <ul className="list-disc pl-5 text-sm text-muted-foreground space-y-2">
            <li>Use the search box to look for a topic, series, or author.</li>
            <li>Try Browse to explore popular categories.</li>
            <li>Open a book to see where it’s available and place a hold.</li>
          </ul>
        </div>

        <div className="rounded-2xl border border-border bg-card p-6 shadow-sm space-y-3">
          <h2 className="text-lg font-semibold text-foreground">{t("howTrackReading")}</h2>
          <p className="text-sm text-muted-foreground">
            Go to <Link className="text-primary underline" href="/opac/kids/account">My Stuff</Link>{" "}
            to see your reading log and challenges.
          </p>
        </div>

        <div className="flex items-center justify-between">
          <Link className="text-sm text-primary underline" href="/opac/kids">
            Back to Kids Home
          </Link>
          <Link className="text-sm text-primary underline" href="/opac/kids/parents">
            For Parents
          </Link>
        </div>
      </div>
    </div>
  );
}

