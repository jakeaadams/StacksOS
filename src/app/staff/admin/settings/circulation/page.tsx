"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  PageContainer,
  PageHeader,
  PageContent,
  DataTable,
  EmptyState,
  LoadingSpinner,
  StatusBadge,
} from "@/components/shared";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { useAuth } from "@/contexts/auth-context";
import { fetchWithAuth } from "@/lib/client-fetch";
import { toast } from "sonner";
import { ColumnDef } from "@tanstack/react-table";
import {
  BookOpen,
  RefreshCw,
  Eye,
  Building2,
  Users,
  MapPin,
  Clock,
  DollarSign,
  Hash,
  CheckCircle,
  XCircle,
  AlertCircle,
} from "lucide-react";

interface CircPolicy {
  id: number;
  active: boolean;
  orgUnit: number;
  orgUnitName: string | null;
  grp: number;
  grpName: string | null;
  circModifier: string | null;
  copyLocation: number | null;
  copyLocationName: string | null;
  isRenewal: boolean | null;
  refFlag: boolean | null;
  usrAgeUpperBound: string | null;
  usrAgeLowerBound: string | null;
  itemAgeRange: string | null;
  circulate: boolean;
  durationRule: number | null;
  recurringFineRule: number | null;
  maxFineRule: number | null;
  hardDueDate: number | null;
  renewalExtends: number | null;
  gracePeriod: string | null;
}

export default function CirculationPoliciesPage() {
  const _router = useRouter();
  const { orgs: _orgs } = useAuth();
  const [policies, setPolicies] = useState<CircPolicy[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedPolicy, setSelectedPolicy] = useState<CircPolicy | null>(null);

  const loadPolicies = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await fetchWithAuth(
        `/api/evergreen/admin-settings?type=circ_policies&limit=200`
      );
      const data = await response.json();

      if (data.ok) {
        setPolicies(data.policies || []);
      } else {
        toast.error(data.error || "Failed to load policies");
      }
    } catch (_error) {
      toast.error("Failed to load policies");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPolicies();
  }, [loadPolicies]);

  const filteredPolicies = useMemo(() => {
    if (!searchQuery) return policies;
    const query = searchQuery.toLowerCase();
    return policies.filter(
      (p) =>
        p.orgUnitName?.toLowerCase().includes(query) ||
        p.grpName?.toLowerCase().includes(query) ||
        p.copyLocationName?.toLowerCase().includes(query) ||
        p.circModifier?.toLowerCase().includes(query) ||
        String(p.id).includes(query)
    );
  }, [policies, searchQuery]);

  const columns: ColumnDef<CircPolicy>[] = useMemo(
    () => [
      {
        accessorKey: "id",
        header: "ID",
        cell: ({ row }) => (
          <span className="font-mono text-xs">#{row.original.id}</span>
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
      {
        accessorKey: "orgUnitName",
        header: "Organization",
        cell: ({ row }) => (
          <div className="flex items-center gap-2">
            <Building2 className="h-4 w-4 text-muted-foreground" />
            <span>{row.original.orgUnitName || `Org ${row.original.orgUnit}`}</span>
          </div>
        ),
      },
      {
        accessorKey: "grpName",
        header: "Patron Group",
        cell: ({ row }) => (
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-muted-foreground" />
            <span>{row.original.grpName || (row.original.grp ? `Group ${row.original.grp}` : "Any")}</span>
          </div>
        ),
      },
      {
        accessorKey: "circModifier",
        header: "Circ Modifier",
        cell: ({ row }) => (
          row.original.circModifier ? (
            <Badge variant="outline">{row.original.circModifier}</Badge>
          ) : (
            <span className="text-muted-foreground text-xs">Any</span>
          )
        ),
      },
      {
        accessorKey: "copyLocationName",
        header: "Copy Location",
        cell: ({ row }) => (
          <div className="flex items-center gap-2">
            <MapPin className="h-4 w-4 text-muted-foreground" />
            <span>{row.original.copyLocationName || (row.original.copyLocation ? `Loc ${row.original.copyLocation}` : "Any")}</span>
          </div>
        ),
      },
      {
        accessorKey: "circulate",
        header: "Circulates",
        cell: ({ row }) => (
          row.original.circulate ? (
            <CheckCircle className="h-4 w-4 text-emerald-600" />
          ) : (
            <XCircle className="h-4 w-4 text-red-600" />
          )
        ),
      },
      {
        id: "actions",
        header: "",
        cell: ({ row }) => (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setSelectedPolicy(row.original)}
          >
            <Eye className="h-4 w-4 mr-1" />
            View
          </Button>
        ),
      },
    ],
    []
  );

  // Summary stats
  const stats = useMemo(() => {
    const active = policies.filter((p) => p.active).length;
    const circulating = policies.filter((p) => p.circulate).length;
    const withFines = policies.filter((p) => p.recurringFineRule).length;
    const uniqueOrgs = new Set(policies.map((p) => p.orgUnit)).size;
    return { active, circulating, withFines, uniqueOrgs };
  }, [policies]);

  if (isLoading && policies.length === 0) {
    return (
      <PageContainer>
        <PageHeader
          title="Circulation Policies"
          subtitle="View circulation matrix matchpoints."
          breadcrumbs={[
            { label: "Administration", href: "/staff/admin" },
            { label: "Settings", href: "/staff/admin/settings" },
            { label: "Circulation" },
          ]}
        />
        <PageContent>
          <LoadingSpinner message="Loading circulation policies..." />
        </PageContent>
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <PageHeader
        title="Circulation Policies"
        subtitle="View and manage circulation matrix matchpoints that determine loan rules."
        breadcrumbs={[
          { label: "Administration", href: "/staff/admin" },
          { label: "Settings", href: "/staff/admin/settings" },
          { label: "Circulation" },
        ]}
        actions={[
          { label: "Refresh", onClick: loadPolicies, icon: RefreshCw },
        ]}
      />

      <PageContent className="space-y-6">
        {/* Summary Stats */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card className="rounded-2xl">
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Total Policies</p>
                  <div className="text-2xl font-semibold mt-1">{policies.length}</div>
                </div>
                <div className="h-10 w-10 rounded-full flex items-center justify-center bg-blue-500/10 text-blue-600">
                  <BookOpen className="h-5 w-5" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-2xl">
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Active</p>
                  <div className="text-2xl font-semibold mt-1">{stats.active}</div>
                </div>
                <div className="h-10 w-10 rounded-full flex items-center justify-center bg-emerald-500/10 text-emerald-600">
                  <CheckCircle className="h-5 w-5" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-2xl">
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Organizations</p>
                  <div className="text-2xl font-semibold mt-1">{stats.uniqueOrgs}</div>
                </div>
                <div className="h-10 w-10 rounded-full flex items-center justify-center bg-purple-500/10 text-purple-600">
                  <Building2 className="h-5 w-5" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-2xl">
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">With Fines</p>
                  <div className="text-2xl font-semibold mt-1">{stats.withFines}</div>
                </div>
                <div className="h-10 w-10 rounded-full flex items-center justify-center bg-amber-500/10 text-amber-600">
                  <DollarSign className="h-5 w-5" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Policies Table */}
        <Card className="rounded-2xl">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base">Circulation Matrix Matchpoints</CardTitle>
                <CardDescription>
                  Policies are evaluated in order based on specificity. More specific matchpoints take precedence.
                </CardDescription>
              </div>
              <div className="w-72">
                <Input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search policies..."
                />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <DataTable
              columns={columns}
              data={filteredPolicies}
              isLoading={isLoading}
              searchable={false}
              paginated={filteredPolicies.length > 20}
              emptyState={
                <EmptyState
                  title="No policies found"
                  description={
                    searchQuery
                      ? "No policies match your search criteria."
                      : "No circulation policies have been configured."
                  }
                />
              }
            />
          </CardContent>
        </Card>

        {/* Information Card */}
        <Card className="rounded-2xl">
          <CardHeader>
            <CardTitle className="text-base">Understanding Circulation Policies</CardTitle>
            <CardDescription>How Evergreen determines loan rules</CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground space-y-4">
            <p>
              Circulation matrix matchpoints define the rules that apply when checking out items.
              Evergreen evaluates matchpoints based on specificity - a matchpoint that specifies
              more criteria will take precedence over a more general one.
            </p>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-lg border p-4">
                <h4 className="font-medium text-foreground mb-2 flex items-center gap-2">
                  <Users className="h-4 w-4" />
                  Matching Criteria
                </h4>
                <ul className="text-xs space-y-1">
                  <li>Organization unit hierarchy</li>
                  <li>Patron permission group</li>
                  <li>Circulation modifier</li>
                  <li>Copy location</li>
                  <li>Item/user age ranges</li>
                </ul>
              </div>
              <div className="rounded-lg border p-4">
                <h4 className="font-medium text-foreground mb-2 flex items-center gap-2">
                  <Clock className="h-4 w-4" />
                  Applied Rules
                </h4>
                <ul className="text-xs space-y-1">
                  <li>Loan duration rule</li>
                  <li>Recurring fine rule</li>
                  <li>Max fine rule</li>
                  <li>Grace period</li>
                  <li>Renewal limits</li>
                </ul>
              </div>
            </div>
            <p className="text-xs border-l-2 border-blue-500 pl-3 bg-blue-50 dark:bg-blue-950/20 py-2 rounded-r">
              <strong>Note:</strong> Modifying circulation policies requires specific Evergreen permissions.
              Changes may require staff to re-authenticate to take effect.
            </p>
          </CardContent>
        </Card>
      </PageContent>

      {/* Policy Detail Dialog */}
      <Dialog open={!!selectedPolicy} onOpenChange={() => setSelectedPolicy(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <BookOpen className="h-5 w-5" />
              Policy #{selectedPolicy?.id}
            </DialogTitle>
            <DialogDescription>
              Circulation matrix matchpoint details
            </DialogDescription>
          </DialogHeader>
          {selectedPolicy && (
            <div className="space-y-4 py-4">
              <div className="flex items-center gap-2">
                <StatusBadge
                  label={selectedPolicy.active ? "Active" : "Inactive"}
                  status={selectedPolicy.active ? "success" : "error"}
                />
                {selectedPolicy.circulate ? (
                  <Badge variant="outline" className="text-emerald-600 border-emerald-600">
                    <CheckCircle className="h-3 w-3 mr-1" />
                    Circulates
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-red-600 border-red-600">
                    <XCircle className="h-3 w-3 mr-1" />
                    Non-circulating
                  </Badge>
                )}
              </div>

              <Accordion type="single" collapsible defaultValue="matching">
                <AccordionItem value="matching">
                  <AccordionTrigger>Matching Criteria</AccordionTrigger>
                  <AccordionContent>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="flex items-center gap-3 p-3 rounded-lg border">
                        <Building2 className="h-4 w-4 text-muted-foreground" />
                        <div>
                          <Label className="text-xs text-muted-foreground">Organization</Label>
                          <p className="font-medium">
                            {selectedPolicy.orgUnitName || `Org ${selectedPolicy.orgUnit}`}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 p-3 rounded-lg border">
                        <Users className="h-4 w-4 text-muted-foreground" />
                        <div>
                          <Label className="text-xs text-muted-foreground">Patron Group</Label>
                          <p className="font-medium">
                            {selectedPolicy.grpName || (selectedPolicy.grp ? `Group ${selectedPolicy.grp}` : "Any")}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 p-3 rounded-lg border">
                        <Hash className="h-4 w-4 text-muted-foreground" />
                        <div>
                          <Label className="text-xs text-muted-foreground">Circ Modifier</Label>
                          <p className="font-medium">{selectedPolicy.circModifier || "Any"}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 p-3 rounded-lg border">
                        <MapPin className="h-4 w-4 text-muted-foreground" />
                        <div>
                          <Label className="text-xs text-muted-foreground">Copy Location</Label>
                          <p className="font-medium">
                            {selectedPolicy.copyLocationName || (selectedPolicy.copyLocation ? `Location ${selectedPolicy.copyLocation}` : "Any")}
                          </p>
                        </div>
                      </div>
                    </div>
                    {(selectedPolicy.isRenewal !== null || selectedPolicy.refFlag !== null) && (
                      <div className="mt-3 flex gap-2">
                        {selectedPolicy.isRenewal !== null && (
                          <Badge variant="secondary">
                            {selectedPolicy.isRenewal ? "Renewal Only" : "Initial Checkout Only"}
                          </Badge>
                        )}
                        {selectedPolicy.refFlag !== null && (
                          <Badge variant="secondary">
                            {selectedPolicy.refFlag ? "Reference Items" : "Non-reference Items"}
                          </Badge>
                        )}
                      </div>
                    )}
                  </AccordionContent>
                </AccordionItem>

                <AccordionItem value="rules">
                  <AccordionTrigger>Applied Rules</AccordionTrigger>
                  <AccordionContent>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="flex items-center gap-3 p-3 rounded-lg border">
                        <Clock className="h-4 w-4 text-muted-foreground" />
                        <div>
                          <Label className="text-xs text-muted-foreground">Duration Rule</Label>
                          <p className="font-medium">
                            {selectedPolicy.durationRule ? `Rule #${selectedPolicy.durationRule}` : "Not set"}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 p-3 rounded-lg border">
                        <DollarSign className="h-4 w-4 text-muted-foreground" />
                        <div>
                          <Label className="text-xs text-muted-foreground">Recurring Fine Rule</Label>
                          <p className="font-medium">
                            {selectedPolicy.recurringFineRule ? `Rule #${selectedPolicy.recurringFineRule}` : "Not set"}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 p-3 rounded-lg border">
                        <AlertCircle className="h-4 w-4 text-muted-foreground" />
                        <div>
                          <Label className="text-xs text-muted-foreground">Max Fine Rule</Label>
                          <p className="font-medium">
                            {selectedPolicy.maxFineRule ? `Rule #${selectedPolicy.maxFineRule}` : "Not set"}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 p-3 rounded-lg border">
                        <Clock className="h-4 w-4 text-muted-foreground" />
                        <div>
                          <Label className="text-xs text-muted-foreground">Grace Period</Label>
                          <p className="font-medium">{selectedPolicy.gracePeriod || "Not set"}</p>
                        </div>
                      </div>
                    </div>
                    {(selectedPolicy.renewalExtends || selectedPolicy.hardDueDate) && (
                      <div className="mt-3 grid gap-3 sm:grid-cols-2">
                        {selectedPolicy.renewalExtends && (
                          <div className="p-3 rounded-lg border">
                            <Label className="text-xs text-muted-foreground">Renewals Allowed</Label>
                            <p className="font-medium">{selectedPolicy.renewalExtends}</p>
                          </div>
                        )}
                        {selectedPolicy.hardDueDate && (
                          <div className="p-3 rounded-lg border">
                            <Label className="text-xs text-muted-foreground">Hard Due Date</Label>
                            <p className="font-medium">Rule #{selectedPolicy.hardDueDate}</p>
                          </div>
                        )}
                      </div>
                    )}
                  </AccordionContent>
                </AccordionItem>

                {(selectedPolicy.usrAgeUpperBound || selectedPolicy.usrAgeLowerBound || selectedPolicy.itemAgeRange) && (
                  <AccordionItem value="age">
                    <AccordionTrigger>Age Restrictions</AccordionTrigger>
                    <AccordionContent>
                      <div className="grid gap-3 sm:grid-cols-3">
                        {selectedPolicy.usrAgeLowerBound && (
                          <div className="p-3 rounded-lg border">
                            <Label className="text-xs text-muted-foreground">User Age Lower Bound</Label>
                            <p className="font-medium">{selectedPolicy.usrAgeLowerBound}</p>
                          </div>
                        )}
                        {selectedPolicy.usrAgeUpperBound && (
                          <div className="p-3 rounded-lg border">
                            <Label className="text-xs text-muted-foreground">User Age Upper Bound</Label>
                            <p className="font-medium">{selectedPolicy.usrAgeUpperBound}</p>
                          </div>
                        )}
                        {selectedPolicy.itemAgeRange && (
                          <div className="p-3 rounded-lg border">
                            <Label className="text-xs text-muted-foreground">Item Age Range</Label>
                            <p className="font-medium">{selectedPolicy.itemAgeRange}</p>
                          </div>
                        )}
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                )}
              </Accordion>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </PageContainer>
  );
}
