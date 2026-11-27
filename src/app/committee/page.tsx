import { AlertTriangle, Clock, Database, Mail, ShieldCheck, ShieldX, UserCheck, Users } from "lucide-react";
import Link from "next/link";
import { ElectionsTable } from "@/components/elections/elections-table";
import { PageHeader } from "@/components/layout/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireRolePage } from "@/server/auth/guards";
import { listElections, syncIfDue } from "@/server/services/elections";
import { emailStatusCounts } from "@/server/services/email-queue";
import { memberStats } from "@/server/services/members";
import { databaseHardeningStatus } from "@/server/services/system-health";

export default async function CommitteeOverviewPage() {
  await requireRolePage("ELECTORAL_COMMITTEE");
  await syncIfDue();
  const [stats, emails, elections, hardening] = await Promise.all([
    memberStats(),
    emailStatusCounts(),
    listElections(),
    databaseHardeningStatus(),
  ]);
  const emailProblems = emails.FAILED + emails.BOUNCED + emails.COMPLAINED;
  return (
    <>
      <PageHeader
        title="Electoral Committee overview"
        description="Read-only visibility of the whole election process. Individual ballot choices are secret and are not available to anyone."
      />
      <div className="space-y-8">
        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Elections</h2>
          {elections.length ? (
            <ElectionsTable rows={elections} now={new Date()} basePath="/committee/elections" />
          ) : (
            <p className="rounded-xl border border-dashed bg-card p-6 text-sm text-muted-foreground">No elections yet.</p>
          )}
        </section>
        <section className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
          <StatCard label="Registered members" value={stats.total} icon={Users} href="/committee/members" />
          <StatCard label="Pending approval" value={stats.pending} icon={Clock} href="/committee/members?approval=PENDING" />
          <StatCard label="Eligible (approved & active)" value={stats.eligible} icon={UserCheck} tone="success" />
          <StatCard
            label="Email delivery problems"
            value={emailProblems}
            icon={emailProblems ? AlertTriangle : Mail}
            tone={emailProblems ? "danger" : "default"}
            href="/committee/emails"
          />
        </section>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Database className="size-5 text-brand" aria-hidden /> Safeguards you can check
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p className={`flex items-start gap-2 ${hardening.isHardened ? "text-success" : "text-destructive"}`}>
              {hardening.isHardened ? <ShieldCheck className="mt-0.5 size-4" aria-hidden /> : <ShieldX className="mt-0.5 size-4" aria-hidden />}
              {hardening.isHardened
                ? "Database protection active: the application cannot read individual ballots or edit the audit log."
                : "Database protection NOT active. Ask the System Administrator to harden the database before any live election."}
            </p>
            <p>
              <Link href="/committee/audit?verify=1" className="font-medium text-brand hover:underline">
                Verify the integrity of the audit log
              </Link>. This recomputes the hash chain over every recorded action.
            </p>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
