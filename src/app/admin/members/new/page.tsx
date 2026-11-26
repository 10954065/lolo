import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { MemberForm } from "@/components/members/member-form";
import { Card, CardContent } from "@/components/ui/card";
import { createMemberAction } from "@/server/actions/members";
import { requirePermissionPage } from "@/server/auth/guards";

export const metadata: Metadata = { title: "Add member" };

export default async function NewMemberPage() {
  await requirePermissionPage("members.write");
  return (
    <>
      <PageHeader
        title="Add member"
        description="Register a single MOBA 2017 member. To add many members at once, use bulk registration."
        backHref="/admin/members"
        backLabel="All members"
      />
      <Card className="max-w-3xl">
        <CardContent className="pt-6">
          <MemberForm action={createMemberAction} isCreate />
        </CardContent>
      </Card>
    </>
  );
}
