"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  PageContainer,
  PageHeader,
  PageContent,
  DataTable,
  EmptyState,
  StatusBadge,
} from "@/components/shared";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useApi } from "@/hooks";
import { useAuth } from "@/contexts/auth-context";
import { fetchWithAuth } from "@/lib/client-fetch";
import { Monitor, Plus, RefreshCw } from "lucide-react";
import { ColumnDef } from "@tanstack/react-table";
import { toast } from "sonner";

interface Workstation {
  id: number;
  name: string;
  owning_lib: number;
}

export default function WorkstationsPage() {
  const { orgs } = useAuth();
  const [selectedOrgId, setSelectedOrgId] = useState<number | null>(null);
  const [newWorkstationName, setNewWorkstationName] = useState("");
  const [isRegistering, setIsRegistering] = useState(false);
  const registerCardRef = useRef<HTMLDivElement | null>(null);
  const nameInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!selectedOrgId && orgs.length > 0) {
      setSelectedOrgId(orgs[0]!.id);
    }
  }, [orgs, selectedOrgId]);

  const { data, isLoading, refetch } = useApi<any>(
    selectedOrgId ? `/api/evergreen/workstations?org_id=${selectedOrgId}` : null,
    { immediate: !!selectedOrgId, deps: [selectedOrgId] }
  );

  const workstations: Workstation[] = useMemo(
    () => (data?.workstations || []).map((ws: any) => ({
      id: ws.id ?? ws[0] ?? 0,
      name: ws.name || ws[1] || "Unknown",
      owning_lib: ws.owning_lib || ws.owner || ws.org_unit || selectedOrgId,
    })),
    [data, selectedOrgId]
  );

  const columns: ColumnDef<Workstation>[] = [
    {
      accessorKey: "name",
      header: "Workstation Name",
      cell: ({ row }) => (
        <span className="font-mono text-sm flex items-center gap-2">
          <Monitor className="h-4 w-4 text-muted-foreground" />
          {row.original.name}
        </span>
      ),
    },
    {
      accessorKey: "id",
      header: "ID",
      cell: ({ row }) => <span className="font-mono text-xs">{row.original.id}</span>,
    },
    {
      accessorKey: "owning_lib",
      header: "Owning Library",
      cell: ({ row }) => {
        const org = orgs.find(o => o.id === row.original.owning_lib);
        return org ? org.shortname : row.original.owning_lib;
      },
    },
    {
      id: "status",
      header: "Status",
      cell: () => <StatusBadge label="Registered" status="success" />,
    },
  ];

  const handleRegister = async () => {
    if (!newWorkstationName.trim() || !selectedOrgId) {
      toast.error("Missing data", { description: "Enter a name and select an organization." });
      return;
    }

    setIsRegistering(true);
    try {
      const res = await fetchWithAuth("/api/evergreen/workstations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newWorkstationName.trim(), org_id: selectedOrgId }),
      });
      const result = await res.json();

      if (result.ok) {
        toast.success("Workstation registered", { description: newWorkstationName });
        setNewWorkstationName("");
        await refetch();
      } else {
        toast.error("Registration failed", { description: result.error || "Unknown error" });
      }
    } catch (_error) {
      toast.error("Registration failed", { description: "Network error" });
    } finally {
      setIsRegistering(false);
    }
  };

  return (
    <PageContainer>
      <PageHeader
        title="Workstations"
        subtitle="Manage circulation workstations for each branch."
        breadcrumbs={[
          { label: "Administration", href: "/staff/admin" },
          { label: "Workstations" },
        ]}
        actions={[
          {
            label: "Refresh",
            onClick: () => refetch(),
            icon: RefreshCw,
          },
        ]}
      />

      <PageContent className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <Card className="rounded-2xl">
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Total Workstations</p>
                  <div className="text-2xl font-semibold mt-1">{workstations.length}</div>
                </div>
                <div className="h-10 w-10 rounded-full flex items-center justify-center bg-blue-500/10 text-blue-600">
                  <Monitor className="h-5 w-5" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-2xl">
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Organizations</p>
                  <div className="text-2xl font-semibold mt-1">{orgs.length}</div>
                </div>
                <div className="h-10 w-10 rounded-full flex items-center justify-center bg-emerald-500/10 text-emerald-600">
                  <Monitor className="h-5 w-5" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card className="rounded-2xl">
          <CardHeader>
            <CardTitle className="text-base">Register New Workstation</CardTitle>
            <CardDescription>Add a new circulation workstation to an organization.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4" ref={registerCardRef}>
            <div className="grid gap-4 sm:grid-cols-[1fr,200px,auto]">
              <div className="space-y-2">
                <label htmlFor="workstation-name" className="text-sm font-medium">Workstation Name</label>
                <Input id="workstation-name"
                  ref={nameInputRef}
                  value={newWorkstationName}
                  onChange={(e) => setNewWorkstationName(e.target.value)}
                  placeholder="e.g., CIRC-DESK-01"
                />
              </div>
              <div className="space-y-2">
                <label htmlFor="organization" className="text-sm font-medium">Organization</label>
                <Select id="organization"
                  value={selectedOrgId ? String(selectedOrgId) : ""}
                  onValueChange={(v) => setSelectedOrgId(parseInt(v, 10))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select org" />
                  </SelectTrigger>
                  <SelectContent>
                    {orgs.map((org) => (
                      <SelectItem key={org.id} value={String(org.id)}>
                        {org.shortname}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-end">
                <Button onClick={handleRegister} disabled={isRegistering}>
                  <Plus className="h-4 w-4 mr-2" />
                  {isRegistering ? "Registering..." : "Register"}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-2xl">
          <CardHeader>
            <CardTitle className="text-base">Registered Workstations</CardTitle>
            <CardDescription>Workstations registered for the selected organization.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="mb-4">
              <Select
                value={selectedOrgId ? String(selectedOrgId) : ""}
                onValueChange={(v) => setSelectedOrgId(parseInt(v, 10))}
              >
                <SelectTrigger className="w-[200px]">
                  <SelectValue placeholder="Filter by org" />
                </SelectTrigger>
                <SelectContent>
                  {orgs.map((org) => (
                    <SelectItem key={org.id} value={String(org.id)}>
                      {org.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <DataTable
              columns={columns}
              data={workstations}
              isLoading={isLoading}
              searchable={true}
              searchPlaceholder="Search workstations..."
              paginated={workstations.length > 10}
	              emptyState={
	                <EmptyState
	                  title="No workstations"
	                  description="No workstations registered for this organization."
	                  action={{
	                    label: "Register workstation",
	                    onClick: () => {
	                      registerCardRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
	                      setTimeout(() => nameInputRef.current?.focus(), 150);
	                    },
	                  }}
	                  secondaryAction={{
	                    label: "Evergreen setup",
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
