/**
 * Form Components - React Hook Form + Zod integration
 *
 * Provides consistent form handling with validation across the application.
 * Built on shadcn/ui Form components with Zod schema validation.
 *
 * @see https://react-hook-form.com/
 * @see https://zod.dev/
 */

"use client";

import * as React from "react";
import {
  useForm,
  UseFormReturn,
  FieldValues,
  Path,
  SubmitHandler,
  Resolver,
} from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { AlertCircle, Check, Loader2 } from "lucide-react";

// ============================================================================
// Types
// ============================================================================

export interface FormFieldConfig<T extends FieldValues> {
  name: Path<T>;
  label: string;
  type?:
    | "text"
    | "email"
    | "password"
    | "number"
    | "tel"
    | "date"
    | "textarea"
    | "select"
    | "checkbox";
  placeholder?: string;
  description?: string;
  options?: { value: string; label: string }[];
  disabled?: boolean;
  required?: boolean;
  autoFocus?: boolean;
  className?: string;
}

export interface FormProps<T extends FieldValues> {
  schema: z.ZodType<T>;
  defaultValues?: Partial<T>;
  onSubmit: SubmitHandler<T>;
  fields: FormFieldConfig<T>[];
  submitLabel?: string;
  cancelLabel?: string;
  onCancel?: () => void;
  isSubmitting?: boolean;
  className?: string;
  layout?: "vertical" | "horizontal" | "inline";
  showReset?: boolean;
}

// ============================================================================
// Hook: useZodForm
// ============================================================================

export function useZodForm<T extends FieldValues>(
  schema: z.ZodType<T>,
  defaultValues?: Partial<T>
): UseFormReturn<T, any, T> {
  return useForm<T, any, T>({
    resolver: zodResolver(schema as any) as unknown as Resolver<T>,
    defaultValues: defaultValues as any,
    mode: "onBlur",
  });
}

// ============================================================================
// Component: FormBuilder
// ============================================================================

/**
 * Dynamic form builder with Zod validation
 *
 * @example
 * ```tsx
 * const schema = z.object({
 *   email: z.string().email(),
 *   name: z.string().min(2),
 * });
 *
 * <FormBuilder
 *   schema={schema}
 *   fields={[
 *     { name: "email", label: "Email", type: "email" },
 *     { name: "name", label: "Name" },
 *   ]}
 *   onSubmit={(data) => handleSubmit(data)}
 * />
 * ```
 */
export function FormBuilder<T extends FieldValues>({
  schema,
  defaultValues,
  onSubmit,
  fields,
  submitLabel = "Submit",
  cancelLabel = "Cancel",
  onCancel,
  isSubmitting = false,
  className,
  layout = "vertical",
  showReset = false,
}: FormProps<T>) {
  const form = useZodForm(schema, defaultValues);

  const layoutClasses = {
    vertical: "space-y-4",
    horizontal: "grid gap-4 md:grid-cols-2",
    inline: "flex flex-wrap gap-4 items-end",
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className={cn(layoutClasses[layout], className)}>
        {fields.map((fieldConfig) => (
          <FormFieldRenderer key={fieldConfig.name} form={form} config={fieldConfig} />
        ))}

        <div className={cn("flex gap-2 pt-4", layout === "inline" ? "" : "border-t mt-6")}>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              submitLabel
            )}
          </Button>

          {showReset && (
            <Button
              type="button"
              variant="outline"
              onClick={() => form.reset()}
              disabled={isSubmitting}
            >
              Reset
            </Button>
          )}

          {onCancel && (
            <Button type="button" variant="ghost" onClick={onCancel} disabled={isSubmitting}>
              {cancelLabel}
            </Button>
          )}
        </div>
      </form>
    </Form>
  );
}

// ============================================================================
// Component: FormFieldRenderer
// ============================================================================

function FormFieldRenderer<T extends FieldValues>({
  form,
  config,
}: {
  form: UseFormReturn<T>;
  config: FormFieldConfig<T>;
}) {
  const {
    name,
    label,
    type = "text",
    placeholder,
    description,
    options,
    disabled,
    required,
    autoFocus,
    className,
  } = config;

  return (
    <FormField
      control={form.control}
      name={name}
      render={({ field }) => (
        <FormItem className={className}>
          {type !== "checkbox" && (
            <FormLabel>
              {label}
              {required && <span className="text-destructive ml-1">*</span>}
            </FormLabel>
          )}

          <FormControl>
            {type === "textarea" ? (
              <Textarea
                placeholder={placeholder}
                disabled={disabled}
                autoFocus={autoFocus}
                {...field}
              />
            ) : type === "select" && options ? (
              <Select onValueChange={field.onChange} defaultValue={field.value} disabled={disabled}>
                <SelectTrigger>
                  <SelectValue placeholder={placeholder || "Select..."} />
                </SelectTrigger>
                <SelectContent>
                  {options.map((option: any) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : type === "checkbox" ? (
              <div className="flex items-center space-x-2">
                <Checkbox
                  checked={field.value}
                  onCheckedChange={field.onChange}
                  disabled={disabled}
                />
                <label className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                  {label}
                </label>
              </div>
            ) : (
              <Input
                type={type}
                placeholder={placeholder}
                disabled={disabled}
                autoFocus={autoFocus}
                {...field}
              />
            )}
          </FormControl>

          {description && <FormDescription>{description}</FormDescription>}
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

// ============================================================================
// Pre-built Form Schemas
// ============================================================================

/**
 * Common Zod schemas for library operations
 */
export const formSchemas = {
  // Patron registration
  patronRegistration: z.object({
    firstName: z.string().min(1, "First name is required"),
    lastName: z.string().min(1, "Last name is required"),
    email: z.string().email("Invalid email address").optional().or(z.literal("")),
    phone: z.string().optional(),
    barcode: z.string().min(1, "Barcode is required"),
    patronType: z.string().min(1, "Patron type is required"),
    homeLibrary: z.string().min(1, "Home library is required"),
    street1: z.string().optional(),
    street2: z.string().optional(),
    city: z.string().optional(),
    state: z.string().optional(),
    zip: z.string().optional(),
    dateOfBirth: z.string().optional(),
    expirationDate: z.string().optional(),
    notifyByEmail: z.boolean().default(true),
    notifyBySms: z.boolean().default(false),
  }),

  // Patron update
  patronUpdate: z.object({
    firstName: z.string().min(1, "First name is required"),
    lastName: z.string().min(1, "Last name is required"),
    email: z.string().email("Invalid email address").optional().or(z.literal("")),
    phone: z.string().optional(),
    street1: z.string().optional(),
    street2: z.string().optional(),
    city: z.string().optional(),
    state: z.string().optional(),
    zip: z.string().optional(),
    notifyByEmail: z.boolean(),
    notifyBySms: z.boolean(),
  }),

  // Hold placement
  holdPlacement: z.object({
    patronBarcode: z.string().min(1, "Patron barcode is required"),
    pickupLibrary: z.string().min(1, "Pickup library is required"),
    notifyByEmail: z.boolean().default(true),
    notifyBySms: z.boolean().default(false),
    expirationDate: z.string().optional(),
    suspendUntil: z.string().optional(),
    notes: z.string().optional(),
  }),

  // Bill payment
  billPayment: z.object({
    amount: z.number().positive("Amount must be positive"),
    paymentType: z.enum(["cash", "check", "card", "forgive"]),
    checkNumber: z.string().optional(),
    notes: z.string().optional(),
  }),

  // Item creation (cataloging)
  itemCreation: z.object({
    barcode: z.string().min(1, "Barcode is required"),
    callNumber: z.string().min(1, "Call number is required"),
    copyNumber: z.number().int().positive().default(1),
    circulationLibrary: z.string().min(1, "Circulation library is required"),
    owningLibrary: z.string().min(1, "Owning library is required"),
    location: z.string().optional(),
    circulationModifier: z.string().optional(),
    price: z.number().nonnegative().optional(),
    circulate: z.boolean().default(true),
    holdable: z.boolean().default(true),
    refItem: z.boolean().default(false),
    depositRequired: z.boolean().default(false),
    depositAmount: z.number().nonnegative().optional(),
  }),

  // Vendor creation (acquisitions)
  vendorCreation: z.object({
    name: z.string().min(1, "Vendor name is required"),
    code: z.string().min(1, "Vendor code is required"),
    email: z.string().email("Invalid email").optional().or(z.literal("")),
    phone: z.string().optional(),
    fax: z.string().optional(),
    url: z.string().url("Invalid URL").optional().or(z.literal("")),
    address1: z.string().optional(),
    address2: z.string().optional(),
    city: z.string().optional(),
    state: z.string().optional(),
    zip: z.string().optional(),
    country: z.string().optional(),
    sanCode: z.string().optional(),
    ediCode: z.string().optional(),
    active: z.boolean().default(true),
  }),

  // Search form
  search: z.object({
    query: z.string().min(1, "Search query is required"),
    searchType: z
      .enum(["keyword", "title", "author", "subject", "barcode", "isbn"])
      .default("keyword"),
    library: z.string().optional(),
    format: z.string().optional(),
    available: z.boolean().default(false),
  }),

  // Login form
  login: z.object({
    username: z.string().min(1, "Username is required"),
    password: z.string().min(1, "Password is required"),
    workstation: z.string().optional(),
  }),
};

// Export schema types
export type PatronRegistrationForm = z.infer<typeof formSchemas.patronRegistration>;
export type PatronUpdateForm = z.infer<typeof formSchemas.patronUpdate>;
export type HoldPlacementForm = z.infer<typeof formSchemas.holdPlacement>;
export type BillPaymentForm = z.infer<typeof formSchemas.billPayment>;
export type ItemCreationForm = z.infer<typeof formSchemas.itemCreation>;
export type VendorCreationForm = z.infer<typeof formSchemas.vendorCreation>;
export type SearchForm = z.infer<typeof formSchemas.search>;
export type LoginForm = z.infer<typeof formSchemas.login>;

// ============================================================================
// Specialized Form Components
// ============================================================================

/**
 * Inline search form
 */
export function SearchForm({
  onSubmit,
  isLoading = false,
  placeholder = "Search...",
  className,
}: {
  onSubmit: (query: string) => void;
  isLoading?: boolean;
  placeholder?: string;
  className?: string;
}) {
  const [query, setQuery] = React.useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim()) {
      onSubmit(query.trim());
    }
  };

  return (
    <form onSubmit={handleSubmit} className={cn("flex gap-2", className)}>
      <Input
        type="text"
        placeholder={placeholder}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        disabled={isLoading}
        className="flex-1"
      />
      <Button type="submit" disabled={isLoading || !query.trim()}>
        {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Search"}
      </Button>
    </form>
  );
}

/**
 * Form field with inline validation indicator
 */
export function ValidatedInput({
  label,
  error,
  success,
  description,
  required,
  className,
  ...inputProps
}: React.InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  error?: string;
  success?: boolean;
  description?: string;
  required?: boolean;
}) {
  // Generate unique IDs for ARIA relationships
  const generatedId = React.useId();
  const inputId = inputProps.id ?? `input-${generatedId}`;
  const errorId = `${inputId}-error`;
  const descriptionId = `${inputId}-description`;

  // Build aria-describedby value
  const describedBy =
    [description && descriptionId, error && errorId].filter(Boolean).join(" ") || undefined;

  return (
    <div className={cn("space-y-2", className)}>
      <Label>
        {label}
        {required && <span className="text-destructive ml-1">*</span>}
      </Label>
      <div className="relative">
        <Input
          {...inputProps}
          id={inputId}
          className={cn(
            error && "border-destructive focus-visible:ring-destructive",
            success && "border-green-500 focus-visible:ring-green-500"
          )}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
        />
        {(error || success) && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2">
            {error ? (
              <AlertCircle className="h-4 w-4 text-destructive" />
            ) : (
              <Check className="h-4 w-4 text-green-500" />
            )}
          </div>
        )}
      </div>
      {description && !error && (
        <p id={descriptionId} className="text-sm text-muted-foreground">
          {description}
        </p>
      )}
      {error && (
        <p id={errorId} role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

/**
 * Password input with visibility toggle
 */
export function PasswordInput({
  label,
  error,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  error?: string;
}) {
  const [show, setShow] = React.useState(false);

  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <div className="relative">
        <Input
          type={show ? "text" : "password"}
          className={cn(error && "border-destructive")}
          {...props}
        />
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="absolute right-1 top-1/2 -translate-y-1/2 h-7 px-2"
          onClick={() => setShow(!show)}
        >
          {show ? "Hide" : "Show"}
        </Button>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}

export default FormBuilder;
