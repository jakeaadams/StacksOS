import Link from "next/link";
import { Button } from "@/components/ui/button";
import { FileQuestion, Home, Search, LayoutDashboard } from "lucide-react";
import { useTranslations } from "next-intl";

export default function NotFound() {
  const t = useTranslations("notFound");
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-background to-muted/30">
      <div className="text-center space-y-8 p-8 max-w-lg">
        <div className="flex justify-center">
          <div className="rounded-2xl bg-muted p-5 shadow-sm">
            <FileQuestion className="h-10 w-10 text-muted-foreground" />
          </div>
        </div>

        <div className="space-y-3">
          <h1 className="text-3xl font-bold tracking-tight">{t("title")}</h1>
          <p className="text-muted-foreground leading-relaxed">{t("message")}</p>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Button asChild size="lg">
            <Link href="/opac">
              <Home className="mr-2 h-4 w-4" />
              {t("backHome")}
            </Link>
          </Button>
          <Button variant="outline" size="lg" asChild>
            <Link href="/opac/search">
              <Search className="mr-2 h-4 w-4" />
              {t("searchCatalog")}
            </Link>
          </Button>
        </div>

        <div className="pt-2 border-t border-border">
          <p className="text-xs text-muted-foreground mb-3">{t("helpfulLinks")}</p>
          <div className="flex flex-wrap gap-3 justify-center text-sm">
            <Link href="/opac/locations" className="text-primary hover:underline">
              {t("locations")}
            </Link>
            <span className="text-muted-foreground/40">·</span>
            <Link href="/opac/account" className="text-primary hover:underline">
              {t("myAccount")}
            </Link>
            <span className="text-muted-foreground/40">·</span>
            <Link href="/staff" className="text-primary hover:underline flex items-center gap-1">
              <LayoutDashboard className="h-3 w-3" />
              {t("staffPortal")}
            </Link>
          </div>
        </div>

        <p className="text-xs text-muted-foreground/60">Error 404</p>
      </div>
    </div>
  );
}
