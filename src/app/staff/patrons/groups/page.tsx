"use client";

import { fetchWithAuth } from "@/lib/client-fetch";

import { useMemo, useState, useEffect } from "react";
import { ColumnDef } from "@tanstack/react-table";
import {
  PageContainer,
  PageHeader,
  PageContent,
  DataTable,
  LoadingSpinner,
  EmptyState,
} from "@/components/shared";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Users, Search, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { clientLogger } from "@/lib/client-logger";

interface PatronGroup {
  id: number;
  name: string;
  description: string;
  parentId?: number;
  depth: number;
}

function depthPaddingClass(depth: number): string {
  if (depth <= 0) return "pl-0";
  if (depth === 1) return "pl-3";
  if (depth === 2) return "pl-6";
  if (depth === 3) return "pl-9";
  if (depth === 4) return "pl-12";
  return "pl-14";
}

export default function PatronGroupsPage() {
  const [groups, setGroups] = useState<PatronGroup[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchGroups();
  }, []);

  const fetchGroups = async () => {
    setLoading(true);
    try {
      const res = await fetchWithAuth("/api/evergreen/patrons?action=groups");
      const data = await res.json();

      if (data.ok && data.groups) {
        const mappedGroups: PatronGroup[] = [];

        function traverse(group: any, depth = 0) {
          mappedGroups.push({
            id: group.id,
            name: group.name,
            description: group.description || "",
            parentId: group.parent,
            depth,
          });
          if (group.children) {
            group.children.forEach((child: any) => traverse(child, depth + 1));
          }
        }

        if (Array.isArray(data.groups)) {
          data.groups.forEach((g: any) => traverse(g));
        } else {
          traverse(data.groups);
        }

        setGroups(mappedGroups);
      } else {
        setGroups([]);
        toast.error("Failed to load patron groups");
      }
    } catch (err) {
      toast.error("Connection error");
      clientLogger.error("Patron groups error:", err);
    }
    setLoading(false);
  };

  const filteredGroups = useMemo(() => {
    if (!searchQuery) return groups;
    const term = searchQuery.toLowerCase();
    return groups.filter((group) =>
      `${group.name} ${group.description}`.toLowerCase().includes(term)
    );
  }, [groups, searchQuery]);

  const columns = useMemo<ColumnDef<PatronGroup>[]>(
    () => [
      {
        accessorKey: "name",
        header: "Group",
        cell: ({ row }) => (
          <div className="flex items-center gap-2">
            <span className={`font-medium ${depthPaddingClass(row.original.depth)}`}>
              {row.getValue("name")}
            </span>
          </div>
        ),
      },
      {
        accessorKey: "description",
        header: "Description",
        cell: ({ row }) => row.getValue("description") || "-",
      },
      {
        accessorKey: "parentId",
        header: "Parent",
        cell: ({ row }) => (row.getValue("parentId") ? `#${row.getValue("parentId")}` : "-"),
      },
    ],
    []
  );

  return (
    <PageContainer>
      <PageHeader
        title="Patron Groups"
        subtitle="Manage Evergreen patron permission groups and hierarchy."
        breadcrumbs={[{ label: "Patrons", href: "/staff/patrons" }, { label: "Groups" }]}
        actions={[
          {
            label: "Refresh",
            onClick: fetchGroups,
            icon: RefreshCw,
          },
        ]}
      >
        <div className="flex items-center gap-2 max-w-md">
          <Input
            placeholder="Search groups..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          <Button
            variant="outline"
            size="sm"
            onClick={fetchGroups}
            aria-label="Search patron groups"
          >
            <Search className="h-4 w-4" />
          </Button>
        </div>
      </PageHeader>
      <PageContent>
        {loading ? (
          <LoadingSpinner message="Loading patron groups..." />
        ) : (
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Users className="h-4 w-4" />
                Group Hierarchy
              </CardTitle>
            </CardHeader>
            <CardContent>
              <DataTable
                columns={columns}
                data={filteredGroups}
                searchable={false}
                emptyState={
                  <EmptyState
                    icon={Users}
                    title="No patron groups found"
                    description="Check Evergreen group configuration or refresh the list."
                  />
                }
              />
            </CardContent>
          </Card>
        )}
      </PageContent>
    </PageContainer>
  );
}
