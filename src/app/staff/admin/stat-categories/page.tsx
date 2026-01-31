/**
 * Statistical Categories
 *
 * Note: This page previously showed hardcoded demo data. We intentionally ship it as
 * an explicit "not wired up yet" screen until Evergreen integration is complete.
 */

"use client";

import * as React from "react";
import { PageContainer, PageHeader, PageContent, EmptyState } from "@/components/shared";
import { Card, CardContent } from "@/components/ui/card";
import { BarChart3 } from "lucide-react";

export default function StatCategoriesPage() {
  return (
    <PageContainer>
      <PageHeader
        title="Statistical Categories"
        subtitle="Copy + patron stat cats (Evergreen-backed)"
        breadcrumbs={[{ label: "Admin", href: "/staff/admin" }, { label: "Statistical Categories" }]}
      />
      <PageContent>
        <Card>
          <CardContent className="pt-10 pb-10">
            <EmptyState
              icon={BarChart3}
              title="Not connected yet"
              description="Statistical Categories are not wired to Evergreen on this StackSOS install yet. (We removed demo data so production reflects reality.)"
            />
          </CardContent>
        </Card>
      </PageContent>
    </PageContainer>
  );
}

