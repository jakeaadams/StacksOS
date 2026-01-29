"use client";
import { PageContainer, PageHeader, PageContent } from "@/components/shared";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BookMarked, Clock, MapPin } from "lucide-react";

export default function HoldPolicyEditorPage() {
  return (
    <PageContainer>
      <PageHeader title="Hold Policy Settings" subtitle="Configure hold matrix matchpoints." breadcrumbs={[{ label: "Admin", href: "/staff/admin" }, { label: "Holds" }]} />
      <PageContent className="space-y-6">
        <Card className="rounded-2xl"><CardHeader><CardTitle className="text-base flex items-center gap-2"><BookMarked className="h-5 w-5" />Hold Matrix Matchpoints</CardTitle></CardHeader><CardContent className="text-sm text-muted-foreground">Hold policies define which patrons can place holds on which items. Configure matchpoints in Evergreen staff client under Admin &gt; Server Administration &gt; Hold Policies.</CardContent></Card>
        <div className="grid gap-6 md:grid-cols-2">
          <Card className="rounded-2xl"><CardHeader><CardTitle className="text-base flex items-center gap-2"><Clock className="h-5 w-5" />Hold Expiration</CardTitle></CardHeader><CardContent className="text-sm text-muted-foreground">Configure when holds expire: 6 months, 1 year, or unlimited.</CardContent></Card>
          <Card className="rounded-2xl"><CardHeader><CardTitle className="text-base flex items-center gap-2"><MapPin className="h-5 w-5" />Transit Ranges</CardTitle></CardHeader><CardContent className="text-sm text-muted-foreground">Control where items can be routed: branch, system, or consortium-wide.</CardContent></Card>
        </div>
      </PageContent>
    </PageContainer>
  );
}
