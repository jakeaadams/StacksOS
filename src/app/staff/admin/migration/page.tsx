"use client";

import Link from "next/link";
import { PageContainer, PageHeader, PageContent } from "@/components/shared";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  FileText,
  Users,
  ArrowRight,
  Upload,
  BookOpen,
  Settings,
  CheckCircle2,
  Globe,
} from "lucide-react";

const MIGRATION_FLOWS = [
  {
    title: "MARC / Bib Record Import",
    description:
      "Import bibliographic records from MARC21 binary (.mrc) or MARCXML files. Includes duplicate detection, diff preview, and batch processing.",
    icon: BookOpen,
    href: "/staff/cataloging/import",
    status: "available" as const,
    badge: "Ready",
  },
  {
    title: "CSV Patron Import",
    description:
      "Batch import patron records from CSV files. Map columns to Evergreen fields, validate barcodes, and preview before importing.",
    icon: Users,
    href: "/staff/admin/migration/patrons",
    status: "available" as const,
    badge: "Ready",
  },
  {
    title: "Z39.50 Catalog Search",
    description:
      "Search external library catalogs via Z39.50 and import records directly into your Evergreen instance.",
    icon: Globe,
    href: "/staff/cataloging/z3950",
    status: "available" as const,
    badge: "Ready",
  },
  {
    title: "Circulation Rule Mapping",
    description:
      "Map circulation policies from your previous ILS to Evergreen matchpoints, duration rules, and fine rules.",
    icon: Settings,
    href: "/staff/admin/policies",
    status: "available" as const,
    badge: "Via Policy Editor",
  },
];

const MIGRATION_STEPS = [
  {
    step: 1,
    title: "Import Bibliographic Records",
    description: "Load your MARC records first — they form the foundation for items and holdings.",
  },
  {
    step: 2,
    title: "Import Patron Records",
    description:
      "Bring over patron data from your old system via CSV. Map fields, validate, and import.",
  },
  {
    step: 3,
    title: "Configure Circulation Rules",
    description: "Set up checkout limits, fine rules, and hold policies using the Policy Editor.",
  },
  {
    step: 4,
    title: "Verify & Go Live",
    description:
      "Run the Go-Live checklist to verify data integrity, test workflows, and enable patron access.",
  },
];

export default function MigrationHubPage() {
  return (
    <PageContainer>
      <PageHeader
        title="Migration Center"
        subtitle="Import data from your previous ILS and configure StacksOS for your library."
        breadcrumbs={[{ label: "Administration", href: "/staff/admin" }, { label: "Migration" }]}
      />

      <PageContent className="space-y-6">
        {/* Migration Steps Overview */}
        <Card className="rounded-2xl border-border/70 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Upload className="h-4 w-4" /> Migration Workflow
            </CardTitle>
            <CardDescription>
              Follow these steps to migrate from your previous system.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {MIGRATION_STEPS.map((s) => (
                <div
                  key={s.step}
                  className="relative rounded-xl border border-border/70 bg-muted/20 p-4"
                >
                  <div className="flex items-center gap-3 mb-2">
                    <div className="h-8 w-8 rounded-full bg-[hsl(var(--brand-1))]/10 text-[hsl(var(--brand-1))] flex items-center justify-center text-sm font-bold">
                      {s.step}
                    </div>
                    <span className="text-sm font-medium">{s.title}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">{s.description}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Migration Tools */}
        <div className="grid gap-4 sm:grid-cols-2">
          {MIGRATION_FLOWS.map((flow) => (
            <Card
              key={flow.title}
              className="rounded-2xl border-border/70 shadow-sm hover:shadow-md transition-shadow"
            >
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-xl bg-[hsl(var(--brand-1))]/10 flex items-center justify-center">
                      <flow.icon className="h-5 w-5 text-[hsl(var(--brand-1))]" />
                    </div>
                    <div>
                      <CardTitle className="text-sm">{flow.title}</CardTitle>
                    </div>
                  </div>
                  <Badge
                    variant="secondary"
                    className="rounded-full text-[10px] flex items-center gap-1"
                  >
                    <CheckCircle2 className="h-3 w-3" />
                    {flow.badge}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-xs text-muted-foreground">{flow.description}</p>
                <Button asChild variant="outline" size="sm" className="w-full justify-between">
                  <Link href={flow.href}>
                    Open Tool
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Quick Links */}
        <Card className="rounded-2xl border-border/70 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Related Tools</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 sm:grid-cols-3">
              <Button asChild variant="outline" className="justify-start gap-2">
                <Link href="/staff/admin/go-live">
                  <CheckCircle2 className="h-4 w-4" /> Go-Live Checklist
                </Link>
              </Button>
              <Button asChild variant="outline" className="justify-start gap-2">
                <Link href="/staff/admin/onboarding">
                  <FileText className="h-4 w-4" /> Onboarding Playbook
                </Link>
              </Button>
              <Button asChild variant="outline" className="justify-start gap-2">
                <Link href="/staff/catalog/batch">
                  <Settings className="h-4 w-4" /> MARC Batch Edit
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </PageContent>
    </PageContainer>
  );
}
