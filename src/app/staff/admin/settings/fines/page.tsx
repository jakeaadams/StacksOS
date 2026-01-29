"use client";
import { PageContainer, PageHeader, PageContent } from "@/components/shared";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DollarSign, Clock } from "lucide-react";

export default function FineConfigurationPage() {
  return (
    <PageContainer>
      <PageHeader title="Fine/Fee Configuration" subtitle="Configure fine rules and maximum fines." breadcrumbs={[{ label: "Admin", href: "/staff/admin" }, { label: "Settings" }, { label: "Fines" }]} />
      <PageContent className="space-y-6">
        <Card className="rounded-2xl"><CardHeader><CardTitle className="text-base flex items-center gap-2"><DollarSign className="h-5 w-5" />Recurring Fine Rules</CardTitle></CardHeader><CardContent className="text-sm text-muted-foreground">Fine rules define charges for overdue items. Configure in Evergreen: Admin &gt; Server Administration &gt; Circ Rules &gt; Recurring Fine Rules. Common settings: \$0.10/day, \$0.25/day, \$1.00/day.</CardContent></Card>
        <Card className="rounded-2xl"><CardHeader><CardTitle className="text-base flex items-center gap-2"><Clock className="h-5 w-5" />Maximum Fine Rules</CardTitle></CardHeader><CardContent className="text-sm text-muted-foreground">Maximum fine rules cap total fines per item. Configure caps as fixed amounts (\$5.00, \$10.00) or percentage of item price (100%, 200%).</CardContent></Card>
      </PageContent>
    </PageContainer>
  );
}
