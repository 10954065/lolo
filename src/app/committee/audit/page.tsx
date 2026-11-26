import type { Metadata } from "next";
import { AuditLogView } from "@/components/audit/audit-log-view";
import { PageHeader } from "@/components/layout/page-header";
import { requirePermissionPage } from "@/server/auth/guards";

export const metadata: Metadata = { title: "Audit log" };

export default async function CommitteeAuditPage({ searchParams }: PageProps<"/committee/audit">) {
  await requirePermissionPage("audit.read");
  return (
    <>
      <PageHeader
        title="Audit log"
        description="Review every administrative and system action. Use “Verify integrity” to confirm no entry has been altered, removed or inserted."
      />
      <AuditLogView searchParams={await searchParams} basePath="/committee/audit" />
    </>
  );
}
