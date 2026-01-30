"use client";

import { fetchWithAuth } from "@/lib/client-fetch";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
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
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ColumnDef } from "@tanstack/react-table";
import { useApi } from "@/hooks";
import { useAuth } from "@/contexts/auth-context";
import { toast } from "sonner";
import { Building, Server, Activity, Globe, Barcode, ShieldCheck, Settings2 } from "lucide-react";

interface OrgRow {
  id: number;
  name: string;
  shortname: string;
}

interface WorkstationRow {
  id: number;
  name: string;
  owning_lib?: number;
}

interface BarcodeProfileRow {
  id: string;
  label: string;
  entity: string;
  minLength?: number;
  maxLength?: number;
  prefix?: string;
  suffix?: string;
  checkDigit?: string;
}

interface PreflightResultRow {
  index: number;
  sourceId?: string;
  barcode: string;
  completed?: string;
  entity?: string;
  valid: boolean;
  duplicate?: boolean;
  errors?: string[];
}

export default function AdminPage() {
  const router = useRouter();
  const { orgs } = useAuth();
  const [selectedOrgId, setSelectedOrgId] = useState<number | null>(null);
  const [workstationName, setWorkstationName] = useState("");
  const [isRegistering, setIsRegistering] = useState(false);
  const [barcodeProfileId, setBarcodeProfileId] = useState<string>("");
  const [barcodeInput, setBarcodeInput] = useState("");
  const [barcodeResult, setBarcodeResult] = useState<any>(null);
  const [isValidatingBarcode, setIsValidatingBarcode] = useState(false);
  const [preflightProfileId, setPreflightProfileId] = useState<string>("");
  const [preflightCsv, setPreflightCsv] = useState("");
  const [preflightResult, setPreflightResult] = useState<any>(null);
  const [isPreflighting, setIsPreflighting] = useState(false);

  useEffect(() => {
    if (!selectedOrgId && orgs.length > 0) {
      setSelectedOrgId(orgs[0].id);
    }
  }, [orgs, selectedOrgId]);

  const { data: workstationData, isLoading: workstationsLoading, refetch } = useApi<any>(
    selectedOrgId ? `/api/evergreen/workstations?org_id=${selectedOrgId}` : null,
    { immediate: !!selectedOrgId, deps: [selectedOrgId] }
  );

  const { data: pingData } = useApi<any>("/api/evergreen/ping", { immediate: true });
  const { data: barcodeData } = useApi<any>("/api/stacksos/barcodes", { immediate: true });

  useEffect(() => {
    if (!barcodeProfileId && barcodeData?.profiles?.length) {
      setBarcodeProfileId(barcodeData.profiles[0].id);
    }
    if (!preflightProfileId && barcodeData?.profiles?.length) {
      setPreflightProfileId(barcodeData.profiles[0].id);
    }
  }, [barcodeData, barcodeProfileId, preflightProfileId]);

  const orgRows: OrgRow[] = useMemo(
    () => orgs.map((org) => ({ id: org.id, name: org.name, shortname: org.shortname })),
    [orgs]
  );

  const workstationRows: WorkstationRow[] = useMemo(
    () => (workstationData?.workstations || []).map((ws: any) => ({
      id: ws.id ?? ws[0] ?? 0,
      name: ws.name || ws[1] || "Unknown",
      owning_lib: ws.owning_lib || ws.owner || ws.org_unit,
    })),
    [workstationData]
  );

  const orgColumns = useMemo<ColumnDef<OrgRow>[]>(
    () => [
      { accessorKey: "name", header: "Name" },
      { accessorKey: "shortname", header: "Shortname" },
      {
        accessorKey: "id",
        header: "ID",
        cell: ({ row }) => <span className="font-mono text-xs">{row.original.id}</span>,
      },
    ],
    []
  );

  const workstationColumns = useMemo<ColumnDef<WorkstationRow>[]>(
    () => [
      { accessorKey: "name", header: "Workstation" },
      {
        accessorKey: "id",
        header: "ID",
        cell: ({ row }) => <span className="font-mono text-xs">{row.original.id}</span>,
      },
      {
        accessorKey: "owning_lib",
        header: "Org ID",
        cell: ({ row }) => <span className="font-mono text-xs">{row.original.owning_lib ?? "—"}</span>,
      },
    ],
    []
  );

  const barcodeProfiles: BarcodeProfileRow[] = useMemo(
    () => (barcodeData?.profiles || []) as BarcodeProfileRow[],
    [barcodeData]
  );

  const barcodeColumns = useMemo<ColumnDef<BarcodeProfileRow>[]>(
    () => [
      { accessorKey: "label", header: "Profile" },
      { accessorKey: "entity", header: "Entity" },
      {
        accessorKey: "minLength",
        header: "Min",
        cell: ({ row }) => row.original.minLength ?? "—",
      },
      {
        accessorKey: "maxLength",
        header: "Max",
        cell: ({ row }) => row.original.maxLength ?? "—",
      },
      {
        accessorKey: "checkDigit",
        header: "Check",
        cell: ({ row }) => row.original.checkDigit ?? "none",
      },
      {
        accessorKey: "prefix",
        header: "Prefix",
        cell: ({ row }) => row.original.prefix ?? "—",
      },
    ],
    []
  );

  const preflightRows: PreflightResultRow[] = useMemo(
    () => (preflightResult?.results || []) as PreflightResultRow[],
    [preflightResult]
  );

  const preflightColumns = useMemo<ColumnDef<PreflightResultRow>[]>(
    () => [
      {
        accessorKey: "index",
        header: "Row",
        cell: ({ row }) => <span className="font-mono text-xs">{row.original.index + 1}</span>,
      },
      { accessorKey: "barcode", header: "Barcode" },
      {
        accessorKey: "completed",
        header: "Normalized",
        cell: ({ row }) => row.original.completed ?? "—",
      },
      { accessorKey: "entity", header: "Entity" },
      {
        accessorKey: "valid",
        header: "Status",
        cell: ({ row }) => (
          row.original.valid ? (
            <StatusBadge label={row.original.duplicate ? "Duplicate" : "Valid"} status={row.original.duplicate ? "warning" : "success"} />
          ) : (
            <StatusBadge label="Invalid" status="error" />
          )
        ),
      },
      {
        accessorKey: "errors",
        header: "Errors",
        cell: ({ row }) => row.original.errors?.join("; ") ?? "—",
      },
    ],
    []
  );

  const handleRegisterWorkstation = async () => {
    if (!workstationName.trim() || !selectedOrgId) {
      toast.error("Enter a workstation name and choose an org");
      return;
    }

	    setIsRegistering(true);
	    try {
	      const res = await fetchWithAuth("/api/evergreen/workstations", {
	        method: "POST",
	        headers: { "Content-Type": "application/json" },
	        body: JSON.stringify({ name: workstationName.trim(), org_id: selectedOrgId }),
	      });
      const data = await res.json();

      if (data.ok) {
        toast.success("Workstation registered", { description: workstationName });
        setWorkstationName("");
        await refetch();
      } else {
        toast.error(data.error || "Registration failed");
      }
    } catch (_error) {
      toast.error("Registration failed");
    } finally {
      setIsRegistering(false);
    }
  };

  const handleValidateBarcode = async () => {
    if (!barcodeProfileId) {
      toast.error("Select a barcode profile");
      return;
    }
    if (!barcodeInput.trim()) {
      toast.error("Enter a barcode to validate");
      return;
    }

	    setIsValidatingBarcode(true);
	    try {
	      const res = await fetchWithAuth("/api/stacksos/barcodes", {
	        method: "POST",
	        headers: { "Content-Type": "application/json" },
	        body: JSON.stringify({ barcode: barcodeInput.trim(), profileId: barcodeProfileId }),
	      });
      const data = await res.json();
      if (data.ok) {
        setBarcodeResult(data.result);
      } else {
        toast.error(data.error || "Validation failed");
      }
    } catch (_error) {
      toast.error("Validation failed");
    } finally {
      setIsValidatingBarcode(false);
    }
  };

  const parsePreflightCsv = () => {
    const lines = preflightCsv
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    if (lines.length === 0) return [];

    const header = lines[0].split(",").map((h) => h.trim().toLowerCase());
    const hasHeader = header.includes("barcode");
    const startIndex = hasHeader ? 1 : 0;

    return lines.slice(startIndex).map((line, idx) => {
      const columns = line.split(",").map((c) => c.trim());
      if (hasHeader) {
        const record: any = {};
        header.forEach((key, i) => {
          record[key] = columns[i];
        });
        return {
          barcode: record.barcode,
          profileId: record.profileid || record.profileId || preflightProfileId,
          entity: record.entity,
          sourceId: record.sourceid || record.sourceId || `row-${idx + 1}`,
        };
      }
      return {
        barcode: columns[0],
        profileId: preflightProfileId,
        sourceId: `row-${idx + 1}`,
      };
    });
  };

  const handlePreflight = async () => {
    if (!preflightProfileId) {
      toast.error("Select a barcode profile");
      return;
    }
    const records = parsePreflightCsv();
    if (records.length === 0) {
      toast.error("Paste CSV data to preflight");
      return;
    }

	    setIsPreflighting(true);
	    try {
	      const res = await fetchWithAuth("/api/stacksos/migration/preflight", {
	        method: "POST",
	        headers: { "Content-Type": "application/json" },
	        body: JSON.stringify({ records }),
	      });
      const data = await res.json();
      if (data.ok) {
        setPreflightResult(data);
      } else {
        toast.error(data.error || "Preflight failed");
      }
    } catch (_error) {
      toast.error("Preflight failed");
    } finally {
      setIsPreflighting(false);
    }
  };

  return (
    <PageContainer>
      <PageHeader
        title="Administration"
        subtitle="Org structure, workstations, and Evergreen connectivity."
        breadcrumbs={[{ label: "Administration" }]}
        actions={[
          {
            label: "Setup Guide",
            onClick: () => router.push("/staff/help#evergreen-setup"),
            icon: Globe,
          },
          {
            label: "Policy Inspector",
            onClick: () => router.push("/staff/admin/policy-inspector"),
            icon: Settings2,
            variant: "outline",
          },
        ]}
      />
      <PageContent>
        <div className="grid gap-6 lg:grid-cols-[360px,1fr]">
          <div className="space-y-6">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Activity className="h-4 w-4" /> Evergreen Status
                </CardTitle>
                <CardDescription>Connectivity to the Evergreen gateway</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="flex items-center justify-between">
                  <span>Gateway</span>
                  {pingData?.ok ? (
                    <StatusBadge label="Online" status="success" />
                  ) : (
                    <StatusBadge label="Offline" status="error" />
                  )}
                </div>
                {pingData?.status && (
                  <div className="text-xs text-muted-foreground">Status {pingData.status}</div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Building className="h-4 w-4" /> Organization Units
                </CardTitle>
                <CardDescription>Flattened org tree from Evergreen</CardDescription>
              </CardHeader>
              <CardContent>
                <DataTable
                  columns={orgColumns}
                  data={orgRows}
                  searchable={true}
                  searchPlaceholder="Search orgs..."
                  paginated={false}
                  emptyState={<EmptyState title="No org units" description="No org units loaded. If this is unexpected, check Evergreen connectivity and your session." />}
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Barcode className="h-4 w-4" /> Barcode Profiles
                </CardTitle>
                <CardDescription>Normalize and validate barcodes for migration and scanning.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <DataTable
                  columns={barcodeColumns}
                  data={barcodeProfiles}
                  searchable={false}
                  paginated={false}
                  emptyState={<EmptyState title="No profiles" description="No barcode profiles configured." />}
                />
                <div className="grid gap-3 sm:grid-cols-[1fr,220px]">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Profile</label>
                    <Select value={barcodeProfileId} onValueChange={setBarcodeProfileId}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select profile" />
                      </SelectTrigger>
                      <SelectContent>
                        {barcodeProfiles.map((profile) => (
                          <SelectItem key={profile.id} value={profile.id}>
                            {profile.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Test Barcode</label>
                    <Input
                      value={barcodeInput}
                      onChange={(e) => setBarcodeInput(e.target.value)}
                      placeholder="Scan or paste barcode"
                    />
                  </div>
                </div>
                <Button onClick={handleValidateBarcode} disabled={isValidatingBarcode}>
                  {isValidatingBarcode ? "Validating..." : "Validate Barcode"}
                </Button>
                {barcodeResult && (
                  <div className="rounded-lg border p-3 text-sm space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="font-medium">Normalized</span>
                      <span className="font-mono">{barcodeResult.normalized}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="font-medium">Completed</span>
                      <span className="font-mono">{barcodeResult.completed}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="font-medium">Status</span>
                      {barcodeResult.valid ? (
                        <StatusBadge label="Valid" status="success" />
                      ) : (
                        <StatusBadge label="Invalid" status="error" />
                      )}
                    </div>
                    {!barcodeResult.valid && barcodeResult.errors?.length > 0 && (
                      <div className="text-xs text-destructive">{barcodeResult.errors.join("; ")}</div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Server className="h-4 w-4" /> Workstations
                </CardTitle>
                <CardDescription>Register and manage circulation workstations</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-[1fr,180px]">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Organization</label>
                    <Select
                      value={selectedOrgId ? String(selectedOrgId) : ""}
                      onValueChange={(value) => setSelectedOrgId(parseInt(value, 10))}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select org" />
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
                  <div className="space-y-2">
                    <label className="text-sm font-medium">New Workstation</label>
                    <Input
                      value={workstationName}
                      onChange={(e) => setWorkstationName(e.target.value)}
                      placeholder="StacksOS-Desk-01"
                    />
                  </div>
                </div>
                <Button onClick={handleRegisterWorkstation} disabled={isRegistering}>
                  {isRegistering ? "Registering..." : "Register Workstation"}
                </Button>

                <DataTable
                  columns={workstationColumns}
                  data={workstationRows}
                  isLoading={workstationsLoading}
                  searchable={false}
                  paginated={false}
                  emptyState={
                    <EmptyState
                      title="No workstations"
                      description="Register a workstation to enable circulation login."
                    />
                  }
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4" /> Migration Preflight
                </CardTitle>
                <CardDescription>Validate imported barcodes before migration.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-[1fr,220px]">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Barcode Profile</label>
                    <Select value={preflightProfileId} onValueChange={setPreflightProfileId}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select profile" />
                      </SelectTrigger>
                      <SelectContent>
                        {barcodeProfiles.map((profile) => (
                          <SelectItem key={profile.id} value={profile.id}>
                            {profile.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <Textarea
                  value={preflightCsv}
                  onChange={(e) => setPreflightCsv(e.target.value)}
                  placeholder="Paste CSV (barcode,profileId,entity optional)"
                  className="min-h-[120px]"
                />
                <Button onClick={handlePreflight} disabled={isPreflighting}>
                  {isPreflighting ? "Running preflight..." : "Run Preflight"}
                </Button>

                {preflightResult?.summary && (
                  <div className="grid gap-3 sm:grid-cols-4 text-sm">
                    <div className="rounded-md border p-3">
                      <div className="text-xs text-muted-foreground">Total</div>
                      <div className="text-lg font-semibold">{preflightResult.summary.total}</div>
                    </div>
                    <div className="rounded-md border p-3">
                      <div className="text-xs text-muted-foreground">Valid</div>
                      <div className="text-lg font-semibold text-emerald-600">{preflightResult.summary.valid}</div>
                    </div>
                    <div className="rounded-md border p-3">
                      <div className="text-xs text-muted-foreground">Invalid</div>
                      <div className="text-lg font-semibold text-destructive">{preflightResult.summary.invalid}</div>
                    </div>
                    <div className="rounded-md border p-3">
                      <div className="text-xs text-muted-foreground">Duplicates</div>
                      <div className="text-lg font-semibold text-yellow-600">{preflightResult.summary.duplicates}</div>
                    </div>
                  </div>
                )}

                {preflightRows.length > 0 && (
                  <DataTable
                    columns={preflightColumns}
                    data={preflightRows}
                    searchable={true}
                    searchPlaceholder="Filter results..."
                    paginated={false}
                  />
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </PageContent>
    </PageContainer>
  );
}
