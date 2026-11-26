import { Download, FileSpreadsheet, UserPlus, Users } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { MemberFilters, filtersToParams } from "@/components/members/member-filters";
import { MembersTable } from "@/components/members/members-table";
import { EmptyState } from "@/components/shared/empty-state";
import { Pagination } from "@/components/shared/pagination";
import { Button } from "@/components/ui/button";
import { requirePermissionPage } from "@/server/auth/guards";
import { listMembers } from "@/server/services/members";
import { memberListFiltersSchema } from "@/server/validation/members";

export const metadata: Metadata = { title: "Members" };

export default async function AdminMembersPage({ searchParams }: PageProps<"/admin/members">) {
  await requirePermissionPage("members.write");
  const filters = memberListFiltersSchema.parse(await searchParams);
  const result = await listMembers(filters);
  const params = filtersToParams(filters);
  const exportQuery = new URLSearchParams({ includeDeactivated: filters.account === "DEACTIVATED" ? "1" : "0" });

  return (
    <>
      <PageHeader
        title="Members"
        description="Register, verify and manage MOBA 2017 members. Only approved, active members can receive credentials and vote."
        actions={
          <>
            <Button variant="outline" asChild>
              <a href={`/api/exports/members?${exportQuery}`}>
                <Download className="size-4" /> Export CSV
              </a>
            </Button>
            <Button variant="outline" asChild>
              <Link href="/admin/members/import">
                <FileSpreadsheet className="size-4" /> Bulk registration
              </Link>
            </Button>
            <Button asChild>
              <Link href="/admin/members/new">
                <UserPlus className="size-4" /> Add member
              </Link>
            </Button>
          </>
        }
      />
      <div className="space-y-4">
        <MemberFilters filters={filters} basePath="/admin/members" />
        {result.rows.length === 0 ? (
          <EmptyState
            icon={Users}
            title={Object.values(params).some(Boolean) ? "No members match these filters" : "No members registered yet"}
            description="Add members one at a time or upload the MOBA 2017 member list as a CSV file."
            action={
              <Button asChild>
                <Link href="/admin/members/import">Upload member list</Link>
              </Button>
            }
          />
        ) : (
          <>
            <MembersTable
              basePath="/admin/members"
              canManage
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
              basePath="/admin/members"
            />
          </>
        )}
      </div>
    </>
  );
}
