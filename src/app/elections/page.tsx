import type { Metadata } from "next";
import Link from "next/link";
import { PlainText } from "@/components/elections/election-summary";
import { PublicShell } from "@/components/layout/public-shell";
import { StatusBadge } from "@/components/shared/status-badge";
import { formatDateTime } from "@/lib/datetime";
import { effectiveStatus, STATUS_DESCRIPTIONS } from "@/lib/election-rules";
import { publicElections } from "@/server/services/public";

export const metadata: Metadata = { title: "Election information" };

export default async function PublicElectionsPage() {
  const rows = await publicElections();
  const now = new Date();
  return (
    <PublicShell>
      <h1 className="text-3xl font-bold text-ink">Election information</h1>
      <p className="mt-2 text-muted-foreground">Official schedules (Ghana time, GMT). Members sign in to vote.</p>
      {rows.length === 0 ? (
        <p className="mt-8 rounded-xl border border-dashed p-8 text-center text-muted-foreground">No elections have been announced yet.</p>
      ) : (
        <ul className="mt-8 space-y-4">
          {rows.map((e) => {
            const status = effectiveStatus(e, now);
            return (
              <li key={e.id} className="space-y-2 rounded-xl border bg-card p-5">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-lg font-semibold text-ink">{e.title}</h2>
                  <StatusBadge status={status} />
                </div>
                <p className="text-sm text-muted-foreground">{STATUS_DESCRIPTIONS[status]}</p>
                <p className="text-sm">
                  Voting: <strong>{formatDateTime(e.opensAt)}</strong> to <strong>{formatDateTime(e.closesAt)}</strong>
                </p>
                <PlainText text={e.description} className="text-sm" />
                {status === "RESULTS_PUBLISHED" && e.resultsVisibility === "PUBLIC" ? (
                  <Link href={`/results/${e.id}`} className="text-sm font-medium text-brand hover:underline">
                    View the official results
                  </Link>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </PublicShell>
  );
}
