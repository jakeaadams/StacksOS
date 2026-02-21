"use client";

import { useMemo } from "react";
import { ColumnDef } from "@tanstack/react-table";
import { Badge } from "@/components/ui/badge";
import { Edit3, Trash2 } from "lucide-react";
import { TableRowActions } from "@/components/shared";
import type { PermGroup, GroupPerm } from "./permissions-types";

interface GroupColumnsOpts {
  canEdit: boolean;
  onEdit: (group: PermGroup) => void;
}

export function useGroupColumns(opts: GroupColumnsOpts) {
  return useMemo<ColumnDef<PermGroup>[]>(() => [
    {
      accessorKey: "name", header: "Group",
      cell: ({ row }) => (
        <div className="min-w-0">
          <div className="font-medium truncate">{row.original.name || `Group ${row.original.id}`}</div>
          <div className="text-[11px] text-muted-foreground font-mono">#{row.original.id}</div>
          {row.original.parentName ? <div className="text-[11px] text-muted-foreground truncate">Parent: {row.original.parentName}</div> : null}
        </div>
      ),
    },
    {
      accessorKey: "application_perm", header: "App Perm",
      cell: ({ row }) => <span className="font-mono text-[11px] text-muted-foreground">{row.original.application_perm || "\u2014"}</span>,
    },
    {
      id: "actions", header: "", enableSorting: false,
      cell: ({ row }) => {
        if (!opts.canEdit) return null;
        return (
          <div onClick={(e) => e.stopPropagation()} className="flex justify-end">
            <TableRowActions actions={[{ id: "edit", label: "Edit group", icon: Edit3, onClick: () => opts.onEdit(row.original) }]} quickActions={["edit"]} />
          </div>
        );
      },
    },
  ], [opts]);
}

interface GroupPermColumnsOpts {
  canEdit: boolean;
  onEdit: (mapping: GroupPerm) => void;
  onRemove: (mapping: GroupPerm) => void;
}

export function useGroupPermColumns(opts: GroupPermColumnsOpts) {
  return useMemo<ColumnDef<GroupPerm>[]>(() => [
    {
      accessorKey: "permCode", header: "Permission",
      cell: ({ row }) => (
        <div className="min-w-0">
          <div className="font-mono text-xs truncate">{row.original.permCode || `perm #${row.original.perm}`}</div>
          <div className="text-[11px] text-muted-foreground line-clamp-2">{row.original.permDescription || "\u2014"}</div>
        </div>
      ),
    },
    { accessorKey: "depth", header: "Depth", cell: ({ row }) => <span className="font-mono text-xs">{String(row.original.depth ?? "\u2014")}</span> },
    {
      accessorKey: "grantable", header: "Grantable",
      cell: ({ row }) => row.original.grantable ? <Badge className="rounded-full">Yes</Badge> : <Badge variant="secondary" className="rounded-full">No</Badge>,
    },
    {
      id: "actions", header: "", enableSorting: false,
      cell: ({ row }) => {
        if (!opts.canEdit) return null;
        return (
          <div onClick={(e) => e.stopPropagation()} className="flex justify-end">
            <TableRowActions actions={[
              { id: "edit", label: "Edit mapping", icon: Edit3, onClick: () => opts.onEdit(row.original) },
              { id: "remove", label: "Remove from group", icon: Trash2, variant: "destructive", onClick: () => opts.onRemove(row.original) },
            ]} quickActions={["edit"]} />
          </div>
        );
      },
    },
  ], [opts]);
}
