/**
 * Holds Shelf Page - Display captured holds waiting on holds shelf
 */

"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { RefreshCw, Printer, Trash2, Inbox, AlertTriangle } from "lucide-react";
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

interface ShelfHold {
  id: number;
  holdId: number;
  title: string;
  author: string;
  patronName: string;
  patronBarcode: string;
  pickupDate: string;
  expireDate: string;
  shelfLocation: string;
  barcode: string;
  callNumber: string;
  daysOnShelf: number;
  isExpired: boolean;
  isExpiringSoon: boolean;
}

export default function HoldsShelfPage() {
  const router = useRouter();
  const { user, getOrgName } = useAuth();
  const defaultOrgId = user?.activeOrgId ?? user?.homeLibraryId ?? 1;

  const [shelfHolds, setShelfHolds] = useState<ShelfHold[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [clearDialogOpen, setClearDialogOpen] = useState(false);
  const [clearing, setClearing] = useState(false);

  const loadShelfHolds = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetchWithAuth(
        "/api/evergreen/holds/shelf?org_id=" + defaultOrgId
      );
      const data = await res.json();

      if (data.ok) {
        setShelfHolds(data.shelfHolds || []);
      } else {
        setError(data.error || "Failed to load holds shelf");
      }
    } catch (err) {
      setError("Failed to load holds shelf");
      clientLogger.error(err);
    } finally {
      setLoading(false);
    }
  }, [defaultOrgId]);

  useEffect(() => {
    void loadShelfHolds();
  }, [loadShelfHolds]);

  const expiredCount = useMemo(
    () => shelfHolds.filter((h) => h.isExpired).length,
    [shelfHolds]
  );

  const expiringSoonCount = useMemo(
    () => shelfHolds.filter((h) => h.isExpiringSoon && !h.isExpired).length,
    [shelfHolds]
  );

  const handleClearExpired = async () => {
    setClearing(true);
    try {
      const res = await fetchWithAuth("/api/evergreen/holds/shelf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "clear_expired",
          orgId: defaultOrgId,
        }),
      });

      const data = await res.json();

      if (data.ok) {
        toast.success(
          "Cleared " + (data.clearedCount || 0) + " expired hold(s)"
        );
        setClearDialogOpen(false);
        void loadShelfHolds();
      } else {
        toast.error(data.error || "Failed to clear expired holds");
      }
    } catch (err) {
      toast.error("Failed to clear expired holds");
      clientLogger.error(err);
    } finally {
      setClearing(false);
    }
  };

  const printShelfList = useCallback(() => {
    const now = new Date();
    const orgName = getOrgName?.(defaultOrgId) || "Library";

    const rows = shelfHolds
      .map((item) => {
        const rowClass = item.isExpired
          ? 'style="background-color: #fee2e2;"'
          : item.isExpiringSoon
            ? 'style="background-color: #fef3c7;"'
            : "";
        return (
          "<tr " +
          rowClass +
          ">" +
          "<td>" +
          escapeHtml(item.title) +
          (item.author
            ? '<div class="muted">' + escapeHtml(item.author) + "</div>"
            : "") +
          "</td>" +
          "<td>" +
          escapeHtml(item.patronName) +
          "</td>" +
          "<td>" +
          (item.pickupDate
            ? format(new Date(item.pickupDate), "MM/dd/yyyy")
            : "-") +
          "</td>" +
          "<td>" +
          (item.expireDate
            ? format(new Date(item.expireDate), "MM/dd/yyyy")
            : "-") +
          "</td>" +
          "<td>" +
          escapeHtml(item.shelfLocation) +
          "</td>" +
          "<td>" +
          item.daysOnShelf +
          "</td>" +
          "</tr>"
        );
      })
      .join("");

    const html =
      "<h1>Holds Shelf List</h1>" +
      '<div class="meta">' +
      '<span><span class="k">Location:</span> <span class="v">' +
      escapeHtml(orgName) +
      "</span></span>" +
      '<span><span class="k">Date:</span> <span class="v">' +
      format(now, "MM/dd/yyyy h:mm a") +
      "</span></span>" +
      '<span><span class="k">Items:</span> <span class="v">' +
      shelfHolds.length +
      "</span></span>" +
      '<span><span class="k">Expired:</span> <span class="v" style="color: #dc2626;">' +
      expiredCount +
      "</span></span>" +
      "</div>" +
      '<table style="margin-top: 16px;">' +
      "<thead>" +
      "<tr>" +
      "<th scope=\"col\">Title / Author</th>" +
      "<th scope=\"col\">Patron</th>" +
      "<th scope=\"col\">Pickup Date</th>" +
      "<th scope=\"col\">Expire Date</th>" +
      "<th scope=\"col\">Shelf Location</th>" +
      "<th scope=\"col\">Days</th>" +
      "</tr>" +
      "</thead>" +
      "<tbody>" +
      rows +
      "</tbody>" +
      "</table>" +
      '<div style="margin-top: 12px; font-size: 11px; color: #64748b;">' +
      '<span style="display: inline-block; width: 12px; height: 12px; background: #fee2e2; margin-right: 4px;"></span> Expired' +
      '<span style="display: inline-block; width: 12px; height: 12px; background: #fef3c7; margin-left: 12px; margin-right: 4px;"></span> Expiring Soon' +
      "</div>";

    printHtml(html, { title: "Holds Shelf", tone: "report" });
  }, [shelfHolds, getOrgName, defaultOrgId, expiredCount]);

  const columns: ColumnDef<ShelfHold>[] = useMemo(
    () => [
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
        accessorKey: "patronName",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Patron" />
        ),
        cell: ({ row }) => {
          const barcode = row.original.patronBarcode || "";
          const maskedBarcode =
            barcode.length > 4 ? "****" + barcode.slice(-4) : barcode;
          return (
            <div>
              <div>{row.original.patronName}</div>
              <div className="text-xs text-muted-foreground font-mono">
                {maskedBarcode}
              </div>
            </div>
          );
        },
      },
      {
        accessorKey: "pickupDate",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Pickup Date" />
        ),
        cell: ({ row }) =>
          row.original.pickupDate
            ? format(new Date(row.original.pickupDate), "MM/dd/yyyy")
            : "-",
      },
      {
        accessorKey: "expireDate",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Expire Date" />
        ),
        cell: ({ row }) => {
          const expireDate = row.original.expireDate;
          if (!expireDate) return "-";

          const isExpired = row.original.isExpired;
          const isExpiringSoon = row.original.isExpiringSoon;

          return (
            <span
              className={
                isExpired
                  ? "text-red-600 font-medium"
                  : isExpiringSoon
                    ? "text-amber-600 font-medium"
                    : ""
              }
            >
              {format(new Date(expireDate), "MM/dd/yyyy")}
            </span>
          );
        },
      },
      {
        accessorKey: "shelfLocation",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Shelf Location" />
        ),
      },
      {
        accessorKey: "daysOnShelf",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Days on Shelf" />
        ),
        cell: ({ row }) => {
          const days = row.original.daysOnShelf;
          return (
            <span
              className={
                days > 7
                  ? "text-red-600 font-medium"
                  : days > 5
                    ? "text-amber-600 font-medium"
                    : ""
              }
            >
              {days}
            </span>
          );
        },
      },
      {
        accessorKey: "status",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Status" />
        ),
        cell: ({ row }) => {
          const isExpired = row.original.isExpired;
          const isExpiringSoon = row.original.isExpiringSoon;

          if (isExpired) {
            return <StatusBadge status="error" label="Expired" />;
          }
          if (isExpiringSoon) {
            return <StatusBadge status="warning" label="Expiring Soon" />;
          }
          return <StatusBadge status="success" label="On Shelf" />;
        },
      },
    ],
    []
  );

  const getRowClassName = useCallback((row: ShelfHold) => {
    if (row.isExpired) return "bg-red-50 dark:bg-red-950/20";
    if (row.isExpiringSoon) return "bg-amber-50 dark:bg-amber-950/20";
    return "";
  }, []);

  return (
    <PageContainer>
      <PageHeader
        title="Holds Shelf"
        breadcrumbs={[
          { label: "Circulation", href: "/staff/circulation" },
          { label: "Holds Shelf" },
        ]}
        actions={[
          {
            label: "Refresh",
            icon: RefreshCw,
            onClick: loadShelfHolds,
            variant: "outline",
          },
          {
            label: "Print List",
            icon: Printer,
            onClick: printShelfList,
            variant: "outline",
          },
          ...(expiredCount > 0
            ? [
                {
                  label: "Clear Expired (" + expiredCount + ")",
                  icon: Trash2,
                  onClick: () => setClearDialogOpen(true),
                  variant: "destructive" as const,
                },
              ]
            : []),
        ]}
      />

      <PageContent>
        {error && <ErrorMessage message={error} className="mb-4" />}

        <div className="flex items-center gap-4 mb-4">
          <div className="flex items-center gap-6 text-sm">
            <div>
              <span className="text-muted-foreground">Total on shelf: </span>
              <span className="font-medium">{shelfHolds.length}</span>
            </div>
            {expiringSoonCount > 0 && (
              <div className="flex items-center gap-1 text-amber-600">
                <AlertTriangle className="h-4 w-4" />
                <span>{expiringSoonCount} expiring soon</span>
              </div>
            )}
            {expiredCount > 0 && (
              <div className="flex items-center gap-1 text-red-600">
                <AlertTriangle className="h-4 w-4" />
                <span>{expiredCount} expired</span>
              </div>
            )}
          </div>
        </div>

        {shelfHolds.length === 0 && !loading ? (
          <EmptyState
            icon={Inbox}
            title="No holds on shelf"
            description="There are no captured holds waiting on the holds shelf."
            action={{
              label: "Open pull list",
              onClick: () => router.push("/staff/circulation/pull-list"),
            }}
            secondaryAction={{
              label: "Hold policies",
              onClick: () => router.push("/staff/admin/policies/holds"),
            }}
	          >
	            <Button variant="ghost" onClick={() => router.push("/staff/help#demo-data")}>
	              Seed demo data
	            </Button>
	          </EmptyState>
	        ) : (
	          <DataTable
	            columns={columns}
	            data={shelfHolds}
	            isLoading={loading}
            getRowClassName={getRowClassName}
          />
        )}
      </PageContent>

      <Dialog open={clearDialogOpen} onOpenChange={setClearDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Clear Expired Holds</DialogTitle>
            <DialogDescription>
              This will remove {expiredCount} expired hold(s) from the shelf and
              return them to the available pool. Items will need to be
              reshelved.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setClearDialogOpen(false)}
              disabled={clearing}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleClearExpired}
              disabled={clearing}
            >
              {clearing ? "Clearing..." : "Clear Expired"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageContainer>
  );
}
