"use client";

import { useState, useCallback, useEffect } from "react";
import { fetchWithAuth } from "@/lib/client-fetch";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  Play,
  Save,
  FileSpreadsheet,
  Clock,
  Database,
  Table2,
  AlertTriangle,
  CheckCircle,
  Loader2,
  Trash2,
  FolderOpen,
  Code2,
  Info,
} from "lucide-react";

interface QueryResult {
  columns: string[];
  rows: Record<string, unknown>[];
  rowCount: number;
  executionTime: number;
}

interface SavedReport {
  id: string;
  name: string;
  description: string;
  templateId: string;
  parameters: Record<string, string>;
  createdAt: string;
  lastRun?: string;
  category: string;
}

// Pre-built report templates that map to Evergreen data
const REPORT_TEMPLATES = [
  {
    id: "overdue-items",
    name: "Overdue Items",
    category: "circulation",
    description: "Items currently overdue, sorted by days overdue",
    parameters: [
      { name: "orgId", label: "Library", type: "org", default: "1" },
      { name: "limit", label: "Max Results", type: "number", default: "100" },
    ],
    apiEndpoint: "/api/evergreen/reports",
    apiAction: "overdue_items",
  },
  {
    id: "circ-stats",
    name: "Circulation Statistics",
    category: "circulation",
    description: "Daily checkout and checkin counts",
    parameters: [
      { name: "orgId", label: "Library", type: "org", default: "1" },
      { name: "days", label: "Days Back", type: "number", default: "30" },
    ],
    apiEndpoint: "/api/evergreen/reports",
    apiAction: "circ_stats",
  },
  {
    id: "holds-summary",
    name: "Holds Summary",
    category: "circulation",
    description: "Current holds status by library",
    parameters: [
      { name: "orgId", label: "Library", type: "org", default: "1" },
    ],
    apiEndpoint: "/api/evergreen/reports",
    apiAction: "holds_summary",
  },
  {
    id: "patron-stats",
    name: "Patron Statistics",
    category: "patrons",
    description: "Active patrons, new registrations, expired accounts",
    parameters: [
      { name: "orgId", label: "Library", type: "org", default: "1" },
    ],
    apiEndpoint: "/api/evergreen/reports",
    apiAction: "patron_stats",
  },
  {
    id: "collection-stats",
    name: "Collection Statistics",
    category: "collection",
    description: "Item counts by status and location",
    parameters: [
      { name: "orgId", label: "Library", type: "org", default: "1" },
    ],
    apiEndpoint: "/api/evergreen/reports",
    apiAction: "collection_stats",
  },
  {
    id: "fines-summary",
    name: "Fines Summary",
    category: "circulation",
    description: "Outstanding fines and recent payments",
    parameters: [
      { name: "orgId", label: "Library", type: "org", default: "1" },
    ],
    apiEndpoint: "/api/evergreen/reports",
    apiAction: "fines_summary",
  },
];

export default function ReportsBuilderPage() {
  const [selectedTemplate, setSelectedTemplate] = useState<typeof REPORT_TEMPLATES[0] | null>(null);
  const [parameters, setParameters] = useState<Record<string, string>>({});
  const [isExecuting, setIsExecuting] = useState(false);
  const [result, setResult] = useState<QueryResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [savedReports, setSavedReports] = useState<SavedReport[]>([]);
  const [reportName, setReportName] = useState("");
  const [reportDescription, setReportDescription] = useState("");
  const [isSaveDialogOpen, setIsSaveDialogOpen] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState("all");

  // Load saved reports from localStorage
  useEffect(() => {
    const saved = localStorage.getItem("stacksos_saved_reports");
    if (saved) {
      try {
        setSavedReports(JSON.parse(saved));
      } catch {
        // Ignore parse _errors
      }
    }
  }, []);

  const executeReport = useCallback(async () => {
    if (!selectedTemplate) {
      toast.error("Please select a report template");
      return;
    }

    setIsExecuting(true);
    setError(null);
    setResult(null);

    const startTime = Date.now();

    try {
      // Build query parameters
      const queryParams = new URLSearchParams();
      queryParams.set("action", selectedTemplate.apiAction);

      Object.entries(parameters).forEach(([key, value]) => {
        if (value) queryParams.set(key, value);
      });

      const response = await fetchWithAuth(
        `${selectedTemplate.apiEndpoint}?${queryParams.toString()}`
      );
      const data = await response.json();

      const executionTime = (Date.now() - startTime) / 1000;

      if (!data.ok) {
        throw new Error(data.error || "Report execution failed");
      }

      // Transform API response to table format
      let columns: string[] = [];
      let rows: Record<string, unknown>[] = [];

      if (data.stats) {
        // Dashboard-style stats
        columns = ["Metric", "Value"];
        rows = Object.entries(data.stats)
          .filter(([_, v]) => v !== null)
          .map(([key, value]) => ({
            Metric: key.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase()),
            Value: value,
          }));
      } else if (data.items && Array.isArray(data.items)) {
        // List of items
        if (data.items.length > 0) {
          columns = Object.keys(data.items[0]);
          rows = data.items;
        }
      } else if (data.data && Array.isArray(data.data)) {
        if (data.data.length > 0) {
          columns = Object.keys(data.data[0]);
          rows = data.data;
        }
      } else {
        // Try to extract any array from the response
        const arrays = Object.entries(data).filter(([k, v]) => Array.isArray(v) && k !== "ok");
        if (arrays.length > 0) {
          const [_, arr] = arrays[0] as [string, any[]];
          if (arr.length > 0) {
            columns = Object.keys(arr[0]);
            rows = arr;
          }
        }
      }

      setResult({
        columns,
        rows,
        rowCount: rows.length,
        executionTime,
      });

      toast.success(`Report completed: ${rows.length} rows`);

    } catch (err) {
      const message = err instanceof Error ? err.message : "Report execution failed";
      setError(message);
      toast.error(message);
    } finally {
      setIsExecuting(false);
    }
  }, [selectedTemplate, parameters]);

  const selectTemplate = (template: typeof REPORT_TEMPLATES[0]) => {
    setSelectedTemplate(template);
    // Initialize parameters with defaults
    const defaults: Record<string, string> = {};
    template.parameters.forEach(p => {
      defaults[p.name] = p.default;
    });
    setParameters(defaults);
    setResult(null);
    setError(null);
  };

  const saveReport = () => {
    if (!reportName.trim() || !selectedTemplate) {
      toast.error("Please enter a report name");
      return;
    }

    const newReport: SavedReport = {
      id: Date.now().toString(),
      name: reportName,
      description: reportDescription,
      templateId: selectedTemplate.id,
      parameters,
      createdAt: new Date().toISOString().split("T")[0],
      category: selectedTemplate.category,
    };

    const updated = [newReport, ...savedReports];
    setSavedReports(updated);
    localStorage.setItem("stacksos_saved_reports", JSON.stringify(updated));

    setIsSaveDialogOpen(false);
    setReportName("");
    setReportDescription("");
    toast.success("Report saved");
  };

  const loadSavedReport = (report: SavedReport) => {
    const template = REPORT_TEMPLATES.find(t => t.id === report.templateId);
    if (template) {
      setSelectedTemplate(template);
      setParameters(report.parameters);
      toast.info(`Loaded: ${report.name}`);
    }
  };

  const deleteSavedReport = (reportId: string) => {
    const updated = savedReports.filter(r => r.id !== reportId);
    setSavedReports(updated);
    localStorage.setItem("stacksos_saved_reports", JSON.stringify(updated));
    toast.success("Report deleted");
  };

  const exportCSV = () => {
    if (!result) return;

    const headers = result.columns.join(",");
    const rows = result.rows.map(row =>
      result.columns.map(col => JSON.stringify(row[col] ?? "")).join(",")
    );
    const csv = [headers, ...rows].join("\n");

    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `report-${selectedTemplate?.id || "data"}-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);

    toast.success("CSV exported");
  };

  const filteredTemplates = selectedCategory === "all"
    ? REPORT_TEMPLATES
    : REPORT_TEMPLATES.filter(t => t.category === selectedCategory);

  return (
    <div className="flex flex-col h-full">
      <div className="border-b px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <nav className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
              <Link href="/staff/reports" className="hover:text-foreground transition-colors">
                Reports
              </Link>
              <span>/</span>
              <span className="text-foreground font-medium" aria-current="page">Builder</span>
            </nav>
            <h1 className="text-2xl font-semibold flex items-center gap-2">
              <Database className="h-6 w-6" />
              Reports Builder
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Build and run reports using Evergreen data
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Dialog open={isSaveDialogOpen} onOpenChange={setIsSaveDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" disabled={!selectedTemplate}>
                  <Save className="h-4 w-4 mr-2" />
                  Save Report
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Save Report</DialogTitle>
                  <DialogDescription>
                    Save this report configuration for quick access later.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="name">Report Name</Label>
                    <Input
                      id="name"
                      value={reportName}
                      onChange={(e) => setReportName(e.target.value)}
                      placeholder="e.g., Monthly Circulation Stats"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="desc">Description</Label>
                    <Textarea
                      id="desc"
                      value={reportDescription}
                      onChange={(e) => setReportDescription(e.target.value)}
                      placeholder="What does this report show?"
                      rows={2}
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setIsSaveDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button onClick={saveReport}>Save Report</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar */}
        <div className="w-80 border-r flex flex-col">
          <Tabs defaultValue="templates" className="flex-1 flex flex-col">
            <TabsList className="mx-4 mt-4">
              <TabsTrigger value="templates" className="flex-1">
                <Code2 className="h-4 w-4 mr-1" />
                Templates
              </TabsTrigger>
              <TabsTrigger value="saved" className="flex-1">
                <FolderOpen className="h-4 w-4 mr-1" />
                Saved
              </TabsTrigger>
            </TabsList>

            <TabsContent value="templates" className="flex-1 overflow-hidden m-0">
              <div className="px-4 pt-4">
                <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Filter by category" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Categories</SelectItem>
                    <SelectItem value="circulation">Circulation</SelectItem>
                    <SelectItem value="collection">Collection</SelectItem>
                    <SelectItem value="patrons">Patrons</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <ScrollArea className="h-full">
                <div className="p-4 space-y-2">
                  {filteredTemplates.map((template) => (
                    <Card
                      key={template.id}
                      className={`cursor-pointer transition-colors ${
                        selectedTemplate?.id === template.id
                          ? "border-primary bg-primary/5"
                          : "hover:bg-muted/50"
                      }`}
                      onClick={() => selectTemplate(template)}
                    >
                      <CardHeader className="p-3">
                        <CardTitle className="text-sm font-medium">{template.name}</CardTitle>
                        <CardDescription className="text-xs">{template.description}</CardDescription>
                        <Badge variant="outline" className="w-fit text-xs mt-1">
                          {template.category}
                        </Badge>
                      </CardHeader>
                    </Card>
                  ))}
                </div>
              </ScrollArea>
            </TabsContent>

            <TabsContent value="saved" className="flex-1 overflow-hidden m-0">
              <ScrollArea className="h-full">
                <div className="p-4 space-y-2">
                  {savedReports.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      <FolderOpen className="h-8 w-8 mx-auto mb-2 opacity-50" />
                      <p className="text-sm">No saved reports</p>
                    </div>
                  ) : (
                    savedReports.map((report) => (
                      <Card
                        key={report.id}
                        className="cursor-pointer hover:bg-muted/50 transition-colors"
                      >
                        <CardHeader className="p-3">
                          <div className="flex items-start justify-between">
                            <div onClick={() => loadSavedReport(report)}>
                              <CardTitle className="text-sm font-medium">{report.name}</CardTitle>
                              {report.description && (
                                <CardDescription className="text-xs">{report.description}</CardDescription>
                              )}
                              <div className="flex items-center gap-2 mt-1">
                                <Badge variant="outline" className="text-xs">
                                  {report.category}
                                </Badge>
                                <span className="text-xs text-muted-foreground">
                                  {report.createdAt}
                                </span>
                              </div>
                            </div>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 w-8 p-0"
                              onClick={(e) => {
                                e.stopPropagation();
                                deleteSavedReport(report.id);
                              }}
                              title="Delete report"
                            >
                              <Trash2 className="h-4 w-4" />
                              <span className="sr-only">Delete report</span>
                            </Button>
                          </div>
                        </CardHeader>
                      </Card>
                    ))
                  )}
                </div>
              </ScrollArea>
            </TabsContent>
          </Tabs>
        </div>

        {/* Main Content */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Parameters */}
          {selectedTemplate ? (
            <div className="p-4 border-b">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="font-semibold">{selectedTemplate.name}</h2>
                  <p className="text-sm text-muted-foreground">{selectedTemplate.description}</p>
                </div>
                <Button onClick={executeReport} disabled={isExecuting}>
                  {isExecuting ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Running...
                    </>
                  ) : (
                    <>
                      <Play className="h-4 w-4 mr-2" />
                      Run Report
                    </>
                  )}
                </Button>
              </div>

              {selectedTemplate.parameters.length > 0 && (
                <div className="flex flex-wrap gap-4">
                  {selectedTemplate.parameters.map((param) => (
                    <div key={param.name} className="space-y-1">
                      <Label htmlFor={param.name} className="text-xs">{param.label}</Label>
                      <Input
                        id={param.name}
                        type={param.type === "number" ? "number" : "text"}
                        value={parameters[param.name] || ""}
                        onChange={(e) => setParameters(prev => ({
                          ...prev,
                          [param.name]: e.target.value,
                        }))}
                        className="w-32"
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="p-4 border-b">
              <div className="flex items-center gap-2 text-muted-foreground">
                <Info className="h-4 w-4" />
                <span className="text-sm">Select a report template from the sidebar to get started</span>
              </div>
            </div>
          )}

          {/* Results */}
          <div className="flex-1 overflow-hidden flex flex-col">
            {error ? (
              <div className="p-6">
                <div className="p-4 bg-destructive/10 border border-destructive/20 rounded-lg">
                  <div className="flex items-center gap-2 text-destructive">
                    <AlertTriangle className="h-5 w-5" />
                    <span className="font-medium">Error</span>
                  </div>
                  <p className="mt-2 text-sm">{error}</p>
                </div>
              </div>
            ) : result ? (
              <>
                <div className="px-4 py-3 border-b bg-muted/30 flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2">
                      <CheckCircle className="h-4 w-4 text-green-600" />
                      <span className="text-sm font-medium">{result.rowCount} rows returned</span>
                    </div>
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Clock className="h-4 w-4" />
                      <span className="text-sm">{result.executionTime.toFixed(3)}s</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={exportCSV}>
                      <FileSpreadsheet className="h-4 w-4 mr-2" />
                      Export CSV
                    </Button>
                  </div>
                </div>
                <ScrollArea className="flex-1">
                  <div className="p-4">
                    {result.rowCount === 0 ? (
                      <div className="text-center py-8 text-muted-foreground">
                        <Table2 className="h-8 w-8 mx-auto mb-2 opacity-50" />
                        <p>No data returned</p>
                      </div>
                    ) : (
                      <div className="border rounded-lg overflow-hidden">
                        <table className="w-full text-sm">
                          <thead className="bg-muted">
                            <tr>
                              {result.columns.map((col) => (
                                <th key={col} className="px-4 py-2 text-left font-medium border-b">
                                  {col}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {result.rows.map((row, idx) => (
                              <tr key={idx} className="hover:bg-muted/50">
                                {result.columns.map((col) => (
                                  <td key={col} className="px-4 py-2 border-b">
                                    {String(row[col] ?? "")}
                                  </td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </ScrollArea>
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center text-muted-foreground">
                <div className="text-center">
                  <Table2 className="h-12 w-12 mx-auto mb-3 opacity-50" />
                  <p className="font-medium">No results yet</p>
                  <p className="text-sm mt-1">Select a template and run it to see results</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
