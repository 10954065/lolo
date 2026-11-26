import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

/** Styled native <select>: works in plain GET filter forms and on every mobile browser. */
export function NativeSelect({ className, children, ...props }: ComponentProps<"select">) {
  return (
    <select
      className={cn(
        "h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-xs outline-none transition-colors",
        "focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-50",
        className,
      )}
      {...props}
    >
      {children}
    </select>
  );
}
