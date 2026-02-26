import Link from "next/link";
import { AccessibilityControls } from "@/components/opac/accessibility-controls";
import { useTranslations } from "next-intl";

export const metadata = {
  title: "Accessibility",
};

export default function AccessibilityPage() {
  const _t = useTranslations("accessibilityPage");
  return (
    <div className="min-h-screen bg-muted/30">
      <section className="bg-card border-b border-border py-12">
        <div className="max-w-4xl mx-auto px-4">
          <h1 className="text-3xl font-bold text-foreground">Accessibility</h1>
          <p className="mt-3 text-muted-foreground">
            We want everyone to be able to use the catalog comfortably. If you run into an
            accessibility barrier, please contact your library.
          </p>
        </div>
      </section>

      <div className="max-w-4xl mx-auto px-4 py-12 space-y-8">
        <AccessibilityControls />

        <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-foreground">Keyboard navigation</h2>
          <ul className="mt-3 list-disc pl-5 text-sm text-muted-foreground space-y-2">
            <li>Use the “Skip to main content” link at the top of OPAC pages.</li>
            <li>Use Tab / Shift+Tab to move between controls and links.</li>
            <li>Use Enter/Space to activate buttons and menu items.</li>
          </ul>
        </div>

        <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-foreground">Screen readers</h2>
          <p className="mt-3 text-sm text-muted-foreground">
            Pages are structured with landmarks and headings. If something is not announced
            correctly, please report the page URL and what you expected to hear.
          </p>
        </div>

        <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-foreground">Need help?</h2>
          <p className="mt-3 text-sm text-muted-foreground">
            See{" "}
            <Link className="text-primary underline" href="/opac/help">
              Help
            </Link>{" "}
            for common questions, or contact your library for assistance.
          </p>
        </div>
      </div>
    </div>
  );
}
