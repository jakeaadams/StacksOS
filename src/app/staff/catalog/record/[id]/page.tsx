"use client";

import * as React from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ColumnDef } from "@tanstack/react-table";
import { toast } from "sonner";
import {
  ArrowLeft,
  BookOpen,
  Bookmark,
  Building,
  Copy,
  Edit,
  ExternalLink,
  ImageOff,
  ListOrdered,
  MapPin,
  Package,
  Plus,
} from "lucide-react";
import { fetchWithAuth } from "@/lib/client-fetch";
import { clientLogger } from "@/lib/client-logger";
import {
  DataTable,
  DataTableColumnHeader,
  EmptyState,
  ErrorBoundary,
  LoadingSpinner,
  PageContainer,
  PageContent,
  PageHeader,
  PlaceHoldDialog,
  UnoptimizedImage,
} from "@/components/shared";
import { AddItemDialog } from "@/components/cataloging/add-item-dialog";
import { CoverArtPicker } from "@/components/shared/cover-art-picker";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface RecordDetail {
  id: number;
  tcn: string;
  title: string;
  author?: string;
  contributors?: string[];
  isbn?: string;
  issn?: string;
  upc?: string;
  publisher?: string;
  pubdate?: string;
  edition?: string;
  physicalDescription?: string;
  language?: string;
  subjects?: string[];
  summary?: string;
  series?: string;
  format?: string;
  notes?: string[];
  createDate?: string;
  editDate?: string;
  holdCount?: number;
  marcXml?: string;
}

interface CopyInfo {
  id: number;
  barcode: string;
  status: string;
  statusId: number;
  location: string;
  circLib: string;
  callNumber: string;
  dueDate?: string;
  holdable: boolean;
  circulate: boolean;
}

interface HoldingsSummary {
  library: string;
  location: string;
  callNumber: string;
  totalCopies: number;
  availableCopies: number;
}

interface TitleHold {
  id: number;
  queuePosition?: number;
  status?: string | number;
  requestTime?: string;
  pickupLib?: number;
  patronName?: string;
  patronBarcode?: string;
}

interface MarcControlField {
  tag: string;
  value: string;
}

interface MarcDataField {
  tag: string;
  ind1: string;
  ind2: string;
  subfields: Array<{ code: string; value: string }>;
}

interface ParsedMarcRecord {
  leader: string;
  controlFields: MarcControlField[];
  dataFields: MarcDataField[];
  field008: string;
}

interface FixedFieldRow {
  position: string;
  label: string;
  value: string;
  note: string;
}

interface HoldingsTreeBranch {
  key: string;
  location: string;
  callNumber: string;
  copies: CopyInfo[];
  availableCopies: number;
}

interface HoldingsTreeLibrary {
  library: string;
  totalCopies: number;
  availableCopies: number;
  branches: HoldingsTreeBranch[];
}

const leaderRecordStatusMap: Record<string, string> = {
  a: "Increase in encoding level",
  c: "Corrected or revised",
  d: "Deleted",
  n: "New",
  p: "Increase in encoding level from prepublication",
};

const leaderTypeOfRecordMap: Record<string, string> = {
  a: "Language material",
  c: "Notated music",
  d: "Manuscript notated music",
  e: "Cartographic material",
  f: "Manuscript cartographic material",
  g: "Projected medium",
  i: "Nonmusical sound recording",
  j: "Musical sound recording",
  k: "Two-dimensional nonprojectable graphic",
  m: "Computer file",
  o: "Kit",
  p: "Mixed materials",
  r: "Three-dimensional artifact",
  t: "Manuscript language material",
};

const leaderBibLevelMap: Record<string, string> = {
  a: "Monographic component part",
  b: "Serial component part",
  c: "Collection",
  d: "Subunit",
  i: "Integrating resource",
  m: "Monograph/item",
  s: "Serial",
};

const leaderEncodingLevelMap: Record<string, string> = {
  " ": "Full level",
  1: "Full level, material not examined",
  2: "Less-than-full level, material not examined",
  3: "Abbreviated level",
  4: "Core level",
  5: "Partial level",
  7: "Minimal level",
  8: "Prepublication level",
  u: "Unknown",
  z: "Not applicable",
};

const leaderCatalogingFormMap: Record<string, string> = {
  " ": "Non-ISBD",
  a: "AACR2",
  i: "ISBD punctuation included",
  n: "Non-ISBD punctuation omitted",
  u: "Unknown",
};

const fixed008DateTypeMap: Record<string, string> = {
  b: "No dates given; B.C. date involved",
  c: "Continuing resource currently published",
  d: "Continuing resource ceased publication",
  e: "Detailed date",
  i: "Inclusive dates of collection",
  k: "Range of years of bulk of collection",
  m: "Multiple dates",
  n: "Dates unknown",
  p: "Date of distribution/release/issue and production/recording session",
  q: "Questionable date",
  r: "Reprint/reissue and original date",
  s: "Single known date/probable date",
  t: "Publication date and copyright date",
  u: "Continuing resource status unknown",
};

const fixed008AudienceMap: Record<string, string> = {
  " ": "Unknown/unspecified",
  a: "Preschool",
  b: "Primary",
  c: "Pre-adolescent",
  d: "Adolescent",
  e: "Adult",
  f: "Specialized",
  g: "General",
  j: "Juvenile",
};

const fixed008FormOfItemMap: Record<string, string> = {
  " ": "None of the following",
  a: "Microfilm",
  b: "Microfiche",
  c: "Microopaque",
  d: "Large print",
  f: "Braille",
  o: "Online",
  q: "Direct electronic",
  r: "Regular print reproduction",
  s: "Electronic",
};

const fixed008CatalogingSourceMap: Record<string, string> = {
  " ": "National bibliographic agency",
  c: "Cooperative cataloging program",
  d: "Other",
  u: "Unknown",
};

function sortMarcTags(a: string, b: string) {
  const aNum = Number.parseInt(a, 10);
  const bNum = Number.parseInt(b, 10);
  if (!Number.isNaN(aNum) && !Number.isNaN(bNum) && aNum !== bNum) {
    return aNum - bNum;
  }
  return a.localeCompare(b);
}

function parseMarcXmlForView(marcXml?: string): ParsedMarcRecord | null {
  if (!marcXml || !marcXml.trim()) return null;
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(marcXml, "text/xml");
    const recordEl = doc.querySelector("record");
    if (!recordEl) return null;

    const leader = recordEl.querySelector("leader")?.textContent || "";
    const controlFields: MarcControlField[] = Array.from(
      recordEl.querySelectorAll("controlfield")
    ).map((cf) => ({
      tag: cf.getAttribute("tag") || "",
      value: cf.textContent || "",
    }));

    const dataFields: MarcDataField[] = Array.from(recordEl.querySelectorAll("datafield")).map(
      (df) => ({
        tag: df.getAttribute("tag") || "",
        ind1: df.getAttribute("ind1") || " ",
        ind2: df.getAttribute("ind2") || " ",
        subfields: Array.from(df.querySelectorAll("subfield")).map((sf) => ({
          code: sf.getAttribute("code") || "",
          value: sf.textContent || "",
        })),
      })
    );

    controlFields.sort((a, b) => sortMarcTags(a.tag, b.tag));
    dataFields.sort((a, b) => sortMarcTags(a.tag, b.tag));

    const field008 = controlFields.find((f) => f.tag === "008")?.value || "";
    return { leader, controlFields, dataFields, field008 };
  } catch (error) {
    clientLogger.error("Failed to parse MARC XML for bib view", error);
    return null;
  }
}

function getCodeDescription(code: string, map: Record<string, string>) {
  return map[code] || "Unmapped code";
}

function buildLeaderRows(leader: string): FixedFieldRow[] {
  const value = String(leader || "").padEnd(24, " ");
  return [
    {
      position: "05",
      label: "Record Status",
      value: value.charAt(5) || "-",
      note: getCodeDescription(value.charAt(5), leaderRecordStatusMap),
    },
    {
      position: "06",
      label: "Type of Record",
      value: value.charAt(6) || "-",
      note: getCodeDescription(value.charAt(6), leaderTypeOfRecordMap),
    },
    {
      position: "07",
      label: "Bibliographic Level",
      value: value.charAt(7) || "-",
      note: getCodeDescription(value.charAt(7), leaderBibLevelMap),
    },
    {
      position: "17",
      label: "Encoding Level",
      value: value.charAt(17) || "-",
      note: getCodeDescription(value.charAt(17), leaderEncodingLevelMap),
    },
    {
      position: "18",
      label: "Descriptive Cataloging Form",
      value: value.charAt(18) || "-",
      note: getCodeDescription(value.charAt(18), leaderCatalogingFormMap),
    },
  ];
}

function build008Rows(field008: string): FixedFieldRow[] {
  const value = String(field008 || "").padEnd(40, " ");
  return [
    {
      position: "00-05",
      label: "Date Entered on File",
      value: value.slice(0, 6) || "-",
      note: "YYMMDD",
    },
    {
      position: "06",
      label: "Date Type/Publication Status",
      value: value.charAt(6) || "-",
      note: getCodeDescription(value.charAt(6), fixed008DateTypeMap),
    },
    {
      position: "07-10",
      label: "Date 1",
      value: value.slice(7, 11) || "-",
      note: "Year or beginning date",
    },
    {
      position: "11-14",
      label: "Date 2",
      value: value.slice(11, 15) || "-",
      note: "Ending date when applicable",
    },
    {
      position: "15-17",
      label: "Place of Publication",
      value: value.slice(15, 18) || "-",
      note: "MARC country code",
    },
    {
      position: "22",
      label: "Target Audience",
      value: value.charAt(22) || "-",
      note: getCodeDescription(value.charAt(22), fixed008AudienceMap),
    },
    {
      position: "23",
      label: "Form of Item",
      value: value.charAt(23) || "-",
      note: getCodeDescription(value.charAt(23), fixed008FormOfItemMap),
    },
    {
      position: "35-37",
      label: "Language",
      value: value.slice(35, 38) || "-",
      note: "MARC language code",
    },
    {
      position: "39",
      label: "Cataloging Source",
      value: value.charAt(39) || "-",
      note: getCodeDescription(value.charAt(39), fixed008CatalogingSourceMap),
    },
  ];
}

function formatMarcSubfields(subfields: Array<{ code: string; value: string }>) {
  if (!Array.isArray(subfields) || subfields.length === 0) return "-";
  return subfields
    .map((subfield) => {
      const code = (subfield.code || "").trim();
      const val = (subfield.value || "").trim();
      if (!code && !val) return "";
      return `$${code || "?"} ${val}`.trim();
    })
    .filter(Boolean)
    .join(" ");
}

function isCopyAvailable(statusId: number) {
  return statusId === 0 || statusId === 7;
}

function getStatusColor(statusId: number) {
  switch (statusId) {
    case 0:
    case 7:
      return "text-green-600 bg-green-50 border-green-200";
    case 1:
      return "text-blue-600 bg-blue-50 border-blue-200";
    case 6:
      return "text-amber-600 bg-amber-50 border-amber-200";
    case 8:
      return "text-purple-600 bg-purple-50 border-purple-200";
    default:
      return "text-muted-foreground bg-muted border-border";
  }
}

function getHoldStatusLabel(status: string | number | undefined) {
  if (typeof status === "string" && status.trim()) return status;
  if (typeof status === "number") return `Status ${status}`;
  return "Pending";
}

function getHoldStatusClass(status: string | number | undefined) {
  const text = String(status ?? "").toLowerCase();
  if (text.includes("ready") || text.includes("captured") || text.includes("shelf")) {
    return "text-green-600 bg-green-50 border-green-200";
  }
  if (text.includes("cancel") || text.includes("expire") || text.includes("fail")) {
    return "text-red-600 bg-red-50 border-red-200";
  }
  if (text.includes("transit")) {
    return "text-amber-600 bg-amber-50 border-amber-200";
  }
  return "text-muted-foreground bg-muted border-border";
}

function formatDateTime(value?: string) {
  if (!value) return "Unknown";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString();
}

function CoverImage({
  isbn,
  title,
  customCoverUrl,
  onClick,
}: {
  isbn?: string;
  title: string;
  customCoverUrl?: string;
  onClick: () => void;
}) {
  const [error, setError] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const cleanIsbn = isbn ? isbn.replace(/[^0-9X]/gi, "") : "";
  const coverUrl =
    customCoverUrl ||
    (cleanIsbn ? `https://covers.openlibrary.org/b/isbn/${cleanIsbn}-L.jpg` : null);

  if (!coverUrl || error) {
    return (
      <div
        className="w-full max-w-[240px] aspect-[2/3] bg-muted rounded-xl flex flex-col items-center justify-center cursor-pointer hover:bg-muted/70 transition-colors group"
        onClick={onClick}
        title="Click to upload cover art"
      >
        <ImageOff className="h-12 w-12 text-muted-foreground group-hover:text-foreground transition-colors" />
        <span className="text-xs text-muted-foreground group-hover:text-foreground mt-2 transition-colors">
          Click to upload
        </span>
      </div>
    );
  }

  return (
    <div
      className="w-full max-w-[240px] aspect-[2/3] relative group cursor-pointer"
      onClick={onClick}
      title="Click to change cover art"
    >
      {!loaded && <div className="absolute inset-0 bg-muted rounded-xl animate-pulse" />}
      <UnoptimizedImage
        src={coverUrl}
        alt={"Cover of " + title}
        className={
          "absolute inset-0 h-full w-full object-contain bg-muted rounded-xl shadow-md transition-opacity " +
          (loaded ? "opacity-100" : "opacity-0")
        }
        onError={() => setError(true)}
        onLoad={() => setLoaded(true)}
      />
      <div className="absolute inset-0 bg-black/60 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
        <div className="text-white text-center">
          <Edit className="h-8 w-8 mx-auto mb-2" />
          <span className="text-sm font-medium">Change Cover</span>
        </div>
      </div>
    </div>
  );
}

export default function CatalogRecordPage() {
  const params = useParams();
  const router = useRouter();
  const recordId = params.id as string;

  const [record, setRecord] = useState<RecordDetail | null>(null);
  const [copies, setCopies] = useState<CopyInfo[]>([]);
  const [holdings, setHoldings] = useState<HoldingsSummary[]>([]);
  const [titleHolds, setTitleHolds] = useState<TitleHold[]>([]);
  const [titleHoldCount, setTitleHoldCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [coverPickerOpen, setCoverPickerOpen] = useState(false);
  const [customCoverUrl, setCustomCoverUrl] = useState<string | undefined>(undefined);
  const [holdOpen, setHoldOpen] = useState(false);
  const [addItemOpen, setAddItemOpen] = useState(false);

  const loadRecordData = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const [recordRes, holdingsRes, coverRes, titleHoldsRes] = await Promise.all([
        fetchWithAuth("/api/evergreen/catalog?action=record&id=" + recordId),
        fetchWithAuth("/api/evergreen/catalog?action=holdings&id=" + recordId),
        fetch("/api/save-cover?recordId=" + recordId).catch(() => null),
        fetchWithAuth(
          `/api/evergreen/holds?action=title_holds&title_id=${encodeURIComponent(recordId)}&limit=25`
        ).catch(() => null),
      ]);

      let fallbackHoldCount = 0;
      const recordData = await recordRes.json();
      if (recordData.ok && recordData.record) {
        const r = recordData.record;
        const holdCountRaw = Number.parseInt(String(r.hold_count ?? r.holdCount ?? "0"), 10);
        fallbackHoldCount = Number.isFinite(holdCountRaw) ? holdCountRaw : 0;
        setRecord({
          id: r.id,
          tcn: r.tcn || "",
          title: r.title || "Unknown Title",
          author: r.author,
          contributors: r.contributors || [],
          isbn: r.isbn,
          issn: r.issn,
          upc: r.upc,
          publisher: r.publisher,
          pubdate: r.pubdate,
          edition: r.edition,
          physicalDescription: r.physicalDescription || r.physical_description,
          language: r.language,
          subjects: r.subjects || [],
          summary: r.summary,
          series: r.series,
          format: r.format,
          notes: r.notes || [],
          createDate: r.create_date,
          editDate: r.edit_date,
          holdCount: fallbackHoldCount,
          marcXml: typeof r.marc_xml === "string" ? r.marc_xml : undefined,
        });
      } else {
        setError("Record not found");
      }

      if (coverRes && coverRes.ok) {
        const coverData = await coverRes.json();
        if (coverData.success && coverData.coverUrl) {
          setCustomCoverUrl(coverData.coverUrl);
        }
      }

      const holdingsData = await holdingsRes.json();
      if (holdingsData.ok) {
        if (holdingsData.summary) {
          setHoldings(
            holdingsData.summary.map((holding: unknown) => {
              const h =
                typeof holding === "object" && holding ? (holding as Record<string, unknown>) : {};
              const orgId = String(h.org_id ?? "").trim();
              return {
                library: String(
                  h.library ?? h.org_name ?? (orgId ? `Library ${orgId}` : "Library")
                ),
                location: String(h.location ?? h.copy_location ?? "-"),
                callNumber: String(h.call_number ?? "-"),
                totalCopies: Number.parseInt(String(h.copy_count ?? "0"), 10) || 0,
                availableCopies: Number.parseInt(String(h.available_count ?? "0"), 10) || 0,
              };
            })
          );
        }

        if (holdingsData.copies) {
          setCopies(
            holdingsData.copies.map((copy: unknown) => {
              const c = typeof copy === "object" && copy ? (copy as Record<string, unknown>) : {};
              return {
                id: Number.parseInt(String(c.id ?? "0"), 10) || 0,
                barcode: String(c.barcode ?? "-"),
                status: String(c.status_name ?? c.status ?? "Unknown"),
                statusId: Number.parseInt(String(c.status_id ?? c.statusId ?? "0"), 10) || 0,
                location: String(c.location ?? c.copy_location ?? "-"),
                circLib: String(c.circ_lib_name ?? c.circLib ?? "-"),
                callNumber: String(c.call_number ?? c.callNumber ?? "-"),
                dueDate: typeof c.due_date === "string" ? c.due_date : undefined,
                holdable: c.holdable !== false,
                circulate: c.circulate !== false,
              };
            })
          );
        }
      }

      if (titleHoldsRes) {
        const titleHoldsData = await titleHoldsRes.json().catch(() => null);
        if (titleHoldsData?.ok) {
          const holdList = Array.isArray(titleHoldsData.holds) ? titleHoldsData.holds : [];
          setTitleHolds(
            holdList.map((hold: unknown, idx: number) => {
              const h = typeof hold === "object" && hold ? (hold as Record<string, unknown>) : {};
              const queuePosition = Number.parseInt(
                String(h.queuePosition ?? h.queue_position ?? ""),
                10
              );
              const pickupLib = Number.parseInt(String(h.pickupLib ?? h.pickup_lib ?? ""), 10);
              return {
                id: Number.isFinite(Number(h.id)) ? Number(h.id) : -(idx + 1),
                queuePosition: Number.isFinite(queuePosition) ? queuePosition : undefined,
                status:
                  typeof h.status === "string" || typeof h.status === "number"
                    ? h.status
                    : undefined,
                requestTime: String(h.requestTime ?? h.request_time ?? "").trim() || undefined,
                pickupLib: Number.isFinite(pickupLib) ? pickupLib : undefined,
                patronName: String(h.patronName ?? h.patron_name ?? "").trim() || undefined,
                patronBarcode:
                  String(h.patronBarcode ?? h.patron_barcode ?? "").trim() || undefined,
              };
            })
          );

          const explicitCount = Number.parseInt(String(titleHoldsData.holdCount ?? ""), 10);
          setTitleHoldCount(
            Number.isFinite(explicitCount) ? explicitCount : fallbackHoldCount || holdList.length
          );
        } else {
          setTitleHolds([]);
          setTitleHoldCount(fallbackHoldCount);
        }
      } else {
        setTitleHolds([]);
        setTitleHoldCount(fallbackHoldCount);
      }
    } catch (err) {
      clientLogger.error("Error loading record:", err);
      setError("Failed to load record details");
      toast.error("Failed to load record");
    } finally {
      setIsLoading(false);
    }
  }, [recordId]);

  useEffect(() => {
    void loadRecordData();
  }, [loadRecordData]);

  const parsedMarc = useMemo(() => parseMarcXmlForView(record?.marcXml), [record?.marcXml]);
  const leaderRows = useMemo(() => buildLeaderRows(parsedMarc?.leader || ""), [parsedMarc?.leader]);
  const field008Rows = useMemo(
    () => build008Rows(parsedMarc?.field008 || ""),
    [parsedMarc?.field008]
  );

  const totalCopies =
    holdings.length > 0
      ? holdings.reduce((sum, holding) => sum + holding.totalCopies, 0)
      : copies.length;
  const availableCopies =
    holdings.length > 0
      ? holdings.reduce((sum, holding) => sum + holding.availableCopies, 0)
      : copies.filter((copy) => isCopyAvailable(copy.statusId)).length;
  const holdQueueCount = titleHoldCount > 0 ? titleHoldCount : record?.holdCount || 0;

  const holdingsTree = useMemo<HoldingsTreeLibrary[]>(() => {
    const tree = new Map<
      string,
      {
        library: string;
        totalCopies: number;
        availableCopies: number;
        branches: Map<string, HoldingsTreeBranch>;
      }
    >();

    for (const copy of copies) {
      const library = copy.circLib || "-";
      const location = copy.location || "-";
      const callNumber = copy.callNumber || "-";
      const branchKey = `${location}||${callNumber}`;
      const libraryNode =
        tree.get(library) ||
        ({
          library,
          totalCopies: 0,
          availableCopies: 0,
          branches: new Map<string, HoldingsTreeBranch>(),
        } as {
          library: string;
          totalCopies: number;
          availableCopies: number;
          branches: Map<string, HoldingsTreeBranch>;
        });

      libraryNode.totalCopies += 1;
      if (isCopyAvailable(copy.statusId)) {
        libraryNode.availableCopies += 1;
      }

      const branch =
        libraryNode.branches.get(branchKey) ||
        ({
          key: branchKey,
          location,
          callNumber,
          copies: [],
          availableCopies: 0,
        } as HoldingsTreeBranch);
      branch.copies.push(copy);
      if (isCopyAvailable(copy.statusId)) {
        branch.availableCopies += 1;
      }

      libraryNode.branches.set(branchKey, branch);
      tree.set(library, libraryNode);
    }

    return Array.from(tree.values())
      .map((libraryNode) => ({
        library: libraryNode.library,
        totalCopies: libraryNode.totalCopies,
        availableCopies: libraryNode.availableCopies,
        branches: Array.from(libraryNode.branches.values())
          .map((branch) => ({
            ...branch,
            copies: [...branch.copies].sort((a, b) => a.barcode.localeCompare(b.barcode)),
          }))
          .sort((a, b) => {
            const callNumberCompare = a.callNumber.localeCompare(b.callNumber);
            if (callNumberCompare !== 0) return callNumberCompare;
            return a.location.localeCompare(b.location);
          }),
      }))
      .sort((a, b) => a.library.localeCompare(b.library));
  }, [copies]);

  const handleCoverSelected = async (url: string, source: string) => {
    setCustomCoverUrl(url);
    try {
      const response = await fetchWithAuth("/api/save-cover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recordId, coverUrl: url, source }),
      });

      if (!response.ok) {
        throw new Error("Failed to save cover");
      }

      toast.success(`Cover updated from ${source}`);
      clientLogger.info("Cover saved:", { url, source, recordId });
    } catch (err) {
      clientLogger.error("Error saving cover:", err);
      toast.error("Cover updated locally, but failed to save to server");
    }
  };

  const copyColumns: ColumnDef<CopyInfo>[] = [
    {
      accessorKey: "barcode",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Barcode" />,
      cell: ({ row }) => (
        <Link
          href={"/staff/catalog/item/" + row.original.id}
          className="font-mono text-sm text-primary hover:underline"
        >
          {row.original.barcode}
        </Link>
      ),
    },
    {
      accessorKey: "callNumber",
      header: "Call Number",
      cell: ({ row }) => <span className="text-sm">{row.original.callNumber}</span>,
    },
    {
      accessorKey: "location",
      header: "Location",
      cell: ({ row }) => (
        <div className="flex items-center gap-1.5">
          <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-sm">{row.original.location}</span>
        </div>
      ),
    },
    {
      accessorKey: "circLib",
      header: "Library",
      cell: ({ row }) => (
        <div className="flex items-center gap-1.5">
          <Building className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-sm">{row.original.circLib}</span>
        </div>
      ),
    },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row }) => (
        <Badge variant="outline" className={getStatusColor(row.original.statusId)}>
          {row.original.status}
        </Badge>
      ),
    },
    {
      accessorKey: "dueDate",
      header: "Due Date",
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">
          {row.original.dueDate ? new Date(row.original.dueDate).toLocaleDateString() : "-"}
        </span>
      ),
    },
  ];

  if (isLoading) {
    return <LoadingSpinner message="Loading record..." />;
  }

  if (error || !record) {
    return (
      <PageContainer>
        <PageContent>
          <EmptyState
            title="Record not found"
            description={error || "The requested record could not be found."}
            action={{
              label: "Back to Catalog",
              onClick: () => router.push("/staff/catalog"),
              icon: ArrowLeft,
            }}
          />
        </PageContent>
      </PageContainer>
    );
  }

  const holdQueueHref = `/staff/circulation/holds-management?tab=title&title_id=${record.id}`;

  return (
    <ErrorBoundary onReset={() => router.refresh()}>
      <PageContainer>
        <PageHeader
          title={record.title}
          subtitle={[
            record.author ? `by ${record.author}` : null,
            record.pubdate || null,
            record.format || null,
          ]
            .filter(Boolean)
            .join(" • ")}
          breadcrumbs={[
            { label: "Catalog", href: "/staff/catalog" },
            {
              label:
                record.title && record.title.length > 42
                  ? `${record.title.slice(0, 42)}…`
                  : record.title || `Record ${record.id}`,
            },
          ]}
          actions={[
            {
              label: "Back",
              onClick: () => router.back(),
              icon: ArrowLeft,
              variant: "outline",
            },
            {
              label: "Edit MARC",
              onClick: () => router.push("/staff/cataloging/marc-editor?id=" + record.id),
              icon: Edit,
            },
            {
              label: "Add Items",
              onClick: () => setAddItemOpen(true),
              icon: Plus,
            },
            {
              label: "Hold Queue",
              onClick: () => router.push(holdQueueHref),
              icon: ListOrdered,
              variant: "outline",
            },
            {
              label: "Holdings",
              onClick: () => router.push("/staff/cataloging/holdings?id=" + record.id),
              icon: Package,
              variant: "outline",
            },
            {
              label: "Place Hold",
              onClick: () => setHoldOpen(true),
              icon: Bookmark,
              variant: "outline",
            },
          ]}
        />

        <PageContent className="space-y-6">
          <div className="grid lg:grid-cols-4 gap-6">
            <Card className="lg:col-span-1">
              <CardContent className="pt-6 flex flex-col items-center gap-4">
                <CoverImage
                  isbn={record.isbn}
                  title={record.title}
                  customCoverUrl={customCoverUrl}
                  onClick={() => setCoverPickerOpen(true)}
                />

                <div className="w-full space-y-3 pt-2">
                  <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                    <span className="text-sm text-muted-foreground">Total Copies</span>
                    <span className="text-lg font-semibold">{totalCopies}</span>
                  </div>
                  <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                    <span className="text-sm text-muted-foreground">Available</span>
                    <span
                      className={
                        "text-lg font-semibold " +
                        (availableCopies > 0 ? "text-green-600" : "text-amber-600")
                      }
                    >
                      {availableCopies}
                    </span>
                  </div>
                  <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                    <span className="text-sm text-muted-foreground">Holds in Queue</span>
                    <span
                      className={
                        "text-lg font-semibold " +
                        (holdQueueCount > 0 ? "text-amber-600" : "text-muted-foreground")
                      }
                    >
                      {holdQueueCount}
                    </span>
                  </div>
                  {(record.createDate || record.editDate) && (
                    <div className="rounded-lg border bg-background px-3 py-2">
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-xs uppercase tracking-wide text-muted-foreground">
                          Record Created
                        </span>
                        <span className="text-xs font-medium">{formatDateTime(record.createDate)}</span>
                      </div>
                      <div className="mt-1 flex items-center justify-between gap-3">
                        <span className="text-xs uppercase tracking-wide text-muted-foreground">
                          Last Edited
                        </span>
                        <span className="text-xs font-medium">{formatDateTime(record.editDate)}</span>
                      </div>
                    </div>
                  )}
                </div>

                <Separator />

                <div className="w-full space-y-2">
                  <Button variant="outline" size="sm" className="w-full" asChild>
                    <Link
                      href={"/opac/record/" + record.id}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <ExternalLink className="h-4 w-4 mr-2" />
                      View in OPAC
                    </Link>
                  </Button>
                  <Button variant="outline" size="sm" className="w-full" asChild>
                    <Link href={holdQueueHref}>
                      <ListOrdered className="h-4 w-4 mr-2" />
                      View Hold Queue
                    </Link>
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card className="lg:col-span-3">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <BookOpen className="h-5 w-5" />
                  Bibliographic Details
                </CardTitle>
                <CardDescription>
                  TCN: {record.tcn || record.id} | Record ID: {record.id}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Tabs defaultValue="details">
                  <TabsList>
                    <TabsTrigger value="details">Details</TabsTrigger>
                    <TabsTrigger value="marc">MARC</TabsTrigger>
                    <TabsTrigger value="subjects">Subjects</TabsTrigger>
                    {record.summary && <TabsTrigger value="summary">Summary</TabsTrigger>}
                    {record.notes && record.notes.length > 0 && (
                      <TabsTrigger value="notes">Notes</TabsTrigger>
                    )}
                  </TabsList>

                  <TabsContent value="details" className="mt-4">
                    <div className="grid sm:grid-cols-2 gap-4">
                      {record.author && (
                        <div>
                          <span className="text-xs text-muted-foreground uppercase tracking-wide">
                            Author
                          </span>
                          <p className="font-medium">{record.author}</p>
                        </div>
                      )}
                      {record.publisher && (
                        <div>
                          <span className="text-xs text-muted-foreground uppercase tracking-wide">
                            Publisher
                          </span>
                          <p className="font-medium">{record.publisher}</p>
                        </div>
                      )}
                      {record.pubdate && (
                        <div>
                          <span className="text-xs text-muted-foreground uppercase tracking-wide">
                            Publication Date
                          </span>
                          <p className="font-medium">{record.pubdate}</p>
                        </div>
                      )}
                      {record.edition && (
                        <div>
                          <span className="text-xs text-muted-foreground uppercase tracking-wide">
                            Edition
                          </span>
                          <p className="font-medium">{record.edition}</p>
                        </div>
                      )}
                      {record.isbn && (
                        <div>
                          <span className="text-xs text-muted-foreground uppercase tracking-wide">
                            ISBN
                          </span>
                          <p className="font-mono">{record.isbn}</p>
                        </div>
                      )}
                      {record.issn && (
                        <div>
                          <span className="text-xs text-muted-foreground uppercase tracking-wide">
                            ISSN
                          </span>
                          <p className="font-mono">{record.issn}</p>
                        </div>
                      )}
                      {record.format && (
                        <div>
                          <span className="text-xs text-muted-foreground uppercase tracking-wide">
                            Format
                          </span>
                          <Badge variant="secondary">{record.format}</Badge>
                        </div>
                      )}
                      {record.language && (
                        <div>
                          <span className="text-xs text-muted-foreground uppercase tracking-wide">
                            Language
                          </span>
                          <p className="font-medium">{record.language}</p>
                        </div>
                      )}
                      {record.physicalDescription && (
                        <div className="sm:col-span-2">
                          <span className="text-xs text-muted-foreground uppercase tracking-wide">
                            Physical Description
                          </span>
                          <p className="font-medium">{record.physicalDescription}</p>
                        </div>
                      )}
                      {record.series && (
                        <div className="sm:col-span-2">
                          <span className="text-xs text-muted-foreground uppercase tracking-wide">
                            Series
                          </span>
                          <p className="font-medium">{record.series}</p>
                        </div>
                      )}
                    </div>
                  </TabsContent>

                  <TabsContent value="marc" className="mt-4 space-y-4">
                    {parsedMarc ? (
                      <>
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="text-xs text-muted-foreground">
                            {parsedMarc.controlFields.length + parsedMarc.dataFields.length + 1}{" "}
                            fields loaded from MARC record
                          </p>
                          <Button size="sm" variant="outline" asChild>
                            <Link href={`/staff/cataloging/marc-editor?id=${record.id}`}>
                              <Edit className="h-4 w-4 mr-2" />
                              Open Full MARC Editor
                            </Link>
                          </Button>
                        </div>

                        <div className="grid gap-4 lg:grid-cols-2">
                          <Card>
                            <CardHeader className="pb-2">
                              <CardTitle className="text-base">Leader Fixed Fields</CardTitle>
                            </CardHeader>
                            <CardContent className="pt-0">
                              <div className="rounded border">
                                <table className="w-full text-sm">
                                  <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                                    <tr>
                                      <th className="px-3 py-2 text-left">Pos</th>
                                      <th className="px-3 py-2 text-left">Label</th>
                                      <th className="px-3 py-2 text-left">Value</th>
                                      <th className="px-3 py-2 text-left">Meaning</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {leaderRows.map((row) => (
                                      <tr
                                        key={`leader-${row.position}`}
                                        className="border-t align-top"
                                      >
                                        <td className="px-3 py-2 font-mono text-xs">
                                          {row.position}
                                        </td>
                                        <td className="px-3 py-2">{row.label}</td>
                                        <td className="px-3 py-2 font-mono text-xs">
                                          {row.value || "-"}
                                        </td>
                                        <td className="px-3 py-2 text-muted-foreground">
                                          {row.note}
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </CardContent>
                          </Card>

                          <Card>
                            <CardHeader className="pb-2">
                              <CardTitle className="text-base">008 Fixed Fields</CardTitle>
                            </CardHeader>
                            <CardContent className="pt-0">
                              <div className="rounded border">
                                <table className="w-full text-sm">
                                  <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                                    <tr>
                                      <th className="px-3 py-2 text-left">Pos</th>
                                      <th className="px-3 py-2 text-left">Label</th>
                                      <th className="px-3 py-2 text-left">Value</th>
                                      <th className="px-3 py-2 text-left">Meaning</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {field008Rows.map((row) => (
                                      <tr
                                        key={`008-${row.position}`}
                                        className="border-t align-top"
                                      >
                                        <td className="px-3 py-2 font-mono text-xs">
                                          {row.position}
                                        </td>
                                        <td className="px-3 py-2">{row.label}</td>
                                        <td className="px-3 py-2 font-mono text-xs">
                                          {row.value || "-"}
                                        </td>
                                        <td className="px-3 py-2 text-muted-foreground">
                                          {row.note}
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </CardContent>
                          </Card>
                        </div>

                        <div className="rounded border">
                          <div className="max-h-[460px] overflow-auto">
                            <table className="w-full text-sm">
                              <thead className="sticky top-0 bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                                <tr>
                                  <th className="px-3 py-2 text-left">Tag</th>
                                  <th className="px-3 py-2 text-left">Ind</th>
                                  <th className="px-3 py-2 text-left">Subfields</th>
                                </tr>
                              </thead>
                              <tbody>
                                <tr className="border-t align-top">
                                  <td className="px-3 py-2 font-mono">LDR</td>
                                  <td className="px-3 py-2 font-mono">--</td>
                                  <td className="px-3 py-2 font-mono text-xs">
                                    {parsedMarc.leader || "-"}
                                  </td>
                                </tr>
                                {parsedMarc.controlFields.map((field, idx) => (
                                  <tr key={`cf-${field.tag}-${idx}`} className="border-t align-top">
                                    <td className="px-3 py-2 font-mono">{field.tag}</td>
                                    <td className="px-3 py-2 font-mono">--</td>
                                    <td className="px-3 py-2 font-mono text-xs break-all">
                                      {field.value || "-"}
                                    </td>
                                  </tr>
                                ))}
                                {parsedMarc.dataFields.map((field, idx) => (
                                  <tr key={`df-${field.tag}-${idx}`} className="border-t align-top">
                                    <td className="px-3 py-2 font-mono">{field.tag}</td>
                                    <td className="px-3 py-2 font-mono">{`${field.ind1}${field.ind2}`}</td>
                                    <td className="px-3 py-2 font-mono text-xs break-words">
                                      {formatMarcSubfields(field.subfields)}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      </>
                    ) : (
                      <EmptyState
                        title="MARC data unavailable"
                        description="This record did not return MARCXML in the current response."
                        action={{
                          label: "Open MARC Editor",
                          onClick: () =>
                            router.push("/staff/cataloging/marc-editor?id=" + record.id),
                          icon: Edit,
                        }}
                      />
                    )}
                  </TabsContent>

                  <TabsContent value="subjects" className="mt-4">
                    {record.subjects && record.subjects.length > 0 ? (
                      <div className="flex flex-wrap gap-2">
                        {record.subjects.map((subject, idx) => (
                          <Badge
                            key={"subject-" + idx}
                            variant="outline"
                            className="cursor-pointer hover:bg-muted"
                          >
                            {subject}
                          </Badge>
                        ))}
                      </div>
                    ) : (
                      <p className="text-muted-foreground">No subjects available</p>
                    )}
                  </TabsContent>

                  {record.summary && (
                    <TabsContent value="summary" className="mt-4">
                      <p className="text-sm leading-relaxed whitespace-pre-line">
                        {record.summary}
                      </p>
                    </TabsContent>
                  )}

                  {record.notes && record.notes.length > 0 && (
                    <TabsContent value="notes" className="mt-4">
                      <ul className="space-y-2">
                        {record.notes.map((note, idx) => (
                          <li key={"note-" + idx} className="text-sm text-muted-foreground">
                            {note}
                          </li>
                        ))}
                      </ul>
                    </TabsContent>
                  )}
                </Tabs>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ListOrdered className="h-5 w-5" />
                Hold Queue ({holdQueueCount})
              </CardTitle>
              <CardDescription>
                Title-level hold queue for this bibliographic record
              </CardDescription>
            </CardHeader>
            <CardContent>
              {holdQueueCount === 0 ? (
                <p className="text-sm text-muted-foreground">No active holds on this title.</p>
              ) : titleHolds.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Holds exist for this title, but queue details are not available in this response.
                </p>
              ) : (
                <div className="space-y-2">
                  {titleHolds.map((hold) => (
                    <div
                      key={`title-hold-${hold.id}`}
                      className="grid gap-2 rounded-lg border p-3 sm:grid-cols-[auto_1fr_auto] sm:items-center"
                    >
                      <Badge variant="outline" className="font-mono w-fit">
                        #{hold.queuePosition ?? "?"}
                      </Badge>
                      <div>
                        <p className="text-sm font-medium">
                          Requested {formatDateTime(hold.requestTime)}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {hold.patronBarcode
                            ? `Patron ${hold.patronBarcode}`
                            : "Patron details unavailable"}
                          {hold.pickupLib ? ` • Pickup Library ${hold.pickupLib}` : ""}
                        </p>
                      </div>
                      <Badge variant="outline" className={getHoldStatusClass(hold.status)}>
                        {getHoldStatusLabel(hold.status)}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}

              <Button variant="outline" size="sm" className="mt-4" asChild>
                <Link href={holdQueueHref}>Open Hold Queue Management</Link>
              </Button>
            </CardContent>
          </Card>

          {holdingsTree.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Building className="h-5 w-5" />
                  Holdings Tree
                </CardTitle>
                <CardDescription>
                  Hierarchy by library, call number, and copy barcode
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Accordion type="multiple" className="w-full">
                  {holdingsTree.map((libraryNode, libraryIndex) => (
                    <AccordionItem
                      key={`library-${libraryIndex}-${libraryNode.library}`}
                      value={`library-${libraryIndex}`}
                    >
                      <AccordionTrigger className="hover:no-underline">
                        <div className="flex w-full items-center justify-between gap-3 pr-3 text-left">
                          <div className="flex items-center gap-2">
                            <Building className="h-4 w-4 text-muted-foreground" />
                            <span className="font-medium">{libraryNode.library}</span>
                          </div>
                          <Badge
                            variant={libraryNode.availableCopies > 0 ? "default" : "secondary"}
                          >
                            {libraryNode.availableCopies}/{libraryNode.totalCopies}
                          </Badge>
                        </div>
                      </AccordionTrigger>
                      <AccordionContent>
                        <div className="space-y-3 pb-1">
                          {libraryNode.branches.map((branch) => (
                            <div
                              key={`branch-${libraryNode.library}-${branch.key}`}
                              className="rounded-lg border p-3"
                            >
                              <div className="flex flex-wrap items-center justify-between gap-3">
                                <div>
                                  <p className="font-mono text-xs">{branch.callNumber}</p>
                                  <p className="text-xs text-muted-foreground">{branch.location}</p>
                                </div>
                                <Badge
                                  variant={branch.availableCopies > 0 ? "default" : "secondary"}
                                >
                                  {branch.availableCopies}/{branch.copies.length}
                                </Badge>
                              </div>

                              <div className="mt-2 space-y-1">
                                {branch.copies.map((copy) => (
                                  <div
                                    key={`tree-copy-${copy.id}`}
                                    className="flex flex-wrap items-center justify-between gap-2 rounded border border-dashed px-2 py-1"
                                  >
                                    <Link
                                      href={`/staff/catalog/item/${copy.id}`}
                                      className="font-mono text-xs text-primary hover:underline"
                                    >
                                      {copy.barcode}
                                    </Link>
                                    <Badge
                                      variant="outline"
                                      className={getStatusColor(copy.statusId)}
                                    >
                                      {copy.status}
                                    </Badge>
                                  </div>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  ))}
                </Accordion>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Copy className="h-5 w-5" />
                Item Copies ({copies.length})
              </CardTitle>
              <CardDescription>
                Individual copies attached to this bibliographic record
              </CardDescription>
            </CardHeader>
            <CardContent>
              <DataTable
                columns={copyColumns}
                data={copies}
                searchable={false}
                emptyState={
                  <EmptyState
                    title="No copies"
                    description="No copies are attached to this record."
                    action={{ label: "Add item", onClick: () => setAddItemOpen(true) }}
                    secondaryAction={{
                      label: "Seed demo data",
                      onClick: () => router.push("/staff/help#demo-data"),
                    }}
                  />
                }
              />
            </CardContent>
          </Card>
        </PageContent>

        <CoverArtPicker
          open={coverPickerOpen}
          onOpenChange={setCoverPickerOpen}
          isbn={record?.isbn}
          title={record?.title || ""}
          author={record?.author}
          recordId={Number.parseInt(recordId, 10)}
          currentCoverUrl={customCoverUrl}
          onCoverSelected={handleCoverSelected}
        />

        <PlaceHoldDialog
          open={holdOpen}
          onOpenChange={setHoldOpen}
          record={{ id: record.id, title: record.title, author: record.author }}
        />

        <AddItemDialog
          open={addItemOpen}
          onOpenChange={setAddItemOpen}
          bibRecord={{
            id: record.id,
            title: record.title,
            author: record.author,
            isbn: record.isbn,
          }}
          onItemCreated={() => window.location.reload()}
        />
      </PageContainer>
    </ErrorBoundary>
  );
}
