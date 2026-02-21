"use client";

import { useState } from "react";
import {
  PageContainer,
  PageHeader,
  PageContent,
  StatusBadge,
  EmptyState,
} from "@/components/shared";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { fetchWithAuth } from "@/lib/client-fetch";
import { featureFlags } from "@/lib/feature-flags";
import { Layers, Play, FileText, AlertCircle, CheckCircle, XCircle, Wand2 } from "lucide-react";
import { toast } from "sonner";

interface BatchOperation {
  id: string;
  label: string;
  description: string;
  mode: "read" | "write";
}

interface BatchResult {
  recordId: string;
  success: boolean;
  message: string;
}

interface MarcSubfield {
  code: string;
  value: string;
}

interface MarcField {
  tag: string;
  ind1: string;
  ind2: string;
  subfields: MarcSubfield[];
  controlValue?: string;
}

interface MarcWritePreview {
  recordId: number;
  success: boolean;
  message: string;
  originalMarcXml?: string;
  updatedMarcXml?: string;
  changed?: boolean;
}

const BATCH_OPERATIONS: BatchOperation[] = [
  {
    id: "validate",
    label: "Validate Records",
    description: "Check if records exist and are accessible",
    mode: "read",
  },
  {
    id: "fetch_marc",
    label: "Fetch MARC",
    description: "Retrieve MARC XML for records",
    mode: "read",
  },
  {
    id: "holdings",
    label: "Check Holdings",
    description: "Get holdings/copy counts for records",
    mode: "read",
  },
  {
    id: "add_field",
    label: "Add MARC Field",
    description: "Add a MARC field to each selected record",
    mode: "write",
  },
  {
    id: "remove_field",
    label: "Remove MARC Field",
    description: "Remove all occurrences of a MARC field from each record",
    mode: "write",
  },
  {
    id: "replace_subfield",
    label: "Replace Subfield Value",
    description: "Replace a subfield value within matching MARC tags",
    mode: "write",
  },
];

function parseRecordIds(raw: string): number[] {
  return raw
    .split(/[\n,\s]+/)
    .map((id) => id.trim())
    .filter((id) => id.length > 0)
    .map((id) => Number.parseInt(id, 10))
    .filter((id) => Number.isFinite(id) && id > 0);
}

function parseMarcXml(marcXml: string): MarcField[] | null {
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(marcXml, "text/xml");
    const parseError = doc.querySelector("parsererror");
    if (parseError) return null;

    const fields: MarcField[] = [];

    doc.querySelectorAll("controlfield").forEach((node) => {
      fields.push({
        tag: node.getAttribute("tag") || "",
        ind1: " ",
        ind2: " ",
        subfields: [],
        controlValue: node.textContent || "",
      });
    });

    doc.querySelectorAll("datafield").forEach((node) => {
      const subfields: MarcSubfield[] = [];
      node.querySelectorAll("subfield").forEach((sf) => {
        subfields.push({
          code: sf.getAttribute("code") || "",
          value: sf.textContent || "",
        });
      });

      fields.push({
        tag: node.getAttribute("tag") || "",
        ind1: node.getAttribute("ind1") || " ",
        ind2: node.getAttribute("ind2") || " ",
        subfields,
      });
    });

    return fields;
  } catch {
    return null;
  }
}

function escapeXml(input: string): string {
  return String(input)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function sortFields(fields: MarcField[]): MarcField[] {
  return [...fields].sort((a, b) => {
    const an = Number.parseInt(a.tag, 10);
    const bn = Number.parseInt(b.tag, 10);
    if (Number.isFinite(an) && Number.isFinite(bn) && an !== bn) return an - bn;
    return a.tag.localeCompare(b.tag);
  });
}

function buildMarcXml(marcXml: string, fields: MarcField[]): string {
  const parser = new DOMParser();
  const doc = parser.parseFromString(marcXml, "text/xml");
  const record = doc.querySelector("record");
  const leader = record?.querySelector("leader")?.textContent || "00000nam a22000007i 4500";

  const controlFields = sortFields(fields).filter((field) => {
    const tagNum = Number.parseInt(field.tag, 10);
    return Number.isFinite(tagNum) && tagNum < 10;
  });

  const dataFields = sortFields(fields).filter((field) => {
    const tagNum = Number.parseInt(field.tag, 10);
    return !Number.isFinite(tagNum) || tagNum >= 10;
  });

  const parts: string[] = [];
  parts.push('<?xml version="1.0" encoding="UTF-8"?>');
  parts.push('<record xmlns="http://www.loc.gov/MARC21/slim">');
  parts.push(`<leader>${escapeXml(leader)}</leader>`);

  for (const field of controlFields) {
    const tag = String(field.tag || "").trim();
    if (!/^\d{3}$/.test(tag)) continue;
    parts.push(`<controlfield tag="${escapeXml(tag)}">${escapeXml(field.controlValue || "")}</controlfield>`);
  }

  for (const field of dataFields) {
    const tag = String(field.tag || "").trim();
    if (!/^\d{3}$/.test(tag)) continue;
    const ind1 = String(field.ind1 || " ").slice(0, 1) || " ";
    const ind2 = String(field.ind2 || " ").slice(0, 1) || " ";
    const subfields = (field.subfields || [])
      .map((subfield) => {
        const code = String(subfield.code || "").trim().slice(0, 1);
        if (!code) return "";
        return `<subfield code="${escapeXml(code)}">${escapeXml(subfield.value || "")}</subfield>`;
      })
      .filter(Boolean)
      .join("");
    parts.push(
      `<datafield tag="${escapeXml(tag)}" ind1="${escapeXml(ind1)}" ind2="${escapeXml(ind2)}">${subfields}</datafield>`
    );
  }

  parts.push("</record>");
  return parts.join("");
}

function applyWriteOperation(args: {
  operation: string;
  fields: MarcField[];
  targetTag: string;
  subfieldCode: string;
  subfieldValue: string;
  ind1: string;
  ind2: string;
}): { fields: MarcField[]; changed: boolean; message: string } {
  const targetTag = args.targetTag.trim();
  const tagNum = Number.parseInt(targetTag, 10);
  const next = [...args.fields];

  if (!/^\d{3}$/.test(targetTag)) {
    return { fields: next, changed: false, message: "Tag must be a 3-digit MARC tag" };
  }

  if (args.operation === "add_field") {
    if (Number.isFinite(tagNum) && tagNum < 10) {
      next.push({
        tag: targetTag,
        ind1: " ",
        ind2: " ",
        subfields: [],
        controlValue: args.subfieldValue,
      });
    } else {
      const code = args.subfieldCode.trim().slice(0, 1);
      if (!code) {
        return { fields: next, changed: false, message: "Subfield code is required for data fields" };
      }
      next.push({
        tag: targetTag,
        ind1: (args.ind1 || " ").slice(0, 1) || " ",
        ind2: (args.ind2 || " ").slice(0, 1) || " ",
        subfields: [{ code, value: args.subfieldValue }],
      });
    }

    return { fields: sortFields(next), changed: true, message: `Added ${targetTag}` };
  }

  if (args.operation === "remove_field") {
    const before = next.length;
    const filtered = next.filter((field) => field.tag !== targetTag);
    const removed = before - filtered.length;
    return {
      fields: filtered,
      changed: removed > 0,
      message: removed > 0 ? `Removed ${removed} ${targetTag} field(s)` : `No ${targetTag} fields found`,
    };
  }

  if (args.operation === "replace_subfield") {
    const code = args.subfieldCode.trim().slice(0, 1);
    if (!code) {
      return { fields: next, changed: false, message: "Subfield code is required" };
    }

    let replacements = 0;
    const updated = next.map((field) => {
      if (field.tag !== targetTag) return field;
      if (Number.isFinite(tagNum) && tagNum < 10) return field;

      const subfields = (field.subfields || []).map((subfield) => {
        if (subfield.code !== code) return subfield;
        replacements += 1;
        return { ...subfield, value: args.subfieldValue };
      });

      return { ...field, subfields };
    });

    return {
      fields: updated,
      changed: replacements > 0,
      message:
        replacements > 0
          ? `Updated ${replacements} subfield ${targetTag}$${code}`
          : `No matching ${targetTag}$${code} subfields found`,
    };
  }

  return { fields: next, changed: false, message: "Unsupported write operation" };
}

export default function MarcBatchEditPage() {
  const enabled = featureFlags.marcBatchEdit;
  const [selectedOp, setSelectedOp] = useState<string>("validate");
  const [recordIds, setRecordIds] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [results, setResults] = useState<BatchResult[]>([]);
  const [writePreview, setWritePreview] = useState<MarcWritePreview[]>([]);
  const [isApplyingWrite, setIsApplyingWrite] = useState(false);

  const [targetTag, setTargetTag] = useState("650");
  const [ind1, setInd1] = useState(" ");
  const [ind2, setInd2] = useState("0");
  const [subfieldCode, setSubfieldCode] = useState("a");
  const [subfieldValue, setSubfieldValue] = useState("");

  const operation = BATCH_OPERATIONS.find((op) => op.id === selectedOp) || BATCH_OPERATIONS[0];
  const isWriteOperation = operation!.mode === "write";

  if (!enabled) {
    return (
      <PageContainer>
        <PageHeader
          title="MARC Batch Operations"
          subtitle="Batch workflows are behind a feature flag until write operations are end-to-end."
          breadcrumbs={[
            { label: "Cataloging", href: "/staff/cataloging" },
            { label: "Batch" },
          ]}
        />
        <PageContent>
          <EmptyState
            icon={Layers}
            title="MARC batch operations are disabled"
            description="This route is hidden by default to avoid dead UI. Enable it once your Evergreen permissions + bulk write workflows are validated."
          />
        </PageContent>
      </PageContainer>
    );
  }

  const handleRunBatch = async () => {
    const ids = parseRecordIds(recordIds);
    if (ids.length === 0) {
      toast.error("Enter valid record IDs");
      return;
    }

    setIsProcessing(true);
    setResults([]);
    setWritePreview([]);

    try {
      if (!isWriteOperation) {
        const batchResults: BatchResult[] = [];

        for (const id of ids) {
          try {
            if (selectedOp === "validate" || selectedOp === "fetch_marc") {
              const response = await fetchWithAuth(`/api/evergreen/catalog?action=record&id=${id}`);
              const data = await response.json();
              const hasRecord = Boolean(data.ok && data.record);
              const hasMarc = Boolean(data.record?.marc_xml);
              batchResults.push({
                recordId: String(id),
                success: selectedOp === "validate" ? hasRecord : hasRecord && hasMarc,
                message:
                  selectedOp === "validate"
                    ? hasRecord
                      ? "Record found"
                      : data.error || "Record not found"
                    : hasRecord && hasMarc
                      ? "MARC XML loaded"
                      : data.error || "MARC unavailable",
              });
              continue;
            }

            if (selectedOp === "holdings") {
              const response = await fetchWithAuth(`/api/evergreen/catalog?action=holdings&id=${id}`);
              const data = await response.json();
              const copyCount = Array.isArray(data?.copies) ? data.copies.length : 0;
              batchResults.push({
                recordId: String(id),
                success: Boolean(data.ok),
                message: data.ok ? `${copyCount} copies found` : data.error || "Failed to fetch holdings",
              });
              continue;
            }

            batchResults.push({ recordId: String(id), success: false, message: "Unknown operation" });
          } catch {
            batchResults.push({ recordId: String(id), success: false, message: "Network error" });
          }
        }

        setResults(batchResults);
        const successCount = batchResults.filter((result) => result.success).length;
        toast.success("Batch complete", {
          description: `${successCount}/${batchResults.length} succeeded`,
        });
        return;
      }

      if (!/^\d{3}$/.test(targetTag.trim())) {
        toast.error("Tag must be a 3-digit MARC tag");
        return;
      }

      if (selectedOp === "add_field" && Number.parseInt(targetTag, 10) >= 10) {
        if (!subfieldCode.trim()) {
          toast.error("Subfield code is required when adding a data field");
          return;
        }
      }

      if (selectedOp === "replace_subfield" && !subfieldCode.trim()) {
        toast.error("Subfield code is required for replace operation");
        return;
      }

      const previews: MarcWritePreview[] = [];

      for (const id of ids) {
        try {
          const response = await fetchWithAuth(`/api/evergreen/catalog?action=record&id=${id}`);
          const data = await response.json();
          const marcXml = typeof data?.record?.marc_xml === "string" ? data.record.marc_xml : "";
          if (!data.ok || !marcXml) {
            previews.push({
              recordId: id,
              success: false,
              message: data.error || "MARC unavailable",
            });
            continue;
          }

          const parsed = parseMarcXml(marcXml);
          if (!parsed) {
            previews.push({
              recordId: id,
              success: false,
              message: "Failed to parse MARC XML",
            });
            continue;
          }

          const opResult = applyWriteOperation({
            operation: selectedOp,
            fields: parsed,
            targetTag,
            subfieldCode,
            subfieldValue,
            ind1,
            ind2,
          });

          const updatedMarcXml = buildMarcXml(marcXml, opResult.fields);

          previews.push({
            recordId: id,
            success: true,
            message: opResult.message,
            originalMarcXml: marcXml,
            updatedMarcXml,
            changed: opResult.changed,
          });
        } catch {
          previews.push({
            recordId: id,
            success: false,
            message: "Network error",
          });
        }
      }

      setWritePreview(previews);
      const readyCount = previews.filter((entry) => entry.success).length;
      const changedCount = previews.filter((entry) => entry.success && entry.changed).length;
      toast.success("Preview ready", {
        description: `${readyCount}/${previews.length} prepared, ${changedCount} with actual changes`,
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleApplyWrite = async () => {
    const ready = writePreview.filter(
      (entry) => entry.success && entry.changed && entry.updatedMarcXml && entry.recordId > 0
    );
    if (ready.length === 0) {
      toast.error("No changed records to apply");
      return;
    }

    setIsApplyingWrite(true);
    try {
      const applyResults: BatchResult[] = [];

      for (const entry of ready) {
        try {
          const response = await fetchWithAuth("/api/evergreen/marc", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              recordId: entry.recordId,
              marcxml: entry.updatedMarcXml,
            }),
          });
          const data = await response.json();

          if (response.ok && data.ok !== false) {
            applyResults.push({
              recordId: String(entry.recordId),
              success: true,
              message: "Updated",
            });
          } else {
            applyResults.push({
              recordId: String(entry.recordId),
              success: false,
              message: data.error || "Update failed",
            });
          }
        } catch {
          applyResults.push({
            recordId: String(entry.recordId),
            success: false,
            message: "Network error",
          });
        }
      }

      setResults(applyResults);
      const successCount = applyResults.filter((result) => result.success).length;
      toast.success("Batch write complete", {
        description: `${successCount}/${applyResults.length} records updated`,
      });
    } finally {
      setIsApplyingWrite(false);
    }
  };

  const successCount = results.filter((result) => result.success).length;
  const failCount = results.filter((result) => !result.success).length;
  const previewPreparedCount = writePreview.filter((entry) => entry.success).length;
  const previewChangedCount = writePreview.filter((entry) => entry.success && entry.changed).length;

  return (
    <PageContainer>
      <PageHeader
        title="MARC Batch Operations"
        subtitle="Read and write MARC operations across multiple bibliographic records."
        breadcrumbs={[
          { label: "Cataloging", href: "/staff/cataloging" },
          { label: "Batch" },
        ]}
      />

      <PageContent className="space-y-6">
        <Card className="rounded-2xl border-amber-500/30 bg-amber-500/5">
          <CardContent className="flex items-start gap-3 p-4">
            <AlertCircle className="mt-0.5 h-5 w-5 text-amber-600" />
            <div className="text-sm">
              <p className="font-medium text-amber-700">Bulk change safety</p>
              <p className="text-muted-foreground">
                Write operations always run as preview first. Review results and apply only when
                you are ready.
              </p>
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-6 lg:grid-cols-[1fr,320px]">
          <div className="space-y-6">
            <Card className="rounded-2xl">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
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

                <div className="rounded-lg bg-muted/30 p-3 text-sm text-muted-foreground">
                  {operation!.description}
                </div>

                {isWriteOperation && (
                  <div className="space-y-3 rounded-lg border p-3">
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <Wand2 className="h-4 w-4" /> Write Operation Settings
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="tag">Tag</Label>
                        <Input id="tag"
                          value={targetTag}
                          onChange={(e) => setTargetTag(e.target.value.replace(/[^0-9]/g, "").slice(0, 3))}
                          placeholder="650"
                          className="font-mono"
                        />
                      </div>

                      {selectedOp === "add_field" && Number.parseInt(targetTag || "0", 10) >= 10 ? (
                        <>
                          <div className="space-y-2">
                            <Label htmlFor="indicator-1">Indicator 1</Label>
                            <Input id="indicator-1"
                              value={ind1}
                              onChange={(e) => setInd1((e.target.value || " ").slice(0, 1))}
                              maxLength={1}
                              placeholder=" "
                              className="font-mono"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="indicator-2">Indicator 2</Label>
                            <Input id="indicator-2"
                              value={ind2}
                              onChange={(e) => setInd2((e.target.value || " ").slice(0, 1))}
                              maxLength={1}
                              placeholder="0"
                              className="font-mono"
                            />
                          </div>
                        </>
                      ) : null}

                      {(selectedOp === "add_field" && Number.parseInt(targetTag || "0", 10) >= 10) ||
                      selectedOp === "replace_subfield" ? (
                        <div className="space-y-2">
                          <Label htmlFor="subfield-code">Subfield Code</Label>
                          <Input id="subfield-code"
                            value={subfieldCode}
                            onChange={(e) => setSubfieldCode(e.target.value.replace(/[^a-z0-9]/gi, "").slice(0, 1))}
                            maxLength={1}
                            placeholder="a"
                            className="font-mono"
                          />
                        </div>
                      ) : null}
                    </div>

                    {selectedOp === "add_field" ? (
                      <div className="space-y-2">
                        <Label htmlFor="number-parseint-targettag-0-10">{Number.parseInt(targetTag || "0", 10) < 10 ? "Control Field Value" : "Subfield Value"}</Label>
                        <Input id="number-parseint-targettag-0-10"
                          value={subfieldValue}
                          onChange={(e) => setSubfieldValue(e.target.value)}
                          placeholder={Number.parseInt(targetTag || "0", 10) < 10 ? "Control value" : "Subfield value"}
                        />
                      </div>
                    ) : null}

                    {selectedOp === "replace_subfield" ? (
                      <div className="space-y-2">
                        <Label htmlFor="replacement-value">Replacement Value</Label>
                        <Input id="replacement-value"
                          value={subfieldValue}
                          onChange={(e) => setSubfieldValue(e.target.value)}
                          placeholder="New subfield value"
                        />
                      </div>
                    ) : null}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="rounded-2xl">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <FileText className="h-4 w-4" /> Record IDs
                </CardTitle>
                <CardDescription>Enter record IDs (one per line or comma-separated).</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Textarea
                  value={recordIds}
                  onChange={(e) => setRecordIds(e.target.value)}
                  placeholder={`Enter record IDs...\n1\n2\n3`}
                  className="min-h-[220px] font-mono text-sm"
                />
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">
                    {parseRecordIds(recordIds).length} record(s)
                  </span>
                  <Button onClick={handleRunBatch} disabled={isProcessing || isApplyingWrite}>
                    <Play className="mr-2 h-4 w-4" />
                    {isProcessing
                      ? "Processing..."
                      : isWriteOperation
                        ? "Preview Changes"
                        : "Run Batch"}
                  </Button>
                </div>
              </CardContent>
            </Card>

            {isWriteOperation && writePreview.length > 0 && (
              <Card className="rounded-2xl">
                <CardHeader>
                  <CardTitle className="text-base">Write Preview</CardTitle>
                  <CardDescription>
                    {previewPreparedCount}/{writePreview.length} records prepared, {previewChangedCount} with
                    changes.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="space-y-2 max-h-[360px] overflow-auto">
                    {writePreview.map((entry) => (
                      <div
                        key={`preview-${entry.recordId}`}
                        className={`rounded border p-2 text-xs ${
                          entry.success
                            ? entry.changed
                              ? "bg-emerald-500/10"
                              : "bg-muted/30"
                            : "bg-rose-500/10"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-mono">ID: {entry.recordId}</span>
                          <StatusBadge
                            label={
                              entry.success
                                ? entry.changed
                                  ? "Changed"
                                  : "No Change"
                                : "Fail"
                            }
                            status={entry.success ? (entry.changed ? "success" : "pending") : "error"}
                          />
                        </div>
                        <div className="mt-1 text-muted-foreground">{entry.message}</div>
                      </div>
                    ))}
                  </div>

                  <div className="flex justify-end">
                    <Button
                      onClick={handleApplyWrite}
                      disabled={isApplyingWrite || previewChangedCount === 0}
                    >
                      {isApplyingWrite ? "Applying..." : `Apply to ${previewChangedCount} Record(s)`}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}
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
                  <span className="flex items-center gap-2 text-sm">
                    <CheckCircle className="h-4 w-4 text-emerald-500" /> Success
                  </span>
                  <span className="font-semibold text-emerald-600">{successCount}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-2 text-sm">
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
                        key={`result-${result.recordId}-${index}`}
                        className={`rounded p-2 text-xs ${
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
                        <div className="mt-1 text-muted-foreground">{result.message}</div>
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
