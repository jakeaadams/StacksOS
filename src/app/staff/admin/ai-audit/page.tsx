"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchWithAuth } from "@/lib/client-fetch";
import { featureFlags } from "@/lib/feature-flags";

import { PageContainer, PageHeader, PageContent, DataTable, EmptyState } from "@/components/shared";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ChevronDown, ChevronRight, FileSearch, Loader2, RefreshCw, Sparkles } from "lucide-react";
import type { ColumnDef } from "@tanstack/react-table";

type AiDraftRow = {
  id: string;
  type: string;
  request_id: string | null;
  actor_id: number | null;
  provider: string | null;
  model: string | null;
  prompt_template: string | null;
  prompt_version: number | null;
  input_redacted: unknown;
  output: unknown;
  created_at: string;
  decided_at: string | null;
  decision: string | null;
  decision_reason: string | null;
  decided_by: number | null;
  ip: string | null;
  user_agent: string | null;
};

type AiDraftDecisionRow = {
  id: number;
  draft_id: string;
  suggestion_id: string | null;
  decision: string;
  reason: string | null;
  decided_at: string;
  decided_by: number | null;
};

const AI_DRAFT_TYPES = [
  { value: "", label: "All Types" },
  { value: "policy_explain", label: "Policy Explain" },
  { value: "cataloging_suggest", label: "Cataloging Suggest" },
  { value: "analytics_summary", label: "Analytics Summary" },
  { value: "ops_playbooks", label: "Ops Playbooks" },
  { value: "staff_copilot", label: "Staff Copilot" },
  { value: "holds_copilot", label: "Holds Copilot" },
  { value: "patron_copilot", label: "Patron Copilot" },
  { value: "acquisitions_copilot", label: "Acquisitions Copilot" },
  { value: "semantic_rerank", label: "Semantic Rerank" },
  { value: "ai_search", label: "AI Search" },
  { value: "marc_generation", label: "MARC Generation" },
];

function formatDate(iso: string | null): string {
  if (!iso) return "\u2014";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function DecisionBadge({ decision }: { decision: string | null }) {
  if (!decision) {
    return (
      <Badge variant="outline" className="text-muted-foreground">
        Pending
      </Badge>
    );
  }
  if (decision === "accepted") {
    return <Badge className="bg-green-100 text-green-800">Accepted</Badge>;
  }
  if (decision === "rejected") {
    return <Badge variant="destructive">Rejected</Badge>;
  }
  return <Badge variant="outline">{decision}</Badge>;
}

function DraftDetailPanel({ draftId }: { draftId: string }) {
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState<AiDraftRow | null>(null);
  const [decisions, setDecisions] = useState<AiDraftDecisionRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetchWithAuth(`/api/ai/audit?draftId=${encodeURIComponent(draftId)}`);
        const json = await res.json();
        if (!res.ok || json.ok === false) {
          throw new Error(json.error || "Failed to load draft");
        }
        if (!cancelled) {
          setDraft(json.draft || null);
          setDecisions(Array.isArray(json.decisions) ? json.decisions : []);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [draftId]);

  if (loading) {
    return (
      <div className="p-4 flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading draft details...
      </div>
    );
  }

  if (error) {
    return <div className="p-4 text-sm text-destructive">{error}</div>;
  }

  if (!draft) {
    return <div className="p-4 text-sm text-muted-foreground">Draft not found.</div>;
  }

  return (
    <div className="p-4 space-y-4 bg-muted/10 border-t">
      <div className="grid gap-3 md:grid-cols-2">
        <div className="space-y-2">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">
            Provider / Model
          </div>
          <div className="text-sm">
            {draft.provider || "\u2014"} / {draft.model || "\u2014"}
          </div>
        </div>
        <div className="space-y-2">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">
            Prompt Template
          </div>
          <div className="text-sm font-mono">
            {draft.prompt_template || "\u2014"} v{draft.prompt_version ?? "\u2014"}
          </div>
        </div>
        <div className="space-y-2">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">Request ID</div>
          <div className="text-sm font-mono truncate">{draft.request_id || "\u2014"}</div>
        </div>
        <div className="space-y-2">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">IP / Actor</div>
          <div className="text-sm">
            {draft.ip || "\u2014"} / Actor #{draft.actor_id ?? "\u2014"}
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <div className="text-xs uppercase tracking-wide text-muted-foreground">Redacted Input</div>
        <pre className="text-xs bg-muted/30 rounded-md p-3 overflow-auto max-h-48">
          {JSON.stringify(draft.input_redacted, null, 2)}
        </pre>
      </div>

      <div className="space-y-2">
        <div className="text-xs uppercase tracking-wide text-muted-foreground">AI Output</div>
        <pre className="text-xs bg-muted/30 rounded-md p-3 overflow-auto max-h-48">
          {JSON.stringify(draft.output, null, 2)}
        </pre>
      </div>

      {decisions.length > 0 ? (
        <div className="space-y-2">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">
            Accept/Reject Chain
          </div>
          <div className="space-y-1">
            {decisions.map((d) => (
              <div
                key={d.id}
                className="flex items-center gap-3 rounded-md border px-3 py-2 text-sm"
              >
                <DecisionBadge decision={d.decision} />
                <span className="text-muted-foreground">
                  {d.suggestion_id ? `[${d.suggestion_id}]` : ""}
                </span>
                <span className="flex-1 truncate">{d.reason || "\u2014"}</span>
                <span className="text-xs text-muted-foreground">{formatDate(d.decided_at)}</span>
                {d.decided_by ? (
                  <span className="text-xs text-muted-foreground">by #{d.decided_by}</span>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default function AiAuditPage() {
  const [drafts, setDrafts] = useState<AiDraftRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [typeFilter, setTypeFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(0);
  const pageSize = 25;

  // Expanded rows
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const toggleExpanded = useCallback((id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const loadDrafts = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (typeFilter) params.set("type", typeFilter);
      if (dateFrom) params.set("dateFrom", dateFrom);
      if (dateTo) params.set("dateTo", dateTo);
      params.set("limit", String(pageSize));
      params.set("offset", String(page * pageSize));

      const res = await fetchWithAuth(`/api/ai/audit?${params.toString()}`);
      const json = await res.json();
      if (!res.ok || json.ok === false) {
        throw new Error(json.error || "Failed to load AI audit data");
      }
      setDrafts(Array.isArray(json.drafts) ? json.drafts : []);
      setTotal(typeof json.total === "number" ? json.total : 0);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [typeFilter, dateFrom, dateTo, page]);

  useEffect(() => {
    void loadDrafts();
  }, [loadDrafts]);

  const columns = useMemo<ColumnDef<AiDraftRow, unknown>[]>(
    () => [
      {
        id: "expand",
        header: "",
        size: 40,
        cell: ({ row }) => (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0"
            onClick={(e) => {
              e.stopPropagation();
              toggleExpanded(row.original.id);
            }}
          >
            {expandedIds.has(row.original.id) ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
          </Button>
        ),
      },
      {
        accessorKey: "type",
        header: "Type",
        cell: ({ row }) => (
          <Badge variant="outline" className="font-mono text-xs">
            {row.original.type}
          </Badge>
        ),
      },
      {
        accessorKey: "provider",
        header: "Provider",
        cell: ({ row }) => <span className="text-sm">{row.original.provider || "\u2014"}</span>,
      },
      {
        accessorKey: "model",
        header: "Model",
        cell: ({ row }) => (
          <span className="text-sm font-mono truncate max-w-[160px] block">
            {row.original.model || "\u2014"}
          </span>
        ),
      },
      {
        accessorKey: "decision",
        header: "Decision",
        cell: ({ row }) => <DecisionBadge decision={row.original.decision} />,
      },
      {
        accessorKey: "created_at",
        header: "Created",
        cell: ({ row }) => (
          <span className="text-sm text-muted-foreground whitespace-nowrap">
            {formatDate(row.original.created_at)}
          </span>
        ),
      },
      {
        accessorKey: "actor_id",
        header: "Actor",
        cell: ({ row }) => (
          <span className="text-sm">
            {row.original.actor_id != null ? `#${row.original.actor_id}` : "\u2014"}
          </span>
        ),
      },
    ],
    [expandedIds, toggleExpanded]
  );

  const tableData = useMemo(() => drafts, [drafts]);

  const totalPages = Math.ceil(total / pageSize);

  return (
    <PageContainer>
      <PageHeader
        title="AI Audit Trail"
        subtitle="Review all AI-generated drafts, decisions, and provider telemetry."
        breadcrumbs={[{ label: "Administration", href: "/staff/admin" }, { label: "AI Audit" }]}
        actions={[
          {
            label: "Refresh",
            onClick: () => void loadDrafts(),
            icon: RefreshCw,
            loading,
          },
        ]}
      />

      <PageContent className="space-y-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Filters</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-3 items-end">
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Type</label>
                <Select
                  value={typeFilter}
                  onValueChange={(v) => {
                    setTypeFilter(v);
                    setPage(0);
                  }}
                >
                  <SelectTrigger className="w-48 h-8">
                    <SelectValue placeholder="All Types" />
                  </SelectTrigger>
                  <SelectContent>
                    {AI_DRAFT_TYPES.map((t) => (
                      <SelectItem key={t.value} value={t.value}>
                        {t.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">From</label>
                <Input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => {
                    setDateFrom(e.target.value);
                    setPage(0);
                  }}
                  className="w-40 h-8"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">To</label>
                <Input
                  type="date"
                  value={dateTo}
                  onChange={(e) => {
                    setDateTo(e.target.value);
                    setPage(0);
                  }}
                  className="w-40 h-8"
                />
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setTypeFilter("");
                  setDateFrom("");
                  setDateTo("");
                  setPage(0);
                }}
              >
                Clear
              </Button>
            </div>
          </CardContent>
        </Card>

        {error ? <div className="text-sm text-destructive">{error}</div> : null}

        <DataTable
          columns={columns}
          data={tableData}
          isLoading={loading}
          searchable
          searchPlaceholder="Search by type, provider, model..."
          onRowClick={(row) => toggleExpanded(row.id)}
          hoverHighlight
          compact
          emptyState={
            <EmptyState
              icon={FileSearch}
              title="No AI drafts found"
              description="Adjust filters or wait for AI copilot activity."
            />
          }
        />

        {/* Expanded detail panels */}
        {drafts
          .filter((d) => expandedIds.has(d.id))
          .map((d) => (
            <Card key={`detail-${d.id}`} className="rounded-lg">
              <CardHeader className="pb-0 pt-3 px-4">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Sparkles className="h-3.5 w-3.5" />
                  Draft {d.id.slice(0, 8)}... ({d.type})
                </CardTitle>
              </CardHeader>
              <DraftDetailPanel draftId={d.id} />
            </Card>
          ))}

        {totalPages > 1 ? (
          <div className="flex items-center justify-between gap-4">
            <span className="text-sm text-muted-foreground">
              Showing {page * pageSize + 1}–{Math.min((page + 1) * pageSize, total)} of {total}
            </span>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={page === 0}
                onClick={() => setPage((p) => Math.max(0, p - 1))}
              >
                Previous
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={page >= totalPages - 1}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        ) : null}
      </PageContent>
    </PageContainer>
  );
}
