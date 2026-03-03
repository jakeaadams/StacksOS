"use client";

import { fetchWithAuth } from "@/lib/client-fetch";
import { useCallback, useRef, useState } from "react";
import { PageContainer, PageHeader, PageContent } from "@/components/shared";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Upload,
  FileText,
  CheckCircle2,
  AlertCircle,
  Users,
  ArrowRight,
  Loader2,
  X,
} from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";

const EVERGREEN_PATRON_FIELDS = [
  { key: "", label: "— Skip —" },
  { key: "first_given_name", label: "First Name" },
  { key: "second_given_name", label: "Middle Name" },
  { key: "family_name", label: "Last Name" },
  { key: "email", label: "Email" },
  { key: "day_phone", label: "Phone" },
  { key: "barcode", label: "Barcode" },
  { key: "usrname", label: "Username" },
  { key: "passwd", label: "Password" },
  { key: "dob", label: "Date of Birth" },
  { key: "expire_date", label: "Expiration Date" },
  { key: "street1", label: "Street Address" },
  { key: "city", label: "City" },
  { key: "state", label: "State" },
  { key: "post_code", label: "ZIP / Postal Code" },
];

const MIGRATION_PRESETS: Record<string, { label: string; mapping: Record<string, string> }> = {
  koha: {
    label: "Koha",
    mapping: {
      borrowernumber: "",
      cardnumber: "barcode",
      surname: "family_name",
      firstname: "first_given_name",
      email: "email",
      phone: "day_phone",
      dateofbirth: "dob",
      dateexpiry: "expire_date",
      address: "street1",
      city: "city",
      state: "state",
      zipcode: "post_code",
      userid: "usrname",
      password: "passwd",
    },
  },
  sierra: {
    label: "Sierra / Innovative",
    mapping: {
      P_BARCODE: "barcode",
      LAST_NAME: "family_name",
      FIRST_NAME: "first_given_name",
      MIDDLE_NAME: "second_given_name",
      EMAIL: "email",
      TELEPHONE: "day_phone",
      BIRTH_DATE: "dob",
      EXP_DATE: "expire_date",
      ADDRESS: "street1",
      CITY: "city",
      STATE: "state",
      ZIP: "post_code",
    },
  },
  follett: {
    label: "Follett Destiny",
    mapping: {
      Barcode: "barcode",
      LastName: "family_name",
      FirstName: "first_given_name",
      MiddleName: "second_given_name",
      Email: "email",
      Phone: "day_phone",
      BirthDate: "dob",
      ExpirationDate: "expire_date",
      Address1: "street1",
      City: "city",
      State: "state",
      Zip: "post_code",
      Username: "usrname",
    },
  },
  alexandria: {
    label: "Alexandria",
    mapping: {
      Barcode: "barcode",
      Last: "family_name",
      First: "first_given_name",
      Middle: "second_given_name",
      Email: "email",
      Phone: "day_phone",
      DOB: "dob",
      Expires: "expire_date",
      Address: "street1",
      City: "city",
      State: "state",
      Zip: "post_code",
      Login: "usrname",
    },
  },
};

interface ParsedRow {
  raw: Record<string, string>;
  mapped: Record<string, string>;
  errors: string[];
  rowNum: number;
}

interface ImportResult {
  created: number;
  skipped: number;
  failed: number;
  errors: Array<{ row: number; error: string }>;
}

function parseCSV(text: string): { headers: string[]; rows: string[][] } {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) return { headers: [], rows: [] };

  const parseLine = (line: string): string[] => {
    const fields: string[] = [];
    let field = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inQuotes) {
        if (ch === '"' && line[i + 1] === '"') {
          field += '"';
          i++;
        } else if (ch === '"') {
          inQuotes = false;
        } else {
          field += ch;
        }
      } else {
        if (ch === '"') {
          inQuotes = true;
        } else if (ch === ",") {
          fields.push(field.trim());
          field = "";
        } else {
          field += ch;
        }
      }
    }
    fields.push(field.trim());
    return fields;
  };

  const headers = parseLine(lines[0]!);
  const rows = lines.slice(1).map(parseLine);
  return { headers, rows };
}

type Step = "upload" | "map" | "validate" | "import" | "done";

export default function PatronImportPage() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<Step>("upload");
  const [fileName, setFileName] = useState("");
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [csvRows, setCsvRows] = useState<string[][]>([]);
  const [columnMap, setColumnMap] = useState<Record<string, string>>({});
  const [validatedRows, setValidatedRows] = useState<ParsedRow[]>([]);
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState(0);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);

  const handleFileUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);

    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const { headers, rows } = parseCSV(text);
      if (headers.length === 0) {
        toast.error("Could not parse CSV headers");
        return;
      }
      setCsvHeaders(headers);
      setCsvRows(rows);

      // Auto-detect column mappings
      const autoMap: Record<string, string> = {};
      for (const h of headers) {
        const lower = h.toLowerCase().replace(/[^a-z]/g, "");
        if (lower.includes("first") && lower.includes("name")) autoMap[h] = "first_given_name";
        else if (lower.includes("last") && lower.includes("name")) autoMap[h] = "family_name";
        else if (lower.includes("middle")) autoMap[h] = "second_given_name";
        else if (lower === "email" || lower.includes("email")) autoMap[h] = "email";
        else if (lower.includes("phone") || lower.includes("day")) autoMap[h] = "day_phone";
        else if (lower === "barcode" || lower.includes("barcode")) autoMap[h] = "barcode";
        else if (lower.includes("username") || lower === "usrname") autoMap[h] = "usrname";
        else if (lower.includes("password") || lower === "passwd") autoMap[h] = "passwd";
        else if (lower.includes("dob") || lower.includes("birth")) autoMap[h] = "dob";
        else if (lower.includes("expire") || lower.includes("expir")) autoMap[h] = "expire_date";
        else if (lower.includes("street") || lower.includes("address")) autoMap[h] = "street1";
        else if (lower === "city") autoMap[h] = "city";
        else if (lower === "state" || lower === "province") autoMap[h] = "state";
        else if (lower.includes("zip") || lower.includes("postal")) autoMap[h] = "post_code";
      }
      setColumnMap(autoMap);
      setStep("map");
      toast.success(`Parsed ${rows.length} rows from ${file.name}`);
    };
    reader.readAsText(file);
  }, []);

  const handlePresetSelect = useCallback(
    (presetKey: string) => {
      const preset = MIGRATION_PRESETS[presetKey];
      if (!preset) return;
      const newMap: Record<string, string> = {};
      let mapped = 0;
      for (const header of csvHeaders) {
        const match = preset.mapping[header];
        if (match !== undefined) {
          newMap[header] = match;
          if (match) mapped++;
        }
      }
      setColumnMap((prev) => ({ ...prev, ...newMap }));
      toast.success(`${preset.label} preset applied — ${mapped} columns auto-mapped`);
    },
    [csvHeaders]
  );

  const handleValidate = useCallback(() => {
    const results: ParsedRow[] = [];
    const barcodes = new Set<string>();

    for (let i = 0; i < csvRows.length; i++) {
      const row = csvRows[i]!;
      const mapped: Record<string, string> = {};
      const errors: string[] = [];

      for (let j = 0; j < csvHeaders.length; j++) {
        const header = csvHeaders[j]!;
        const field = columnMap[header];
        if (field && field !== "skip" && row[j]) {
          mapped[field] = row[j]!;
        }
      }

      // Required field validation
      if (!mapped.family_name) errors.push("Last name is required");
      if (!mapped.barcode) errors.push("Barcode is required");

      // Barcode duplicate check
      if (mapped.barcode) {
        if (barcodes.has(mapped.barcode)) {
          errors.push(`Duplicate barcode: ${mapped.barcode}`);
        }
        barcodes.add(mapped.barcode);
      }

      // Email format
      if (mapped.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mapped.email)) {
        errors.push("Invalid email format");
      }

      const raw: Record<string, string> = {};
      csvHeaders.forEach((h, j) => {
        raw[h] = row[j] ?? "";
      });

      results.push({ raw, mapped, errors, rowNum: i + 2 });
    }

    setValidatedRows(results);
    setStep("validate");

    const valid = results.filter((r) => r.errors.length === 0).length;
    const invalid = results.length - valid;
    toast.info(`Validation: ${valid} valid, ${invalid} with errors`);
  }, [csvRows, csvHeaders, columnMap]);

  const handleImport = useCallback(async () => {
    const validRows = validatedRows.filter((r) => r.errors.length === 0);
    if (validRows.length === 0) {
      toast.error("No valid rows to import");
      return;
    }

    setImporting(true);
    setImportProgress(0);
    setStep("import");

    const result: ImportResult = { created: 0, skipped: 0, failed: 0, errors: [] };

    for (let i = 0; i < validRows.length; i++) {
      const row = validRows[i]!;
      try {
        const res = await fetchWithAuth("/api/evergreen/patrons", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "create",
            patron: {
              firstName: row.mapped.first_given_name || "",
              middleName: row.mapped.second_given_name || "",
              lastName: row.mapped.family_name || "",
              email: row.mapped.email || "",
              phone: row.mapped.day_phone || "",
              barcode: row.mapped.barcode || "",
              username: row.mapped.usrname || row.mapped.barcode || "",
              password: row.mapped.passwd || row.mapped.barcode || "changeme",
              dob: row.mapped.dob || undefined,
              expireDate: row.mapped.expire_date || undefined,
              street1: row.mapped.street1 || undefined,
              city: row.mapped.city || undefined,
              state: row.mapped.state || undefined,
              postCode: row.mapped.post_code || undefined,
            },
          }),
        });
        const data = await res.json();

        if (res.ok && data?.patron?.id) {
          result.created++;
        } else if (data?.error?.includes?.("DUPLICATE")) {
          result.skipped++;
        } else {
          result.failed++;
          result.errors.push({
            row: row.rowNum,
            error: data?.error || "Unknown error",
          });
        }
      } catch (err) {
        result.failed++;
        result.errors.push({
          row: row.rowNum,
          error: err instanceof Error ? err.message : String(err),
        });
      }

      setImportProgress(Math.round(((i + 1) / validRows.length) * 100));

      // Small delay to avoid overwhelming the API
      if (i < validRows.length - 1) {
        await new Promise((r) => setTimeout(r, 150));
      }
    }

    setImportResult(result);
    setImporting(false);
    setStep("done");
    toast.success(
      `Import complete: ${result.created} created, ${result.skipped} skipped, ${result.failed} failed`
    );
  }, [validatedRows]);

  const handleReset = useCallback(() => {
    setStep("upload");
    setFileName("");
    setCsvHeaders([]);
    setCsvRows([]);
    setColumnMap({});
    setValidatedRows([]);
    setImportResult(null);
    setImportProgress(0);
    if (fileRef.current) fileRef.current.value = "";
  }, []);

  const validCount = validatedRows.filter((r) => r.errors.length === 0).length;
  const errorCount = validatedRows.length - validCount;
  const mappedFieldCount = Object.values(columnMap).filter(
    (value) => value && value !== "skip"
  ).length;

  return (
    <PageContainer>
      <PageHeader
        title="CSV Patron Import"
        subtitle="Batch import patron records from CSV files."
        breadcrumbs={[
          { label: "Administration", href: "/staff/admin" },
          { label: "Migration", href: "/staff/admin/migration" },
          { label: "Patron Import" },
        ]}
      />

      <PageContent className="space-y-6">
        {/* Step Indicator */}
        <div className="flex items-center gap-2">
          {(["upload", "map", "validate", "import", "done"] as Step[]).map((s, i) => {
            const labels = ["Upload", "Map Columns", "Validate", "Import", "Done"];
            const isCurrent = step === s;
            const isPast = ["upload", "map", "validate", "import", "done"].indexOf(step) > i;

            return (
              <div key={s} className="flex items-center gap-2">
                {i > 0 && <div className={`h-px w-6 ${isPast ? "bg-emerald-500" : "bg-border"}`} />}
                <div
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium ${
                    isCurrent
                      ? "bg-[hsl(var(--brand-1))]/10 text-[hsl(var(--brand-1))] border border-[hsl(var(--brand-1))]/20"
                      : isPast
                        ? "bg-emerald-500/10 text-emerald-600"
                        : "bg-muted/50 text-muted-foreground"
                  }`}
                >
                  {isPast ? (
                    <CheckCircle2 className="h-3 w-3" />
                  ) : (
                    <span className="h-4 w-4 rounded-full bg-current/10 flex items-center justify-center text-[10px]">
                      {i + 1}
                    </span>
                  )}
                  <span className="hidden sm:inline">{labels[i]}</span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Step 1: Upload */}
        {step === "upload" && (
          <Card className="rounded-2xl border-border/70 shadow-sm">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Upload className="h-4 w-4" /> Upload CSV File
              </CardTitle>
              <CardDescription>
                Select a CSV file with patron data. The first row should contain column headers.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="border-2 border-dashed border-border/70 rounded-xl p-8 text-center">
                <FileText className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
                <p className="text-sm text-muted-foreground mb-3">
                  Drag and drop a CSV file here, or click to browse
                </p>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".csv,.tsv,.txt"
                  onChange={handleFileUpload}
                  className="hidden"
                />
                <Button onClick={() => fileRef.current?.click()}>Choose File</Button>
              </div>
              <div className="text-xs text-muted-foreground">
                Supported: CSV with headers. Required columns: Last Name, Barcode. Max 5,000 rows
                per batch.
              </div>
            </CardContent>
          </Card>
        )}

        {/* Step 2: Map Columns */}
        {step === "map" && (
          <Card className="rounded-2xl border-border/70 shadow-sm">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base flex items-center gap-2">
                    <FileText className="h-4 w-4" /> Map Columns
                  </CardTitle>
                  <CardDescription>
                    {fileName} — {csvRows.length} rows, {csvHeaders.length} columns.
                    {mappedFieldCount > 0 ? ` ${mappedFieldCount} fields auto-detected.` : ""}
                  </CardDescription>
                </div>
                <div className="flex gap-2 items-center">
                  <Select onValueChange={handlePresetSelect}>
                    <SelectTrigger className="w-44 h-8 text-xs">
                      <SelectValue placeholder="Load Preset..." />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(MIGRATION_PRESETS).map(([key, p]) => (
                        <SelectItem key={key} value={key}>
                          {p.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button variant="ghost" size="sm" onClick={handleReset}>
                    <X className="h-4 w-4 mr-1" /> Cancel
                  </Button>
                  <Button size="sm" onClick={handleValidate} disabled={mappedFieldCount < 2}>
                    Validate <ArrowRight className="h-4 w-4 ml-1" />
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {csvHeaders.map((header) => (
                  <div
                    key={header}
                    className="flex items-center gap-4 rounded-xl bg-muted/20 px-4 py-3"
                  >
                    <div className="w-40 text-sm font-medium truncate" title={header}>
                      {header}
                    </div>
                    <ArrowRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                    <Select
                      value={columnMap[header] || "skip"}
                      onValueChange={(v) =>
                        setColumnMap((prev) => ({ ...prev, [header]: v === "skip" ? "" : v }))
                      }
                    >
                      <SelectTrigger className="w-56">
                        <SelectValue placeholder="Select field..." />
                      </SelectTrigger>
                      <SelectContent>
                        {EVERGREEN_PATRON_FIELDS.map((f) => (
                          <SelectItem key={f.key} value={f.key || "skip"}>
                            {f.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {csvRows[0]?.[csvHeaders.indexOf(header)] && (
                      <span className="text-xs text-muted-foreground truncate max-w-[200px]">
                        e.g. &quot;{csvRows[0][csvHeaders.indexOf(header)]}&quot;
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Step 3: Validate */}
        {step === "validate" && (
          <Card className="rounded-2xl border-border/70 shadow-sm">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4" /> Validation Results
                  </CardTitle>
                  <CardDescription>
                    {validCount} valid, {errorCount} with errors out of {validatedRows.length} total
                    rows.
                  </CardDescription>
                </div>
                <div className="flex gap-2">
                  <Button variant="ghost" size="sm" onClick={() => setStep("map")}>
                    Back
                  </Button>
                  <Button size="sm" onClick={handleImport} disabled={validCount === 0 || importing}>
                    {importing ? (
                      <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                    ) : (
                      <Users className="h-4 w-4 mr-1" />
                    )}{" "}
                    Import {validCount} Patrons
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-xl bg-emerald-500/10 p-3 text-center">
                  <div className="text-2xl font-semibold text-emerald-600">{validCount}</div>
                  <div className="text-xs text-muted-foreground">Valid</div>
                </div>
                <div className="rounded-xl bg-rose-500/10 p-3 text-center">
                  <div className="text-2xl font-semibold text-rose-600">{errorCount}</div>
                  <div className="text-xs text-muted-foreground">Errors</div>
                </div>
                <div className="rounded-xl bg-muted/30 p-3 text-center">
                  <div className="text-2xl font-semibold">{validatedRows.length}</div>
                  <div className="text-xs text-muted-foreground">Total</div>
                </div>
              </div>

              {/* Preview table */}
              <div className="rounded-xl border overflow-x-auto max-h-[400px] overflow-y-auto">
                <table className="w-full text-xs">
                  <thead className="bg-muted/50 sticky top-0">
                    <tr>
                      <th className="px-3 py-2 text-left">Row</th>
                      <th className="px-3 py-2 text-left">Name</th>
                      <th className="px-3 py-2 text-left">Barcode</th>
                      <th className="px-3 py-2 text-left">Email</th>
                      <th className="px-3 py-2 text-left">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {validatedRows.slice(0, 100).map((row) => (
                      <tr
                        key={row.rowNum}
                        className={row.errors.length > 0 ? "bg-rose-500/5" : "hover:bg-muted/20"}
                      >
                        <td className="px-3 py-2 font-mono">{row.rowNum}</td>
                        <td className="px-3 py-2">
                          {row.mapped.first_given_name} {row.mapped.family_name}
                        </td>
                        <td className="px-3 py-2 font-mono">{row.mapped.barcode || "—"}</td>
                        <td className="px-3 py-2">{row.mapped.email || "—"}</td>
                        <td className="px-3 py-2">
                          {row.errors.length > 0 ? (
                            <Badge variant="destructive" className="text-[10px] rounded-full">
                              <AlertCircle className="h-3 w-3 mr-1" />
                              {row.errors[0]}
                            </Badge>
                          ) : (
                            <Badge
                              variant="secondary"
                              className="text-[10px] rounded-full bg-emerald-500/10 text-emerald-600"
                            >
                              <CheckCircle2 className="h-3 w-3 mr-1" /> Valid
                            </Badge>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {validatedRows.length > 100 && (
                <div className="text-xs text-muted-foreground text-center">
                  Showing first 100 of {validatedRows.length} rows
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Step 4: Import Progress */}
        {step === "import" && (
          <Card className="rounded-2xl border-border/70 shadow-sm">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" /> Importing Patrons...
              </CardTitle>
              <CardDescription>
                Creating patron records in Evergreen. Do not close this page.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Progress value={importProgress} className="h-3" />
              <div className="text-center text-sm text-muted-foreground">
                {importProgress}% complete
              </div>
            </CardContent>
          </Card>
        )}

        {/* Step 5: Done */}
        {step === "done" && importResult && (
          <Card className="rounded-2xl border-border/70 shadow-sm">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-600" /> Import Complete
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-xl bg-emerald-500/10 p-4 text-center">
                  <div className="text-3xl font-semibold text-emerald-600">
                    {importResult.created}
                  </div>
                  <div className="text-xs text-muted-foreground">Created</div>
                </div>
                <div className="rounded-xl bg-amber-500/10 p-4 text-center">
                  <div className="text-3xl font-semibold text-amber-600">
                    {importResult.skipped}
                  </div>
                  <div className="text-xs text-muted-foreground">Skipped (duplicates)</div>
                </div>
                <div className="rounded-xl bg-rose-500/10 p-4 text-center">
                  <div className="text-3xl font-semibold text-rose-600">{importResult.failed}</div>
                  <div className="text-xs text-muted-foreground">Failed</div>
                </div>
              </div>

              {importResult.errors.length > 0 && (
                <div className="rounded-xl border bg-muted/20 p-4">
                  <div className="text-sm font-medium mb-2">Errors</div>
                  <div className="space-y-1 max-h-[200px] overflow-y-auto">
                    {importResult.errors.map((err, i) => (
                      <div key={i} className="text-xs text-muted-foreground">
                        Row {err.row}: {err.error}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex gap-2">
                <Button onClick={handleReset}>Import More</Button>
                <Button variant="outline" asChild>
                  <Link href="/staff/patrons">View Patrons</Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </PageContent>
    </PageContainer>
  );
}
