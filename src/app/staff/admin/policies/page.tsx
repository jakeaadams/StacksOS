"use client";

import { useRouter } from "next/navigation";

import { featureFlags } from "@/lib/feature-flags";
import { PageContainer, PageHeader, PageContent, EmptyState } from "@/components/shared";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { BookOpen, BookMarked, DollarSign, ArrowRight } from "lucide-react";

export default function PolicyEditorsHubPage() {
  const router = useRouter();

  if (!featureFlags.policyEditors) {
    return (
      <PageContainer>
        <PageHeader
          title="Policy Editors"
          subtitle="Advanced policy tooling is hidden behind an experimental feature flag."
          breadcrumbs={[
            { label: "Administration", href: "/staff/admin" },
            { label: "Policy Editors" },
          ]}
        />
        <PageContent>
          <EmptyState
            title="Policy editors are disabled"
            description="Set NEXT_PUBLIC_STACKSOS_EXPERIMENTAL=1 to enable advanced policy editors."
          />
        </PageContent>
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <PageHeader
        title="Policy Editors"
        subtitle="Evergreen-backed policy configuration (advanced editors + write paths behind an experimental feature flag and admin permissions)."
        breadcrumbs={[
          { label: "Administration", href: "/staff/admin" },
          { label: "Policy Editors" },
        ]}
      />

      <PageContent className="space-y-6">
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          <Card
            className="rounded-2xl hover:shadow-md transition-shadow cursor-pointer group"
            onClick={() => router.push("/staff/admin/policies/circulation")}
          >
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between">
                <div className="h-12 w-12 rounded-xl flex items-center justify-center bg-emerald-500/10 text-emerald-600">
                  <BookOpen className="h-6 w-6" />
                </div>
                <Button variant="ghost" size="icon" className="opacity-0 group-hover:opacity-100 transition-opacity" aria-label="Go to Circulation policies">
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </div>
              <CardTitle className="text-lg mt-3">Circulation</CardTitle>
              <CardDescription className="text-sm">
                Circ matrix matchpoints + duration/fine rules.
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-0 text-xs text-muted-foreground">
              Evergreen: Circ Matrix Matchpoints, Circ Duration Rules, Recurring Fine Rules, Max Fine Rules.
            </CardContent>
          </Card>

          <Card
            className="rounded-2xl hover:shadow-md transition-shadow cursor-pointer group"
            onClick={() => router.push("/staff/admin/policies/holds")}
          >
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between">
                <div className="h-12 w-12 rounded-xl flex items-center justify-center bg-blue-500/10 text-blue-600">
                  <BookMarked className="h-6 w-6" />
                </div>
                <Button variant="ghost" size="icon" className="opacity-0 group-hover:opacity-100 transition-opacity" aria-label="Go to Holds policies">
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </div>
              <CardTitle className="text-lg mt-3">Holds</CardTitle>
              <CardDescription className="text-sm">
                Hold matrix matchpoints and routing controls.
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-0 text-xs text-muted-foreground">
              Evergreen: Hold Policies / Hold Matrix Matchpoints.
            </CardContent>
          </Card>

          <Card
            className="rounded-2xl hover:shadow-md transition-shadow cursor-pointer group"
            onClick={() => router.push("/staff/admin/settings/fines")}
          >
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between">
                <div className="h-12 w-12 rounded-xl flex items-center justify-center bg-rose-500/10 text-rose-600">
                  <DollarSign className="h-6 w-6" />
                </div>
                <Button variant="ghost" size="icon" className="opacity-0 group-hover:opacity-100 transition-opacity" aria-label="Go to Fines and Fees settings">
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </div>
              <CardTitle className="text-lg mt-3">Fines & Fees</CardTitle>
              <CardDescription className="text-sm">
                Fine rules and maximum fine caps (read-only overview).
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-0 text-xs text-muted-foreground">
              Evergreen: Recurring Fine Rules, Maximum Fine Rules.
            </CardContent>
          </Card>
        </div>
      </PageContent>
    </PageContainer>
  );
}
