"use client";
import { PageContainer, PageHeader, PageContent } from "@/components/shared";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Clock, Calendar } from "lucide-react";

export default function LibraryHoursPage() {
  return (
    <PageContainer>
      <PageHeader title="Library Hours Settings" subtitle="Configure operating hours for each branch." breadcrumbs={[{ label: "Admin", href: "/staff/admin" }, { label: "Settings" }, { label: "Hours" }]} />
      <PageContent className="space-y-6">
        <Card className="rounded-2xl"><CardHeader><CardTitle className="text-base flex items-center gap-2"><Clock className="h-5 w-5" />Operating Hours</CardTitle></CardHeader><CardContent className="text-sm text-muted-foreground">Library hours affect due date calculations and hold shelf expiration. Configure hours in Evergreen: Admin &gt; Local Administration &gt; Hours of Operation.</CardContent></Card>
        <Card className="rounded-2xl"><CardHeader><CardTitle className="text-base flex items-center gap-2"><Calendar className="h-5 w-5" />Closed Dates</CardTitle></CardHeader><CardContent className="text-sm text-muted-foreground">Holiday closures and special closed dates. Configure in Evergreen: Admin &gt; Local Administration &gt; Closed Dates.</CardContent></Card>
      </PageContent>
    </PageContainer>
  );
}
