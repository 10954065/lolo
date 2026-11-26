import { Download, Users } from "lucide-react";
import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { MemberFilters, filtersToParams } from "@/components/members/member-filters";
import { MembersTable } from "@/components/members/members-table";
import { EmptyState } from "@/components/shared/empty-state";
import { Pagination } from "@/components/shared/pagination";
import { Button } from "@/components/ui/button";
import { requirePermissionPage } from "@/server/auth/guards";
import { listMembers } from "@/server/services/members";
import { memberListFiltersSchema } from "@/server/validation/members";

export const metadata: Metadata = { title: "Member records" };

export default async function CommitteeMembersPage({ searchParams }: PageProps<"/committee/members">) {
  await requirePermissionPage("members.read");
  const filters = memberListFiltersSchema.parse(await searchParams);
  const result = await listMembers(filters);
  const params = filtersToParams(filters);

  return (
    <>
      <PageHeader
        title="Member records"
        description="Registered members, their approval status and credential delivery. View only."
        actions={
          <Button variant="outline" asChild>
            <a href={`/api/exports/members?includeDeactivated=${filters.account === "DEACTIVATED" ? "1" : "0"}`}>
              <Download className="size-4" /> Export CSV
            </a>
          </Button>
        }
      />
      <div className="space-y-4">
        <MemberFilters filters={filters} basePath="/committee/members" />
        {result.rows.length === 0 ? (
          <EmptyState icon={Users} title="No members match these filters" />
        ) : (
          <>
            <MembersTable
              basePath="/committee/members"
              canManage={false}
              rows={result.rows.map((m) => ({
                id: m.id,
                fullName: m.fullName,
                email: m.email,
                phone: m.phone,
                membershipNumber: m.membershipNumber,
                approvalStatus: m.approvalStatus,
                accountStatus: m.accountStatus,
                credentialStatus: m.credentialStatus,
                registeredAt: m.registeredAt.toISOString(),
              }))}
            />
            <Pagination
              page={result.page}
              pageSize={result.pageSize}
              total={result.total}
              params={params}
              basePath="/committee/members"
            />
          </>
        )}
      </div>
    </>
  );
}
