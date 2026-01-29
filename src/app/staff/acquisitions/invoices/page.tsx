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

interface InvoiceRow {
  id: number;
  vendor_invoice_id?: string;
  provider?: number;
  recv_date?: string;
  close_date?: string;
  closed_by?: number;
}

export default function InvoicesPage() {
  const { data, isLoading } = useApi<any>(
    "/api/evergreen/acquisitions?action=invoices",
    { immediate: true }
  );

  const invoices: InvoiceRow[] = data?.invoices || [];

  const columns = useMemo<ColumnDef<InvoiceRow>[]>(
    () => [
      { accessorKey: "vendor_invoice_id", header: "Invoice" },
      {
        accessorKey: "provider",
        header: "Provider",
        cell: ({ row }) => row.original.provider ?? "—",
      },
      {
        accessorKey: "recv_date",
        header: "Received",
        cell: ({ row }) =>
          row.original.recv_date ? new Date(row.original.recv_date).toLocaleDateString() : "—",
      },
      {
        accessorKey: "close_date",
        header: "Closed",
        cell: ({ row }) =>
          row.original.close_date ? new Date(row.original.close_date).toLocaleDateString() : "—",
      },
    ],
    []
  );

  return (
    <PageContainer>
      <PageHeader
        title="Invoices"
        subtitle="Evergreen acquisition invoices."
        breadcrumbs={[{ label: "Acquisitions", href: "/staff/acquisitions" }, { label: "Invoices" }]}
      />
      <PageContent>
        <Card>
          <CardHeader>
            <CardTitle>Invoices</CardTitle>
            <CardDescription>Invoices returned from Evergreen acquisitions.</CardDescription>
          </CardHeader>
          <CardContent>
            <DataTable
              columns={columns}
              data={invoices}
              isLoading={isLoading}
              searchable
              searchPlaceholder="Search invoices..."
              paginated={true}
              emptyState={
                <EmptyState
                  title="No invoices"
                  description={data?.message || "No invoices returned."}
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
