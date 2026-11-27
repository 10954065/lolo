import { CheckCircle2, KeyRound, Mail, Send, ShieldCheck, XCircle } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { EmailJobsTable } from "@/components/emails/email-jobs-table";
import { ActionButton, ActionDialog } from "@/components/forms/action-dialog";
import { PageHeader } from "@/components/layout/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { dispatchNowAction, issueCredentialsAction } from "@/server/actions/credentials";
import { requirePermissionPage } from "@/server/auth/guards";
import { listEmailJobs } from "@/server/services/email-queue";
import { memberStats } from "@/server/services/members";
import { getSettings } from "@/server/services/settings";

export const metadata: Metadata = { title: "Credentials" };

export default async function CredentialsPage() {
  await requirePermissionPage("credentials.send");
  const [stats, failed, settings] = await Promise.all([
    memberStats(),
    listEmailJobs({ template: "credentials", status: "FAILED", pageSize: 100 }),
    getSettings(),
  ]);
  const c = stats.credentials;
  const awaiting = c.NOT_ISSUED ?? 0;

  return (
    <>
      <PageHeader
        title="Login credentials"
        description="Each approved member receives a unique temporary password by email and must choose their own password at first sign-in."
        actions={
          <ActionButton
            action={dispatchNowAction}
            label={
              <>
                <Send className="size-4" /> Send queued emails now
              </>
            }
            pendingLabel="Sending…"
          />
        }
      />
      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-5">
        <StatCard
          label="Awaiting credentials"
          value={awaiting}
          icon={KeyRound}
          tone={awaiting ? "warning" : "default"}
          href="/admin/members?approval=APPROVED&credential=NOT_ISSUED"
        />
        <StatCard label="Queued / sent" value={(c.QUEUED ?? 0) + (c.SENT ?? 0)} icon={Mail} href="/admin/members?credential=SENT" />
        <StatCard label="Delivered" value={c.DELIVERED ?? 0} icon={CheckCircle2} tone="success" href="/admin/members?credential=DELIVERED" />
        <StatCard
          label="Activated"
          value={c.ACTIVATED ?? 0}
          icon={ShieldCheck}
          tone="success"
          hint="Own password set"
          href="/admin/members?credential=ACTIVATED"
        />
        <StatCard
          label="Delivery failed"
          value={c.FAILED ?? 0}
          icon={XCircle}
          tone={c.FAILED ? "danger" : "default"}
          href="/admin/members?credential=FAILED"
        />
      </div>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Send credentials to approved members</CardTitle>
          <CardDescription>
            Sends login details to every approved, active member who has not yet received them ({awaiting}). Members who
            already received credentials are never sent a new password automatically. Temporary passwords are valid for{" "}
            {settings.tempPasswordValidityDays} days.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ActionDialog
            action={issueCredentialsAction}
            triggerVariant="default"
            triggerSize="default"
            isDisabled={awaiting === 0}
            triggerLabel={
              <>
                <KeyRound className="size-4" /> Send credentials to {awaiting} member{awaiting === 1 ? "" : "s"}
              </>
            }
            title={`Send credentials to ${awaiting} members?`}
            description="A unique temporary password is generated for each member and emailed directly to them. Passwords are never shown to administrators."
            confirmLabel="Send credentials"
            hiddenFields={{ scope: "all" }}
          />
        </CardContent>
      </Card>

      <section className="mt-6 space-y-3">
        <h2 className="text-lg font-semibold text-ink">Failed credential emails</h2>
        <p className="text-sm text-muted-foreground">
          “Retry” re-sends the same credentials once the problem is fixed (for example a corrected email address). To issue
          a new password, open the member and choose “Generate new credentials”.
        </p>
        {failed.rows.length === 0 ? (
          <p className="rounded-xl border border-dashed bg-card p-6 text-center text-sm text-muted-foreground">
            No failed credential emails.
          </p>
        ) : (
          <EmailJobsTable rows={failed.rows} canRetry />
        )}
        <p className="text-sm">
          <Link href="/admin/emails" className="font-medium text-brand hover:underline">
            View the full email delivery log
          </Link>
        </p>
      </section>
    </>
  );
}
