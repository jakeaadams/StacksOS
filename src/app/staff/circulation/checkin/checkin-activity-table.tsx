"use client";

import type { ColumnDef } from "@tanstack/react-table";

import { DataTable, DataTableColumnHeader, EmptyState, StatusBadge } from "@/components/shared";

import type { CheckinItem } from "./types";
import { AlertTriangle, Archive, Bell, ScanLine, Truck } from "lucide-react";
import { cn } from "@/lib/utils";

interface CheckinActivityTableProps {
  data: CheckinItem[];
  onSelectionChange: (rows: CheckinItem[]) => void;
}

export function CheckinActivityTable({ data, onSelectionChange }: CheckinActivityTableProps) {
  const columns: ColumnDef<CheckinItem>[] = [
    {
      accessorKey: "status",
      header: "Outcome",
      cell: ({ row }) => {
        const status = row.original.status;
        if (status === "hold") {
          return <StatusBadge label="Hold shelf" status="warning" icon={Bell} showIcon />;
        }
        if (status === "transit") {
          return <StatusBadge label="Transit" status="info" icon={Truck} showIcon />;
        }
        if (status === "error") {
          return <StatusBadge label="Review" status="error" icon={AlertTriangle} showIcon />;
        }
        if (status === "alert") {
          return <StatusBadge label="Alert" status="warning" icon={AlertTriangle} showIcon />;
        }
        return <StatusBadge label="Reshelve" status="success" icon={Archive} showIcon />;
      },
    },
    {
      accessorKey: "title",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Title" />,
      cell: ({ row }) => (
        <div className="min-w-0 space-y-0.5">
          <div className="font-medium leading-snug">{row.original.title}</div>
          {row.original.author && (
            <div className="text-xs text-muted-foreground">{row.original.author}</div>
          )}
          {row.original.message && (
            <div
              className={cn(
                "text-xs",
                row.original.status === "error"
                  ? "text-[hsl(var(--status-error-text))]"
                  : row.original.status === "hold" || row.original.status === "transit"
                    ? "text-[hsl(var(--status-warning-text))]"
                    : "text-muted-foreground"
              )}
            >
              {row.original.message}
            </div>
          )}
        </div>
      ),
    },
    {
      accessorKey: "barcode",
      header: "Item barcode",
      cell: ({ row }) => (
        <span className="font-mono text-xs text-muted-foreground">{row.original.barcode}</span>
      ),
    },
    {
      accessorKey: "callNumber",
      header: "Route",
      cell: ({ row }) => {
        const item = row.original;
        if (item.status === "hold" && item.holdFor) {
          return (
            <span className="text-xs">
              Hold for <span className="font-medium">{item.holdFor.name}</span>
            </span>
          );
        }
        if (item.status === "transit") {
          return (
            <span className="text-xs">
              Send to <span className="font-medium">{item.transitTo || "destination branch"}</span>
            </span>
          );
        }
        if (item.status === "error") {
          return (
            <span className="text-xs text-[hsl(var(--status-error-text))]">
              Resolve before retry
            </span>
          );
        }
        return (
          <span className="font-mono text-xs text-muted-foreground">
            {item.callNumber || "Shelving cart"}
          </span>
        );
      },
    },
    {
      accessorKey: "timestamp",
      header: "Time",
      cell: ({ row }) => (
        <span className="text-xs text-muted-foreground">
          {row.original.timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
        </span>
      ),
    },
  ];

  return (
    <DataTable
      columns={columns}
      data={data}
      searchable={data.length >= 8}
      searchPlaceholder="Filter by title, barcode, or route…"
      emptyState={
        <EmptyState
          icon={ScanLine}
          title="No scans in this session"
          description="Return activity appears here as items are processed."
          size="md"
        />
      }
      selectable={data.length > 0}
      onSelectionChange={onSelectionChange}
      columnVisibilityToggle={false}
      compact
      paginated={false}
      className="min-w-0"
      getRowClassName={(row) =>
        row.status === "error"
          ? "bg-[hsl(var(--status-error-bg))/0.18]"
          : row.status === "hold" || row.status === "transit"
            ? "bg-[hsl(var(--status-warning-bg))/0.12]"
            : ""
      }
    />
  );
}
