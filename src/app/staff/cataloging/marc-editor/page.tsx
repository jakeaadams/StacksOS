"use client";

import { fetchWithAuth } from "@/lib/client-fetch";
import { useCallback, useEffect, useMemo, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { clientLogger } from "@/lib/client-logger";

import { PageContainer, PageHeader, PageContent } from "@/components/shared";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Save,
  Check,
  AlertTriangle,
  Plus,
  HelpCircle,
  Loader2,
  Columns2,
  Sparkles,
  ClipboardList,
  Users,
} from "lucide-react";
import { featureFlags } from "@/lib/feature-flags";

import {
  FixedFieldsEditor,
  MarcFieldRow,
  AiSuggestionsPanel,
  TasksPanel,
  ComparePanel,
} from "./_components";
import type {
  MarcField,
  MarcRecord,
  AiCatalogingSuggestion,
  RecordPresence,
  RecordTask,
} from "./_components/marc-types";
import {
  defaultMarcRecord,
  marcFieldDescriptions,
  marcTagSuggestions,
  indicatorRules,
  indicatorLabel,
  QUICK_ADD_TAGS,
} from "./_components/marc-constants";
import {
  controlTagSort,
  parseMarcXml,
  buildMarcXml,
  recordToLines,
  toCounts,
  applySuggestionToRecord,
} from "./_components/marc-utils";

function MarcEditorContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const recordId = searchParams.get("id");
  const compareIdParam = searchParams.get("compare");

  // ---- Core editor state ----
  const [record, setRecord] = useState<MarcRecord>(defaultMarcRecord);
  const [bibInfo, setBibInfo] = useState<{ title: string; author: string } | null>(null);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [hasChanges, setHasChanges] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [loading, setLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ---- Compare state ----
  const [comparePanelOpen, setComparePanelOpen] = useState(false);
  const [compareDraft, setCompareDraft] = useState("");
  const [compareRecord, setCompareRecord] = useState<MarcRecord | null>(null);
  const [compareBibInfo, setCompareBibInfo] = useState<{ title: string; author: string } | null>(
    null
  );
  const [compareLoading, setCompareLoading] = useState(false);
  const [compareError, setCompareError] = useState<string | null>(null);
  const [diffOnly, setDiffOnly] = useState(false);

  // ---- AI state ----
  const canAi = featureFlags.ai;
  const [aiPanelOpen, setAiPanelOpen] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiDraftId, setAiDraftId] = useState<string | null>(null);
  const [aiSuggestions, setAiSuggestions] = useState<AiCatalogingSuggestion[]>([]);
  const [aiDecisions, setAiDecisions] = useState<Record<string, "accepted" | "rejected">>({});
  const [aiExpandedDiffs, setAiExpandedDiffs] = useState<Record<string, boolean>>({});

  // ---- Tasks state ----
  const [tasksPanelOpen, setTasksPanelOpen] = useState(false);
  const [tasksLoading, setTasksLoading] = useState(false);
  const [tasksError, setTasksError] = useState<string | null>(null);
  const [tasks, setTasks] = useState<RecordTask[]>([]);
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [newTaskBody, setNewTaskBody] = useState("");

  // ---- Presence state ----
  const [presence, setPresence] = useState<RecordPresence[]>([]);

  // ---- Diff computation ----
  const baseLines = useMemo(() => recordToLines(record), [record]);
  const compareLines = useMemo(
    () => (compareRecord ? recordToLines(compareRecord) : []),
    [compareRecord]
  );
  const diff = useMemo(() => {
    const baseCounts = toCounts(baseLines);
    const compareCounts = toCounts(compareLines);
    const keys = new Set<string>([...baseCounts.keys(), ...compareCounts.keys()]);
    const order = new Map<string, number>();
    for (let i = 0; i < baseLines.length; i += 1) {
      const line = baseLines[i];
      if (!order.has(line!)) order.set(line!, i);
    }
    let nextOrder = baseLines.length;
    for (const line of compareLines) {
      if (!order.has(line)) order.set(line, nextOrder++);
    }
    const rows = [...keys]
      .sort((a, b) => (order.get(a) ?? 0) - (order.get(b) ?? 0))
      .map((line) => {
        const baseCount = baseCounts.get(line) || 0;
        const compareCount = compareCounts.get(line) || 0;
        if (baseCount === compareCount)
          return { line, kind: "same" as const, baseCount, compareCount, delta: 0 };
        if (compareCount > baseCount)
          return {
            line,
            kind: "added" as const,
            baseCount,
            compareCount,
            delta: compareCount - baseCount,
          };
        return {
          line,
          kind: "removed" as const,
          baseCount,
          compareCount,
          delta: baseCount - compareCount,
        };
      });
    const added = rows.filter((r) => r.kind === "added").reduce((sum, r) => sum + r.delta, 0);
    const removed = rows.filter((r) => r.kind === "removed").reduce((sum, r) => sum + r.delta, 0);
    return { rows, added, removed, hasCompare: Boolean(compareRecord) };
  }, [baseLines, compareLines, compareRecord]);

  // ---- Helpers ----
  const recordIdNum = recordId && /^\d+$/.test(recordId) ? parseInt(recordId, 10) : 0;

  const extractFirst = (tag: string, code: string): string | null => {
    const f = record.fields.find((x) => String(x.tag || "").trim() === tag);
    if (!f) return null;
    const sub = (f.subfields || []).find((s) => String(s.code || "").trim() === code);
    const v = sub ? String(sub.value || "").trim() : "";
    return v ? v : null;
  };

  const getControlFieldValue = useCallback(
    (tag: string) => {
      const field = record.fields.find((f) => f.tag === tag);
      return field?.subfields?.[0]?.value || "";
    },
    [record.fields]
  );

  const updateControlField = useCallback(
    (tag: string, value: string) => {
      const nextFields = [...record.fields];
      const index = nextFields.findIndex((f) => f.tag === tag);
      if (index >= 0) {
        nextFields[index] = {
          ...nextFields[index],
          tag,
          ind1: " ",
          ind2: " ",
          subfields: [{ code: "", value }],
        };
      } else {
        nextFields.push({ tag, ind1: " ", ind2: " ", subfields: [{ code: "", value }] });
      }
      nextFields.sort((a, b) => controlTagSort(a.tag, b.tag));
      setRecord({ ...record, fields: nextFields });
      setHasChanges(true);
    },
    [record]
  );

  const currentLeader = String(record.leader || "")
    .padEnd(24, " ")
    .slice(0, 24);
  const field008 = String(getControlFieldValue("008") || "")
    .padEnd(40, " ")
    .slice(0, 40);

  const updateLeaderPos = (position: number, value: string) => {
    const next = currentLeader.split("");
    next[position] = (value || " ").slice(0, 1);
    setRecord({ ...record, leader: next.join("") });
    setHasChanges(true);
  };

  const update008Pos = (position: number, value: string) => {
    const next = field008.split("");
    next[position] = (value || " ").slice(0, 1);
    updateControlField("008", next.join(""));
  };

  const update008Range = (start: number, endExclusive: number, value: string) => {
    const next = field008.split("");
    const width = endExclusive - start;
    const normalized = String(value || "")
      .slice(0, width)
      .padEnd(width, " ");
    for (let i = 0; i < width; i += 1) next[start + i] = normalized[i]!;
    updateControlField("008", next.join(""));
  };

  // ---- Field operations ----
  const updateField = (index: number, updates: Partial<MarcField>) => {
    const newFields = [...record.fields];
    newFields[index] = { ...newFields[index], ...updates }! as MarcField;
    setRecord({ ...record, fields: newFields });
    setHasChanges(true);
  };

  const updateSubfield = (
    fieldIndex: number,
    subfieldIndex: number,
    code: string,
    value: string
  ) => {
    const newFields = [...record.fields];
    const newSubfields = [...newFields[fieldIndex]!.subfields];
    newSubfields[subfieldIndex] = { code, value };
    newFields[fieldIndex] = { ...newFields[fieldIndex], subfields: newSubfields }! as MarcField;
    setRecord({ ...record, fields: newFields });
    setHasChanges(true);
  };

  const addSubfield = (fieldIndex: number) => {
    const newFields = [...record.fields];
    newFields[fieldIndex]!.subfields.push({ code: "", value: "" });
    setRecord({ ...record, fields: newFields });
    setHasChanges(true);
  };

  const addField = (tag: string = "") => {
    const newField: MarcField = {
      tag,
      ind1: " ",
      ind2: " ",
      subfields: [{ code: "a", value: "" }],
    };
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

  // ---- Validate ----
  const validateRecord = () => {
    const errors: string[] = [];
    const has245 = record.fields.some(
      (f) => f.tag === "245" && f.subfields.some((s) => s.code === "a" && s.value.trim())
    );
    if (!has245) errors.push("Field 245 (Title) is required");
    const normalizedLeader = String(record.leader || "");
    if (normalizedLeader.length !== 24)
      errors.push(`Leader must be 24 characters (currently ${normalizedLeader.length})`);
    const fixed008 = getControlFieldValue("008");
    if (fixed008 && fixed008.length !== 40)
      errors.push(`Field 008 must be 40 characters when present (currently ${fixed008.length})`);
    for (const field of record.fields) {
      if (!/^\d{3}$/.test(String(field.tag || ""))) {
        errors.push(`Field tag "${field.tag || "blank"}" must be a 3-digit numeric tag`);
        continue;
      }
      const tagNum = Number.parseInt(field.tag, 10);
      if (tagNum >= 10) {
        if (String(field.ind1 || "").length !== 1 || String(field.ind2 || "").length !== 1)
          errors.push(`Field ${field.tag} indicators must be exactly 1 character each`);
        const rule = indicatorRules[field.tag];
        if (rule) {
          const ind1 = String(field.ind1 || " ").slice(0, 1) || " ";
          const ind2 = String(field.ind2 || " ").slice(0, 1) || " ";
          if (!rule.ind1.includes(ind1))
            errors.push(
              `Field ${field.tag} ind1 "${indicatorLabel(ind1)}" is invalid (allowed: ${rule.ind1.map(indicatorLabel).join(", ")})`
            );
          if (!rule.ind2.includes(ind2))
            errors.push(
              `Field ${field.tag} ind2 "${indicatorLabel(ind2)}" is invalid (allowed: ${rule.ind2.map(indicatorLabel).join(", ")})`
            );
        }
      }
    }
    setValidationErrors(errors);
    return errors.length === 0;
  };

  // ---- Load / Save ----
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
          } else setError("Failed to parse MARC record");
        } else setError("No MARC data available for this record");
      } else setError(data.error || "Failed to load record");
    } catch {
      setError("Failed to connect to catalog service");
    } finally {
      setLoading(false);
    }
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
        if (!res.ok || data.ok === false) throw new Error(data.error || "Save failed");
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
      if (!res.ok || data.ok === false) throw new Error(data.error || "Create failed");
      const newId = data.record?.id;
      toast.success("Record created", { description: newId ? `Record ${newId}` : undefined });
      if (newId) router.push(`/staff/cataloging/marc-editor?id=${newId}`);
      setHasChanges(false);
    } catch (err: any) {
      const message = err instanceof Error ? err.message : "Save failed";
      toast.error(message);
      setError(message);
    } finally {
      setIsSaving(false);
    }
  };

  // ---- Compare ----
  const loadCompareRecord = async (id: string) => {
    setCompareLoading(true);
    setCompareError(null);
    setCompareRecord(null);
    setCompareBibInfo(null);
    try {
      const response = await fetchWithAuth(
        `/api/evergreen/catalog?action=record&id=${encodeURIComponent(id)}`
      );
      const data = await response.json();
      if (!data.ok || !data.record) throw new Error(data.error || "Failed to load compare record");
      setCompareBibInfo({ title: data.record.title, author: data.record.author });
      if (!data.record.marc_xml) throw new Error("No MARC data available for compare record");
      const parsed = parseMarcXml(data.record.marc_xml);
      if (!parsed) throw new Error("Failed to parse compare MARC record");
      setCompareRecord(parsed);
    } catch (e) {
      setCompareError(e instanceof Error ? e.message : String(e));
    } finally {
      setCompareLoading(false);
    }
  };

  const updateCompareInUrl = (nextCompare: string | null) => {
    const params = new URLSearchParams(searchParams.toString());
    if (nextCompare && nextCompare.trim()) params.set("compare", nextCompare.trim());
    else params.delete("compare");
    router.replace(`/staff/cataloging/marc-editor?${params.toString()}`);
  };

  const closeCompare = () => {
    setComparePanelOpen(false);
    setCompareDraft("");
    setCompareRecord(null);
    setCompareBibInfo(null);
    setCompareError(null);
    updateCompareInUrl(null);
  };
  const clearCompare = () => {
    setCompareDraft("");
    setCompareRecord(null);
    setCompareBibInfo(null);
    setCompareError(null);
    updateCompareInUrl(null);
  };
  const canLoadCompare =
    Boolean(recordId) && /^\d+$/.test(compareDraft.trim()) && compareDraft.trim() !== recordId;

  // ---- AI ----
  const applySuggestion = (s: AiCatalogingSuggestion) => {
    const suggestedValue = String(s?.suggestedValue || "").trim();
    if (!suggestedValue) return;
    setRecord((prev) => applySuggestionToRecord(prev, s));
    setHasChanges(true);
  };

  const decideSuggestion = async (decision: "accepted" | "rejected", suggestionId: string) => {
    if (!aiDraftId) return;
    try {
      await fetchWithAuth(`/api/ai/drafts/${aiDraftId}/decision`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision, suggestionId }),
      });
    } catch (e) {
      clientLogger.warn("AI draft decision failed", e);
    }
  };

  const runAi = async () => {
    if (!canAi) return;
    setAiPanelOpen(true);
    setAiLoading(true);
    setAiError(null);
    try {
      const marcXml = buildMarcXml(record);
      const title = extractFirst("245", "a") || undefined;
      const author = extractFirst("100", "a") || extractFirst("110", "a") || undefined;
      const isbn = extractFirst("020", "a") || undefined;
      const recordIdNum2 = recordId && /^\d+$/.test(recordId) ? parseInt(recordId, 10) : undefined;
      const res = await fetchWithAuth("/api/ai/cataloging-suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recordId: recordIdNum2,
          title,
          author,
          isbn,
          marcXml,
          allowExternalLookups: false,
        }),
      });
      const json = await res.json();
      if (!res.ok || json.ok === false) throw new Error(json.error || "AI request failed");
      setAiDraftId(json.draftId || null);
      setAiSuggestions(Array.isArray(json.response?.suggestions) ? json.response.suggestions : []);
      setAiDecisions({});
      setAiExpandedDiffs({});
    } catch (e) {
      setAiError(e instanceof Error ? e.message : String(e));
      setAiDraftId(null);
      setAiSuggestions([]);
      setAiDecisions({});
      setAiExpandedDiffs({});
    } finally {
      setAiLoading(false);
    }
  };

  // ---- Presence ----
  const loadPresence = useCallback(async () => {
    if (!recordIdNum) return;
    try {
      const res = await fetchWithAuth(
        `/api/collaboration/presence?recordType=bib&recordId=${recordIdNum}`
      );
      const json = await res.json();
      if (!res.ok || json.ok === false) return;
      setPresence(Array.isArray(json.presence) ? json.presence : []);
    } catch {
      /* Best-effort. */
    }
  }, [recordIdNum]);

  const heartbeatPresence = useCallback(
    async (activity: "viewing" | "editing") => {
      if (!recordIdNum) return;
      try {
        await fetchWithAuth("/api/collaboration/presence", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ recordType: "bib", recordId: recordIdNum, activity }),
        });
      } catch {
        /* Best-effort. */
      }
    },
    [recordIdNum]
  );

  // ---- Tasks ----
  const loadTasks = async () => {
    if (!recordIdNum) return;
    setTasksLoading(true);
    setTasksError(null);
    try {
      const res = await fetchWithAuth(
        `/api/collaboration/tasks?recordType=bib&recordId=${recordIdNum}`
      );
      const json = await res.json();
      if (!res.ok || json.ok === false) throw new Error(json.error || "Failed to load tasks");
      setTasks(Array.isArray(json.tasks) ? json.tasks : []);
    } catch (e) {
      setTasksError(e instanceof Error ? e.message : String(e));
      setTasks([]);
    } finally {
      setTasksLoading(false);
    }
  };

  const createTask = async () => {
    if (!recordIdNum) return;
    const title = newTaskTitle.trim();
    if (!title) return;
    try {
      const res = await fetchWithAuth("/api/collaboration/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recordType: "bib",
          recordId: recordIdNum,
          title,
          body: newTaskBody.trim() || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok || json.ok === false) throw new Error(json.error || "Failed to create task");
      setNewTaskTitle("");
      setNewTaskBody("");
      await loadTasks();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    }
  };

  const setTaskStatus = async (taskId: number, status: "open" | "done" | "canceled") => {
    try {
      const res = await fetchWithAuth("/api/collaboration/tasks", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: taskId, status }),
      });
      const json = await res.json();
      if (!res.ok || json.ok === false) throw new Error(json.error || "Failed to update task");
      await loadTasks();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    }
  };

  // ---- Effects ----
  useEffect(() => {
    if (!recordId) return;
    void loadRecord(recordId);
  }, [recordId]);

  useEffect(() => {
    if (!recordIdNum) return;
    void heartbeatPresence("editing");
    void loadPresence();
    const t = window.setInterval(() => {
      void heartbeatPresence("editing");
      void loadPresence();
    }, 20000);
    return () => window.clearInterval(t);
  }, [heartbeatPresence, loadPresence, recordIdNum]);

  useEffect(() => {
    const id = compareIdParam && /^\d+$/.test(compareIdParam) ? compareIdParam : "";
    if (id) {
      setComparePanelOpen(true);
      setCompareDraft(id);
      void loadCompareRecord(id);
      return;
    }
    setCompareRecord(null);
    setCompareBibInfo(null);
    setCompareError(null);
  }, [compareIdParam]);

  // ---- Render ----
  if (loading)
    return (
      <div className="h-full flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );

  return (
    <PageContainer>
      <PageHeader
        title="MARC Editor"
        subtitle="Edit bibliographic records with real Evergreen saves."
        breadcrumbs={[{ label: "Cataloging", href: "/staff/cataloging" }, { label: "MARC Editor" }]}
      />
      <PageContent className="p-0">
        <div className="h-full flex flex-col -m-6">
          {/* Toolbar */}
          <div className="bg-muted/50 border-b px-4 py-2 flex items-center gap-2">
            <Button size="sm" onClick={saveRecord} disabled={!hasChanges || isSaving}>
              {isSaving ? (
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
              ) : (
                <Save className="h-4 w-4 mr-1" />
              )}{" "}
              Save Record
            </Button>
            <Button size="sm" variant="outline" onClick={validateRecord}>
              <Check className="h-4 w-4 mr-1" /> Validate
            </Button>
            <div className="border-l h-6 mx-2" />
            <Button size="sm" variant="outline" onClick={() => addField()}>
              <Plus className="h-4 w-4 mr-1" /> Add Field
            </Button>
            <div className="flex-1" />
            {presence.length > 0 && (
              <Badge variant="secondary" className="hidden sm:inline-flex items-center gap-2">
                <Users className="h-3.5 w-3.5" />
                {(() => {
                  const names = presence
                    .map((p) => p.actorName || "Staff")
                    .slice(0, 2)
                    .join(", ");
                  const extra = presence.length > 2 ? ` +${presence.length - 2}` : "";
                  const verb = presence.some((p) => p.activity === "editing")
                    ? "editing"
                    : "viewing";
                  return `${names}${extra} ${verb}`;
                })()}
              </Badge>
            )}
            <Button
              size="sm"
              variant={comparePanelOpen ? "default" : "outline"}
              onClick={() => {
                if (!recordId) return;
                if (comparePanelOpen) {
                  closeCompare();
                  return;
                }
                setComparePanelOpen(true);
                setCompareDraft(
                  compareIdParam && /^\d+$/.test(compareIdParam) ? compareIdParam : ""
                );
              }}
              title="Split-screen compare"
              disabled={!recordId}
            >
              <Columns2 className="h-4 w-4 mr-1" /> Compare
            </Button>
            {canAi && (
              <Button
                size="sm"
                variant={aiPanelOpen ? "default" : "outline"}
                onClick={() => {
                  if (aiPanelOpen) {
                    setAiPanelOpen(false);
                    return;
                  }
                  void runAi();
                }}
                title="AI cataloging suggestions (draft-only)"
              >
                <Sparkles className="h-4 w-4 mr-1" /> AI
              </Button>
            )}
            <Button
              size="sm"
              variant={tasksPanelOpen ? "default" : "outline"}
              onClick={() => {
                if (tasksPanelOpen) {
                  setTasksPanelOpen(false);
                  return;
                }
                setTasksPanelOpen(true);
                void loadTasks();
              }}
              title="Record tasks/notes (draft-only)"
              disabled={!recordIdNum}
            >
              <ClipboardList className="h-4 w-4 mr-1" /> Tasks
            </Button>
            {comparePanelOpen && (
              <Button
                size="sm"
                variant={diffOnly ? "default" : "outline"}
                onClick={() => setDiffOnly((v) => !v)}
                title="Toggle differences only"
              >
                Diff only
              </Button>
            )}
            <Button size="sm" variant="ghost" onClick={() => setShowHelp(!showHelp)}>
              <HelpCircle className="h-4 w-4" />
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link href="/staff/cataloging">Close</Link>
            </Button>
          </div>

          {/* Error/validation banners */}
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
          {presence.some((p) => p.activity === "editing") && (
            <div className="px-4 py-2 border-b bg-background">
              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  {(() => {
                    const editing = presence.filter((p) => p.activity === "editing");
                    const names = editing
                      .map((p) => p.actorName || "Staff")
                      .slice(0, 2)
                      .join(", ");
                    const extra = editing.length > 2 ? ` +${editing.length - 2}` : "";
                    return `${names}${extra} is editing this record. Changes are not locked; review diffs before saving to avoid overwrites.`;
                  })()}
                </AlertDescription>
              </Alert>
            </div>
          )}

          {/* Main content */}
          <div className="flex-1 overflow-auto p-4">
            <div className="flex flex-col lg:flex-row gap-4">
              <Card className="flex-1 min-w-0">
                <CardHeader className="py-3">
                  <CardTitle className="text-base flex items-center justify-between">
                    <span>
                      {recordId ? (
                        <div>
                          <div>Editing Record #{recordId}</div>
                          {bibInfo && (
                            <div className="text-sm font-normal text-muted-foreground">
                              {bibInfo.title}
                            </div>
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
                  <FixedFieldsEditor
                    currentLeader={currentLeader}
                    field008={field008}
                    onLeaderChange={(v) => {
                      setRecord({ ...record, leader: v });
                      setHasChanges(true);
                    }}
                    onLeaderPosChange={updateLeaderPos}
                    on008PosChange={update008Pos}
                    on008RangeChange={update008Range}
                    onControlFieldChange={updateControlField}
                  />
                  <div className="space-y-2">
                    {record.fields.map((field, fieldIndex) => (
                      <MarcFieldRow
                        key={fieldIndex}
                        field={field}
                        fieldIndex={fieldIndex}
                        onUpdateField={updateField}
                        onUpdateSubfield={updateSubfield}
                        onAddSubfield={addSubfield}
                        onRemoveField={removeField}
                      />
                    ))}
                  </div>
                  <div className="flex flex-wrap gap-2 pt-4 border-t">
                    <span className="text-sm text-muted-foreground mr-2">Quick Add:</span>
                    {QUICK_ADD_TAGS.map((tag) => (
                      <Button key={tag} size="sm" variant="outline" onClick={() => addField(tag)}>
                        {tag}
                      </Button>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* Side panels */}
              {(comparePanelOpen || showHelp || aiPanelOpen || tasksPanelOpen) && (
                <div className="w-full lg:w-[420px] shrink-0 space-y-4">
                  {aiPanelOpen && (
                    <AiSuggestionsPanel
                      record={record}
                      aiLoading={aiLoading}
                      aiError={aiError}
                      aiDraftId={aiDraftId}
                      aiSuggestions={aiSuggestions}
                      aiDecisions={aiDecisions}
                      aiExpandedDiffs={aiExpandedDiffs}
                      onClose={() => setAiPanelOpen(false)}
                      onRunAi={() => void runAi()}
                      onApplySuggestion={applySuggestion}
                      onDecideSuggestion={(d, id) => void decideSuggestion(d, id)}
                      onSetDecision={(id, d) => setAiDecisions((prev) => ({ ...prev, [id]: d }))}
                      onToggleDiffExpanded={(id) =>
                        setAiExpandedDiffs((prev) => ({ ...prev, [id]: !Boolean(prev[id]) }))
                      }
                    />
                  )}
                  {tasksPanelOpen && (
                    <TasksPanel
                      recordIdNum={recordIdNum}
                      tasksLoading={tasksLoading}
                      tasksError={tasksError}
                      tasks={tasks}
                      newTaskTitle={newTaskTitle}
                      newTaskBody={newTaskBody}
                      onNewTaskTitleChange={setNewTaskTitle}
                      onNewTaskBodyChange={setNewTaskBody}
                      onCreateTask={() => void createTask()}
                      onSetTaskStatus={(id, s) => void setTaskStatus(id, s)}
                      onClose={() => setTasksPanelOpen(false)}
                    />
                  )}
                  {comparePanelOpen && (
                    <ComparePanel
                      recordId={recordId}
                      compareDraft={compareDraft}
                      compareLoading={compareLoading}
                      compareError={compareError}
                      compareBibInfo={compareBibInfo}
                      compareIdParam={compareIdParam}
                      diffRows={diff.rows}
                      diffAdded={diff.added}
                      diffRemoved={diff.removed}
                      hasCompare={diff.hasCompare}
                      diffOnly={diffOnly}
                      canLoadCompare={canLoadCompare}
                      onCompareDraftChange={setCompareDraft}
                      onLoadCompare={(id) => {
                        if (recordId && id === recordId) {
                          setCompareError("Pick a different record id to compare.");
                          return;
                        }
                        updateCompareInUrl(id);
                      }}
                      onClearCompare={clearCompare}
                      onCloseCompare={closeCompare}
                    />
                  )}
                  {showHelp && (
                    <div className="border rounded-lg p-4 bg-muted/30">
                      <h3 className="font-medium mb-3 flex items-center gap-2">
                        <HelpCircle className="h-4 w-4" /> MARC Help
                      </h3>
                      <div className="space-y-2 text-sm">
                        {Object.entries(marcFieldDescriptions)
                          .slice(0, 12)
                          .map(([tag, desc]) => (
                            <div key={tag} className="flex gap-2">
                              <Badge variant="outline" className="shrink-0">
                                {tag}
                              </Badge>
                              <span className="text-muted-foreground text-xs">{desc}</span>
                            </div>
                          ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Status bar */}
          <div className="bg-muted/50 border-t px-4 py-1 text-xs text-muted-foreground flex items-center gap-4">
            <span>Fields: {record.fields.length}</span>
            <span>Errors: {validationErrors.length}</span>
            <div className="flex-1" />
            <span>MARC21 Bibliographic</span>
          </div>
        </div>
        <datalist id="marc-tag-suggestions">
          {marcTagSuggestions.map((entry) => (
            <option key={`tag-${entry.tag}`} value={entry.tag}>
              {entry.label}
            </option>
          ))}
        </datalist>
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
