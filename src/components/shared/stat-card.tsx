import { ChevronRight, type LucideIcon } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type StatCardProps = {
  label: string;
  value: ReactNode;
  icon?: LucideIcon;
  hint?: ReactNode;
  href?: string;
  tone?: "default" | "brand" | "success" | "warning" | "danger";
};

const ICON_TONE: Record<NonNullable<StatCardProps["tone"]>, string> = {
  default: "bg-secondary text-navy",
  brand: "bg-brand-soft text-brand",
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning",
  danger: "bg-destructive/10 text-destructive",
};

/** Accent line along the top edge, so a problem stands out even in a dense two-column grid. */
const EDGE_TONE: Record<NonNullable<StatCardProps["tone"]>, string> = {
  default: "before:bg-transparent",
  brand: "before:bg-brand",
  success: "before:bg-success/70",
  warning: "before:bg-gold",
  danger: "before:bg-destructive",
};

export function StatCard({ label, value, icon: Icon, hint, href, tone = "default" }: StatCardProps) {
  const body = (
    <div
      className={cn(
        "relative flex h-full flex-col gap-3 overflow-hidden rounded-xl border bg-card p-4 shadow-card transition-all sm:p-5",
        "before:absolute before:inset-x-0 before:top-0 before:h-0.5",
        EDGE_TONE[tone],
        href && "group-hover/stat:-translate-y-0.5 group-hover/stat:border-brand/30 group-hover/stat:shadow-lift",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-medium leading-snug text-muted-foreground sm:text-sm">{label}</p>
        {Icon ? (
          <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-lg sm:size-9", ICON_TONE[tone])}>
            <Icon className="size-4" aria-hidden />
          </span>
        ) : null}
      </div>
      <div className="mt-auto flex items-end justify-between gap-2">
        <p className="text-2xl font-semibold tabular-nums tracking-tight text-navy sm:text-3xl">{value}</p>
        {href ? (
          <ChevronRight className="mb-1 size-4 text-muted-foreground transition-transform group-hover/stat:translate-x-0.5" aria-hidden />
        ) : null}
      </div>
      {hint ? <p className="-mt-1 line-clamp-2 text-[11px] leading-snug text-muted-foreground sm:text-xs">{hint}</p> : null}
    </div>
  );
  return href ? (
    <Link href={href} className="group/stat block rounded-xl focus-visible:outline-2">
      {body}
    </Link>
  ) : (
    body
  );
}
