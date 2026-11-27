import { eq } from "drizzle-orm";
import { KeyRound, LogOut } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { ActionButton } from "@/components/forms/action-dialog";
import { PageHeader } from "@/components/layout/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDateTime } from "@/lib/datetime";
import { revokeSessionsAction } from "@/server/actions/accounts";
import { requireRolePage } from "@/server/auth/guards";
import { getDb } from "@/server/db/client";
import { members, users } from "@/server/db/schema";

export const metadata: Metadata = { title: "My profile" };

export default async function ProfilePage() {
  const { session } = await requireRolePage("VOTER");
  const [row] = await getDb()
    .select({ member: members, lastLoginAt: users.lastLoginAt, passwordChangedAt: users.passwordChangedAt })
    .from(members)
    .innerJoin(users, eq(users.id, members.userId))
    .where(eq(members.userId, session.user.id))
    .limit(1);
  const m = row?.member;

  return (
    <>
      <PageHeader title="My profile" description="To correct your details, contact the election administrator." />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Membership details</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-4 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-muted-foreground">Full name</dt>
                <dd className="font-medium">{m?.fullName}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Email</dt>
                <dd className="font-medium break-all">{m?.email}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Phone</dt>
                <dd className="font-medium">{m?.phone ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Membership number</dt>
                <dd className="font-medium">{m?.membershipNumber ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Status</dt>
                <dd className="mt-1 flex gap-2">
                  {m ? <StatusBadge status={m.approvalStatus} /> : null}
                  {m ? <StatusBadge status={m.accountStatus} /> : null}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Last sign-in</dt>
                <dd className="font-medium">{formatDateTime(row?.lastLoginAt)}</dd>
              </div>
            </dl>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Security</CardTitle>
            <CardDescription>Password last changed {formatDateTime(row?.passwordChangedAt, "—")}.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Button variant="outline" asChild>
              <Link href="/change-password">
                <KeyRound className="size-4" /> Change password
              </Link>
            </Button>
            <ActionButton
              action={revokeSessionsAction.bind(null, session.user.id)}
              size="default"
              label={<><LogOut className="size-4" /> Sign out other devices</>}
              pendingLabel="Signing out…"
            />
          </CardContent>
        </Card>
      </div>
    </>
  );
}
