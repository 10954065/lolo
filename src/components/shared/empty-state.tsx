import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: LucideIcon;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed bg-card px-6 py-12 text-center">
      <span className="flex size-12 items-center justify-center rounded-full bg-secondary text-navy">
        <Icon className="size-6" aria-hidden />
      </span>
      <div className="space-y-1">
        <p className="font-medium text-navy">{title}</p>
        {description ? <p className="max-w-md text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}
