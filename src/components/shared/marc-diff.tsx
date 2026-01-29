/**
 * MarcDiff - MARC XML Diff Viewer
 *
 * Features:
 * - Side-by-side comparison of MARC XML records
 * - Field-by-field diff highlighting
 * - Color-coded changes (green=added, red=removed, gray=unchanged)
 * - Dialog-based UI with confirmation actions
 * - Accessible and keyboard navigable
 */

"use client";

import * as React from "react";
import { clientLogger } from "@/lib/client-logger";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { FileText, AlertCircle } from "lucide-react";

export interface MarcDiffProps {
  /** Original MARC XML */
  oldMarc: string;
  /** New MARC XML */
  newMarc: string;
  /** Whether the dialog is open */
  open: boolean;
  /** Close handler */
  onOpenChange: (open: boolean) => void;
  /** Confirm callback */
  onConfirm?: () => void;
}

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

type DiffStatus = "added" | "removed" | "modified" | "unchanged";

interface FieldDiff {
  tag: string;
  oldField?: MarcField;
  newField?: MarcField;
  status: DiffStatus;
  subfieldDiffs?: {
    code: string;
    oldValue?: string;
    newValue?: string;
    status: DiffStatus;
  }[];
}

// MARC field descriptions for better UX
const MARC_FIELD_LABELS: Record<string, string> = {
  "001": "Control Number",
  "003": "Control Number Identifier",
  "005": "Date/Time Modified",
  "008": "Fixed-Length Data",
  "010": "LCCN",
  "020": "ISBN",
  "022": "ISSN",
  "040": "Cataloging Source",
  "050": "LC Call Number",
  "082": "Dewey Decimal",
  "100": "Main Entry - Personal Name",
  "110": "Main Entry - Corporate Name",
  "245": "Title Statement",
  "246": "Varying Form of Title",
  "250": "Edition Statement",
  "264": "Publication/Distribution",
  "300": "Physical Description",
  "336": "Content Type",
  "337": "Media Type",
  "338": "Carrier Type",
  "490": "Series Statement",
  "500": "General Note",
  "520": "Summary",
  "600": "Subject - Personal Name",
  "650": "Subject - Topical",
  "651": "Subject - Geographic",
  "700": "Added Entry - Personal Name",
  "856": "Electronic Location",
};

/**
 * Parse MARC XML into structured format
 */
function parseMarcXml(marcXml: string): MarcRecord | null {
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(marcXml, "text/xml");
    const record = doc.querySelector("record");

    if (!record) return null;

    const leaderEl = record.querySelector("leader");
    const leader = leaderEl?.textContent || "00000nam a22000007i 4500";

    const fields: MarcField[] = [];

    // Control fields (001-009)
    record.querySelectorAll("controlfield").forEach((cf) => {
      const tag = cf.getAttribute("tag") || "";
      fields.push({
        tag,
        ind1: " ",
        ind2: " ",
        subfields: [{ code: "", value: cf.textContent || "" }],
      });
    });

    // Data fields (010+)
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

    return { leader, fields };
  } catch (error) {
    clientLogger.error("Error parsing MARC XML:", error);
    return null;
  }
}

/**
 * Compare two MARC records and generate diff
 */
function diffMarcRecords(oldRecord: MarcRecord | null, newRecord: MarcRecord | null): FieldDiff[] {
  const diffs: FieldDiff[] = [];

  if (!oldRecord && !newRecord) return diffs;

  // Create maps for efficient lookup
  const oldFields = new Map<string, MarcField[]>();
  const newFields = new Map<string, MarcField[]>();

  oldRecord?.fields.forEach((field) => {
    const existing = oldFields.get(field.tag) || [];
    existing.push(field);
    oldFields.set(field.tag, existing);
  });

  newRecord?.fields.forEach((field) => {
    const existing = newFields.get(field.tag) || [];
    existing.push(field);
    newFields.set(field.tag, existing);
  });

  // Get all unique tags
  const allTags = new Set([...oldFields.keys(), ...newFields.keys()]);
  const sortedTags = Array.from(allTags).sort();

  // Compare fields by tag
  for (const tag of sortedTags) {
    const oldFieldList = oldFields.get(tag) || [];
    const newFieldList = newFields.get(tag) || [];

    const maxLen = Math.max(oldFieldList.length, newFieldList.length);

    for (let i = 0; i < maxLen; i++) {
      const oldField = oldFieldList[i];
      const newField = newFieldList[i];

      if (!oldField) {
        // Field added
        diffs.push({
          tag,
          newField,
          status: "added",
        });
      } else if (!newField) {
        // Field removed
        diffs.push({
          tag,
          oldField,
          status: "removed",
        });
      } else {
        // Check if modified
        const isModified = !fieldsEqual(oldField, newField);

        if (isModified) {
          // Generate subfield-level diffs for data fields
          const subfieldDiffs = diffSubfields(oldField.subfields, newField.subfields);

          diffs.push({
            tag,
            oldField,
            newField,
            status: "modified",
            subfieldDiffs,
          });
        } else {
          diffs.push({
            tag,
            oldField,
            newField,
            status: "unchanged",
          });
        }
      }
    }
  }

  return diffs;
}

/**
 * Check if two fields are equal
 */
function fieldsEqual(field1: MarcField, field2: MarcField): boolean {
  if (field1.tag !== field2.tag) return false;
  if (field1.ind1 !== field2.ind1) return false;
  if (field1.ind2 !== field2.ind2) return false;

  if (field1.subfields.length !== field2.subfields.length) return false;

  for (let i = 0; i < field1.subfields.length; i++) {
    const sf1 = field1.subfields[i];
    const sf2 = field2.subfields[i];
    if (sf1.code !== sf2.code || sf1.value !== sf2.value) return false;
  }

  return true;
}

/**
 * Diff subfields
 */
function diffSubfields(
  oldSubfields: { code: string; value: string }[],
  newSubfields: { code: string; value: string }[]
) {
  const diffs: {
    code: string;
    oldValue?: string;
    newValue?: string;
    status: DiffStatus;
  }[] = [];

  const oldMap = new Map(oldSubfields.map(sf => [sf.code, sf.value]));
  const newMap = new Map(newSubfields.map(sf => [sf.code, sf.value]));

  const allCodes = new Set([...oldMap.keys(), ...newMap.keys()]);

  for (const code of allCodes) {
    const oldValue = oldMap.get(code);
    const newValue = newMap.get(code);

    if (oldValue === undefined) {
      diffs.push({ code, newValue, status: "added" });
    } else if (newValue === undefined) {
      diffs.push({ code, oldValue, status: "removed" });
    } else if (oldValue !== newValue) {
      diffs.push({ code, oldValue, newValue, status: "modified" });
    } else {
      diffs.push({ code, oldValue, newValue, status: "unchanged" });
    }
  }

  return diffs;
}

/**
 * Render a single field diff
 */
function FieldDiffRow({ diff }: { diff: FieldDiff }) {
  const label = MARC_FIELD_LABELS[diff.tag] || "Unknown Field";

  const statusColors = {
    added: "bg-green-50 border-green-200 dark:bg-green-950/20 dark:border-green-900",
    removed: "bg-red-50 border-red-200 dark:bg-red-950/20 dark:border-red-900",
    modified: "bg-amber-50 border-amber-200 dark:bg-amber-950/20 dark:border-amber-900",
    unchanged: "bg-background border-border",
  };

  const statusBadgeColors = {
    added: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
    removed: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
    modified: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
    unchanged: "bg-muted text-muted-foreground",
  };

  return (
    <div className={cn("border rounded-md p-3 mb-2", statusColors[diff.status])}>
      {/* Field header */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="font-mono text-xs">
            {diff.tag}
          </Badge>
          <span className="text-sm font-medium">{label}</span>
        </div>
        {diff.status !== "unchanged" && (
          <Badge className={cn("text-xs", statusBadgeColors[diff.status])}>
            {diff.status}
          </Badge>
        )}
      </div>

      {/* Indicators (for data fields) */}
      {diff.tag >= "010" && (
        <div className="text-xs text-muted-foreground mb-1 font-mono">
          {diff.status === "removed" && diff.oldField && (
            <span>Ind1: {diff.oldField.ind1} | Ind2: {diff.oldField.ind2}</span>
          )}
          {diff.status === "added" && diff.newField && (
            <span>Ind1: {diff.newField.ind1} | Ind2: {diff.newField.ind2}</span>
          )}
          {diff.status === "modified" && diff.newField && (
            <span>Ind1: {diff.newField.ind1} | Ind2: {diff.newField.ind2}</span>
          )}
          {diff.status === "unchanged" && diff.oldField && (
            <span>Ind1: {diff.oldField.ind1} | Ind2: {diff.oldField.ind2}</span>
          )}
        </div>
      )}

      {/* Subfields */}
      <div className="space-y-1">
        {diff.status === "removed" && diff.oldField && (
          <SubfieldDisplay subfields={diff.oldField.subfields} status="removed" />
        )}
        {diff.status === "added" && diff.newField && (
          <SubfieldDisplay subfields={diff.newField.subfields} status="added" />
        )}
        {diff.status === "unchanged" && diff.oldField && (
          <SubfieldDisplay subfields={diff.oldField.subfields} status="unchanged" />
        )}
        {diff.status === "modified" && diff.subfieldDiffs && (
          <div className="space-y-1">
            {diff.subfieldDiffs.map((sfDiff, idx) => (
              <SubfieldDiff key={idx} diff={sfDiff} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Display subfields (for unchanged/added/removed fields)
 */
function SubfieldDisplay({
  subfields,
  status,
}: {
  subfields: { code: string; value: string }[];
  status: DiffStatus;
}) {
  const textColor = {
    added: "text-green-700 dark:text-green-400",
    removed: "text-red-700 dark:text-red-400 line-through",
    unchanged: "text-foreground",
    modified: "text-foreground",
  };

  return (
    <div className={cn("text-sm font-mono", textColor[status])}>
      {subfields.map((sf, idx) => (
        <div key={idx}>
          {sf.code ? (
            <>
              <span className="text-muted-foreground">$</span>
              <span className="font-semibold">{sf.code}</span>
              <span className="ml-1">{sf.value}</span>
            </>
          ) : (
            <span>{sf.value}</span>
          )}
        </div>
      ))}
    </div>
  );
}

/**
 * Display subfield diff (for modified fields)
 */
function SubfieldDiff({
  diff,
}: {
  diff: {
    code: string;
    oldValue?: string;
    newValue?: string;
    status: DiffStatus;
  };
}) {
  if (diff.status === "unchanged") {
    return (
      <div className="text-sm font-mono text-foreground">
        <span className="text-muted-foreground">$</span>
        <span className="font-semibold">{diff.code}</span>
        <span className="ml-1">{diff.oldValue}</span>
      </div>
    );
  }

  if (diff.status === "removed") {
    return (
      <div className="text-sm font-mono text-red-700 dark:text-red-400 line-through">
        <span className="text-muted-foreground">$</span>
        <span className="font-semibold">{diff.code}</span>
        <span className="ml-1">{diff.oldValue}</span>
      </div>
    );
  }

  if (diff.status === "added") {
    return (
      <div className="text-sm font-mono text-green-700 dark:text-green-400">
        <span className="text-muted-foreground">$</span>
        <span className="font-semibold">{diff.code}</span>
        <span className="ml-1">{diff.newValue}</span>
      </div>
    );
  }

  // Modified
  return (
    <div className="text-sm font-mono space-y-0.5">
      <div className="text-red-700 dark:text-red-400 line-through">
        <span className="text-muted-foreground">$</span>
        <span className="font-semibold">{diff.code}</span>
        <span className="ml-1">{diff.oldValue}</span>
      </div>
      <div className="text-green-700 dark:text-green-400">
        <span className="text-muted-foreground">$</span>
        <span className="font-semibold">{diff.code}</span>
        <span className="ml-1">{diff.newValue}</span>
      </div>
    </div>
  );
}

/**
 * MarcDiff component
 *
 * @example
 * ```tsx
 * <MarcDiff
 *   oldMarc={originalMarcXml}
 *   newMarc={modifiedMarcXml}
 *   open={showDiff}
 *   onOpenChange={setShowDiff}
 *   onConfirm={handleSave}
 * />
 * ```
 */
export function MarcDiff({
  oldMarc,
  newMarc,
  open,
  onOpenChange,
  onConfirm,
}: MarcDiffProps) {
  const [oldRecord, setOldRecord] = React.useState<MarcRecord | null>(null);
  const [newRecord, setNewRecord] = React.useState<MarcRecord | null>(null);
  const [diffs, setDiffs] = React.useState<FieldDiff[]>([]);
  const [parseError, setParseError] = React.useState<string | null>(null);

  // Parse MARC XML and compute diffs
  React.useEffect(() => {
    if (!open) return;

    try {
      const oldParsed = parseMarcXml(oldMarc);
      const newParsed = parseMarcXml(newMarc);

      if (!oldParsed && !newParsed) {
        setParseError("Failed to parse both MARC records");
        return;
      }

      setOldRecord(oldParsed);
      setNewRecord(newParsed);
      setDiffs(diffMarcRecords(oldParsed, newParsed));
      setParseError(null);
    } catch (error) {
      setParseError(error instanceof Error ? error.message : "Unknown error");
    }
  }, [oldMarc, newMarc, open]);

  // Calculate stats
  const stats = React.useMemo(() => {
    const added = diffs.filter(d => d.status === "added").length;
    const removed = diffs.filter(d => d.status === "removed").length;
    const modified = diffs.filter(d => d.status === "modified").length;
    const unchanged = diffs.filter(d => d.status === "unchanged").length;
    return { added, removed, modified, unchanged, total: diffs.length };
  }, [diffs]);

  const handleConfirm = () => {
    onConfirm?.();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[900px] max-h-[90vh] flex flex-col">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            <DialogTitle>MARC Record Changes</DialogTitle>
          </div>
          <DialogDescription>
            Review the changes to the MARC record before saving.
          </DialogDescription>
        </DialogHeader>

        {/* Stats Summary */}
        {!parseError && stats.total > 0 && (
          <div className="flex gap-2 pb-2">
            {stats.added > 0 && (
              <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
                +{stats.added} added
              </Badge>
            )}
            {stats.removed > 0 && (
              <Badge className="bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400">
                -{stats.removed} removed
              </Badge>
            )}
            {stats.modified > 0 && (
              <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400">
                ~{stats.modified} modified
              </Badge>
            )}
            {stats.unchanged > 0 && (
              <Badge variant="secondary">
                {stats.unchanged} unchanged
              </Badge>
            )}
          </div>
        )}

        {/* Error State */}
        {parseError && (
          <div className="bg-destructive/10 border border-destructive/20 rounded-md p-4 flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-destructive">Parse Error</p>
              <p className="text-sm text-muted-foreground mt-1">{parseError}</p>
            </div>
          </div>
        )}

        {/* Diff Content */}
        {!parseError && (
          <ScrollArea className="flex-1 -mx-6 px-6">
            <div className="pr-4">
              {diffs.length === 0 && (
                <div className="text-center py-8 text-muted-foreground">
                  <FileText className="h-12 w-12 mx-auto mb-2 opacity-50" />
                  <p>No changes detected</p>
                </div>
              )}
              {diffs.map((diff, idx) => (
                <FieldDiffRow key={`${diff.tag}-${idx}`} diff={diff} />
              ))}
            </div>
          </ScrollArea>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleConfirm} disabled={!!parseError}>
            Save Changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default MarcDiff;
