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
} from "@/components/shared";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { fetchWithAuth } from "@/lib/client-fetch";
import { FileText, Play, Star, Search, Users, BookOpen, DollarSign, Clock, RefreshCw } from "lucide-react";
import { ColumnDef } from "@tanstack/react-table";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { featureFlags } from "@/lib/feature-flags";

interface ReportTemplate {
  id: string;
  name: string;
  description: string;
  category: "circulation" | "patrons" | "catalog" | "financial" | "holds";
  apiAction: string;
  isStarred: boolean;
}

const CATEGORY_ICONS: Record<string, React.ElementType> = {
  circulation: BookOpen,
  patrons: Users,
  catalog: FileText,
  financial: DollarSign,
  holds: Clock,
};

const REPORT_TEMPLATES: ReportTemplate[] = [
  {
    id: "dashboard",
    name: "Dashboard Statistics",
    description: "Daily circulation metrics: checkouts, checkins, holds, overdue items",
    category: "circulation",
    apiAction: "dashboard",
    isStarred: true,
  },
  {
    id: "holds",
    name: "Holds Summary",
    description: "Active holds by status: available, pending, in-transit",
    category: "holds",
    apiAction: "holds",
    isStarred: true,
  },
  {
    id: "overdue",
    name: "Overdue Items",
    description: "List of overdue items with patron and item details",
    category: "circulation",
    apiAction: "overdue",
    isStarred: false,
  },
];

export default function ReportTemplatesPage() {
  const router = useRouter();
  const enabled = featureFlags.reportTemplates;
  const [searchQuery, setSearchQuery] = useState("");
  const [isRunning, setIsRunning] = useState<string | null>(null);
  const [previewData, setPreviewData] = useState<any>(null);

  const filteredTemplates = useMemo(() => {
    if (!searchQuery) return REPORT_TEMPLATES;
    const q = searchQuery.toLowerCase();
    return REPORT_TEMPLATES.filter(
      t => t.name.toLowerCase().includes(q) || t.description.toLowerCase().includes(q)
    );
  }, [searchQuery]);

  const handleRunReport = async (template: ReportTemplate) => {
    setIsRunning(template.id);
    try {
      const response = await fetchWithAuth(`/api/evergreen/reports?action=${template.apiAction}`);
      const data = await response.json();

      if (data.ok) {
        setPreviewData({ template, data });
        toast.success("Report generated", { description: template.name });
      } else {
        toast.error("Report failed", { description: data.error || "Unknown error" });
      }
    } catch (error) {
      toast.error("Report failed", { description: "Network error" });
    } finally {
      setIsRunning(null);
    }
  };

  const columns: ColumnDef<ReportTemplate>[] = useMemo(() => [
    {
      accessorKey: "name",
      header: "Template",
      cell: ({ row }) => {
        const CategoryIcon = CATEGORY_ICONS[row.original.category] || FileText;
        return (
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-lg bg-muted/50 flex items-center justify-center">
              <CategoryIcon className="h-4 w-4 text-muted-foreground" />
            </div>
            <div>
              <div className="font-medium flex items-center gap-2">
                {row.original.name}
                {row.original.isStarred && <Star className="h-3 w-3 fill-amber-400 text-amber-400" />}
              </div>
              <div className="text-xs text-muted-foreground">{row.original.description}</div>
            </div>
          </div>
        );
      },
    },
    {
      accessorKey: "category",
      header: "Category",
      cell: ({ row }) => (
        <Badge variant="outline" className="capitalize">
          {row.original.category}
        </Badge>
      ),
    },
    {
      id: "actions",
      header: "Actions",
      cell: ({ row }) => (
        <Button
          variant="ghost"
          size="sm"
          className="h-8 gap-2"
          onClick={() => handleRunReport(row.original)}
          disabled={isRunning === row.original.id}
        >
          {isRunning === row.original.id ? (
            <RefreshCw className="h-4 w-4 animate-spin" />
          ) : (
            <Play className="h-4 w-4" />
          )}
          Run
        </Button>
      ),
    },
  ], [isRunning]);

  const starredTemplates = REPORT_TEMPLATES.filter(t => t.isStarred);

  if (!enabled) {
    return (
      <PageContainer>
        <PageHeader
          title="Report Templates"
          subtitle="Pre-built report templates for common library operations."
          breadcrumbs={[
            { label: "Reports", href: "/staff/reports" },
            { label: "Templates" },
          ]}
        />
        <PageContent>
          <EmptyState
            title="Report Templates is not enabled"
            description="This feature is behind a flag until we ship a real template library and remove any non-functional templates."
          />
        </PageContent>
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <PageHeader
        title="Report Templates"
        subtitle="Pre-built report templates for common library operations."
        breadcrumbs={[
          { label: "Reports", href: "/staff/reports" },
          { label: "Templates" },
        ]}
      />

      <PageContent className="space-y-6">
        {starredTemplates.length > 0 && (
          <div className="space-y-3">
            <h3 className="text-sm font-medium flex items-center gap-2">
              <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
              Quick Access
            </h3>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {starredTemplates.map((template) => {
                const CategoryIcon = CATEGORY_ICONS[template.category] || FileText;
                return (
                  <Card
                    key={template.id}
                    className="rounded-xl hover:border-foreground/20 transition-colors cursor-pointer"
                    onClick={() => handleRunReport(template)}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-start gap-3">
                        <div className="h-9 w-9 rounded-lg bg-muted/50 flex items-center justify-center">
                          <CategoryIcon className="h-4 w-4 text-muted-foreground" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-sm truncate">{template.name}</div>
                          <div className="text-xs text-muted-foreground line-clamp-2">
                            {template.description}
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        )}

        <Card className="rounded-2xl">
          <CardHeader>
            <CardTitle className="text-base">All Templates</CardTitle>
            <CardDescription>Browse and run report templates.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="mb-4">
              <div className="relative">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search templates..."
                  className="!pl-14"
                />
              </div>
            </div>
            <DataTable
              columns={columns}
              data={filteredTemplates}
              searchable={false}
              paginated={filteredTemplates.length > 10}
              emptyState={
                <EmptyState
                  title="No templates found"
                  description="No report templates match your search."
                />
              }
            />
          </CardContent>
        </Card>

        {previewData && (
          <Card className="rounded-2xl">
            <CardHeader>
              <CardTitle className="text-base">Preview: {previewData.template.name}</CardTitle>
              <CardDescription>Report results preview</CardDescription>
            </CardHeader>
            <CardContent>
              <pre className="text-xs bg-muted/30 p-4 rounded-lg overflow-auto max-h-[300px]">
                {JSON.stringify(previewData.data, null, 2)}
              </pre>
            </CardContent>
          </Card>
        )}
      </PageContent>
    </PageContainer>
  );
}
