import type { LucideIcon } from "lucide-react";
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

export function StatCard({ label, value, icon: Icon, hint, href, tone = "default" }: StatCardProps) {
  const body = (
    <div
      className={cn(
        "flex h-full items-start justify-between gap-4 rounded-xl border bg-card p-5 shadow-xs transition-shadow",
        href && "hover:border-brand/40 hover:shadow-sm",
      )}
    >
      <div className="min-w-0 space-y-1">
        <p className="text-sm font-medium text-muted-foreground">{label}</p>
        <p className="text-3xl font-semibold tabular-nums tracking-tight text-navy">{value}</p>
        {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
      </div>
      {Icon ? (
        <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-lg", ICON_TONE[tone])}>
          <Icon className="size-5" aria-hidden />
        </span>
      ) : null}
    </div>
  );
  return href ? (
    <Link href={href} className="block rounded-xl focus-visible:outline-2">
      {body}
    </Link>
  ) : (
    body
  );
}
