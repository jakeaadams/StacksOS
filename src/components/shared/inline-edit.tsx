"use client";
import { logger } from "@/lib/logger";

import * as React from "react";
import { useState, useRef, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Check, X, Edit, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface InlineEditProps {
  value: string;
  onSave: (newValue: string) => Promise<void>;
  onCancel?: () => void;
  className?: string;
  inputClassName?: string;
  placeholder?: string;
  disabled?: boolean;
  multiline?: boolean;
  showEditIcon?: boolean;
}

export function InlineEdit({
  value,
  onSave,
  onCancel,
  className,
  inputClassName,
  placeholder,
  disabled = false,
  multiline = false,
  showEditIcon = true,
}: InlineEditProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(value);
  const [isSaving, setIsSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  useEffect(() => {
    setEditValue(value);
  }, [value]);

  const handleSave = async () => {
    if (editValue === value) {
      setIsEditing(false);
      return;
    }

    try {
      setIsSaving(true);
      await onSave(editValue);
      setIsEditing(false);
    } catch (error) {
      logger.error({ error: String(error) }, "Save error");
      // Revert on error
      setEditValue(value);
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    setEditValue(value);
    setIsEditing(false);

    // Fire optional callback
    if (onCancel) {
      onCancel();
    }

    // Show subtle toast notification
    toast.info("Edit cancelled");
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !multiline) {
      e.preventDefault();
      handleSave();
    } else if (e.key === "Escape") {
      e.preventDefault();
      handleCancel();
    }
  };

  if (!isEditing) {
    return (
      <div
        className={cn(
          "group inline-flex items-center gap-2 cursor-pointer hover:text-foreground transition-colors",
          disabled && "cursor-not-allowed opacity-50",
          className
        )}
        onClick={() => !disabled && setIsEditing(true)}
        title={disabled ? undefined : "Click to edit"}
      >
        <span className={cn(!value && "text-muted-foreground italic")}>
          {value || placeholder || "Click to edit"}
        </span>
        {showEditIcon && !disabled && (
          <Edit className="h-3.5 w-3.5 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground" />
        )}
      </div>
    );
  }

  return (
    <div className={cn("flex items-center gap-2", className)}>
      {multiline ? (
        <textarea
          ref={inputRef as React.Ref<HTMLTextAreaElement>}
          rows={3}
          className={cn(
            "w-full min-w-[200px] resize-none border rounded-md px-3 py-2",
            inputClassName
          )}
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={isSaving}
          placeholder={placeholder}
        />
      ) : (
        <Input
          ref={inputRef as React.Ref<HTMLInputElement>}
          className={cn("w-full min-w-[200px]", inputClassName)}
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={isSaving}
          placeholder={placeholder}
        />
      )}

      <div className="flex items-center gap-1">
        <Button
          size="sm"
          variant="ghost"
          className="h-8 w-8 p-0"
          onClick={handleSave}
          disabled={isSaving}
          title="Save"
        >
          {isSaving ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Check className="h-4 w-4 text-green-600" />
          )}
          <span className="sr-only">Save</span>
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="h-8 w-8 p-0"
          onClick={handleCancel}
          disabled={isSaving}
          title="Cancel"
        >
          <X className="h-4 w-4 text-red-600" />
          <span className="sr-only">Cancel</span>
        </Button>
      </div>
    </div>
  );
}
