/**
 * Pull List Page - Display holds that need to be pulled from shelves
 */

"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RefreshCw, Printer, CheckCircle2, BookMarked } from "lucide-react";
import { format } from "date-fns";
import { escapeHtml, printHtml } from "@/lib/print";
import { fetchWithAuth } from "@/lib/client-fetch";
import { clientLogger } from "@/lib/client-logger";
import { useAuth } from "@/contexts/auth-context";
import {
  DataTable,
  DataTableColumnHeader,
  EmptyState,
  PageContainer,
  PageContent,
  PageHeader,
  StatusBadge,
  ErrorMessage,
} from "@/components/shared";
import type { ColumnDef } from "@tanstack/react-table";

interface PullListItem {
  holdId: number;
  copyId: number;
  title: string;
  author: string;
  callNumber: string;
  barcode: string;
  shelvingLocation: string;
  patronBarcode: string;
  pickupLib: number;
  pickupLibName: string;
  requestDate: string;
  status: "pending" | "in-transit" | "ready";
}

export default function PullListPage() {
  const router = useRouter();
  const { user, getOrgName } = useAuth();
  const defaultOrgId = user?.activeOrgId ?? user?.homeLibraryId ?? 1;

  const [pullList, setPullList] = useState<PullListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filterPickupLib, setFilterPickupLib] = useState<string>("all");
  const [selectedRows, setSelectedRows] = useState<Record<string, boolean>>({});

  const loadPullList = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetchWithAuth(
        "/api/evergreen/holds/pull-list?org_id=" + defaultOrgId + "&limit=200"
      );
      const data = await res.json();

      if (data.ok) {
        setPullList(data.pullList || []);
      } else {
        setError(data.error || "Failed to load pull list");
      }
    } catch (err) {
      setError("Failed to load pull list");
      clientLogger.error(err);
    } finally {
      setLoading(false);
    }
  }, [defaultOrgId]);

  useEffect(() => {
    void loadPullList();
  }, [loadPullList]);

  const handleMarkCaptured = useCallback(
    async (item: PullListItem) => {
      setLoading(true);
      try {
        const res = await fetchWithAuth("/api/evergreen/holds/pull-list", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "capture",
            barcode: item.barcode,
            holdId: item.holdId,
          }),
        });

        const data = await res.json();

        if (data.ok) {
          toast.success("Item " + item.barcode + " marked as captured");
          void loadPullList();
        } else {
          toast.error(data.error || "Failed to capture item");
        }
      } catch (err) {
        toast.error("Failed to capture item");
        clientLogger.error(err);
      } finally {
        setLoading(false);
      }
    },
    [loadPullList]
  );

  const handleMarkSelectedCaptured = async () => {
    const selectedItems = pullList.filter(
      (item) => selectedRows[String(item.holdId)]
    );
    if (selectedItems.length === 0) {
      toast.error("No items selected");
      return;
    }

    setLoading(true);
    let successCount = 0;
    let failCount = 0;

    for (const item of selectedItems) {
      try {
        const res = await fetchWithAuth("/api/evergreen/holds/pull-list", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "capture",
            barcode: item.barcode,
            holdId: item.holdId,
          }),
        });
        const data = await res.json();
        if (data.ok) {
          successCount++;
        } else {
          failCount++;
        }
      } catch {
        failCount++;
      }
    }

    if (successCount > 0) {
      toast.success(successCount + " item(s) marked as captured");
    }
    if (failCount > 0) {
      toast.error(failCount + " item(s) failed to capture");
    }

    setSelectedRows({});
    void loadPullList();
    setLoading(false);
  };

  const filteredPullList = useMemo(() => {
    if (filterPickupLib === "all") return pullList;
    return pullList.filter(
      (item) => String(item.pickupLib) === filterPickupLib
    );
  }, [pullList, filterPickupLib]);

  const printPullList = useCallback(() => {
    const now = new Date();
    const orgName = getOrgName?.(defaultOrgId) || "Library";

    const rows = filteredPullList
      .map(
        (item) =>
          "<tr>" +
          "<td>" +
          escapeHtml(item.callNumber) +
          "</td>" +
          "<td>" +
          escapeHtml(item.title) +
          (item.author
            ? '<div class="muted">' + escapeHtml(item.author) + "</div>"
            : "") +
          "</td>" +
          '<td class="mono">' +
          escapeHtml(item.barcode) +
          "</td>" +
          "<td>" +
          escapeHtml(item.shelvingLocation) +
          "</td>" +
          "<td>" +
          escapeHtml(item.pickupLibName) +
          "</td>" +
          "<td>" +
          (item.requestDate
            ? format(new Date(item.requestDate), "MM/dd/yyyy")
            : "") +
          "</td>" +
          "</tr>"
      )
      .join("");

    const html =
      "<h1>Holds Pull List</h1>" +
      '<div class="meta">' +
      '<span><span class="k">Location:</span> <span class="v">' +
      escapeHtml(orgName) +
      "</span></span>" +
      '<span><span class="k">Date:</span> <span class="v">' +
      format(now, "MM/dd/yyyy h:mm a") +
      "</span></span>" +
      '<span><span class="k">Items:</span> <span class="v">' +
      filteredPullList.length +
      "</span></span>" +
      "</div>" +
      '<table style="margin-top: 16px;">' +
      "<thead>" +
      "<tr>" +
      "<th scope=\"col\">Call Number</th>" +
      "<th scope=\"col\">Title / Author</th>" +
      "<th scope=\"col\">Barcode</th>" +
      "<th scope=\"col\">Location</th>" +
      "<th scope=\"col\">Pickup</th>" +
      "<th scope=\"col\">Requested</th>" +
      "</tr>" +
      "</thead>" +
      "<tbody>" +
      rows +
      "</tbody>" +
      "</table>";

    printHtml(html, { title: "Pull List", tone: "report" });
  }, [filteredPullList, getOrgName, defaultOrgId]);

  const columns: ColumnDef<PullListItem>[] = useMemo(
    () => [
      {
        id: "select",
        header: ({ table }) => (
          <input
            type="checkbox"
            checked={table.getIsAllPageRowsSelected()}
            onChange={(e) => table.toggleAllPageRowsSelected(e.target.checked)}
            aria-label="Select all"
            className="h-4 w-4"
          />
        ),
        cell: ({ row }) => (
          <input
            type="checkbox"
            checked={row.getIsSelected()}
            onChange={(e) => row.toggleSelected(e.target.checked)}
            aria-label="Select row"
            className="h-4 w-4"
          />
        ),
        enableSorting: false,
        enableHiding: false,
      },
      {
        accessorKey: "title",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Title" />
        ),
        cell: ({ row }) => (
          <div>
            <div className="font-medium">{row.original.title}</div>
            {row.original.author && (
              <div className="text-sm text-muted-foreground">
                {row.original.author}
              </div>
            )}
          </div>
        ),
      },
      {
        accessorKey: "callNumber",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Call Number" />
        ),
      },
      {
        accessorKey: "barcode",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Barcode" />
        ),
        cell: ({ row }) => (
          <code className="text-sm">{row.original.barcode}</code>
        ),
      },
      {
        accessorKey: "shelvingLocation",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Shelving Location" />
        ),
      },
      {
        accessorKey: "patronBarcode",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Patron" />
        ),
        cell: ({ row }) => {
          const barcode = row.original.patronBarcode || "";
          if (barcode.length > 4) {
            return (
              <span className="font-mono text-sm">
                {"****" + barcode.slice(-4)}
              </span>
            );
          }
          return <span className="font-mono text-sm">{barcode}</span>;
        },
      },
      {
        accessorKey: "pickupLibName",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Pickup Location" />
        ),
      },
      {
        accessorKey: "requestDate",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Request Date" />
        ),
        cell: ({ row }) =>
          row.original.requestDate
            ? format(new Date(row.original.requestDate), "MM/dd/yyyy")
            : "-",
      },
      {
        accessorKey: "status",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Status" />
        ),
        cell: ({ row }) => {
          const status = row.original.status || "pending";
          return (
            <StatusBadge
              status={
                status === "ready"
                  ? "success"
                  : status === "in-transit"
                    ? "warning"
                    : "info"
              }
              label={
                status === "ready"
                  ? "Ready"
                  : status === "in-transit"
                    ? "In Transit"
                    : "Pending"
              }
            />
          );
        },
      },
      {
        id: "actions",
        header: "Actions",
        cell: ({ row }) => (
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleMarkCaptured(row.original)}
            disabled={loading}
          >
            <CheckCircle2 className="h-4 w-4 mr-1" />
            Capture
          </Button>
        ),
      },
    ],
    [loading, handleMarkCaptured]
  );

  const uniquePickupLibs = useMemo(() => {
    const libs = new Map<number, string>();
    pullList.forEach((item) => {
      if (item.pickupLib && item.pickupLibName) {
        libs.set(item.pickupLib, item.pickupLibName);
      }
    });
    return Array.from(libs.entries()).map(([id, name]) => ({ id, name }));
  }, [pullList]);

  return (
    <PageContainer>
      <PageHeader
        title="Holds Pull List"
        breadcrumbs={[
          { label: "Circulation", href: "/staff/circulation" },
          { label: "Pull List" },
        ]}
        actions={[
          {
            label: "Refresh",
            icon: RefreshCw,
            onClick: loadPullList,
            variant: "outline",
          },
          {
            label: "Print List",
            icon: Printer,
            onClick: printPullList,
            variant: "outline",
          },
        ]}
      />

      <PageContent>
        {error && <ErrorMessage message={error} className="mb-4" />}

        <div className="flex items-center gap-4 mb-4">
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">
              Filter by Pickup Location:
            </span>
            <Select value={filterPickupLib} onValueChange={setFilterPickupLib}>
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="All Locations" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Locations</SelectItem>
                {uniquePickupLibs.map((lib) => (
                  <SelectItem key={lib.id} value={String(lib.id)}>
                    {lib.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {Object.keys(selectedRows).length > 0 && (
            <Button
              variant="default"
              size="sm"
              onClick={handleMarkSelectedCaptured}
              disabled={loading}
            >
              <CheckCircle2 className="h-4 w-4 mr-1" />
              Capture Selected (
              {Object.keys(selectedRows).filter((k) => selectedRows[k]).length})
            </Button>
          )}

          <div className="ml-auto text-sm text-muted-foreground">
            {filteredPullList.length} item(s) to pull
          </div>
        </div>

        {filteredPullList.length === 0 && !loading ? (
          <EmptyState
            icon={BookMarked}
            title="No items to pull"
            description="There are no pending holds requiring pulls right now."
            action={{
              label: "Open holds shelf",
              onClick: () => router.push("/staff/circulation/holds-shelf"),
            }}
            secondaryAction={{
              label: "Hold policies",
              onClick: () => router.push("/staff/admin/policies/holds"),
            }}
          >
            <Button variant="ghost" size="sm" onClick={() => router.push("/staff/help#demo-data")}>
              Seed demo data
            </Button>
          </EmptyState>
        ) : (
          <DataTable
            columns={columns}
            data={filteredPullList}
            isLoading={loading}
            
          />
        )}
      </PageContent>
    </PageContainer>
  );
}
