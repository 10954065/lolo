import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

type PageHeaderProps = {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  backHref?: string;
  backLabel?: string;
};

export function PageHeader({ title, description, actions, backHref, backLabel = "Back" }: PageHeaderProps) {
  return (
    <div className="mb-6 space-y-3">
      {backHref ? (
        <Link href={backHref} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ChevronLeft className="size-4" aria-hidden />
          {backLabel}
        </Link>
      ) : null}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0 space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight text-navy sm:text-3xl">{title}</h1>
          {description ? <div className="max-w-3xl text-sm text-muted-foreground">{description}</div> : null}
        </div>
        {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
      </div>
    </div>
  );
}
