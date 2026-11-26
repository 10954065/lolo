import { Ban, CheckCircle2, KeyRound, RefreshCw, RotateCcw, Trash2, XCircle } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ActionButton, ActionDialog } from "@/components/forms/action-dialog";
import { PageHeader } from "@/components/layout/page-header";
import { MemberForm } from "@/components/members/member-form";
import { MemberActivity, MemberEmailHistory, MemberSummaryCard } from "@/components/members/member-overview";
import { StatusBadge } from "@/components/shared/status-badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { issueCredentialsAction, regenerateCredentialsAction, retryEmailAction } from "@/server/actions/credentials";
import {
  approveMembersAction,
  deactivateMemberAction,
  reactivateMemberAction,
  rejectMemberAction,
  suspendMemberAction,
  updateMemberAction,
} from "@/server/actions/members";
import { requirePermissionPage } from "@/server/auth/guards";
import { listEmailJobs } from "@/server/services/email-queue";
import { getMember, memberHistory } from "@/server/services/members";

export const metadata: Metadata = { title: "Member" };

export default async function AdminMemberPage({ params, searchParams }: PageProps<"/admin/members/[id]">) {
  await requirePermissionPage("members.write");
  const { id } = await params;
  const record = await getMember(id);
  if (!record) notFound();
  const { member } = record;
  const [emails, history, query] = await Promise.all([
    listEmailJobs({ memberId: member.id, pageSize: 50 }),
    memberHistory(member.id),
    searchParams,
  ]);

  const isDeactivated = member.accountStatus === "DEACTIVATED";
  const isEligible = member.approvalStatus === "APPROVED" && member.accountStatus === "ACTIVE";

  return (
    <>
      <PageHeader
        title={member.fullName}
        backHref="/admin/members"
        backLabel="All members"
        description={
          <span className="flex flex-wrap gap-2">
            <StatusBadge status={member.approvalStatus} />
            <StatusBadge status={member.accountStatus} />
            <StatusBadge status={member.credentialStatus} />
          </span>
        }
      />
      {query.created === "1" ? (
        <Alert className="mb-6 border-success/40 bg-success-soft" role="status">
          <CheckCircle2 className="size-4 text-success" />
          <AlertDescription className="text-success">Member registered.</AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="space-y-6">
          <MemberSummaryCard record={record} />
          {isDeactivated ? null : (
            <Card>
              <CardHeader>
                <CardTitle>Edit details</CardTitle>
                <CardDescription>
                  Changes are recorded in the audit log. Changing the email also changes the login email.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <MemberForm
                  action={updateMemberAction.bind(null, member.id)}
                  defaults={{
                    fullName: member.fullName,
                    email: member.email,
                    phone: member.phone ?? "",
                    membershipNumber: member.membershipNumber ?? "",
                    gender: member.gender ?? "",
                    notes: member.notes ?? "",
                  }}
                />
              </CardContent>
            </Card>
          )}
          <MemberEmailHistory
            rows={emails.rows}
            actions={(row) =>
              (row.status === "FAILED" || row.status === "BOUNCED") &&
              (row.template !== "credentials" || row.hasSecret) ? (
                <ActionButton
                  action={retryEmailAction.bind(null, row.id)}
                  label={
                    <>
                      <RefreshCw className="size-3.5" /> Retry
                    </>
                  }
                  pendingLabel="Queuing…"
                />
              ) : null
            }
          />
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Approval &amp; access</CardTitle>
              <CardDescription>Only approved, active members can sign in and vote.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              {member.approvalStatus !== "APPROVED" && !isDeactivated ? (
                <ActionDialog
                  action={approveMembersAction}
                  triggerVariant="default"
                  triggerLabel={
                    <>
                      <CheckCircle2 className="size-4" /> Approve
                    </>
                  }
                  title={`Approve ${member.fullName}?`}
                  description="The member will be notified by email and can then receive login credentials."
                  confirmLabel="Approve"
                  hiddenFields={{ memberId: member.id, notify: "on" }}
                />
              ) : null}
              {member.approvalStatus !== "REJECTED" && !isDeactivated ? (
                <ActionDialog
                  action={rejectMemberAction.bind(null, member.id)}
                  triggerLabel={
                    <>
                      <XCircle className="size-4" /> Reject
                    </>
                  }
                  title={`Reject ${member.fullName}?`}
                  description="A rejected member cannot sign in or vote. You can approve them again later."
                  confirmLabel="Reject registration"
                  isDestructive
                  reasonLabel="Reason for rejection"
                />
              ) : null}
              {member.accountStatus === "ACTIVE" ? (
                <ActionDialog
                  action={suspendMemberAction.bind(null, member.id)}
                  triggerLabel={
                    <>
                      <Ban className="size-4" /> Suspend
                    </>
                  }
                  title={`Suspend ${member.fullName}?`}
                  description="The member is signed out immediately and cannot sign in or vote until reactivated."
                  confirmLabel="Suspend account"
                  isDestructive
                  reasonLabel="Reason for suspension"
                />
              ) : (
                <ActionDialog
                  action={reactivateMemberAction.bind(null, member.id)}
                  triggerLabel={
                    <>
                      <RotateCcw className="size-4" /> Reactivate
                    </>
                  }
                  title={`Reactivate ${member.fullName}?`}
                  description="The member regains access according to their approval status."
                  confirmLabel="Reactivate"
                />
              )}
              {!isDeactivated ? (
                <ActionDialog
                  action={deactivateMemberAction.bind(null, member.id)}
                  triggerVariant="ghost"
                  triggerLabel={
                    <>
                      <Trash2 className="size-4" /> Deactivate
                    </>
                  }
                  title={`Deactivate ${member.fullName}?`}
                  description="Deactivation hides the member from normal lists and removes all access. The record is kept (not erased) for the audit trail, in line with the data-retention policy. It can be reversed."
                  confirmLabel="Deactivate member"
                  isDestructive
                  reasonLabel="Reason for deactivation"
                />
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Login credentials</CardTitle>
              <CardDescription>
                Passwords are never displayed. Credentials are emailed directly to the member and must be changed at
                first sign-in.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {!isEligible ? (
                <p className="text-sm text-muted-foreground">
                  Credentials can be issued once the member is approved and active.
                </p>
              ) : member.credentialStatus === "NOT_ISSUED" ? (
                <ActionDialog
                  action={issueCredentialsAction}
                  triggerVariant="default"
                  triggerLabel={
                    <>
                      <KeyRound className="size-4" /> Send login credentials
                    </>
                  }
                  title="Send login credentials?"
                  description={`A unique temporary password will be generated and emailed to ${member.email}.`}
                  confirmLabel="Send credentials"
                  hiddenFields={{ memberId: member.id }}
                />
              ) : (
                <ActionDialog
                  action={regenerateCredentialsAction.bind(null, member.id)}
                  triggerLabel={
                    <>
                      <RefreshCw className="size-4" /> Generate new credentials
                    </>
                  }
                  title="Generate new credentials?"
                  description={
                    <div className="space-y-2">
                      <p>
                        A NEW temporary password will be emailed to {member.email}. Any previous password stops working
                        and the member is signed out.
                      </p>
                      <p>
                        If an earlier credentials email merely failed to send, use “Retry” in the email history instead
                        — it re-sends the same credentials.
                      </p>
                    </div>
                  }
                  confirmLabel="Generate and send"
                  reasonLabel="Reason (e.g. member did not receive the email)"
                />
              )}
            </CardContent>
          </Card>

          <MemberActivity rows={history} />
        </div>
      </div>
    </>
  );
}
