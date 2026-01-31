/**
 * Copy Tags
 *
 * Note: This page previously showed hardcoded demo data. We intentionally ship it as
 * an explicit "not wired up yet" screen until Evergreen integration is complete.
 */

"use client";

import * as React from "react";
import { PageContainer, PageHeader, PageContent, EmptyState } from "@/components/shared";
import { Card, CardContent } from "@/components/ui/card";
import { Tag } from "lucide-react";

export default function CopyTagsPage() {
  return (
    <PageContainer>
      <PageHeader
        title="Copy Tags"
        subtitle="Digital bookplates and item labels (Evergreen-backed)"
        breadcrumbs={[{ label: "Admin", href: "/staff/admin" }, { label: "Copy Tags" }]}
      />
      <PageContent>
        <Card>
          <CardContent className="pt-10 pb-10">
            <EmptyState
              icon={Tag}
              title="Not connected yet"
              description="Copy Tags are not wired to Evergreen on this StackSOS install yet. (We removed demo data so production doesn’t look “fake”.)"
            />
          </CardContent>
        </Card>
      </PageContent>
    </PageContainer>
  );
}

