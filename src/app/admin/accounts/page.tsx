import { Ban, KeyRound, LogOut, RotateCcw, UserCog, UserPlus } from "lucide-react";
import type { Metadata } from "next";
import { ActionButton, ActionDialog } from "@/components/forms/action-dialog";
import { PageHeader } from "@/components/layout/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDateTime } from "@/lib/datetime";
import {
  changeStaffRoleAction,
  createStaffAccountAction,
  reactivateStaffAction,
  resetStaffCredentialsAction,
  revokeSessionsAction,
  suspendStaffAction,
} from "@/server/actions/accounts";
import { requirePermissionPage } from "@/server/auth/guards";
import { listStaffAccounts, ROLE_LABELS, type StaffRole } from "@/server/services/accounts";
import { RoleSelect, StaffAccountFields } from "./staff-account-form";

export const metadata: Metadata = { title: "Staff accounts" };

export default async function StaffAccountsPage() {
  const { session } = await requirePermissionPage("accounts.manage");
  const accounts = await listStaffAccounts();

  return (
    <>
      <PageHeader
        title="Staff accounts"
        description="System Administrators control the platform. Electoral Committee members observe in read-only mode. Sensitive changes require you to confirm your password."
        actions={
          <ActionDialog
            action={createStaffAccountAction}
            triggerVariant="default"
            triggerSize="default"
            triggerLabel={
              <>
                <UserPlus className="size-4" /> Add staff account
              </>
            }
            title="Add a staff account"
            description="A temporary password (valid for 48 hours) is emailed to the new account holder, who must change it at first sign-in."
            confirmLabel="Create account"
          >
            <StaffAccountFields />
          </ActionDialog>
        }
      />
      <div className="overflow-x-auto rounded-xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="hidden md:table-cell">Last sign-in</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {accounts.map((a) => {
              const isSelf = a.id === session.user.id;
              const role = a.role as StaffRole;
              return (
                <TableRow key={a.id}>
                  <TableCell className="align-top">
                    <p className="font-medium text-ink">
                      {a.fullName} {isSelf ? <Badge variant="outline">You</Badge> : null}
                    </p>
                    <p className="text-xs text-muted-foreground">{a.email}</p>
                    {a.mustChangePassword ? <p className="text-xs text-warning">Has not set a password yet</p> : null}
                  </TableCell>
                  <TableCell className="align-top">{ROLE_LABELS[role]}</TableCell>
                  <TableCell className="align-top">
                    <StatusBadge status={a.status} />
                  </TableCell>
                  <TableCell className="hidden align-top md:table-cell">
                    {formatDateTime(a.lastLoginAt, "Never")}
                    <p className="text-xs text-muted-foreground">{Number(a.activeSessions)} active session(s)</p>
                  </TableCell>
                  <TableCell className="align-top">
                    <div className="flex flex-wrap justify-end gap-2">
                      <ActionButton
                        action={revokeSessionsAction.bind(null, a.id)}
                        label={
                          <>
                            <LogOut className="size-3.5" /> {isSelf ? "Sign out other devices" : "Sign out everywhere"}
                          </>
                        }
                        pendingLabel="Signing out…"
                      />
                      {isSelf ? null : (
                        <>
                          <ActionDialog
                            action={changeStaffRoleAction.bind(null, a.id)}
                            triggerLabel={
                              <>
                                <UserCog className="size-3.5" /> Change role
                              </>
                            }
                            title={`Change the role of ${a.fullName}?`}
                            description="The account is signed out everywhere and gets the new permissions at next sign-in."
                            confirmLabel="Change role"
                            reasonLabel="Reason for the change"
                          >
                            <RoleSelect current={role} />
                          </ActionDialog>
                          {a.status === "ACTIVE" ? (
                            <>
                              <ActionDialog
                                action={resetStaffCredentialsAction.bind(null, a.id)}
                                triggerLabel={
                                  <>
                                    <KeyRound className="size-3.5" /> Reset login
                                  </>
                                }
                                title={`Send new login details to ${a.fullName}?`}
                                description="Their current password stops working immediately."
                                confirmLabel="Send new details"
                                reasonLabel="Reason"
                              />
                              <ActionDialog
                                action={suspendStaffAction.bind(null, a.id)}
                                triggerLabel={
                                  <>
                                    <Ban className="size-3.5" /> Suspend
                                  </>
                                }
                                title={`Suspend ${a.fullName}?`}
                                description="The account is signed out immediately and cannot sign in until reactivated."
                                confirmLabel="Suspend"
                                isDestructive
                                reasonLabel="Reason for suspension"
                              />
                            </>
                          ) : (
                            <ActionDialog
                              action={reactivateStaffAction.bind(null, a.id)}
                              triggerLabel={
                                <>
                                  <RotateCcw className="size-3.5" /> Reactivate
                                </>
                              }
                              title={`Reactivate ${a.fullName}?`}
                              confirmLabel="Reactivate"
                            />
                          )}
                        </>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </>
  );
}
