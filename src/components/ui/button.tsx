import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-medium tracking-[-0.01em] transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70 focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 disabled:saturate-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "border border-[hsl(var(--brand-1))/0.25] bg-[linear-gradient(135deg,hsl(var(--brand-1))_0%,hsl(var(--brand-3))_88%)] text-primary-foreground shadow-[0_16px_28px_-16px_hsl(var(--brand-3)/0.85)] hover:translate-y-[-1px] hover:brightness-110 hover:shadow-[0_22px_30px_-16px_hsl(var(--brand-3)/0.82)] active:translate-y-0 active:brightness-95",
        destructive: "bg-destructive text-destructive-foreground shadow-sm hover:brightness-95",
        outline:
          "border border-border/80 bg-card/76 backdrop-blur-sm shadow-sm hover:bg-card hover:border-[hsl(var(--brand-1))/0.28] hover:text-foreground",
        secondary:
          "border border-transparent bg-secondary/92 text-secondary-foreground shadow-sm hover:bg-secondary",
        ghost: "hover:bg-accent/85 hover:text-accent-foreground",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-10 px-4 py-2.5",
        sm: "h-8 rounded-lg px-3 text-xs",
        lg: "h-11 rounded-xl px-8 text-sm",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />
    );
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
