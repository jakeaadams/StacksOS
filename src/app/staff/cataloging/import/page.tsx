"use client";
import { clientLogger } from "@/lib/client-logger";

import { fetchWithAuth } from "@/lib/client-fetch";
import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  PageContainer,
  PageHeader,
  PageContent,
  StatusBadge,
  ErrorMessage,
  MarcDiff,
} from "@/components/shared";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useApi } from "@/hooks";
import { 
  Upload, 
  FileText, 
  CheckCircle2, 
  AlertCircle, 
  BookOpen,
  User,
  Hash,
  Eye,
  Download as DownloadIcon,
  X,
  ArrowRight
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface BibSource {
  id: number;
  source: string;
}

interface ParsedRecord {
  marcxml: string;
  metadata: {
    title: string;
    author: string;
    isbn: string;
  };
  rawData?: ArrayBuffer;
}

interface ImportResult {
  success: boolean;
  recordId?: number;
  tcn?: string;
  error?: string;
  isDuplicate?: boolean;
  duplicateRecordId?: number;
}

interface ImportProgress {
  total: number;
  current: number;
  successful: number;
  failed: number;
  duplicates: number;
}

export default function CatalogImportPage() {
  const router = useRouter();
  const { data: ping } = useApi<any>("/api/evergreen/ping", { immediate: true });
  const { data: sourcesData } = useApi<any>("/api/evergreen/marc?action=sources", { immediate: true });
  const sources: BibSource[] = sourcesData?.sources || [];

  const [files, setFiles] = useState<File[]>([]);
  const [parsedRecords, setParsedRecords] = useState<ParsedRecord[]>([]);
  const [source, setSource] = useState("System Local");
  const [isImporting, setIsImporting] = useState(false);
  const [isParsing, setIsParsing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [importProgress, setImportProgress] = useState<ImportProgress | null>(null);
  const [importResults, setImportResults] = useState<ImportResult[]>([]);
  const [selectedRecord, setSelectedRecord] = useState<number | null>(null);
  const [showDiff, setShowDiff] = useState(false);

  // Handle file selection
  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(e.target.files || []);
    if (selectedFiles.length === 0) return;

    // Validate file types
    const validFiles = selectedFiles.filter(file => {
      const ext = file.name.toLowerCase();
      return ext.endsWith('.mrc') || ext.endsWith('.xml') || ext.endsWith('.marcxml');
    });

    if (validFiles.length === 0) {
      toast.error('Please select valid MARC files (.mrc, .xml, .marcxml)');
      return;
    }

    setFiles(validFiles);
    await parseFiles(validFiles);
  };

  // Parse MARC files
  const parseFiles = async (filesToParse: File[]) => {
    setIsParsing(true);
    setError(null);
    setParsedRecords([]);

    try {
      const records: ParsedRecord[] = [];

      for (const file of filesToParse) {
        const ext = file.name.toLowerCase();
        
        if (ext.endsWith('.xml') || ext.endsWith('.marcxml')) {
          // Parse MARCXML
          const text = await file.text();
          const xmlRecords = parseMARCXML(text);
          records.push(...xmlRecords);
        } else if (ext.endsWith('.mrc')) {
          // Parse binary MARC
          const buffer = await file.arrayBuffer();
          const binaryRecords = parseMARCBinary(buffer);
          records.push(...binaryRecords);
        }
      }

      if (records.length === 0) {
        throw new Error('No valid MARC records found in files');
      }

      setParsedRecords(records);
      toast.success(`Parsed ${records.length} record${records.length !== 1 ? 's' : ''}`);
    } catch (err: any) {
      const message = err?.message || 'Failed to parse MARC files';
      setError(message);
      toast.error(message);
    } finally {
      setIsParsing(false);
    }
  };

  // Parse MARCXML file
  const parseMARCXML = (xmlText: string): ParsedRecord[] => {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xmlText, 'text/xml');
    const records: ParsedRecord[] = [];

    // Handle both single record and collection
    const recordElements = doc.querySelectorAll('record');
    
    recordElements.forEach(recordEl => {
      const serializer = new XMLSerializer();
      const marcxml = serializer.serializeToString(recordEl);
      const metadata = extractMetadata(recordEl);
      
      records.push({ marcxml, metadata });
    });

    return records;
  };

  // Parse binary MARC file
  const parseMARCBinary = (buffer: ArrayBuffer): ParsedRecord[] => {
    const records: ParsedRecord[] = [];
    const data = new Uint8Array(buffer);
    let offset = 0;

    while (offset < data.length) {
      try {
        // Read record length from first 5 bytes
        const recordLengthStr = new TextDecoder('ascii').decode(data.slice(offset, offset + 5));
        const recordLength = parseInt(recordLengthStr, 10);
        
        if (isNaN(recordLength) || recordLength <= 0 || recordLength > 99999) {
          // Skip invalid records
          offset++;
          continue;
        }

        // Extract record
        const recordData = data.slice(offset, offset + recordLength);
        const marcxml = convertMARCToXML(recordData);
        
        if (marcxml) {
          const parser = new DOMParser();
          const doc = parser.parseFromString(marcxml, 'text/xml');
          const recordEl = doc.querySelector('record');
          const metadata = recordEl ? extractMetadata(recordEl) : { title: '', author: '', isbn: '' };
          
          records.push({ marcxml, metadata, rawData: recordData.buffer });
        }

        offset += recordLength;
      } catch {
        // Skip to next potential record
        offset++;
      }
    }

    return records;
  };

  // Convert binary MARC to MARCXML
  const convertMARCToXML = (data: Uint8Array): string | null => {
    try {
      const decoder = new TextDecoder('utf-8', { fatal: false });
      
      // Read leader
      const leader = decoder.decode(data.slice(0, 24));
      
      // Read base address of data
      const baseAddressStr = leader.substring(12, 17);
      const baseAddress = parseInt(baseAddressStr, 10);
      
      if (isNaN(baseAddress)) return null;

      // Build XML
      let xml = '<record xmlns="http://www.loc.gov/MARC21/slim">';
      xml += `<leader>${leader}</leader>`;

      // Parse directory
      let directoryOffset = 24;
      const directory: { tag: string; length: number; startPos: number }[] = [];

      while (directoryOffset < baseAddress - 1) {
        const entry = decoder.decode(data.slice(directoryOffset, directoryOffset + 12));
        if (entry.charCodeAt(0) === 30) break; // Field terminator

        const tag = entry.substring(0, 3);
        const length = parseInt(entry.substring(3, 7), 10);
        const startPos = parseInt(entry.substring(7, 12), 10);

        if (!isNaN(length) && !isNaN(startPos)) {
          directory.push({ tag, length, startPos });
        }

        directoryOffset += 12;
      }

      // Extract fields
      for (const { tag, length, startPos } of directory) {
        const fieldStart = baseAddress + startPos;
        const fieldEnd = fieldStart + length;
        
        if (fieldEnd > data.length) continue;

        const fieldData = data.slice(fieldStart, fieldEnd);
        const fieldText = decoder.decode(fieldData).replace(/\x1e$/, '').replace(/\x1f$/, '');

        if (tag < '010') {
          // Control field
          xml += `<controlfield tag="${tag}">${escapeXml(fieldText)}</controlfield>`;
        } else {
          // Data field
          const ind1 = fieldText[0] || ' ';
          const ind2 = fieldText[1] || ' ';
          xml += `<datafield tag="${tag}" ind1="${ind1}" ind2="${ind2}">`;

          // Parse subfields
          const subfieldData = fieldText.substring(2);
          const subfields = subfieldData.split('\x1f').filter(Boolean);

          for (const sf of subfields) {
            if (sf.length > 0) {
              const code = sf[0];
              const value = sf.substring(1);
              xml += `<subfield code="${code}">${escapeXml(value)}</subfield>`;
            }
          }

          xml += '</datafield>';
        }
      }

      xml += '</record>';
      return xml;
    } catch (err) {
      clientLogger.error('Error converting MARC to XML:', err);
      return null;
    }
  };

  // Extract metadata from MARC record
  const extractMetadata = (recordEl: Element): { title: string; author: string; isbn: string } => {
    let title = '';
    let author = '';
    let isbn = '';

    // Extract title (245 )
    const titleField = recordEl.querySelector('datafield[tag="245"]');
    if (titleField) {
      const subfieldA = titleField.querySelector('subfield[code="a"]')?.textContent || '';
      const subfieldB = titleField.querySelector('subfield[code="b"]')?.textContent || '';
      title = (subfieldA + ' ' + subfieldB).trim();
    }

    // Extract author (100 or 110)
    const authorField = recordEl.querySelector('datafield[tag="100"], datafield[tag="110"]');
    if (authorField) {
      author = authorField.querySelector('subfield[code="a"]')?.textContent || '';
    }

    // Extract ISBN (020)
    const isbnField = recordEl.querySelector('datafield[tag="020"]');
    if (isbnField) {
      const isbnText = isbnField.querySelector('subfield[code="a"]')?.textContent || '';
      // Clean ISBN (remove hyphens, spaces, and anything after first space)
      isbn = isbnText.split(' ')[0].replace(/[^0-9Xx]/g, '');
    }

    return { title, author, isbn };
  };

  // Check for duplicate ISBN
  const checkDuplicate = async (isbn: string): Promise<{ isDuplicate: boolean; recordId?: number }> => {
    if (!isbn) return { isDuplicate: false };

    try {
      const res = await fetchWithAuth(`/api/evergreen/catalog?query=${encodeURIComponent(isbn)}&searchType=isbn&limit=1`);
      if (!res.ok) return { isDuplicate: false };

      const data = await res.json();
      const records = data?.results || [];
      
      if (records.length > 0) {
        return { isDuplicate: true, recordId: records[0]?.id };
      }
    } catch (err) {
      clientLogger.error('Duplicate check failed:', err);
    }

    return { isDuplicate: false };
  };

  // Import all records
  const handleBatchImport = async () => {
    if (parsedRecords.length === 0) {
      toast.error('No records to import');
      return;
    }

    setIsImporting(true);
    setError(null);
    setImportResults([]);
    setImportProgress({
      total: parsedRecords.length,
      current: 0,
      successful: 0,
      failed: 0,
      duplicates: 0,
    });

    const results: ImportResult[] = [];

    for (let i = 0; i < parsedRecords.length; i++) {
      const record = parsedRecords[i];
      
      try {
        // Check for duplicate
        const dupeCheck = await checkDuplicate(record.metadata.isbn);
        
        if (dupeCheck.isDuplicate) {
          results.push({
            success: false,
            error: `Duplicate ISBN found (Record #${dupeCheck.recordId})`,
            isDuplicate: true,
            duplicateRecordId: dupeCheck.recordId,
          });
          
          setImportProgress(prev => prev ? {
            ...prev,
            current: i + 1,
            duplicates: prev.duplicates + 1,
          } : null);
          
          continue;
        }

        // Import record
        const res = await fetchWithAuth('/api/evergreen/marc', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ marcxml: record.marcxml, source }),
        });

        const data = await res.json();

        if (!res.ok || data.ok === false) {
          throw new Error(data.error || 'Import failed');
        }

        results.push({
          success: true,
          recordId: data.record?.id,
          tcn: data.record?.tcn,
        });

        setImportProgress(prev => prev ? {
          ...prev,
          current: i + 1,
          successful: prev.successful + 1,
        } : null);

      } catch (err: any) {
        results.push({
          success: false,
          error: err?.message || 'Import failed',
        });

        setImportProgress(prev => prev ? {
          ...prev,
          current: i + 1,
          failed: prev.failed + 1,
        } : null);
      }
    }

    setImportResults(results);
    setIsImporting(false);

    const successCount = results.filter(r => r.success).length;
    if (successCount > 0) {
      toast.success(`Successfully imported ${successCount} record${successCount !== 1 ? 's' : ''}`);
    }
    if (results.some(r => !r.success)) {
      toast.error(`${results.filter(r => !r.success).length} record${results.filter(r => !r.success).length !== 1 ? 's' : ''} failed to import`);
    }
  };

  // Helper function to escape XML
  const escapeXml = (unsafe: string): string => {
    return unsafe
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  };

  // Reset form
  const handleReset = () => {
    setFiles([]);
    setParsedRecords([]);
    setImportResults([]);
    setImportProgress(null);
    setError(null);
    setSelectedRecord(null);
  };

  return (
    <PageContainer>
      <PageHeader
        title="MARC Import"
        subtitle="Upload and import MARC records into Evergreen with intelligent de-duplication."
        breadcrumbs={[{ label: "Cataloging", href: "/staff/cataloging" }, { label: "MARC Import" }]}
      >
        <StatusBadge 
          label={ping?.ok ? "Evergreen Online" : "Evergreen Offline"} 
          status={ping?.ok ? "success" : "error"} 
        />
      </PageHeader>

      <PageContent>
        {error && (
          <div className="mb-4">
            <ErrorMessage message={error} onRetry={() => setError(null)} />
          </div>
        )}

        {/* Upload Section */}
        <Card>
          <CardHeader>
            <CardTitle>Upload MARC Files</CardTitle>
            <CardDescription>
              Select MARC files (.mrc binary or .xml/.marcxml) to preview and import.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-2">
              <label className="text-sm font-medium">Record Source</label>
              <Select value={source} onValueChange={setSource} disabled={isImporting}>
                <SelectTrigger className="max-w-sm">
                  <SelectValue placeholder="Select source" />
                </SelectTrigger>
                <SelectContent>
                  {sources.length > 0 ? (
                    sources.map((s) => (
                      <SelectItem key={s.id} value={s.source}>
                        {s.source}
                      </SelectItem>
                    ))
                  ) : (
                    <SelectItem value="System Local">System Local</SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <label className="text-sm font-medium">MARC Files *</label>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="relative"
                  disabled={isImporting || isParsing}
                  onClick={() => document.getElementById('marc-file-input')?.click()}
                >
                  <Upload className="h-4 w-4 mr-2" />
                  {isParsing ? 'Parsing...' : files.length > 0 ? `${files.length} file${files.length !== 1 ? 's' : ''} selected` : 'Select Files'}
                  <input
                    id="marc-file-input"
                    type="file"
                    multiple
                    accept=".mrc,.xml,.marcxml"
                    onChange={handleFileSelect}
                    className="absolute inset-0 opacity-0 cursor-pointer"
                    disabled={isImporting || isParsing}
                  />
                </Button>
                
                {files.length > 0 && !isImporting && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={handleReset}
                  >
                    <X className="h-4 w-4 mr-1" />
                    Clear
                  </Button>
                )}
              </div>
              
              {files.length > 0 && (
                <div className="text-xs text-muted-foreground space-y-1 mt-2">
                  {files.map((file, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <FileText className="h-3 w-3" />
                      <span>{file.name}</span>
                      <span className="text-muted-foreground">({(file.size / 1024).toFixed(1)} KB)</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Preview Section */}
        {parsedRecords.length > 0 && !isImporting && importResults.length === 0 && (
          <Card className="mt-6">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Preview Records</CardTitle>
                  <CardDescription>
                    {parsedRecords.length} record{parsedRecords.length !== 1 ? 's' : ''} ready to import
                  </CardDescription>
                </div>
                <Button onClick={handleBatchImport} disabled={isParsing}>
                  <DownloadIcon className="h-4 w-4 mr-2" />
                  Import All Records
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {parsedRecords.map((record, idx) => (
                  <div
                    key={idx}
                    className="border rounded-lg p-4 hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 space-y-2">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="font-mono">
                            #{idx + 1}
                          </Badge>
                          {record.metadata.isbn && (
                            <Badge variant="secondary" className="font-mono text-xs">
                              <Hash className="h-3 w-3 mr-1" />
                              ISBN: {record.metadata.isbn}
                            </Badge>
                          )}
                        </div>

                        <div className="space-y-1">
                          {record.metadata.title && (
                            <div className="flex items-start gap-2">
                              <BookOpen className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
                              <div>
                                <div className="text-xs text-muted-foreground">Title</div>
                                <div className="font-medium">{record.metadata.title}</div>
                              </div>
                            </div>
                          )}

                          {record.metadata.author && (
                            <div className="flex items-start gap-2">
                              <User className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
                              <div>
                                <div className="text-xs text-muted-foreground">Author</div>
                                <div className="text-sm">{record.metadata.author}</div>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>

                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setSelectedRecord(idx);
                          setShowDiff(true);
                        }}
                      >
                        <Eye className="h-4 w-4 mr-2" />
                        Preview MARC
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Import Progress */}
        {isImporting && importProgress && (
          <Card className="mt-6">
            <CardHeader>
              <CardTitle>Importing Records</CardTitle>
              <CardDescription>
                Processing {importProgress.current} of {importProgress.total} records...
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Progress 
                value={(importProgress.current / importProgress.total) * 100} 
                className="w-full"
              />
              
              <div className="grid grid-cols-4 gap-4 text-center">
                <div className="space-y-1">
                  <div className="text-2xl font-bold text-green-600">{importProgress.successful}</div>
                  <div className="text-xs text-muted-foreground">Successful</div>
                </div>
                <div className="space-y-1">
                  <div className="text-2xl font-bold text-red-600">{importProgress.failed}</div>
                  <div className="text-xs text-muted-foreground">Failed</div>
                </div>
                <div className="space-y-1">
                  <div className="text-2xl font-bold text-amber-600">{importProgress.duplicates}</div>
                  <div className="text-xs text-muted-foreground">Duplicates</div>
                </div>
                <div className="space-y-1">
                  <div className="text-2xl font-bold">{importProgress.current}</div>
                  <div className="text-xs text-muted-foreground">Processed</div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Import Results */}
        {importResults.length > 0 && !isImporting && (
          <Card className="mt-6">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Import Results</CardTitle>
                  <CardDescription>
                    {importResults.filter(r => r.success).length} successful, {' '}
                    {importResults.filter(r => !r.success && !r.isDuplicate).length} failed, {' '}
                    {importResults.filter(r => r.isDuplicate).length} duplicates
                  </CardDescription>
                </div>
                <Button onClick={handleReset} variant="outline">
                  Import More Records
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {importResults.map((result, idx) => (
                  <div
                    key={idx}
                    className={cn(
                      "border rounded-lg p-4 flex items-center justify-between",
                      result.success && "bg-green-50 border-green-200 dark:bg-green-950/20",
                      result.isDuplicate && "bg-amber-50 border-amber-200 dark:bg-amber-950/20",
                      !result.success && !result.isDuplicate && "bg-red-50 border-red-200 dark:bg-red-950/20"
                    )}
                  >
                    <div className="flex items-center gap-3 flex-1">
                      {result.success ? (
                        <CheckCircle2 className="h-5 w-5 text-green-600 shrink-0" />
                      ) : (
                        <AlertCircle className="h-5 w-5 text-red-600 shrink-0" />
                      )}
                      
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">
                            {parsedRecords[idx]?.metadata.title || `Record #${idx + 1}`}
                          </span>
                          {result.success && result.recordId && (
                            <Badge variant="outline" className="font-mono text-xs">
                              ID: {result.recordId}
                            </Badge>
                          )}
                        </div>
                        
                        {result.error && (
                          <div className="text-sm text-muted-foreground mt-1">
                            {result.error}
                          </div>
                        )}
                      </div>
                    </div>

                    {result.success && result.recordId && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => router.push(`/staff/cataloging/marc-editor?id=${result.recordId}`)}
                      >
                        Open in Editor
                        <ArrowRight className="h-4 w-4 ml-2" />
                      </Button>
                    )}

                    {result.isDuplicate && result.duplicateRecordId && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => router.push(`/staff/cataloging/marc-editor?id=${result.duplicateRecordId}`)}
                      >
                        View Existing Record
                        <ArrowRight className="h-4 w-4 ml-2" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* MARC Diff Dialog */}
        {selectedRecord !== null && parsedRecords[selectedRecord] && (
          <MarcDiff
            oldMarc=""
            newMarc={parsedRecords[selectedRecord].marcxml}
            open={showDiff}
            onOpenChange={(open) => {
              setShowDiff(open);
              if (!open) setSelectedRecord(null);
            }}
            onConfirm={() => {
              setShowDiff(false);
              setSelectedRecord(null);
            }}
          />
        )}
      </PageContent>
    </PageContainer>
  );
}
