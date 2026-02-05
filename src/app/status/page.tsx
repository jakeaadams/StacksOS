"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { PageContainer, PageHeader, PageContent, StatusBadge, ErrorMessage, LoadingSpinner } from "@/components/shared";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { RefreshCw, ShieldAlert } from "lucide-react";

export default function StatusPage() {
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch("/api/status", { cache: "no-store" });
      const json = await res.json();
      if (!res.ok || json.ok === false) throw new Error(json.error || "Failed to load status");
      setData(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const evergreenOk = data?.evergreen?.ok === true;
  const incident = data?.incident || null;

  return (
    <PageContainer>
      <PageHeader
        title="Status"
        subtitle="Service status for this tenant"
        breadcrumbs={[{ label: "Status" }]}
        actions={[{ label: "Refresh", onClick: load, icon: RefreshCw, variant: "outline" as const }]}
      />
      <PageContent className="space-y-6">
        {error ? <ErrorMessage message={error} onRetry={load} /> : null}

        {loading ? (
          <LoadingSpinner message="Checking status..." />
        ) : (
          <>
            {incident ? (
              <Card className="rounded-2xl border-amber-200 bg-amber-50">
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <ShieldAlert className="h-4 w-4" />
                    Incident
                  </CardTitle>
                  <CardDescription>{incident.severity || "info"}</CardDescription>
                </CardHeader>
                <CardContent className="text-sm">
                  <div className="mb-2">{incident.message}</div>
                  <div className="text-xs text-muted-foreground">
                    Started: {incident.starts_at ? new Date(incident.starts_at).toLocaleString() : "—"}
                  </div>
                </CardContent>
              </Card>
            ) : null}

            <Card className="rounded-2xl">
              <CardHeader>
                <CardTitle className="text-base">Evergreen</CardTitle>
                <CardDescription>ILS backend reachability</CardDescription>
              </CardHeader>
              <CardContent className="flex items-center justify-between">
                <StatusBadge label={evergreenOk ? "Online" : "Offline"} status={evergreenOk ? "success" : "error"} />
                <div className="text-xs text-muted-foreground">HTTP {data?.evergreen?.status ?? "—"}</div>
              </CardContent>
            </Card>

            <div className="text-sm text-muted-foreground">
              Staff? Go to <Link className="underline underline-offset-2" href="/login">/login</Link>.
            </div>
          </>
        )}
      </PageContent>
    </PageContainer>
  );
}
