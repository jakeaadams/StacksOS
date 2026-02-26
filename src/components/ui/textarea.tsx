import * as React from "react";
import { cn } from "@/lib/utils";

const Textarea = React.forwardRef<HTMLTextAreaElement, React.ComponentProps<"textarea">>(
  ({ className, ...props }, ref) => {
    return (
      <textarea
        className={cn(
          "placeholder:text-muted-foreground/90 selection:bg-primary selection:text-primary-foreground border-border/80 flex min-h-[96px] w-full rounded-xl border bg-card/80 px-3.5 py-2.5 text-base shadow-[0_4px_12px_-10px_hsl(var(--shadow-tint)/0.5)] transition-[border-color,box-shadow,background-color] outline-none backdrop-blur-sm disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
          "focus-visible:border-[hsl(var(--brand-1))/0.5] focus-visible:ring-ring/25 focus-visible:ring-[4px] focus-visible:bg-card",
          "aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive",
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);
Textarea.displayName = "Textarea";

export { Textarea };
