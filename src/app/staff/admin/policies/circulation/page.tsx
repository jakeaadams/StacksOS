"use client";
import { PageContainer, PageHeader, PageContent } from "@/components/shared";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BookOpen, Clock, DollarSign } from "lucide-react";

export default function CirculationPolicyEditorPage() {
  return (
    <PageContainer>
      <PageHeader title="Circulation Policy Editor" subtitle="Configure circulation matrix matchpoints." breadcrumbs={[{ label: "Admin", href: "/staff/admin" }, { label: "Circulation" }]} />
      <PageContent className="space-y-6">
        <Card className="rounded-2xl"><CardHeader><CardTitle className="text-base flex items-center gap-2"><BookOpen className="h-5 w-5" />Circulation Matrix</CardTitle></CardHeader><CardContent className="text-sm text-muted-foreground">Circulation policies define loan rules for patron/item combinations. Configure matchpoints in Evergreen staff client under Admin &gt; Server Administration &gt; Circ Matrix Matchpoints.</CardContent></Card>
        <div className="grid gap-6 md:grid-cols-2">
          <Card className="rounded-2xl"><CardHeader><CardTitle className="text-base flex items-center gap-2"><Clock className="h-5 w-5" />Duration Rules</CardTitle></CardHeader><CardContent className="text-sm text-muted-foreground">Loan duration configurations: 7 days, 14 days, 21 days, etc.</CardContent></Card>
          <Card className="rounded-2xl"><CardHeader><CardTitle className="text-base flex items-center gap-2"><DollarSign className="h-5 w-5" />Fine Rules</CardTitle></CardHeader><CardContent className="text-sm text-muted-foreground">Recurring fine amounts and intervals for overdue items.</CardContent></Card>
        </div>
      </PageContent>
    </PageContainer>
  );
}
