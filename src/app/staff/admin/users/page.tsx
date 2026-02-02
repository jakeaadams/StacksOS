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
  const [loadError, setLoadError] = useState<string | null>(null);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [lastQuery, setLastQuery] = useState<string>("");

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

    setIsLoading(true);
    setLoadError(null);
    try {
      setLastQuery(trimmed);

      const params = new URLSearchParams();
      if (trimmed) params.set("q", trimmed);
      params.set("limit", "50");

      const response = await fetchWithAuth(`/api/evergreen/staff-users?${params.toString()}`);
      const data = await response.json();

      if (!response.ok || !data.ok) {
        const message = data?.error || "Failed to load users";
        setLoadError(message);
        toast.error(message);
        setStaffUsers([]);
        setHasLoaded(true);
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
      setHasLoaded(true);
    } catch (error) {
      const message = "Failed to load users";
      setLoadError(message);
      toast.error(message);
      setStaffUsers([]);
      setHasLoaded(true);
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
    void loadStaffUsers(lastQuery || searchQuery);
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
          { label: "Refresh", onClick: handleRefresh, icon: RefreshCw, disabled: isLoading || !hasLoaded },
        ]}
      />

      <PageContent className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-3">
          <Card className="rounded-2xl">
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Found Users</p>
                  <div className="text-2xl font-semibold mt-1">{hasLoaded ? staffUsers.length : "—"}</div>
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
                  <div className="text-2xl font-semibold mt-1">
                    {hasLoaded ? staffUsers.filter(u => u.active).length : "—"}
                  </div>
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
                  <div className="text-2xl font-semibold mt-1">
                    {hasLoaded ? new Set(staffUsers.map(u => u.profile)).size : "—"}
                  </div>
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
          <CardDescription>
              Search staff users by name, username, or email. Searches query Evergreen staff accounts (no demo data).
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
              <Button
                type="button"
                variant="outline"
                disabled={isLoading}
                onClick={() => void loadStaffUsers("")}
              >
                <RefreshCw className="h-4 w-4 mr-2" />
                Load first 50
              </Button>
            </form>
            {loadError ? (
              <div className="mb-3 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                {loadError}
              </div>
            ) : null}
            <DataTable
              columns={columns}
              data={staffUsers}
              isLoading={isLoading}
              searchable={false}
              paginated={staffUsers.length > 10}
              emptyState={
                <EmptyState
                  title={hasLoaded ? "No users found" : "Search for users"}
                  description={
                    hasLoaded
                      ? lastQuery
                        ? "No users match your search criteria."
                        : "No staff users were returned from Evergreen. Verify staff accounts exist and that your account has VIEW_USER."
                      : "Run a search to list staff users (or click “Load first 50”)."
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
