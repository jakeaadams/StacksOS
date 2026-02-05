"use client";

import { useMemo } from "react";
import {
  PageContainer,
  PageHeader,
  PageContent,
  DataTable,
  EmptyState,
} from "@/components/shared";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ColumnDef } from "@tanstack/react-table";
import { useApi } from "@/hooks";

interface FundRow {
  id: number;
  name: string;
  code: string;
  year: number;
  currency: string;
  balance_stop_percent?: number;
  balance_warning_percent?: number;
}

export default function SelectionPage() {
  const { data, isLoading } = useApi<any>("/api/evergreen/acquisitions/funds", { immediate: true });
  const funds: FundRow[] = data?.funds || [];

  const columns = useMemo<ColumnDef<FundRow>[]>(
    () => [
      { accessorKey: "name", header: "Fund" },
      { accessorKey: "code", header: "Code" },
      { accessorKey: "year", header: "Year" },
      { accessorKey: "currency", header: "Currency" },
      {
        accessorKey: "balance_warning_percent",
        header: "Warn %",
        cell: ({ row }) => row.original.balance_warning_percent ?? "—",
      },
      {
        accessorKey: "balance_stop_percent",
        header: "Stop %",
        cell: ({ row }) => row.original.balance_stop_percent ?? "—",
      },
    ],
    []
  );

  return (
    <PageContainer>
      <PageHeader
        title="Selection Funds"
        subtitle="Funds configured in Evergreen acquisitions."
        breadcrumbs={[{ label: "Acquisitions", href: "/staff/acquisitions" }, { label: "Selection" }]}
      />
      <PageContent>
        <Card>
          <CardHeader>
            <CardTitle>Funds</CardTitle>
            <CardDescription>Use these funds when building selection lists.</CardDescription>
          </CardHeader>
          <CardContent>
            <DataTable
              columns={columns}
              data={funds}
              isLoading={isLoading}
              searchable
              searchPlaceholder="Search funds..."
              paginated={true}
              emptyState={
                <EmptyState
                  title="No funds"
                  description={data?.message || "No acquisition funds returned."}
                  action={{
                    label: "Evergreen setup checklist",
                    onClick: () => window.location.assign("/staff/help#evergreen-setup"),
                  }}
                />
              }
            />
          </CardContent>
        </Card>
      </PageContent>
    </PageContainer>
  );
}
