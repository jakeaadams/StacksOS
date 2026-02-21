import Link from "next/link";
import { ParentsControls } from "@/components/opac/kids/ParentsControls";
import { useTranslations } from "next-intl";

export const metadata = {
  title: "For Parents",
};

export default function KidsParentsPage() {
  const t = useTranslations("kidsParentsPage");
  return (
    <div className="px-4 py-10">
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
          <h1 className="text-2xl font-bold text-foreground">{t("title")}</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            A few notes about safety, privacy, and how to help kids get the most out of the catalog.
          </p>
        </div>

        <ParentsControls />

        <div className="rounded-2xl border border-border bg-card p-6 shadow-sm space-y-3">
          <h2 className="text-lg font-semibold text-foreground">{t("privacy")}</h2>
          <p className="text-sm text-muted-foreground">
            Library accounts contain personal information. Encourage kids not to share their card
            number or PIN. If reading history is available, it should be opt-in and easy to clear.
          </p>
          <p className="text-sm text-muted-foreground">
            See <Link className="text-primary underline" href="/opac/privacy">Privacy Policy</Link> for more.
          </p>
        </div>

        <div className="rounded-2xl border border-border bg-card p-6 shadow-sm space-y-3">
          <h2 className="text-lg font-semibold text-foreground">{t("readingChallenges")}</h2>
          <p className="text-sm text-muted-foreground">
            Challenges are meant to motivate reading. Use the <Link className="text-primary underline" href="/opac/kids/challenges">Challenges</Link>{" "}
            page to see goals and progress.
          </p>
        </div>

        <div className="flex items-center justify-between">
          <Link className="text-sm text-primary underline" href="/opac/kids">
            Back to Kids Home
          </Link>
          <Link className="text-sm text-primary underline" href="/opac/help">
            OPAC Help
          </Link>
        </div>
      </div>
    </div>
  );
}
