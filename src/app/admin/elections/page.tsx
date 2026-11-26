import { CalendarPlus, Vote } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { ElectionsTable } from "@/components/elections/elections-table";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { requirePermissionPage } from "@/server/auth/guards";
import { listElections, syncIfDue } from "@/server/services/elections";

export const metadata: Metadata = { title: "Elections" };

export default async function AdminElectionsPage() {
  await requirePermissionPage("elections.write");
  await syncIfDue();
  const rows = await listElections();
  return (
    <>
      <PageHeader
        title="Elections"
        description="Create and run elections. The ballot locks automatically when voting opens."
        actions={
          <Button asChild>
            <Link href="/admin/elections/new">
              <CalendarPlus className="size-4" /> New election
            </Link>
          </Button>
        }
      />
      {rows.length === 0 ? (
        <EmptyState
          icon={Vote}
          title="No elections yet"
          description="Create the first MOBA 2017 election, then add positions, candidates and the voter roll."
          action={
            <Button asChild>
              <Link href="/admin/elections/new">Create election</Link>
            </Button>
          }
        />
      ) : (
        <ElectionsTable rows={rows} now={new Date()} basePath="/admin/elections" />
      )}
    </>
  );
}
