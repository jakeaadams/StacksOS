"use client";

import { fetchWithAuth } from "@/lib/client-fetch";

import { useMemo, useState, useCallback } from "react";
import { ColumnDef } from "@tanstack/react-table";
import {

  PageContainer,
  PageHeader,
  PageContent,
  DataTable,
  LoadingSpinner,
  EmptyState,
  StatusBadge,
  BarcodeInput,
} from "@/components/shared";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { AlertTriangle, AlertCircle, Search, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { clientLogger } from "@/lib/client-logger";

interface PatronAlert {
  id: number;
  patronId: number;
  patronName: string;
  patronBarcode: string;
  type: string;
  message: string;
  severity: "high" | "medium" | "low";
  createdDate: string;
}

export default function PatronAlertsPage() {
  const [alerts, setAlerts] = useState<PatronAlert[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [patronBarcode, setPatronBarcode] = useState("");
  const [loading, setLoading] = useState(false);

  const fetchPatronAlerts = useCallback(async (barcode: string) => {
    if (!barcode.trim()) return;

    setLoading(true);
    try {
      const patronRes = await fetchWithAuth(`/api/evergreen/patrons?barcode=${encodeURIComponent(barcode)}`);
      const patronData = await patronRes.json();

      if (!patronData.ok || !patronData.patron) {
        toast.error("Patron not found");
        return;
      }

      const patron = patronData.patron;
      const patronName = `${patron.family_name || ""}, ${patron.first_given_name || ""}`.trim();

      const penalties = patron.standing_penalties || [];
      const mappedAlerts: PatronAlert[] = penalties.map((p: any) => {
        let type = "note";
        let severity: "high" | "medium" | "low" = "low";

        const penaltyName = p.standing_penalty?.name || p.name || "";
        if (penaltyName.includes("CIRC") || penaltyName.includes("BLOCK")) {
          type = "block";
          severity = "high";
        } else if (penaltyName.includes("HOLD")) {
          type = "hold_block";
          severity = "medium";
        } else if (penaltyName.includes("RENEW")) {
          type = "renew_block";
          severity = "medium";
        }

        return {
          id: p.id,
          patronId: patron.id,
          patronName,
          patronBarcode: barcode,
          type,
          message: p.note || p.standing_penalty?.label || penaltyName || "Penalty applied",
          severity,
          createdDate: p.set_date ? new Date(p.set_date).toLocaleDateString() : "",
        };
      });

      if (patron.expire_date) {
        const expireDate = new Date(patron.expire_date);
        if (expireDate < new Date()) {
          mappedAlerts.push({
            id: -1,
            patronId: patron.id,
            patronName,
            patronBarcode: barcode,
            type: "expired",
            message: `Library card expired on ${expireDate.toLocaleDateString()}`,
            severity: "medium",
            createdDate: expireDate.toLocaleDateString(),
          });
        }
      }

      setAlerts(mappedAlerts);
      if (mappedAlerts.length === 0) {
        toast.info("No alerts for this patron");
      }
    } catch (err) {
      clientLogger.error("Failed to fetch alerts:", err);
      toast.error("Failed to load patron alerts");
    } finally {
      setLoading(false);
    }
  }, []);

  const filteredAlerts = useMemo(() => {
    if (!searchQuery) return alerts;
    const term = searchQuery.toLowerCase();
    return alerts.filter((alert) =>
      `${alert.message} ${alert.type} ${alert.patronName}`.toLowerCase().includes(term)
    );
  }, [alerts, searchQuery]);

  const columns = useMemo<ColumnDef<PatronAlert>[]>(
    () => [
      {
        accessorKey: "severity",
        header: "Severity",
        cell: ({ row }) => {
          const severity = row.getValue("severity") as "high" | "medium" | "low";
          const label = severity === "high" ? "High" : severity === "medium" ? "Medium" : "Low";
          const status = severity === "high" ? "error" : severity === "medium" ? "warning" : "info";
          return <StatusBadge label={label} status={status} />;
        },
      },
      {
        accessorKey: "type",
        header: "Type",
        cell: ({ row }) => row.getValue("type"),
      },
      {
        accessorKey: "message",
        header: "Message",
        cell: ({ row }) => row.getValue("message"),
      },
      {
        accessorKey: "createdDate",
        header: "Created",
      },
    ],
    []
  );

  return (
    <PageContainer>
      <PageHeader
        title="Patron Alerts"
        subtitle="Review blocks, penalties, and important patron notices."
        breadcrumbs={[{ label: "Patrons", href: "/staff/patrons" }, { label: "Alerts" }]}
        actions={[
          {
            label: "Refresh",
            onClick: () => fetchPatronAlerts(patronBarcode),
            icon: RefreshCw,
          },
        ]}
      >
        <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
          <BarcodeInput
            label="Patron Barcode"
            placeholder="Scan or enter patron barcode"
            value={patronBarcode}
            onChange={setPatronBarcode}
            onSubmit={fetchPatronAlerts}
            isLoading={loading}
            autoFocus
          />
          <div className="flex items-end">
            <Button onClick={() => fetchPatronAlerts(patronBarcode)} disabled={loading}>
              <Search className="h-4 w-4 mr-2" />Search
            </Button>
          </div>
        </div>
      </PageHeader>
      <PageContent>
        {loading ? (
          <LoadingSpinner message="Loading patron alerts..." />
        ) : (
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <AlertTriangle className="h-4 w-4" />Alert Summary
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="mb-4 flex items-center gap-2">
                <Input
                  placeholder="Filter alerts..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
                <Button variant="outline" size="sm" onClick={() => setSearchQuery("")}>Clear</Button>
              </div>
              <DataTable
                columns={columns}
                data={filteredAlerts}
                searchable={false}
                emptyState={
                  <EmptyState
                    icon={AlertCircle}
                    title="No alerts found"
                    description="Search a patron barcode to review active alerts and penalties."
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
