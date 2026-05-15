import { Slot } from "@radix-ui/react-slot";
import { cva } from "class-variance-authority";
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs) {
  return twMerge(clsx(inputs));
}

const buttonVariants = cva("rw-button", {
  variants: {
    variant: {
      primary: "rw-button-primary",
      secondary: "rw-button-secondary",
      ghost: "rw-button-ghost"
    }
  },
  defaultVariants: {
    variant: "primary"
  }
});

export function Button({ asChild = false, className, variant, ...props }) {
  const Comp = asChild ? Slot : "button";
  return <Comp className={cn(buttonVariants({ variant }), className)} {...props} />;
}

export function Panel({ className, children }) {
  return <div className={cn("rw-panel", className)}>{children}</div>;
}

export function Badge({ className, tone = "neutral", children }) {
  return <span className={cn("rw-badge", `rw-badge-${tone}`, className)}>{children}</span>;
}
