"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  PageContainer,
  PageHeader,
  PageContent,
  DataTable,
  EmptyState,
  StatusBadge,
  LoadingSpinner,
} from "@/components/shared";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/contexts/auth-context";
import { fetchWithAuth } from "@/lib/client-fetch";
import { Users, Shield, UserPlus, Search, RefreshCw } from "lucide-react";
import { ColumnDef } from "@tanstack/react-table";
import { toast } from "sonner";

interface StaffUser {
  id: number;
  username: string;
  displayName: string;
  barcode: string;
  homeLibrary: string;
  profile: string;
  active: boolean;
}

export default function UserManagementPage() {
  const { user, orgs } = useAuth();
  const [staffUsers, setStaffUsers] = useState<StaffUser[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

  const loadStaffUsers = useCallback(async () => {
    setIsLoading(true);
    try {
      const query = searchQuery.trim();

      // Default view: show the currently logged-in staff account so this page never looks "empty"
      // and doesn't rely on Evergreen's name-search behavior.
      if (!query) {
        if (user) {
          setStaffUsers([
            {
              id: user.id,
              username: user.username,
              displayName: user.displayName,
              barcode: "—",
              homeLibrary: user.homeLibrary,
              profile: user.profileName || "Staff",
              active: true,
            },
          ]);
        } else {
          setStaffUsers([]);
        }
        return;
      }

      // Search for users - in production this would filter by staff profile
      const response = await fetchWithAuth(`/api/evergreen/patrons?q=${encodeURIComponent(query)}&type=name&limit=50`);
      const data = await response.json();

      if (!response.ok || !data.ok) {
        toast.error(data?.error || "Failed to load users");
        setStaffUsers([]);
        return;
      }

      if (data.patrons) {
        const users = data.patrons.map((p: any) => ({
          id: p.id,
          username: p.username || p.usrname || "",
          displayName: p.displayName || `${p.firstName || ""} ${p.lastName || ""}`.trim() || "Unknown",
          barcode: p.barcode || "",
          homeLibrary: p.homeLibraryName || orgs.find(o => o.id === p.homeLibraryId)?.shortname || "",
          profile: p.profileName || p.profile || "Patron",
          active: p.active !== false,
        }));
        setStaffUsers(users);
      }
    } catch (error) {
      toast.error("Failed to load users");
      setStaffUsers([]);
    } finally {
      setIsLoading(false);
    }
  }, [orgs, searchQuery, user]);

  useEffect(() => {
    loadStaffUsers();
  }, [loadStaffUsers]);

  const columns: ColumnDef<StaffUser>[] = useMemo(() => [
    {
      accessorKey: "username",
      header: "Username",
      cell: ({ row }) => <span className="font-mono text-sm">{row.original.username || "\u2014"}</span>,
    },
    {
      accessorKey: "displayName",
      header: "Name",
    },
    {
      accessorKey: "barcode",
      header: "Barcode",
      cell: ({ row }) => <span className="font-mono text-xs">{row.original.barcode || "\u2014"}</span>,
    },
    {
      accessorKey: "homeLibrary",
      header: "Home Library",
    },
    {
      accessorKey: "profile",
      header: "Profile",
      cell: ({ row }) => (
        <span className="inline-flex items-center gap-1">
          <Shield className="h-3 w-3" />
          {row.original.profile}
        </span>
      ),
    },
    {
      accessorKey: "active",
      header: "Status",
      cell: ({ row }) => (
        <StatusBadge
          label={row.original.active ? "Active" : "Inactive"}
          status={row.original.active ? "success" : "error"}
        />
      ),
    },
  ], []);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    loadStaffUsers();
  };

  if (isLoading && staffUsers.length === 0) {
    return (
      <PageContainer>
        <PageHeader
          title="User Management"
          subtitle="Manage staff users and permissions."
          breadcrumbs={[
            { label: "Administration", href: "/staff/admin" },
            { label: "Users" },
          ]}
        />
        <PageContent>
          <LoadingSpinner message="Loading users..." />
        </PageContent>
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <PageHeader
        title="User Management"
        subtitle="Manage staff users and permissions."
        breadcrumbs={[
          { label: "Administration", href: "/staff/admin" },
          { label: "Users" },
        ]}
        actions={[
          { label: "Refresh", onClick: loadStaffUsers, icon: RefreshCw },
        ]}
      />

      <PageContent className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-3">
          <Card className="rounded-2xl">
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Found Users</p>
                  <div className="text-2xl font-semibold mt-1">{staffUsers.length}</div>
                </div>
                <div className="h-10 w-10 rounded-full flex items-center justify-center bg-blue-500/10 text-blue-600">
                  <Users className="h-5 w-5" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-2xl">
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Active</p>
                  <div className="text-2xl font-semibold mt-1">{staffUsers.filter(u => u.active).length}</div>
                </div>
                <div className="h-10 w-10 rounded-full flex items-center justify-center bg-emerald-500/10 text-emerald-600">
                  <Users className="h-5 w-5" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-2xl">
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Profiles</p>
                  <div className="text-2xl font-semibold mt-1">{new Set(staffUsers.map(u => u.profile)).size}</div>
                </div>
                <div className="h-10 w-10 rounded-full flex items-center justify-center bg-purple-500/10 text-purple-600">
                  <Shield className="h-5 w-5" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card className="rounded-2xl">
          <CardHeader>
            <CardTitle className="text-base">Search Users</CardTitle>
            <CardDescription>Type a name to search Evergreen. Leave blank to show your current session user.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSearch} className="flex gap-2 mb-4">
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by name..."
                className="max-w-sm"
              />
              <Button type="submit" disabled={isLoading}>
                <Search className="h-4 w-4 mr-2" />
                Search
              </Button>
            </form>
            <DataTable
              columns={columns}
              data={staffUsers}
              isLoading={isLoading}
              searchable={false}
              paginated={staffUsers.length > 10}
              emptyState={
                <EmptyState
                  title="No users found"
                  description="No users match your search criteria."
                />
              }
            />
          </CardContent>
        </Card>

        <Card className="rounded-2xl">
          <CardHeader>
            <CardTitle className="text-base">Permission Groups</CardTitle>
            <CardDescription>Staff permission profiles are managed in Evergreen.</CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            <p>
              Evergreen uses a hierarchical permission system. Staff users are assigned to permission groups
              that define what actions they can perform. Common profiles include:
            </p>
            <ul className="list-disc list-inside mt-2 space-y-1">
              <li><strong>Circulator</strong> - Basic checkout/checkin permissions</li>
              <li><strong>Cataloger</strong> - Create and edit bibliographic records</li>
              <li><strong>Staff</strong> - General staff permissions</li>
              <li><strong>Local Admin</strong> - Branch-level administration</li>
            </ul>
          </CardContent>
        </Card>
      </PageContent>
    </PageContainer>
  );
}
