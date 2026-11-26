import type { Metadata } from "next";
import { AuditLogView } from "@/components/audit/audit-log-view";
import { PageHeader } from "@/components/layout/page-header";
import { requirePermissionPage } from "@/server/auth/guards";

export const metadata: Metadata = { title: "Audit log" };

export default async function AdminAuditPage({ searchParams }: PageProps<"/admin/audit">) {
  await requirePermissionPage("audit.read");
  return (
    <>
      <PageHeader
        title="Audit log"
        description="Every administrative action is recorded in an append-only, hash-chained log that nobody — including administrators — can edit or delete. Ballot choices are never recorded."
      />
      <AuditLogView searchParams={await searchParams} basePath="/admin/audit" />
    </>
  );
}
