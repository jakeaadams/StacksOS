"use client";

import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { FixedFieldOption } from "./marc-types";
import {
  leaderRecordStatusOptions,
  leaderTypeOptions,
  leaderBibLevelOptions,
  leaderEncodingOptions,
  leaderCatalogingFormOptions,
  fixed008DateTypeOptions,
  fixed008AudienceOptions,
  fixed008FormOptions,
  fixed008CatalogingSourceOptions,
  fixed008LanguageOptions,
} from "./marc-constants";

interface FixedFieldsEditorProps {
  currentLeader: string;
  field008: string;
  onLeaderChange: (value: string) => void;
  onLeaderPosChange: (position: number, value: string) => void;
  on008PosChange: (position: number, value: string) => void;
  on008RangeChange: (start: number, endExclusive: number, value: string) => void;
  onControlFieldChange: (tag: string, value: string) => void;
}

function getLeaderPos(leader: string, position: number) {
  return leader.charAt(position) || " ";
}
function get008Pos(field008: string, position: number) {
  return field008.charAt(position) || " ";
}
function get008Range(field008: string, start: number, endExclusive: number) {
  return field008.slice(start, endExclusive).trimEnd();
}

function FixedFieldSelect({
  label,
  value,
  options,
  onChange,
  keyPrefix,
}: {
  label: string;
  value: string;
  options: FixedFieldOption[];
  onChange: (v: string) => void;
  keyPrefix: string;
}) {
  return (
    <div className="space-y-1">
      <div className="text-xs text-muted-foreground">{label}</div>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={`${keyPrefix}-${option.value || "blank"}`} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

export function FixedFieldsEditor({
  currentLeader,
  field008,
  onLeaderChange,
  onLeaderPosChange,
  on008PosChange,
  on008RangeChange,
  onControlFieldChange,
}: FixedFieldsEditorProps) {
  return (
    <div className="space-y-3 rounded-lg border bg-muted/20 p-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">Fixed Fields</span>
        <Badge variant="outline">Leader + 008</Badge>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-muted-foreground">Leader (LDR)</span>
          <Badge variant="outline">24 chars</Badge>
        </div>
        <Input
          value={currentLeader}
          onChange={(e) => onLeaderChange(e.target.value.slice(0, 24).padEnd(24, " "))}
          className="font-mono text-sm"
          maxLength={24}
        />

        <div className="grid gap-2 md:grid-cols-2">
          <FixedFieldSelect
            label="05 Record Status"
            value={getLeaderPos(currentLeader, 5) || " "}
            options={leaderRecordStatusOptions}
            onChange={(v) => onLeaderPosChange(5, v)}
            keyPrefix="ldr-05"
          />
          <FixedFieldSelect
            label="06 Type of Record"
            value={getLeaderPos(currentLeader, 6) || "a"}
            options={leaderTypeOptions}
            onChange={(v) => onLeaderPosChange(6, v)}
            keyPrefix="ldr-06"
          />
          <FixedFieldSelect
            label="07 Bibliographic Level"
            value={getLeaderPos(currentLeader, 7) || "m"}
            options={leaderBibLevelOptions}
            onChange={(v) => onLeaderPosChange(7, v)}
            keyPrefix="ldr-07"
          />
          <FixedFieldSelect
            label="17 Encoding Level"
            value={getLeaderPos(currentLeader, 17) || " "}
            options={leaderEncodingOptions}
            onChange={(v) => onLeaderPosChange(17, v)}
            keyPrefix="ldr-17"
          />
          <div className="space-y-1 md:col-span-2">
            <FixedFieldSelect
              label="18 Descriptive Cataloging Form"
              value={getLeaderPos(currentLeader, 18) || " "}
              options={leaderCatalogingFormOptions}
              onChange={(v) => onLeaderPosChange(18, v)}
              keyPrefix="ldr-18"
            />
          </div>
        </div>
      </div>

      <div className="space-y-2 border-t pt-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-muted-foreground">008 Fixed-Length Data</span>
          <Badge variant="outline">40 chars</Badge>
        </div>
        <Input
          value={field008}
          onChange={(e) => onControlFieldChange("008", e.target.value.slice(0, 40).padEnd(40, " "))}
          className="font-mono text-sm"
          maxLength={40}
        />

        <div className="grid gap-2 md:grid-cols-2">
          <div className="space-y-1">
            <div className="text-xs text-muted-foreground">00-05 Date Entered (YYMMDD)</div>
            <Input
              value={get008Range(field008, 0, 6)}
              onChange={(e) => on008RangeChange(0, 6, e.target.value.replace(/[^0-9]/g, ""))}
              className="font-mono text-sm"
              maxLength={6}
              placeholder="YYMMDD"
            />
          </div>
          <FixedFieldSelect
            label="06 Date Type"
            value={get008Pos(field008, 6) || "s"}
            options={fixed008DateTypeOptions}
            onChange={(v) => on008PosChange(6, v)}
            keyPrefix="008-06"
          />
          <div className="space-y-1">
            <div className="text-xs text-muted-foreground">07-10 Date 1</div>
            <Input
              value={get008Range(field008, 7, 11)}
              onChange={(e) => on008RangeChange(7, 11, e.target.value.replace(/[^0-9]/g, ""))}
              className="font-mono text-sm"
              maxLength={4}
              placeholder="YYYY"
              aria-label="Date 1"
            />
          </div>
          <div className="space-y-1">
            <div className="text-xs text-muted-foreground">11-14 Date 2</div>
            <Input
              value={get008Range(field008, 11, 15)}
              onChange={(e) => on008RangeChange(11, 15, e.target.value.replace(/[^0-9]/g, ""))}
              className="font-mono text-sm"
              maxLength={4}
              placeholder="YYYY"
              aria-label="Date 2"
            />
          </div>
          <div className="space-y-1">
            <div className="text-xs text-muted-foreground">15-17 Place</div>
            <Input
              value={get008Range(field008, 15, 18)}
              onChange={(e) =>
                on008RangeChange(15, 18, e.target.value.toLowerCase().replace(/[^a-z#]/g, ""))
              }
              className="font-mono text-sm"
              maxLength={3}
              placeholder="xxu"
              aria-label="Place of publication"
            />
          </div>
          <FixedFieldSelect
            label="22 Target Audience"
            value={get008Pos(field008, 22) || " "}
            options={fixed008AudienceOptions}
            onChange={(v) => on008PosChange(22, v)}
            keyPrefix="008-22"
          />
          <FixedFieldSelect
            label="23 Form of Item"
            value={get008Pos(field008, 23) || " "}
            options={fixed008FormOptions}
            onChange={(v) => on008PosChange(23, v)}
            keyPrefix="008-23"
          />
          <FixedFieldSelect
            label="35-37 Language"
            value={get008Range(field008, 35, 38) || "eng"}
            options={fixed008LanguageOptions}
            onChange={(v) => on008RangeChange(35, 38, v.toLowerCase())}
            keyPrefix="008-lang"
          />
          <FixedFieldSelect
            label="39 Cataloging Source"
            value={get008Pos(field008, 39) || "d"}
            options={fixed008CatalogingSourceOptions}
            onChange={(v) => on008PosChange(39, v)}
            keyPrefix="008-39"
          />
        </div>
      </div>
    </div>
  );
}
