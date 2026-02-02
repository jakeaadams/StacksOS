"use client";

import { useCallback, useMemo, useState } from "react";
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
import { Users, Shield, Search, RefreshCw } from "lucide-react";
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
  const { user, isLoading: authLoading } = useAuth();
  const [staffUsers, setStaffUsers] = useState<StaffUser[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [hasSearched, setHasSearched] = useState(false);
  const [lastSearchedQuery, setLastSearchedQuery] = useState<string>("");

  const sessionUser = useMemo<StaffUser | null>(() => {
    if (!user) return null;
    return {
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      barcode: "—",
      homeLibrary: user.homeLibrary,
      profile: user.profileName || "Staff",
      active: true,
    };
  }, [user]);

  const loadStaffUsers = useCallback(async (query: string) => {
    const trimmed = query.trim();

    // Match the "Search Patrons" UX: no "0 results" until a search is performed.
    if (!trimmed) {
      setHasSearched(false);
      setLastSearchedQuery("");
      setStaffUsers([]);
      return;
    }

    setIsLoading(true);
    try {
      setHasSearched(true);
      setLastSearchedQuery(trimmed);

      const response = await fetchWithAuth(`/api/evergreen/staff-users?q=${encodeURIComponent(trimmed)}&limit=50`);
      const data = await response.json();

      if (!response.ok || !data.ok) {
        toast.error(data?.error || "Failed to load users");
        setStaffUsers([]);
        return;
      }

      const raw = Array.isArray(data.users) ? data.users : [];
      const users = raw.map((u: any) => ({
        id: u.id,
        username: u.username || "",
        displayName: u.displayName || u.username || "Unknown",
        barcode: u.barcode || "",
        homeLibrary: u.homeLibrary || "",
        profile: u.profile || "Staff",
        active: u.active !== false,
      }));
      setStaffUsers(users);
    } catch (error) {
      toast.error("Failed to load users");
      setStaffUsers([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

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

  const handleSearch = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    void loadStaffUsers(searchQuery);
  };

  const handleRefresh = () => {
    if (hasSearched) {
      void loadStaffUsers(lastSearchedQuery || searchQuery);
    }
  };

  if (authLoading) {
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
          <LoadingSpinner message="Loading session..." />
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
          { label: "Refresh", onClick: handleRefresh, icon: RefreshCw, disabled: !hasSearched },
        ]}
      />

      <PageContent className="space-y-6">
        {hasSearched && (
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
        )}

        <Card className="rounded-2xl">
          <CardHeader>
          <CardTitle className="text-base">Search Users</CardTitle>
          <CardDescription>
              Search staff users by name or username. Results appear only after you run a search.
          </CardDescription>
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
                  title={hasSearched ? "No users found" : "Search for users"}
                  description={
                    hasSearched
                      ? "No users match your search criteria."
                      : "Enter a name above (e.g., \"Jake Adams\") and press Search."
                  }
                />
              }
            />
          </CardContent>
        </Card>

        {sessionUser && (
          <Card className="rounded-2xl">
            <CardHeader>
              <CardTitle className="text-base">Current Session</CardTitle>
              <CardDescription>Who you are logged in as (from Evergreen session).</CardDescription>
            </CardHeader>
            <CardContent className="text-sm">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <div className="font-medium">{sessionUser.displayName}</div>
                  <div className="text-muted-foreground font-mono text-xs">{sessionUser.username}</div>
                </div>
                <div className="flex items-center gap-3">
                  <StatusBadge
                    label={sessionUser.active ? "Active" : "Inactive"}
                    status={sessionUser.active ? "success" : "error"}
                  />
                  <div className="text-xs text-muted-foreground">{sessionUser.profile}</div>
                </div>
              </div>
              <div className="mt-3 text-xs text-muted-foreground">
                Home library: {sessionUser.homeLibrary || "—"}
              </div>
            </CardContent>
          </Card>
        )}

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
