import { StatusBadge } from "@/components/shared/status-badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDateTime } from "@/lib/datetime";
import type { getMember, memberHistory } from "@/server/services/members";
import type { listEmailJobs } from "@/server/services/email-queue";
import { TEMPLATE_LABELS, type EmailTemplate } from "@/server/email/templates";

type MemberRecord = NonNullable<Awaited<ReturnType<typeof getMember>>>;
type HistoryRows = Awaited<ReturnType<typeof memberHistory>>;
type EmailRows = Awaited<ReturnType<typeof listEmailJobs>>["rows"];

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-0.5">
      <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="text-sm text-foreground">{children}</dd>
    </div>
  );
}

export function MemberSummaryCard({ record }: { record: MemberRecord }) {
  const { member, user } = record;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Registration</CardTitle>
      </CardHeader>
      <CardContent>
        <dl className="grid gap-4 sm:grid-cols-2">
          <Field label="Email">{member.email}</Field>
          <Field label="Phone">{member.phone ?? "—"}</Field>
          <Field label="Membership no.">{member.membershipNumber ?? "—"}</Field>
          <Field label="Gender">{member.gender ?? "—"}</Field>
          <Field label="Registered">{formatDateTime(member.registeredAt)}</Field>
          <Field label="Approval">
            <StatusBadge status={member.approvalStatus} />
            {member.approvedAt ? <span className="ml-2 text-xs text-muted-foreground">{formatDateTime(member.approvedAt)}</span> : null}
          </Field>
          <Field label="Account">
            <StatusBadge status={member.accountStatus} />
          </Field>
          <Field label="Credentials">
            <StatusBadge status={member.credentialStatus} />
            {member.credentialIssuedAt ? (
              <span className="ml-2 text-xs text-muted-foreground">issued {formatDateTime(member.credentialIssuedAt)}</span>
            ) : null}
          </Field>
          <Field label="Last sign-in">{formatDateTime(user?.lastLoginAt, "Never")}</Field>
          <Field label="Temporary password expires">
            {user?.mustChangePassword ? formatDateTime(user.tempPasswordExpiresAt) : "—"}
          </Field>
          {member.rejectionReason ? <Field label="Rejection reason">{member.rejectionReason}</Field> : null}
          {user?.lockedUntil && user.lockedUntil > new Date() ? (
            <Field label="Locked until">{formatDateTime(user.lockedUntil)}</Field>
          ) : null}
        </dl>
      </CardContent>
    </Card>
  );
}

export function MemberEmailHistory({ rows, actions }: { rows: EmailRows; actions?: (row: EmailRows[number]) => React.ReactNode }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Email history</CardTitle>
        <CardDescription>Delivery status of every email sent to this member. Message contents are never shown.</CardDescription>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No emails have been sent to this member.</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="hidden sm:table-cell">Queued</TableHead>
                  {actions ? <TableHead className="text-right">Action</TableHead> : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>
                      {TEMPLATE_LABELS[r.template as EmailTemplate] ?? r.template}
                      {r.lastError ? <p className="max-w-xs truncate text-xs text-destructive" title={r.lastError}>{r.lastError}</p> : null}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={r.status} />
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">{formatDateTime(r.createdAt)}</TableCell>
                    {actions ? <TableCell className="text-right">{actions(r)}</TableCell> : null}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function MemberActivity({ rows }: { rows: HistoryRows }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Activity history</CardTitle>
        <CardDescription>From the tamper-evident audit log.</CardDescription>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No recorded activity.</p>
        ) : (
          <ol className="space-y-3">
            {rows.map((r) => (
              <li key={r.id} className="border-l-2 border-brand/30 pl-3">
                <p className="text-sm font-medium">{r.summary}</p>
                {r.reason ? <p className="text-sm text-muted-foreground">Reason: {r.reason}</p> : null}
                <p className="text-xs text-muted-foreground">
                  {formatDateTime(r.occurredAt)} · {r.actorLabel}
                </p>
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}
