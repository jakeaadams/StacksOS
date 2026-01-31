"use client";

import {
  PageContainer,
  PageHeader,
  PageContent,
  EmptyState,
} from "@/components/shared";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Plus } from "lucide-react";
import { toast } from "sonner";

export default function ScheduledReportsPage() {
  return (
    <PageContainer>
      <PageHeader
        title="Scheduled Reports"
        subtitle="Automated report generation and delivery."
        breadcrumbs={[
          { label: "Reports", href: "/staff/reports" },
          { label: "Scheduled" },
        ]}
        actions={[
          {
            label: "Add Schedule",
            onClick: () => toast.info("Scheduling requires Evergreen reporter configuration"),
            icon: Plus,
          },
        ]}
      />

      <PageContent className="space-y-6">
        <Card className="rounded-2xl">
          <CardHeader>
            <CardTitle className="text-base">Scheduled Reports</CardTitle>
            <CardDescription>Automated delivery is not configured yet.</CardDescription>
          </CardHeader>
          <CardContent>
            <EmptyState
              title="Scheduled reports not enabled"
              description="This screen previously showed placeholder demo data. Next step is wiring Evergreen Reporter templates + a scheduler (systemd timer / cron / job queue)."
            />
          </CardContent>
        </Card>

        <Card className="rounded-2xl">
          <CardHeader>
            <CardTitle className="text-base">About Scheduled Reports</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            <p>
              Scheduled reports run automatically at specified intervals. Results can be emailed to
              staff members or stored for later download. Full scheduling functionality requires
              configuration in the Evergreen reporting system.
            </p>
          </CardContent>
        </Card>
      </PageContent>
    </PageContainer>
  );
}
