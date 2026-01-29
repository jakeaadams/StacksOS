/**
 * BarcodeInput - Specialized input for barcode scanning
 *
 * Features:
 * - Auto-submit on scan (detects rapid input)
 * - Clear button
 * - Loading state
 * - Success/error feedback
 * - Keyboard accessibility (Enter to submit)
 * - Auto-focus support
 *
 * Critical for library circulation workflows.
 */

"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Barcode, X, Loader2, Check, AlertCircle } from "lucide-react";

export interface BarcodeInputProps {
  /** Input label */
  label?: string;
  /** Placeholder text */
  placeholder?: string;
  /** Current value */
  value?: string;
  /** Change handler */
  onChange?: (value: string) => void;
  /** Submit handler (Enter key or auto-submit) */
  onSubmit?: (value: string) => void;
  /** Loading state */
  isLoading?: boolean;
  /** Success state (briefly shows check mark) */
  isSuccess?: boolean;
  /** Error message */
  error?: string;
  /** Auto-focus on mount */
  autoFocus?: boolean;
  /** Auto-clear after successful submit */
  autoClear?: boolean;
  /** Disabled state */
  disabled?: boolean;
  /** Size variant */
  size?: "sm" | "md" | "lg";
  /** Custom className */
  className?: string;
  /** Input ID */
  id?: string;
  /** Show barcode icon */
  showIcon?: boolean;
  /** Auto-submit after rapid input (scanner detection) */
  autoSubmitOnScan?: boolean;
  /** Minimum characters for auto-submit */
  minLength?: number;
  /** Description/help text */
  description?: string;
}

/**
 * BarcodeInput component for scanning patron/item barcodes
 *
 * @example
 * ```tsx
 * <BarcodeInput
 *   label="Patron Barcode"
 *   placeholder="Scan or enter patron barcode"
 *   onSubmit={handlePatronLookup}
 *   isLoading={isLookingUp}
 *   error={lookupError}
 *   autoFocus
 *   autoClear
 * />
 * ```
 */
export const BarcodeInput = React.forwardRef<HTMLInputElement, BarcodeInputProps>(
  function BarcodeInput(
    {
      label,
      placeholder = "Scan barcode...",
      value: controlledValue,
      onChange,
      onSubmit,
      isLoading = false,
      isSuccess = false,
      error,
      autoFocus = false,
      autoClear = false,
      disabled = false,
      size = "md",
      className,
      id,
      showIcon = true,
      autoSubmitOnScan = true,
      minLength = 3,
      description,
    }: BarcodeInputProps,
    forwardedRef
  ) {
  const [internalValue, setInternalValue] = React.useState("");
  const [showSuccess, setShowSuccess] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const lastInputTimeRef = React.useRef<number>(0);
  const rapidInputCountRef = React.useRef<number>(0);
  const setRefs = React.useCallback(
    (node: HTMLInputElement | null) => {
      inputRef.current = node;
      if (!forwardedRef) return;
      if (typeof forwardedRef === "function") {
        forwardedRef(node);
      } else {
        forwardedRef.current = node;
      }
    },
    [forwardedRef]
  );

  // Use controlled or internal value
  const value = controlledValue ?? internalValue;
  const setValue = React.useCallback(
    (newValue: string) => {
      if (controlledValue === undefined) {
        setInternalValue(newValue);
      }
      onChange?.(newValue);
    },
    [controlledValue, onChange]
  );

  // Auto-focus on mount
  React.useEffect(() => {
    if (autoFocus && inputRef.current) {
      inputRef.current.focus();
    }
  }, [autoFocus]);

  // Show success animation
  React.useEffect(() => {
    if (isSuccess) {
      setShowSuccess(true);
      const timer = setTimeout(() => setShowSuccess(false), 1500);
      return () => clearTimeout(timer);
    }
  }, [isSuccess]);

  // Submit handler
  const handleSubmit = React.useCallback(() => {
    if (!value || value.length < minLength || isLoading) return;

    onSubmit?.(value.trim());

    if (autoClear) {
      setValue("");
      inputRef.current?.focus();
    }
  }, [autoClear, isLoading, minLength, onSubmit, setValue, value]);

  // Handle input change with scanner detection
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    const now = Date.now();
    const timeSinceLastInput = now - lastInputTimeRef.current;

    // Detect rapid input (typical of barcode scanners: < 50ms between chars)
    if (timeSinceLastInput < 50) {
      rapidInputCountRef.current++;
    } else {
      rapidInputCountRef.current = 0;
    }

    lastInputTimeRef.current = now;
    setValue(newValue);
  };

  // Handle key up for scanner detection
  const handleKeyUp = (e: React.KeyboardEvent<HTMLInputElement>) => {
    // Auto-submit on rapid input (scanner) or Enter key
    if (e.key === "Enter" && value.length >= minLength) {
      handleSubmit();
    }
  };

  // Detect when scanner finishes (rapid input followed by pause)
  React.useEffect(() => {
    if (!autoSubmitOnScan || value.length < minLength) return;

    // If we had rapid input, wait for a brief pause then submit
    if (rapidInputCountRef.current >= 3) {
      const timer = setTimeout(() => {
        if (rapidInputCountRef.current >= 3) {
          handleSubmit();
          rapidInputCountRef.current = 0;
        }
      }, 100);

      return () => clearTimeout(timer);
    }
  }, [autoSubmitOnScan, handleSubmit, minLength, value]);

  // Clear handler
  const handleClear = () => {
    setValue("");
    inputRef.current?.focus();
  };

  // Size classes
  const sizeClasses = {
    sm: "h-8 text-sm",
    md: "h-10",
    lg: "h-12 text-lg",
  };

  const iconSizeClasses = {
    sm: "h-4 w-4",
    md: "h-5 w-5",
    lg: "h-6 w-6",
  };

  const generatedId = React.useId();
  const inputId = id ?? generatedId;

  return (
    <div className={cn("space-y-2", className)}>
      {/* Label */}
      {label && (
        <Label htmlFor={inputId} className="text-sm font-medium">
          {label}
        </Label>
      )}

      {/* Input container */}
      <div className="relative">
        {/* Left icon */}
        {showIcon && (
          <div className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground">
            {isLoading ? (
              <Loader2 className={cn("animate-spin", iconSizeClasses[size])} />
            ) : showSuccess ? (
              <Check className={cn("text-green-500", iconSizeClasses[size])} />
            ) : error ? (
              <AlertCircle className={cn("text-destructive", iconSizeClasses[size])} />
            ) : (
              <Barcode className={iconSizeClasses[size]} />
            )}
          </div>
        )}

        {/* Input */}
        <Input
          ref={setRefs}
          id={inputId}
          type="text"
          inputMode="text"
          autoComplete="off"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          placeholder={placeholder}
          value={value}
          onChange={handleChange}
          onKeyUp={handleKeyUp}
          disabled={disabled || isLoading}
          aria-busy={isLoading}
          className={cn(
            sizeClasses[size],
            showIcon && "!pl-14",
            value && "pr-10",
            error && "border-destructive focus-visible:ring-destructive"
          )}
          aria-invalid={!!error}
          aria-describedby={error ? `${inputId}-error` : description ? `${inputId}-description` : undefined}
        />

        {/* Clear button */}
        {value && !isLoading && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
            onClick={handleClear}
            tabIndex={-1}
            title="Clear"
          >
            <X className="h-4 w-4" />
            <span className="sr-only">Clear</span>
          </Button>
        )}
      </div>

      {/* Error message */}
      {error && (
        <p id={`${inputId}-error`} className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}

      {/* Description */}
      {description && !error && (
        <p id={`${inputId}-description`} className="text-sm text-muted-foreground">
          {description}
        </p>
      )}
    </div>
  );
  }
);

BarcodeInput.displayName = "BarcodeInput";

/**
 * Dual barcode input for checkout/checkin (patron + item)
 *
 * @example
 * ```tsx
 * <DualBarcodeInput
 *   patronBarcode={patronBarcode}
 *   onPatronSubmit={lookupPatron}
 *   itemBarcode={itemBarcode}
 *   onItemSubmit={checkoutItem}
 *   patronLoading={patronLoading}
 *   itemLoading={checkoutLoading}
 * />
 * ```
 */
export interface DualBarcodeInputProps {
  patronBarcode?: string;
  onPatronChange?: (value: string) => void;
  onPatronSubmit?: (value: string) => void;
  patronLoading?: boolean;
  patronError?: string;
  patronSuccess?: boolean;

  itemBarcode?: string;
  onItemChange?: (value: string) => void;
  onItemSubmit?: (value: string) => void;
  itemLoading?: boolean;
  itemError?: string;
  itemSuccess?: boolean;

  disabled?: boolean;
  className?: string;
}

export function DualBarcodeInput({
  patronBarcode,
  onPatronChange,
  onPatronSubmit,
  patronLoading,
  patronError,
  patronSuccess,
  itemBarcode,
  onItemChange,
  onItemSubmit,
  itemLoading,
  itemError,
  itemSuccess,
  disabled,
  className,
}: DualBarcodeInputProps) {
  const itemInputRef = React.useRef<HTMLInputElement>(null);

  // Auto-focus item input after patron lookup
  React.useEffect(() => {
    if (patronSuccess && itemInputRef.current) {
      itemInputRef.current.focus();
    }
  }, [patronSuccess]);

  return (
    <div className={cn("grid gap-4 sm:grid-cols-2", className)}>
      <BarcodeInput
        label="Patron Barcode"
        placeholder="Scan patron card..."
        value={patronBarcode}
        onChange={onPatronChange}
        onSubmit={onPatronSubmit}
        isLoading={patronLoading}
        isSuccess={patronSuccess}
        error={patronError}
        disabled={disabled}
        autoFocus
      />
      <BarcodeInput
        label="Item Barcode"
        placeholder="Scan item..."
        value={itemBarcode}
        onChange={onItemChange}
        onSubmit={onItemSubmit}
        isLoading={itemLoading}
        isSuccess={itemSuccess}
        error={itemError}
        disabled={disabled || !patronSuccess}
        autoClear
      />
    </div>
  );
}

export default BarcodeInput;
