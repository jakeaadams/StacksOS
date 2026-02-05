"use client";

import { PageContainer, PageHeader, PageContent } from "@/components/shared";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

export default function HelpPage() {
  return (
    <PageContainer>
      <PageHeader
        title="Help & Documentation"
        subtitle="How StacksOS works (Evergreen-backed), plus the basics for daily staff workflows."
        breadcrumbs={[{ label: "Help" }]}
      />

      <PageContent className="space-y-6">
        <div className="grid gap-6 lg:grid-cols-2">
          <Card className="rounded-2xl border-border/70">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Getting started</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-muted-foreground">
              <div>
                <p className="font-medium text-foreground">Login</p>
                <p>Use your Evergreen staff username and password.</p>
              </div>
              <div>
                <p className="font-medium text-foreground">Why the workstation exists</p>
                <p>
                  Evergreen associates staff circulation activity with a workstation (a registered device + service
                  location). StacksOS auto-registers a workstation per device and branch so you don&apos;t have to.
                </p>
              </div>
              <div>
                <p className="font-medium text-foreground">Switching locations</p>
                <p>
                  Use the location menu in the header. StacksOS will sign you out and guide you back through login,
                  ensuring Evergreen context is correct for the selected branch.
                </p>
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-2xl border-border/70">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Keyboard-first workflows</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-muted-foreground">
              <div className="flex flex-wrap gap-2">
                <Badge variant="secondary" className="rounded-full">
                  Ctrl/⌘+K
                </Badge>
                <Badge variant="secondary" className="rounded-full">
                  Ctrl/⌘+B
                </Badge>
                <Badge variant="secondary" className="rounded-full">
                  Esc
                </Badge>
                <Badge variant="secondary" className="rounded-full">
                  Ctrl/⌘+P
                </Badge>
              </div>
              <p>
                StacksOS is optimized for barcode scanning and minimal mouse use. Use the keyboard shortcuts icon in
                the header to view the latest key map.
              </p>
              <Separator />
              <div>
                <p className="font-medium text-foreground">Printing</p>
                <p>
                  Receipts and slips print using your browser&apos;s print dialog. If you do not see a print dialog, make
                  sure pop-up blockers are disabled for StacksOS.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card id="evergreen-setup" className="rounded-2xl border-border/70">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Evergreen setup checklist</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>
              StacksOS uses Evergreen as the system of record. Some StacksOS screens will show empty states until the
              Evergreen sandbox has real data configured.
            </p>
            <ul className="list-disc list-inside space-y-1">
              <li>
                Workstations: ensure staff can register a workstation and that workstation policies are configured.
              </li>
              <li>
                Acquisitions: configure at least one vendor and fund (otherwise Orders/Receiving/Invoices will be
                empty).
              </li>
              <li>
                Booking: configure resource types and resources (otherwise Booking will be empty).
              </li>
              <li>
                Serials: configure subscriptions/routing (otherwise Serials pages will be empty).
              </li>
              <li>
                Z39.50: configure targets before expecting copy cataloging to return results.
              </li>
            </ul>
            <p className="text-xs text-muted-foreground">
              Tip: open the Administration page for connectivity + org tree + barcode profile tools.
            </p>
          </CardContent>
        </Card>

        <Card id="demo-data" className="rounded-2xl border-border/70">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Seed demo data (sandbox)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>
              If you are evaluating StacksOS in a fresh Evergreen sandbox, seed realistic demo data to avoid empty
              screens (patrons, bibs/items, acquisitions, serials, booking, authority).
            </p>
            <div className="rounded-lg border bg-muted/30 p-3 text-xs">
              <div className="font-mono">node scripts/seed-sandbox-demo-data.mjs</div>
              <div className="mt-2 text-muted-foreground">
                Optional env: <span className="font-mono">STACKSOS_BASE_URL</span>,{" "}
                <span className="font-mono">SEED_STAFF_USERNAME</span>,{" "}
                <span className="font-mono">SEED_STAFF_PASSWORD</span>,{" "}
                <span className="font-mono">SEED_WORKSTATION</span>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              This writes <span className="font-mono">audit/demo_data.json</span> which the automated audits use for
              stable barcodes.
            </p>
          </CardContent>
        </Card>

        <Card id="serials" className="rounded-2xl border-border/70">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Serials setup</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p>
              Serials screens require Evergreen subscriptions and (optionally) routing lists. If Serials is empty:
            </p>
            <ul className="list-disc list-inside space-y-1">
              <li>Create at least one subscription in Evergreen.</li>
              <li>Create a distribution + stream (routing lists are keyed by stream).</li>
              <li>Optional: configure routing users for that stream.</li>
            </ul>
            <p className="text-xs text-muted-foreground">
              Tip: the seed script creates a minimal demo subscription + routing entry for sandbox installs.
            </p>
          </CardContent>
        </Card>

        <Card id="runbook" className="rounded-2xl border-border/70">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Runbook (operator quickstart)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>These are the minimum operational commands for pilots:</p>
            <div className="rounded-lg border bg-muted/30 p-3 text-xs space-y-1">
              <div className="font-mono">BASE_URL=http://127.0.0.1:3000 ./audit/run_all.sh</div>
              <div className="font-mono">STACKSOS_AUDIT_MUTATE=1 BASE_URL=http://127.0.0.1:3000 ./audit/run_all.sh</div>
            </div>
            <p className="text-xs text-muted-foreground">
              Mutation mode should be used only on sandboxes or controlled staging environments.
            </p>
          </CardContent>
        </Card>

        <Card id="ill" className="rounded-2xl border-border/70">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">ILL (Interlibrary Loan)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p>
              StacksOS will expose ILL workflows once an integration is implemented. For now, ILL is hidden by
              default (no dead UI).
            </p>
            <p className="text-xs text-muted-foreground">
              If you enable experimental features, the ILL page is informational only.
            </p>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-border/70">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Troubleshooting</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <div>
              <p className="font-medium text-foreground">LOGIN_FAILED</p>
              <p>
                This typically means the username/password is incorrect, or Evergreen returned an authentication
                error. Try again, or confirm the staff account exists in Evergreen.
              </p>
            </div>
            <div>
              <p className="font-medium text-foreground">Workstation errors</p>
              <p>
                If Evergreen reports a workstation is missing, StacksOS will attempt to register it automatically.
                If the workstation already exists, registration will succeed and login will continue.
              </p>
            </div>
            <div>
              <p className="font-medium text-foreground">Reset this device</p>
              <p>
                If workstation context ever gets confused, sign out and log back in. StacksOS stores workstation
                info in your browser storage for convenience.
              </p>
            </div>
          </CardContent>
        </Card>
      </PageContent>
    </PageContainer>
  );
}
