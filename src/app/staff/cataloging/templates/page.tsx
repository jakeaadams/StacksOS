"use client";

import Link from "next/link";
import { PageContainer, PageHeader, PageContent } from "@/components/shared";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FileText, Package, ArrowRight, Layers } from "lucide-react";

interface TemplateCard {
  title: string;
  description: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  stats?: string;
}

const templateCards: TemplateCard[] = [
  {
    title: "Copy Templates",
    description:
      "Create and manage templates for item copies. Apply default values for status, location, circulation modifiers, and more when adding new copies.",
    href: "/staff/cataloging/templates/copy",
    icon: Package,
    stats: "Quick copy attribute assignment",
  },
  {
    title: "Holdings Templates",
    description:
      "Manage templates for call number and holdings information. Define default prefixes, suffixes, and classification schemes.",
    href: "/staff/cataloging/templates/holdings",
    icon: Layers,
    stats: "Streamline call number entry",
  },
];

export default function TemplatesHubPage() {
  return (
    <PageContainer>
      <PageHeader
        title="Cataloging Templates"
        subtitle="Manage templates for streamlined cataloging workflows."
        breadcrumbs={[{ label: "Cataloging", href: "/staff/cataloging" }, { label: "Templates" }]}
      />

      <PageContent className="space-y-6">
        <Card className="rounded-2xl">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full flex items-center justify-center bg-blue-500/10 text-blue-600">
                <FileText className="h-5 w-5" />
              </div>
              <div>
                <CardTitle className="text-lg">Template Management</CardTitle>
                <CardDescription>
                  Templates help standardize cataloging by providing reusable sets of default
                  values.
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            <p>
              Use templates to speed up cataloging workflows. Copy templates define default item
              attributes, while holdings templates provide standard call number formats and
              prefixes.
            </p>
          </CardContent>
        </Card>

        <div className="grid gap-6 md:grid-cols-2">
          {templateCards.map((card) => (
            <Card key={card.href} className="rounded-2xl hover:shadow-md transition-shadow">
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full flex items-center justify-center bg-indigo-500/10 text-indigo-600">
                    <card.icon className="h-5 w-5" />
                  </div>
                  <div className="flex-1">
                    <CardTitle className="text-base">{card.title}</CardTitle>
                    {card.stats && (
                      <p className="text-xs text-muted-foreground mt-0.5">{card.stats}</p>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground">{card.description}</p>
                <Button asChild variant="outline" className="w-full">
                  <Link href={card.href}>
                    Manage Templates
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Link>
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>

        <Card className="rounded-2xl">
          <CardHeader>
            <CardTitle className="text-base">About Templates</CardTitle>
            <CardDescription>Understanding template types in Evergreen</CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-lg border p-4">
                <h4 className="font-medium text-foreground mb-2 flex items-center gap-2">
                  <Package className="h-4 w-4" />
                  Copy Templates
                </h4>
                <p className="text-xs">
                  Define default values for item copies including status, shelving location,
                  circulation modifier, holdability, and price. Apply these templates when creating
                  new copies to ensure consistency.
                </p>
              </div>
              <div className="rounded-lg border p-4">
                <h4 className="font-medium text-foreground mb-2 flex items-center gap-2">
                  <Layers className="h-4 w-4" />
                  Holdings Templates
                </h4>
                <p className="text-xs">
                  Set up standard call number formats with prefixes, suffixes, and classification
                  schemes. Holdings templates help maintain consistent call number practices across
                  your library system.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </PageContent>
    </PageContainer>
  );
}
