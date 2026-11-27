import { FileDown } from "lucide-react";
import { StatusBadge } from "@/components/shared/status-badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { listElections } from "@/server/services/elections";

type Elections = Awaited<ReturnType<typeof listElections>>;

function ReportLink({ href, label }: { href: string; label: string }) {
  return (
    <a href={href} className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm hover:border-brand hover:text-brand">
      <FileDown className="size-4" aria-hidden /> {label}
    </a>
  );
}

/** Shared by admin and committee. No report ever links a voter to ballot choices. */
export function ReportsHub({ elections, canSeeUnpublished }: { elections: Elections; canSeeUnpublished: boolean }) {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Organisation reports</CardTitle>
          <CardDescription>Member register (approval, account and credential delivery status) and administrative activity.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <ReportLink href="/api/exports/members?includeDeactivated=0" label="Registered members (CSV)" />
          <ReportLink href="/api/exports/members?includeDeactivated=1" label="All members incl. deactivated (CSV)" />
          <ReportLink href="/api/exports/audit" label="Administrative activity (CSV)" />
        </CardContent>
      </Card>
      {elections.map((e) => {
        const base = `/api/exports/elections/${e.id}`;
        const hasResults = e.status === "RESULTS_PUBLISHED" || e.status === "ARCHIVED" || (canSeeUnpublished && e.status === "CLOSED");
        return (
          <Card key={e.id}>
            <CardHeader>
              <CardTitle className="flex flex-wrap items-center gap-2 text-base">
                {e.title} <StatusBadge status={e.status} />
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              <ReportLink href={`${base}/candidates.csv`} label="Candidates (CSV)" />
              <ReportLink href={`${base}/participation.csv`} label="Participation (CSV)" />
              <ReportLink href={`${base}/participation.pdf`} label="Participation (PDF)" />
              {hasResults ? (
                <>
                  <ReportLink href={`${base}/results.csv`} label="Results (CSV)" />
                  <ReportLink href={`${base}/results.pdf`} label="Results (PDF)" />
                </>
              ) : null}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
