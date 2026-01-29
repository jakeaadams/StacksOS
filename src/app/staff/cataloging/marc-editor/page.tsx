"use client";

import { fetchWithAuth } from "@/lib/client-fetch";

import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { clientLogger } from "@/lib/client-logger";

import { PageContainer, PageHeader, PageContent } from "@/components/shared";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

import { Save, Check, AlertTriangle, Plus, Trash2, HelpCircle, Loader2 } from "lucide-react";


interface MarcField {
  tag: string;
  ind1: string;
  ind2: string;
  subfields: { code: string; value: string }[];
}

interface MarcRecord {
  leader: string;
  fields: MarcField[];
}

const marcFieldDescriptions: Record<string, string> = {
  "001": "Control Number",
  "003": "Control Number Identifier",
  "005": "Date/Time of Latest Transaction",
  "008": "Fixed-Length Data Elements",
  "010": "Library of Congress Control Number",
  "020": "ISBN",
  "022": "ISSN",
  "040": "Cataloging Source",
  "041": "Language Code",
  "050": "LC Call Number",
  "082": "Dewey Decimal Number",
  "100": "Main Entry - Personal Name",
  "110": "Main Entry - Corporate Name",
  "245": "Title Statement",
  "246": "Varying Form of Title",
  "250": "Edition Statement",
  "264": "Production/Publication",
  "300": "Physical Description",
  "336": "Content Type",
  "337": "Media Type",
  "338": "Carrier Type",
  "490": "Series Statement",
  "500": "General Note",
  "504": "Bibliography Note",
  "505": "Contents Note",
  "520": "Summary",
  "600": "Subject - Personal Name",
  "650": "Subject - Topical Term",
  "651": "Subject - Geographic",
  "700": "Added Entry - Personal Name",
  "856": "Electronic Location",
};

const defaultMarcRecord: MarcRecord = {
  leader: "00000nam a22000007i 4500",
  fields: [
    { tag: "001", ind1: " ", ind2: " ", subfields: [{ code: "", value: "" }] },
    { tag: "003", ind1: " ", ind2: " ", subfields: [{ code: "", value: "StacksOS" }] },
    { tag: "008", ind1: " ", ind2: " ", subfields: [{ code: "", value: "240120s2024    xxu           000 0 eng d" }] },
    { tag: "020", ind1: " ", ind2: " ", subfields: [{ code: "a", value: "" }] },
    { tag: "100", ind1: "1", ind2: " ", subfields: [{ code: "a", value: "" }] },
    {
      tag: "245",
      ind1: "1",
      ind2: "0",
      subfields: [
        { code: "a", value: "" },
        { code: "c", value: "" },
      ],
    },
    {
      tag: "264",
      ind1: " ",
      ind2: "1",
      subfields: [
        { code: "a", value: "" },
        { code: "b", value: "" },
        { code: "c", value: "" },
      ],
    },
    { tag: "300", ind1: " ", ind2: " ", subfields: [{ code: "a", value: "" }] },
    { tag: "650", ind1: " ", ind2: "0", subfields: [{ code: "a", value: "" }] },
  ],
};

function escapeXml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function parseMarcXml(marcXml: string): MarcRecord | null {
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(marcXml, "text/xml");
    const record = doc.querySelector("record");

    if (!record) return null;

    const leaderEl = record.querySelector("leader");
    const leader = leaderEl?.textContent || "00000nam a22000007i 4500";

    const fields: MarcField[] = [];

    // Control fields
    record.querySelectorAll("controlfield").forEach((cf) => {
      const tag = cf.getAttribute("tag") || "";
      fields.push({
        tag,
        ind1: " ",
        ind2: " ",
        subfields: [{ code: "", value: cf.textContent || "" }],
      });
    });

    // Data fields
    record.querySelectorAll("datafield").forEach((df) => {
      const tag = df.getAttribute("tag") || "";
      const ind1 = df.getAttribute("ind1") || " ";
      const ind2 = df.getAttribute("ind2") || " ";

      const subfields: { code: string; value: string }[] = [];
      df.querySelectorAll("subfield").forEach((sf) => {
        subfields.push({
          code: sf.getAttribute("code") || "",
          value: sf.textContent || "",
        });
      });

      fields.push({ tag, ind1, ind2, subfields });
    });

    fields.sort((a, b) => a.tag.localeCompare(b.tag));

    return { leader, fields };
  } catch (error) {
    clientLogger.error("Error parsing MARC XML:", error);
    return null;
  }
}

function buildMarcXml(record: MarcRecord): string {
  const parts: string[] = [];

  parts.push('<?xml version="1.0" encoding="UTF-8"?>');
  parts.push('<record xmlns="http://www.loc.gov/MARC21/slim">');
  parts.push(`<leader>${escapeXml(record.leader || "00000nam a22000007i 4500")}</leader>`);

  for (const field of record.fields) {
    const tag = (field.tag || "").trim();
    if (!tag) continue;

    const tagNum = Number.parseInt(tag, 10);

    if (!Number.isNaN(tagNum) && tagNum < 10) {
      const value = escapeXml(field.subfields?.[0]?.value || "");
      parts.push(`<controlfield tag="${escapeXml(tag)}">${value}</controlfield>`);
      continue;
    }

    const ind1 = (field.ind1 || " ").slice(0, 1);
    const ind2 = (field.ind2 || " ").slice(0, 1);

    const subfields = (field.subfields || [])
      .filter((sf) => sf.code && sf.code.trim())
      .map((sf) => {
        const code = escapeXml(sf.code.trim().slice(0, 1));
        const value = escapeXml(sf.value || "");
        return `<subfield code="${code}">${value}</subfield>`;
      })
      .join("");

    parts.push(
      `<datafield tag="${escapeXml(tag)}" ind1="${escapeXml(ind1)}" ind2="${escapeXml(ind2)}">${subfields}</datafield>`
    );
  }

  parts.push("</record>");

  return parts.join("");
}

function MarcEditorContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const recordId = searchParams.get("id");

  const [record, setRecord] = useState<MarcRecord>(defaultMarcRecord);
  const [bibInfo, setBibInfo] = useState<{ title: string; author: string } | null>(null);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [hasChanges, setHasChanges] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [loading, setLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!recordId) return;
    void loadRecord(recordId);
  }, [recordId]);

  const loadRecord = async (id: string) => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetchWithAuth(`/api/evergreen/catalog?action=record&id=${id}`);
      const data = await response.json();

      if (data.ok && data.record) {
        setBibInfo({ title: data.record.title, author: data.record.author });

        if (data.record.marc_xml) {
          const parsed = parseMarcXml(data.record.marc_xml);
          if (parsed) {
            setRecord(parsed);
            setHasChanges(false);
            setValidationErrors([]);
          } else {
            setError("Failed to parse MARC record");
          }
        } else {
          setError("No MARC data available for this record");
        }
      } else {
        setError(data.error || "Failed to load record");
      }
    } catch {
      setError("Failed to connect to catalog service");
    } finally {
      setLoading(false);
    }
  };

  const updateField = (index: number, updates: Partial<MarcField>) => {
    const newFields = [...record.fields];
    newFields[index] = { ...newFields[index], ...updates };
    setRecord({ ...record, fields: newFields });
    setHasChanges(true);
  };

  const updateSubfield = (fieldIndex: number, subfieldIndex: number, code: string, value: string) => {
    const newFields = [...record.fields];
    const newSubfields = [...newFields[fieldIndex].subfields];
    newSubfields[subfieldIndex] = { code, value };
    newFields[fieldIndex] = { ...newFields[fieldIndex], subfields: newSubfields };
    setRecord({ ...record, fields: newFields });
    setHasChanges(true);
  };

  const addSubfield = (fieldIndex: number) => {
    const newFields = [...record.fields];
    newFields[fieldIndex].subfields.push({ code: "", value: "" });
    setRecord({ ...record, fields: newFields });
    setHasChanges(true);
  };

  const addField = (tag: string = "") => {
    const newField: MarcField = { tag, ind1: " ", ind2: " ", subfields: [{ code: "a", value: "" }] };
    setRecord({
      ...record,
      fields: [...record.fields, newField].sort((a, b) => a.tag.localeCompare(b.tag)),
    });
    setHasChanges(true);
  };

  const removeField = (index: number) => {
    const newFields = [...record.fields];
    newFields.splice(index, 1);
    setRecord({ ...record, fields: newFields });
    setHasChanges(true);
  };

  const validateRecord = () => {
    const errors: string[] = [];
    const has245 = record.fields.some((f) =>
      f.tag === "245" && f.subfields.some((s) => s.code === "a" && s.value.trim())
    );
    if (!has245) errors.push("Field 245 (Title) is required");
    setValidationErrors(errors);
    return errors.length === 0;
  };

  const saveRecord = async () => {
    if (!validateRecord()) return;

    setIsSaving(true);
    setError(null);

    try {
      const marcxml = buildMarcXml(record);

      if (recordId) {
        const res = await fetchWithAuth("/api/evergreen/marc", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ recordId: Number(recordId), marcxml }),
        });
        const data = await res.json();
        if (!res.ok || data.ok === false) {
          throw new Error(data.error || "Save failed");
        }
        toast.success("Record saved");
        setHasChanges(false);
        return;
      }

      const res = await fetchWithAuth("/api/evergreen/marc", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ marcxml, source: "System Local" }),
      });
      const data = await res.json();
      if (!res.ok || data.ok === false) {
        throw new Error(data.error || "Create failed");
      }
      const newId = data.record?.id;
      toast.success("Record created", { description: newId ? `Record ${newId}` : undefined });
      if (newId) {
        router.push(`/staff/cataloging/marc-editor?id=${newId}`);
      }
      setHasChanges(false);
    } catch (err: any) {
      const message = err?.message || "Save failed";
      toast.error(message);
      setError(message);
    } finally {
      setIsSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <PageContainer>
      <PageHeader
        title="MARC Editor"
        subtitle="Edit bibliographic records with real Evergreen saves."
        breadcrumbs={[{ label: "Cataloging", href: "/staff/cataloging" }, { label: "MARC Editor" }]}
      />
      <PageContent className="p-0">
        <div className="h-full flex flex-col -m-6">
          <div className="bg-muted/50 border-b px-4 py-2 flex items-center gap-2">
            <Button size="sm" onClick={saveRecord} disabled={!hasChanges || isSaving}>
              {isSaving ? (
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
              ) : (
                <Save className="h-4 w-4 mr-1" />
              )}
              Save Record
            </Button>
            <Button size="sm" variant="outline" onClick={validateRecord}>
              <Check className="h-4 w-4 mr-1" />Validate
            </Button>
            <div className="border-l h-6 mx-2" />
            <Button size="sm" variant="outline" onClick={() => addField()}>
              <Plus className="h-4 w-4 mr-1" />Add Field
            </Button>
            <div className="flex-1" />
            <Button size="sm" variant="ghost" onClick={() => setShowHelp(!showHelp)}>
              <HelpCircle className="h-4 w-4" />
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link href="/staff/cataloging">Close</Link>
            </Button>
          </div>

          {error && (
            <div className="px-4 py-2 bg-red-50 border-b">
              <div className="flex items-center gap-2 text-sm text-red-600">
                <AlertTriangle className="h-4 w-4" />
                {error}
              </div>
            </div>
          )}

          {validationErrors.length > 0 && (
            <div className="px-4 py-2 bg-red-50 border-b">
              {validationErrors.map((err, idx) => (
                <div key={idx} className="flex items-center gap-2 text-sm text-red-600">
                  <AlertTriangle className="h-4 w-4" />
                  {err}
                </div>
              ))}
            </div>
          )}

          <div className="flex-1 overflow-auto p-4">
            <div className="flex gap-4">
              <Card className="flex-1">
                <CardHeader className="py-3">
                  <CardTitle className="text-base flex items-center justify-between">
                    <span>
                      {recordId ? (
                        <div>
                          <div>Editing Record #{recordId}</div>
                          {bibInfo && (
                            <div className="text-sm font-normal text-muted-foreground">{bibInfo.title}</div>
                          )}
                        </div>
                      ) : (
                        "New Bibliographic Record"
                      )}
                    </span>
                    {hasChanges && <Badge variant="outline">Unsaved Changes</Badge>}
                  </CardTitle>
                </CardHeader>

                <CardContent className="space-y-4">
                  <div className="p-3 bg-muted/50 rounded-lg">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium">Leader (LDR)</span>
                      <Badge variant="outline">24 chars</Badge>
                    </div>
                    <Input
                      value={record.leader}
                      onChange={(e) => {
                        setRecord({ ...record, leader: e.target.value });
                        setHasChanges(true);
                      }}
                      className="font-mono text-sm"
                      maxLength={24}
                    />
                  </div>

                  <div className="space-y-2">
                    {record.fields.map((field, fieldIndex) => (
                      <div key={fieldIndex} className="border rounded-lg p-3">
                        <div className="flex items-center gap-2 mb-2">
                          <Input
                            value={field.tag}
                            onChange={(e) => updateField(fieldIndex, { tag: e.target.value })}
                            className="w-16 font-mono text-sm font-bold"
                            maxLength={3}
                            placeholder="Tag"
                          />

                          {Number.parseInt(field.tag) >= 10 && (
                            <>
                              <Input
                                value={field.ind1}
                                onChange={(e) => updateField(fieldIndex, { ind1: e.target.value || " " })}
                                className="w-10 font-mono text-sm text-center"
                                maxLength={1}
                                placeholder="_"
                              />
                              <Input
                                value={field.ind2}
                                onChange={(e) => updateField(fieldIndex, { ind2: e.target.value || " " })}
                                className="w-10 font-mono text-sm text-center"
                                maxLength={1}
                                placeholder="_"
                              />
                            </>
                          )}

                          <span className="flex-1 text-sm text-muted-foreground truncate">
                            {marcFieldDescriptions[field.tag] || "Unknown field"}
                          </span>

                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-8 w-8 p-0 text-red-600"
                            onClick={() => removeField(fieldIndex)}
                            title="Delete field"
                          >
                            <Trash2 className="h-4 w-4" />
                            <span className="sr-only">Delete field</span>
                          </Button>
                        </div>

                        {Number.parseInt(field.tag) < 10 ? (
                          <Input
                            value={field.subfields[0]?.value || ""}
                            onChange={(e) => updateSubfield(fieldIndex, 0, "", e.target.value)}
                            className="font-mono text-sm"
                            placeholder="Field value"
                          />
                        ) : (
                          <div className="space-y-1 ml-4">
                            {field.subfields.map((subfield, subfieldIndex) => (
                              <div key={subfieldIndex} className="flex items-center gap-2">
                                <span className="text-muted-foreground">$</span>
                                <Input
                                  value={subfield.code}
                                  onChange={(e) =>
                                    updateSubfield(fieldIndex, subfieldIndex, e.target.value, subfield.value)
                                  }
                                  className="w-10 font-mono text-sm"
                                  maxLength={1}
                                  placeholder="a"
                                />
                                <Input
                                  value={subfield.value}
                                  onChange={(e) =>
                                    updateSubfield(fieldIndex, subfieldIndex, subfield.code, e.target.value)
                                  }
                                  className="flex-1 font-mono text-sm"
                                  placeholder="Subfield value"
                                />
                              </div>
                            ))}
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => addSubfield(fieldIndex)}
                              className="text-xs"
                            >
                              <Plus className="h-3 w-3 mr-1" />Add Subfield
                            </Button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>

                  <div className="flex flex-wrap gap-2 pt-4 border-t">
                    <span className="text-sm text-muted-foreground mr-2">Quick Add:</span>
                    {["020", "050", "082", "100", "245", "264", "300", "500", "650", "700", "856"].map((tag) => (
                      <Button key={tag} size="sm" variant="outline" onClick={() => addField(tag)}>
                        {tag}
                      </Button>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {showHelp && (
                <div className="w-72 border rounded-lg p-4 bg-muted/30">
                  <h3 className="font-medium mb-3 flex items-center gap-2">
                    <HelpCircle className="h-4 w-4" />MARC Help
                  </h3>
                  <div className="space-y-2 text-sm">
                    {Object.entries(marcFieldDescriptions)
                      .slice(0, 12)
                      .map(([tag, desc]) => (
                        <div key={tag} className="flex gap-2">
                          <Badge variant="outline" className="shrink-0">{tag}</Badge>
                          <span className="text-muted-foreground text-xs">{desc}</span>
                        </div>
                      ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="bg-muted/50 border-t px-4 py-1 text-xs text-muted-foreground flex items-center gap-4">
            <span>Fields: {record.fields.length}</span>
            <span>Errors: {validationErrors.length}</span>
            <div className="flex-1" />
            <span>MARC21 Bibliographic</span>
          </div>
        </div>
      </PageContent>
    </PageContainer>
  );
}

export default function MarcEditorPage() {
  return (
    <Suspense fallback={<div className="p-4">Loading...</div>}>
      <MarcEditorContent />
    </Suspense>
  );
}
