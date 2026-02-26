import * as React from "react";

import { cn } from "@/lib/utils";

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "file:text-foreground placeholder:text-muted-foreground/90 selection:bg-primary selection:text-primary-foreground border-border/80 h-10 w-full min-w-0 rounded-xl border bg-card/80 px-3.5 py-2 text-base shadow-[0_4px_12px_-10px_hsl(var(--shadow-tint)/0.5)] transition-[border-color,box-shadow,background-color] outline-none backdrop-blur-sm file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
        "focus-visible:border-[hsl(var(--brand-1))/0.5] focus-visible:ring-ring/25 focus-visible:ring-[4px] focus-visible:bg-card",
        "aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive",
        className
      )}
      {...props}
    />
  );
}

export { Input };
