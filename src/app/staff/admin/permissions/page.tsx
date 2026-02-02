"use client";

import { useMemo } from "react";
import Link from "next/link";

import { useAuth } from "@/contexts/auth-context";
import { useApi } from "@/hooks";

import {
  PageContainer,
  PageHeader,
  PageContent,
  LoadingSpinner,
  EmptyState,
  StatusBadge,
} from "@/components/shared";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

import { CheckCircle2, XCircle, RefreshCw, Shield, ExternalLink } from "lucide-react";

type PermissionItem = {
  code: string;
  label: string;
  description: string;
  evergreenHint: string;
};

type PermissionSection = {
  title: string;
  description: string;
  items: PermissionItem[];
};

const SECTIONS: PermissionSection[] = [
  {
    title: "Circulation",
    description: "Checkout/checkin, holds, claims, payments, overrides.",
    items: [
      {
        code: "COPY_CHECKOUT",
        label: "Checkout items",
        description: "Allows staff to check out copies to patrons.",
        evergreenHint: "Evergreen Admin → Permission Groups → circulation perms",
      },
      {
        code: "COPY_CHECKIN",
        label: "Checkin items",
        description: "Allows staff to check in copies and trigger routing decisions.",
        evergreenHint: "Evergreen Admin → Permission Groups → circulation perms",
      },
      {
        code: "CIRC_OVERRIDE_DUE_DATE",
        label: "Override due date",
        description: "Allows overriding due dates when policy blocks a checkout.",
        evergreenHint: "Evergreen Admin → Permission Groups → circulation overrides",
      },
      {
        code: "MARK_ITEM_CLAIMS_RETURNED",
        label: "Mark claims returned",
        description: "Allows resolving claims returned and related stop-fines states.",
        evergreenHint: "Evergreen Admin → Permission Groups → circulation perms",
      },
      {
        code: "MAKE_PAYMENTS",
        label: "Take payments",
        description: "Allows posting payments and waives (where configured).",
        evergreenHint: "Evergreen Admin → Permission Groups → money perms",
      },
      {
        code: "REFUND_PAYMENT",
        label: "Refund payments",
        description: "Allows refunding a payment transaction.",
        evergreenHint: "Evergreen Admin → Permission Groups → money perms",
      },
    ],
  },
  {
    title: "Patrons",
    description: "Create/edit patrons, blocks/penalties, notes.",
    items: [
      {
        code: "CREATE_USER",
        label: "Create patrons",
        description: "Allows creating new patron accounts.",
        evergreenHint: "Evergreen Admin → Permission Groups → patron perms",
      },
      {
        code: "UPDATE_USER",
        label: "Edit patrons",
        description: "Allows editing patron core fields and addresses.",
        evergreenHint: "Evergreen Admin → Permission Groups → patron perms",
      },
      {
        code: "VIEW_USER",
        label: "View staff users",
        description: "Allows listing and searching staff accounts (Administration → Users).",
        evergreenHint: "Evergreen Admin → Permission Groups → staff/admin perms",
      },
    ],
  },
  {
    title: "Cataloging",
    description: "MARC, holdings, item status.",
    items: [
      {
        code: "CREATE_MARC",
        label: "Create / import bibliographic records",
        description: "Allows creating new bib records and importing MARC.",
        evergreenHint: "Evergreen Admin → Permission Groups → cataloging perms",
      },
      {
        code: "UPDATE_MARC",
        label: "Edit MARC",
        description: "Allows updating MARC for existing bib records.",
        evergreenHint: "Evergreen Admin → Permission Groups → cataloging perms",
      },
      {
        code: "ADMIN_COPY_STATUS",
        label: "Manage item statuses",
        description: "Allows editing copy statuses and related status flags.",
        evergreenHint: "Evergreen Admin → Local Administration → Copy Statuses",
      },
    ],
  },
  {
    title: "Acquisitions",
    description: "P.O.s, receiving, cancel/claim.",
    items: [
      {
        code: "VIEW_FUND",
        label: "View funds",
        description: "Allows viewing acquisitions funds.",
        evergreenHint: "Evergreen Admin → Permission Groups → acquisitions perms",
      },
      {
        code: "VIEW_PROVIDER",
        label: "View vendors",
        description: "Allows viewing vendor/provider records.",
        evergreenHint: "Evergreen Admin → Permission Groups → acquisitions perms",
      },
      {
        code: "ADMIN_ACQ_CLAIM",
        label: "Claim lineitems",
        description: "Allows claiming acquisitions lineitems (vendor follow-up).",
        evergreenHint: "Evergreen Admin → Permission Groups → acquisitions admin perms",
      },
    ],
  },
  {
    title: "Administration",
    description: "Workstations, org settings, server admin.",
    items: [
      {
        code: "ADMIN_WORKSTATION",
        label: "Manage workstations",
        description: "Allows registering and managing circulation workstations.",
        evergreenHint: "Evergreen Admin → Local Administration → Workstations",
      },
      {
        code: "ADMIN_ORG_UNIT",
        label: "Manage org units",
        description: "Allows editing org units and settings inheritance.",
        evergreenHint: "Evergreen Admin → Server Administration → Org Units",
      },
    ],
  },
];

export default function PermissionsInspectorPage() {
  const { user } = useAuth();

  const allPerms = useMemo(() => {
    const uniq = new Set<string>();
    SECTIONS.flatMap((s) => s.items).forEach((p) => uniq.add(p.code));
    return Array.from(uniq);
  }, []);

  const permsQuery = useMemo(() => encodeURIComponent(allPerms.join(",")), [allPerms]);

  const {
    data: permData,
    isLoading,
    error,
    refetch,
  } = useApi<any>(`/api/evergreen/perm-check?perms=${permsQuery}`, {
    immediate: true,
    revalidateOnFocus: false,
    revalidateInterval: 5 * 60_000,
  });

  const perms: Record<string, boolean> = permData?.perms || {};
  const evergreenOrgId = permData?.orgId ?? null;

  return (
    <PageContainer>
      <PageHeader
        title="Permissions Inspector"
        subtitle="See what your account can do (Evergreen-backed) and where to configure it."
        breadcrumbs={[
          { label: "Administration", href: "/staff/admin" },
          { label: "Permissions" },
        ]}
        actions={[
          { label: "Refresh", onClick: () => void refetch(), icon: RefreshCw, variant: "outline" },
        ]}
      >
        <StatusBadge
          label={user?.profileName ? `Role: ${user.profileName}` : "Role: —"}
          status="info"
        />
        {evergreenOrgId ? (
          <Badge variant="secondary" className="rounded-full">
            Work-perms at OU {evergreenOrgId}
          </Badge>
        ) : null}
      </PageHeader>

      <PageContent className="space-y-6">
        <Card className="rounded-2xl">
          <CardHeader>
            <CardTitle className="text-base">Your session</CardTitle>
            <CardDescription>Role/profile names come from Evergreen permission groups.</CardDescription>
          </CardHeader>
          <CardContent className="text-sm space-y-2">
            <div className="flex items-center justify-between gap-4">
              <span className="text-muted-foreground">User</span>
              <span className="font-medium">{user?.displayName || "—"}</span>
            </div>
            <div className="flex items-center justify-between gap-4">
              <span className="text-muted-foreground">Username</span>
              <span className="font-mono text-xs">{user?.username || "—"}</span>
            </div>
            <div className="flex items-center justify-between gap-4">
              <span className="text-muted-foreground">Home library</span>
              <span className="font-medium">{user?.homeLibrary || "—"}</span>
            </div>
            <div className="flex items-center justify-between gap-4">
              <span className="text-muted-foreground">Active org</span>
              <span className="font-medium">{user?.activeOrgName || "—"}</span>
            </div>
            <div className="flex items-center justify-between gap-4">
              <span className="text-muted-foreground">Workstation</span>
              <span className="font-mono text-xs">{user?.workstation || "—"}</span>
            </div>
          </CardContent>
        </Card>

        {isLoading ? <LoadingSpinner message="Checking permissions..." /> : null}

        {error ? (
          <EmptyState
            title="Could not check permissions"
            description={String(error)}
            action={{ label: "Try again", onClick: () => void refetch(), icon: RefreshCw }}
          />
        ) : null}

        {!isLoading && !error ? (
          <div className="grid gap-4">
            {SECTIONS.map((section) => (
              <Card key={section.title} className="rounded-2xl">
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Shield className="h-4 w-4 text-muted-foreground" />
                    {section.title}
                  </CardTitle>
                  <CardDescription>{section.description}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {section.items.map((item) => {
                    const allowed = Boolean(perms[item.code]);
                    return (
                      <div
                        key={item.code}
                        className="rounded-xl border border-border/70 bg-muted/10 px-3 py-2"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="font-medium">{item.label}</div>
                            <div className="text-xs text-muted-foreground">{item.description}</div>
                            <div className="mt-1 text-[11px] text-muted-foreground font-mono">
                              {item.code}
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge
                              variant={allowed ? "default" : "secondary"}
                              className="rounded-full"
                            >
                              {allowed ? (
                                <span className="inline-flex items-center gap-1">
                                  <CheckCircle2 className="h-3.5 w-3.5" /> Allowed
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1">
                                  <XCircle className="h-3.5 w-3.5" /> Denied
                                </span>
                              )}
                            </Badge>
                          </div>
                        </div>
                        <div className="mt-2 text-xs text-muted-foreground">
                          Configure: {item.evergreenHint}
                        </div>
                      </div>
                    );
                  })}
                </CardContent>
              </Card>
            ))}
          </div>
        ) : null}

        <Card className="rounded-2xl">
          <CardHeader>
            <CardTitle className="text-base">Next steps</CardTitle>
            <CardDescription>Make StacksOS-first admin possible.</CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground space-y-2">
            <div>
              If a permission is denied and you expected it to be allowed, update the user’s permission group in
              Evergreen, then re-login to refresh the session.
            </div>
            <div className="flex flex-wrap gap-2 pt-2">
              <Button variant="outline" size="sm" asChild>
                <Link href="/staff/admin/policy-inspector">
                  Policy Inspector <ExternalLink className="h-3.5 w-3.5 ml-1" />
                </Link>
              </Button>
              <Button variant="outline" size="sm" asChild>
                <Link href="/staff/admin/users">
                  Staff Users <ExternalLink className="h-3.5 w-3.5 ml-1" />
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </PageContent>
    </PageContainer>
  );
}

