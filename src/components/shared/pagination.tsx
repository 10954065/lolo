import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

type PaginationProps = {
  page: number;
  pageSize: number;
  total: number;
  /** Current search params (without page) to preserve filters. */
  params: Record<string, string | undefined>;
  basePath: string;
};

function hrefFor(basePath: string, params: PaginationProps["params"], page: number): string {
  const query = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) query.set(k, v);
  if (page > 1) query.set("page", String(page));
  const qs = query.toString();
  return qs ? `${basePath}?${qs}` : basePath;
}

export function Pagination({ page, pageSize, total, params, basePath }: PaginationProps) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);
  return (
    <nav className="flex items-center justify-between gap-4 pt-4 text-sm" aria-label="Pagination">
      <p className="text-muted-foreground">
        Showing <span className="font-medium text-foreground">{from}</span>–
        <span className="font-medium text-foreground">{to}</span> of{" "}
        <span className="font-medium text-foreground">{total}</span>
      </p>
      <div className="flex gap-2">
        {page > 1 ? (
          <Button variant="outline" size="sm" asChild>
            <Link href={hrefFor(basePath, params, page - 1)} aria-label="Previous page">
              <ChevronLeft className="size-4" /> Previous
            </Link>
          </Button>
        ) : (
          <Button variant="outline" size="sm" disabled>
            <ChevronLeft className="size-4" /> Previous
          </Button>
        )}
        {page < pages ? (
          <Button variant="outline" size="sm" asChild>
            <Link href={hrefFor(basePath, params, page + 1)} aria-label="Next page">
              Next <ChevronRight className="size-4" />
            </Link>
          </Button>
        ) : (
          <Button variant="outline" size="sm" disabled>
            Next <ChevronRight className="size-4" />
          </Button>
        )}
      </div>
    </nav>
  );
}
