"use client";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Plus, Trash2 } from "lucide-react";
import type { MarcField } from "./marc-types";
import { marcFieldDescriptions, indicatorRules, indicatorLabel } from "./marc-constants";

interface MarcFieldRowProps {
  field: MarcField;
  fieldIndex: number;
  onUpdateField: (index: number, updates: Partial<MarcField>) => void;
  onUpdateSubfield: (fieldIndex: number, subfieldIndex: number, code: string, value: string) => void;
  onAddSubfield: (fieldIndex: number) => void;
  onRemoveField: (index: number) => void;
}

export function MarcFieldRow({
  field,
  fieldIndex,
  onUpdateField,
  onUpdateSubfield,
  onAddSubfield,
  onRemoveField,
}: MarcFieldRowProps) {
  const rule = indicatorRules[field.tag];
  const tagNum = Number.parseInt(field.tag, 10);
  const isControlField = !Number.isNaN(tagNum) && tagNum < 10;

  return (
    <div className="border rounded-lg p-3">
      <div className="flex items-center gap-2 mb-2">
        <Input
          value={field.tag}
          onChange={(e) => onUpdateField(fieldIndex, { tag: e.target.value })}
          className="w-16 font-mono text-sm font-bold"
          maxLength={3}
          placeholder="Tag"
          list="marc-tag-suggestions"
        />

        {!isControlField && (
          <>
            <Input
              value={field.ind1}
              onChange={(e) => onUpdateField(fieldIndex, { ind1: e.target.value || " " })}
              className="w-10 font-mono text-sm text-center"
              maxLength={1}
              placeholder="_"
            />
            <Input
              value={field.ind2}
              onChange={(e) => onUpdateField(fieldIndex, { ind2: e.target.value || " " })}
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
          onClick={() => onRemoveField(fieldIndex)}
          title="Delete field"
        >
          <Trash2 className="h-4 w-4" />
          <span className="sr-only">Delete field</span>
        </Button>
      </div>

      {rule && !isControlField && (
        <div className="mb-2 text-[11px] text-muted-foreground">
          Allowed indicators: ind1 [{rule.ind1.map(indicatorLabel).join(", ")}], ind2 [{" "}
          {rule.ind2.map(indicatorLabel).join(", ")}]
        </div>
      )}

      {isControlField ? (
        <Input
          value={field.subfields[0]?.value || ""}
          onChange={(e) => onUpdateSubfield(fieldIndex, 0, "", e.target.value)}
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
                  onUpdateSubfield(fieldIndex, subfieldIndex, e.target.value, subfield.value)
                }
                className="w-10 font-mono text-sm"
                maxLength={1}
                placeholder="a"
              />
              <Input
                value={subfield.value}
                onChange={(e) =>
                  onUpdateSubfield(fieldIndex, subfieldIndex, subfield.code, e.target.value)
                }
                className="flex-1 font-mono text-sm"
                placeholder="Subfield value"
              />
            </div>
          ))}
          <Button
            size="sm"
            variant="ghost"
            onClick={() => onAddSubfield(fieldIndex)}
            className="text-xs"
          >
            <Plus className="h-3 w-3 mr-1" />
            Add Subfield
          </Button>
        </div>
      )}
    </div>
  );
}
