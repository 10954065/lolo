import { AlertTriangle, CheckCircle2, Clock, KeyRound, Mail, UserCheck, Users } from "lucide-react";
import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { Button } from "@/components/ui/button";
import { requireRolePage } from "@/server/auth/guards";
import { emailStatusCounts } from "@/server/services/email-queue";
import { memberStats } from "@/server/services/members";

export default async function AdminOverviewPage() {
  const { session } = await requireRolePage("SYSTEM_ADMIN");
  const [stats, emails] = await Promise.all([memberStats(), emailStatusCounts()]);
  const awaitingCredentials = stats.credentials.NOT_ISSUED ?? 0;
  const failedEmails = emails.FAILED + emails.BOUNCED + emails.COMPLAINED;

  return (
    <>
      <PageHeader
        title={`Welcome, ${session.user.fullName.split(" ")[0]}`}
        description="System overview for the MOBA 2017 Digital Election Management System."
        actions={
          <>
            <Button asChild variant="outline">
              <Link href="/admin/members/import">Bulk registration</Link>
            </Button>
            <Button asChild>
              <Link href="/admin/members/new">Add member</Link>
            </Button>
          </>
        }
      />
      <section aria-labelledby="members-heading" className="space-y-3">
        <h2 id="members-heading" className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Members
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Registered members" value={stats.total} icon={Users} href="/admin/members" />
          <StatCard label="Pending approval" value={stats.pending} icon={Clock} tone={stats.pending ? "warning" : "default"} href="/admin/members?approval=PENDING" />
          <StatCard label="Approved" value={stats.approved} icon={UserCheck} tone="success" href="/admin/members?approval=APPROVED" />
          <StatCard label="Eligible (approved & active)" value={stats.eligible} icon={CheckCircle2} hint={`${stats.suspended} suspended · ${stats.deactivated} deactivated`} />
        </div>
      </section>
      <section aria-labelledby="credentials-heading" className="mt-8 space-y-3">
        <h2 id="credentials-heading" className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Credentials &amp; email
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Awaiting credentials" value={awaitingCredentials} icon={KeyRound} tone={awaitingCredentials ? "warning" : "default"} href="/admin/credentials" />
          <StatCard label="Accounts activated" value={stats.credentials.ACTIVATED ?? 0} icon={UserCheck} tone="success" hint="Members who set their own password" />
          <StatCard label="Emails sent / delivered" value={emails.SENT + emails.DELIVERED} icon={Mail} hint={`${emails.QUEUED + emails.SENDING} waiting to send`} href="/admin/emails" />
          <StatCard label="Delivery problems" value={failedEmails} icon={AlertTriangle} tone={failedEmails ? "danger" : "default"} href="/admin/emails?status=FAILED" />
        </div>
      </section>
    </>
  );
}
