/**
 * Course Reserves Management
 *
 * Note: This page previously showed hardcoded demo data. We intentionally ship it as
 * an explicit "not wired up yet" screen until Evergreen integration is complete.
 */

"use client";

import * as React from "react";
import { PageContainer, PageHeader, PageContent, EmptyState } from "@/components/shared";
import { Card, CardContent } from "@/components/ui/card";
import { GraduationCap } from "lucide-react";

export default function CourseReservesPage() {
  return (
    <PageContainer>
      <PageHeader
        title="Course Reserves"
        subtitle="Manage reserve courses and items (Evergreen-backed)"
        breadcrumbs={[{ label: "Staff", href: "/staff" }, { label: "Course Reserves" }]}
      />
      <PageContent>
        <Card>
          <CardContent className="pt-10 pb-10">
            <EmptyState
              icon={GraduationCap}
              title="Not connected yet"
              description="Course Reserves is not wired to Evergreen on this StackSOS install yet. (We removed demo data so production doesn’t look “fake”.)"
            />
          </CardContent>
        </Card>
      </PageContent>
    </PageContainer>
  );
}

