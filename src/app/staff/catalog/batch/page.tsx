"use client";

import { useState } from "react";
import {
  PageContainer,
  PageHeader,
  PageContent,
  EmptyState,
  StatusBadge,
} from "@/components/shared";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { fetchWithAuth } from "@/lib/client-fetch";
import { Layers, Play, FileText, AlertCircle, CheckCircle, XCircle } from "lucide-react";
import { toast } from "sonner";

interface BatchOperation {
  id: string;
  label: string;
  description: string;
}

interface BatchResult {
  recordId: string;
  success: boolean;
  message: string;
}

const BATCH_OPERATIONS: BatchOperation[] = [
  { id: "validate", label: "Validate Records", description: "Check if records exist and are accessible" },
  { id: "fetch_marc", label: "Fetch MARC", description: "Retrieve MARC XML for records" },
  { id: "holdings", label: "Check Holdings", description: "Get holdings/copy counts for records" },
];

export default function MarcBatchEditPage() {
  const [selectedOp, setSelectedOp] = useState<string>("validate");
  const [recordIds, setRecordIds] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [results, setResults] = useState<BatchResult[]>([]);

  const parseRecordIds = (): number[] => {
    return recordIds
      .split(/[\n,\s]+/)
      .map(id => id.trim())
      .filter(id => id)
      .map(id => parseInt(id, 10))
      .filter(id => !isNaN(id));
  };

  const handleRunBatch = async () => {
    const ids = parseRecordIds();
    if (ids.length === 0) {
      toast.error("Enter valid record IDs");
      return;
    }

    setIsProcessing(true);
    setResults([]);

    const batchResults: BatchResult[] = [];

    for (const id of ids) {
      try {
        let response;
        let success = false;
        let message = "";

        if (selectedOp === "validate" || selectedOp === "fetch_marc") {
          response = await fetchWithAuth(`/api/evergreen/catalog?action=record&id=${id}`);
          const data = await response.json();
          success = data.ok && data.record;
          message = success ? "Record found" : (data.error || "Record not found");
        } else if (selectedOp === "holdings") {
          response = await fetchWithAuth(`/api/evergreen/catalog?action=holdings&id=${id}`);
          const data = await response.json();
          success = data.ok;
          const copyCount = data.holdings?.length || 0;
          message = success ? `${copyCount} copies found` : (data.error || "Failed to fetch holdings");
        }

        batchResults.push({ recordId: String(id), success, message });
      } catch (error) {
        batchResults.push({ recordId: String(id), success: false, message: "Network error" });
      }
    }

    setResults(batchResults);
    setIsProcessing(false);

    const successCount = batchResults.filter(r => r.success).length;
    toast.success("Batch complete", {
      description: `${successCount}/${batchResults.length} succeeded`,
    });
  };

  const successCount = results.filter(r => r.success).length;
  const failCount = results.filter(r => !r.success).length;

  return (
    <PageContainer>
      <PageHeader
        title="MARC Batch Operations"
        subtitle="Apply bulk operations to multiple bibliographic records."
        breadcrumbs={[
          { label: "Cataloging", href: "/staff/cataloging" },
          { label: "Batch" },
        ]}
      />

      <PageContent className="space-y-6">
        <Card className="rounded-2xl border-amber-500/30 bg-amber-500/5">
          <CardContent className="p-4 flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-amber-600 mt-0.5" />
            <div className="text-sm">
              <p className="font-medium text-amber-700">Experimental Feature</p>
              <p className="text-muted-foreground">
                MARC batch operations are for advanced cataloging workflows. Currently supports
                validation and read operations. Write operations require additional permissions.
              </p>
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-6 lg:grid-cols-[1fr,300px]">
          <div className="space-y-6">
            <Card className="rounded-2xl">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Layers className="h-4 w-4" /> Batch Operation
                </CardTitle>
                <CardDescription>Select the operation to perform on records.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Select value={selectedOp} onValueChange={setSelectedOp}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select operation" />
                  </SelectTrigger>
                  <SelectContent>
                    {BATCH_OPERATIONS.map((op) => (
                      <SelectItem key={op.id} value={op.id}>
                        {op.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {selectedOp && (
                  <div className="text-sm text-muted-foreground p-3 bg-muted/30 rounded-lg">
                    {BATCH_OPERATIONS.find(o => o.id === selectedOp)?.description}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="rounded-2xl">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <FileText className="h-4 w-4" /> Record IDs
                </CardTitle>
                <CardDescription>Enter record IDs (one per line or comma-separated).</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Textarea
                  value={recordIds}
                  onChange={(e) => setRecordIds(e.target.value)}
                  placeholder="Enter record IDs...
1
2
3"
                  className="min-h-[200px] font-mono text-sm"
                />
                <div className="flex justify-between items-center">
                  <span className="text-xs text-muted-foreground">
                    {parseRecordIds().length} record(s)
                  </span>
                  <Button onClick={handleRunBatch} disabled={isProcessing}>
                    <Play className="h-4 w-4 mr-2" />
                    {isProcessing ? "Processing..." : "Run Batch"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="space-y-6">
            <Card className="rounded-2xl">
              <CardHeader>
                <CardTitle className="text-base">Results Summary</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm">Total</span>
                  <span className="font-semibold">{results.length}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-emerald-500" /> Success
                  </span>
                  <span className="font-semibold text-emerald-600">{successCount}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm flex items-center gap-2">
                    <XCircle className="h-4 w-4 text-rose-500" /> Failed
                  </span>
                  <span className="font-semibold text-rose-600">{failCount}</span>
                </div>
              </CardContent>
            </Card>

            {results.length > 0 && (
              <Card className="rounded-2xl">
                <CardHeader>
                  <CardTitle className="text-base">Results</CardTitle>
                </CardHeader>
                <CardContent className="max-h-[400px] overflow-auto">
                  <div className="space-y-2">
                    {results.map((result, index) => (
                      <div
                        key={index}
                        className={`text-xs p-2 rounded ${
                          result.success ? "bg-emerald-500/10" : "bg-rose-500/10"
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-mono">ID: {result.recordId}</span>
                          <StatusBadge
                            label={result.success ? "OK" : "Fail"}
                            status={result.success ? "success" : "error"}
                          />
                        </div>
                        <div className="text-muted-foreground mt-1">{result.message}</div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </PageContent>
    </PageContainer>
  );
}
