import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import { z } from "zod";
import { NativeSelect } from "@/components/forms/native-select";
import { EmptyState } from "@/components/shared/empty-state";
import { Pagination } from "@/components/shared/pagination";
import { StatCard } from "@/components/shared/stat-card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { EMAIL_STATUSES } from "@/server/db/schema/enums";
import { EMAIL_TEMPLATES, TEMPLATE_LABELS } from "@/server/email/templates";
import { emailStatusCounts, listEmailJobs } from "@/server/services/email-queue";
import { EmailJobsTable } from "./email-jobs-table";

const filtersSchema = z.object({
  status: z.enum(EMAIL_STATUSES).optional().catch(undefined),
  template: z.enum(EMAIL_TEMPLATES).optional().catch(undefined),
  page: z.coerce.number().int().min(1).catch(1),
});

/** Shared by the admin (with retry) and the read-only committee view. */
export async function EmailDeliveryView({
  searchParams,
  basePath,
  canRetry,
  icon,
}: {
  searchParams: Record<string, string | string[] | undefined>;
  basePath: string;
  canRetry: boolean;
  icon: LucideIcon;
}) {
  const filters = filtersSchema.parse(searchParams);
  const [counts, result] = await Promise.all([emailStatusCounts(), listEmailJobs({ ...filters, pageSize: 25 })]);
  const problems = counts.FAILED + counts.BOUNCED + counts.COMPLAINED;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <StatCard label="Waiting to send" value={counts.QUEUED + counts.SENDING} href={`${basePath}?status=QUEUED`} />
        <StatCard label="Sent" value={counts.SENT} href={`${basePath}?status=SENT`} />
        <StatCard label="Delivered" value={counts.DELIVERED} tone="success" href={`${basePath}?status=DELIVERED`} />
        <StatCard label="Failed / bounced" value={problems} tone={problems ? "danger" : "default"} href={`${basePath}?status=FAILED`} />
      </div>
      <form method="get" action={basePath} className="flex flex-wrap items-end gap-3 rounded-xl border bg-card p-4">
        <div className="min-w-40 space-y-1.5">
          <Label htmlFor="status">Status</Label>
          <NativeSelect id="status" name="status" defaultValue={filters.status ?? ""}>
            <option value="">All</option>
            {EMAIL_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s.charAt(0) + s.slice(1).toLowerCase()}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="min-w-48 space-y-1.5">
          <Label htmlFor="template">Type</Label>
          <NativeSelect id="template" name="template" defaultValue={filters.template ?? ""}>
            <option value="">All</option>
            {EMAIL_TEMPLATES.map((t) => (
              <option key={t} value={t}>
                {TEMPLATE_LABELS[t]}
              </option>
            ))}
          </NativeSelect>
        </div>
        <Button type="submit">Apply</Button>
        <Button variant="ghost" asChild>
          <Link href={basePath}>Reset</Link>
        </Button>
      </form>
      {result.rows.length === 0 ? (
        <EmptyState icon={icon} title="No emails found" description="Emails appear here as soon as they are queued." />
      ) : (
        <>
          <EmailJobsTable rows={result.rows} canRetry={canRetry} />
          <Pagination
            page={result.page}
            pageSize={result.pageSize}
            total={result.total}
            params={{ status: filters.status, template: filters.template }}
            basePath={basePath}
          />
        </>
      )}
    </div>
  );
}
