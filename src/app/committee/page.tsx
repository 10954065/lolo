import { Clock, UserCheck, Users } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { requireRolePage } from "@/server/auth/guards";
import { memberStats } from "@/server/services/members";

export default async function CommitteeOverviewPage() {
  await requireRolePage("ELECTORAL_COMMITTEE");
  const stats = await memberStats();
  return (
    <>
      <PageHeader
        title="Electoral Committee overview"
        description="You have read-only visibility of the election process. Individual ballot choices are secret and are not available to anyone."
      />
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Registered members" value={stats.total} icon={Users} href="/committee/members" />
        <StatCard label="Pending approval" value={stats.pending} icon={Clock} />
        <StatCard label="Eligible (approved & active)" value={stats.eligible} icon={UserCheck} tone="success" />
      </div>
    </>
  );
}
