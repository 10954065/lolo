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
    <div className="mb-6 space-y-3 sm:mb-8">
      {backHref ? (
        <Link
          href={backHref}
          className="-ml-1 inline-flex min-h-9 items-center gap-1 rounded-full pl-1 pr-3 text-sm font-medium text-muted-foreground hover:bg-secondary hover:text-navy"
        >
          <ChevronLeft className="size-4" aria-hidden />
          {backLabel}
        </Link>
      ) : null}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0 space-y-1.5">
          <h1 className="text-[1.75rem] font-bold leading-tight text-navy sm:text-4xl">{title}</h1>
          {description ? <div className="max-w-3xl text-sm leading-relaxed text-muted-foreground sm:text-[0.95rem]">{description}</div> : null}
        </div>
        {actions ? (
          <div className="flex flex-wrap gap-2 *:flex-1 *:basis-[calc(50%-0.25rem)] sm:shrink-0 sm:justify-end sm:*:flex-none sm:*:basis-auto [&>*>button]:w-full [&>a]:justify-center">
            {actions}
          </div>
        ) : null}
      </div>
    </div>
  );
}
