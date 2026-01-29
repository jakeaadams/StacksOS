"use client";
import Link from "next/link";
import { PageContainer, PageHeader, PageContent, EmptyState } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { AlertTriangle } from "lucide-react";

export default function ClaimsPage() {
  return (
    <PageContainer>
      <PageHeader title="Acquisitions Claims" subtitle="Track and manage claims for unreceived items from vendors." breadcrumbs={[{ label: "Acquisitions", href: "/staff/acquisitions" }, { label: "Claims" }]} />
      <PageContent>
        <EmptyState icon={AlertTriangle} title="Claims Workflow" description="The claims workflow allows you to track unreceived items and communicate with vendors." action={{ label: "Back to Acquisitions", onClick: () => window.location.href = "/staff/acquisitions", icon: AlertTriangle }} />
        <div className="mt-4 text-center"><Button asChild variant="outline"><Link href="/staff/acquisitions">Back to Acquisitions</Link></Button></div>
      </PageContent>
    </PageContainer>
  );
}
