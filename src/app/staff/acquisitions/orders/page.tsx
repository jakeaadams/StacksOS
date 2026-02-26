"use client";

import { fetchWithAuth } from "@/lib/client-fetch";

import { useMemo, useState } from "react";
import {
  PageContainer,
  PageHeader,
  PageContent,
  DataTable,
  EmptyState,
  ErrorMessage,
  StatusBadge,
} from "@/components/shared";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ColumnDef } from "@tanstack/react-table";
import { toast } from "sonner";
import { useApi } from "@/hooks";
import { ShoppingCart } from "lucide-react";

interface PurchaseOrder {
  id: number;
  name: string;
  state: string;
  order_date?: string;
  lineitem_count?: number;
  provider?: number;
}

interface Vendor {
  id: number;
  name: string;
}

export default function PurchaseOrdersPage() {
  const { data, isLoading, error, refetch } = useApi<any>(
    "/api/evergreen/acquisitions/purchase-orders",
    { immediate: true }
  );
  const { data: vendorData } = useApi<any>("/api/evergreen/acquisitions/vendors", {
    immediate: true,
  });

  const [poName, setPoName] = useState("");
  const [vendorId, setVendorId] = useState("");
  const [isCreating, setIsCreating] = useState(false);

  const orders: PurchaseOrder[] = data?.orders || [];
  const vendors: Vendor[] = vendorData?.vendors || [];

  const columns = useMemo<ColumnDef<PurchaseOrder>[]>(
    () => [
      { accessorKey: "name", header: "PO" },
      {
        accessorKey: "state",
        header: "Status",
        cell: ({ row }) => {
          const state = String(row.original.state || "pending");
          const status =
            state === "received"
              ? "success"
              : state === "cancelled"
                ? "muted"
                : state === "on-order"
                  ? "info"
                  : "pending";
          return <StatusBadge label={state.replace(/_/g, " ")} status={status as any} />;
        },
      },
      {
        accessorKey: "order_date",
        header: "Order Date",
        cell: ({ row }) =>
          row.original.order_date ? new Date(row.original.order_date).toLocaleDateString() : "—",
      },
      {
        accessorKey: "lineitem_count",
        header: "Line Items",
        cell: ({ row }) => row.original.lineitem_count ?? 0,
      },
    ],
    []
  );

  const handleCreatePO = async () => {
    if (!vendorId) {
      toast.error("Select a vendor");
      return;
    }
    setIsCreating(true);
    try {
      const res = await fetchWithAuth("/api/evergreen/acquisitions/purchase-orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: parseInt(vendorId, 10),
          name: poName || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok || json.ok === false) {
        throw new Error(json.error || "Create failed");
      }
      toast.success("Purchase order created");
      setPoName("");
      await refetch();
    } catch (err: unknown) {
      toast.error((err instanceof Error ? err.message : String(err)) || "Create failed");
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <PageContainer>
      <PageHeader
        title="Purchase Orders"
        subtitle="Track acquisitions orders in Evergreen."
        breadcrumbs={[{ label: "Acquisitions", href: "/staff/acquisitions" }, { label: "Orders" }]}
      />
      <PageContent>
        {error && (
          <div className="mb-4">
            <ErrorMessage message={error.message} />
          </div>
        )}

        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Create Purchase Order</CardTitle>
            <CardDescription>
              {vendorData?.message || "Requires a vendor configured in Evergreen."}
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-[1fr,220px,140px]">
            <Input
              placeholder="PO name (optional)"
              value={poName}
              onChange={(e) => setPoName(e.target.value)}
            />
            <Select value={vendorId} onValueChange={setVendorId}>
              <SelectTrigger>
                <SelectValue placeholder="Select vendor" />
              </SelectTrigger>
              <SelectContent>
                {vendors.length > 0 ? (
                  vendors.map((vendor: any) => (
                    <SelectItem key={vendor.id} value={String(vendor.id)}>
                      {vendor.name}
                    </SelectItem>
                  ))
                ) : (
                  <SelectItem value="__none" disabled>
                    {vendorData?.message || "No vendors configured"}
                  </SelectItem>
                )}
              </SelectContent>
            </Select>
            <Button onClick={handleCreatePO} disabled={isCreating || vendors.length === 0}>
              {isCreating ? "Creating..." : "Create PO"}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShoppingCart className="h-4 w-4" /> Orders
            </CardTitle>
          </CardHeader>
          <CardContent>
            <DataTable
              columns={columns}
              data={orders}
              isLoading={isLoading}
              searchable={true}
              searchPlaceholder="Search orders..."
              paginated={true}
              emptyState={
                <EmptyState
                  title="No orders"
                  description={data?.message || "No purchase orders returned."}
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
