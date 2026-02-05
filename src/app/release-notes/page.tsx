"use client";

import { useCallback, useEffect, useState } from "react";
import { PageContainer, PageHeader, PageContent, ErrorMessage, EmptyState, LoadingSpinner } from "@/components/shared";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ScrollText } from "lucide-react";

export default function ReleaseNotesPage() {
  const [notes, setNotes] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch("/api/release-notes", { cache: "no-store" });
      const json = await res.json();
      if (!res.ok || json.ok === false) throw new Error(json.error || "Failed to load release notes");
      setNotes(Array.isArray(json.notes) ? json.notes : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setNotes([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <PageContainer>
      <PageHeader title="Release Notes" subtitle="What changed in StacksOS" breadcrumbs={[{ label: "Release Notes" }]} />
      <PageContent className="space-y-6">
        {error ? <ErrorMessage message={error} onRetry={load} /> : null}

        {loading ? (
          <LoadingSpinner message="Loading release notes..." />
        ) : notes.length === 0 ? (
          <EmptyState title="No release notes yet" description="Release notes will appear here after the first published change log entry." />
        ) : (
          <div className="space-y-4">
            {notes.map((n) => (
              <Card key={n.id} className="rounded-2xl">
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <ScrollText className="h-4 w-4" />
                    {n.title}
                  </CardTitle>
                  <CardDescription>
                    {n.version ? `${n.version} — ` : ""}
                    {n.created_at ? new Date(n.created_at).toLocaleString() : "—"}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <pre className="whitespace-pre-wrap text-sm">{n.body}</pre>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </PageContent>
    </PageContainer>
  );
}
