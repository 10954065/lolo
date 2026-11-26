import type { Metadata } from "next";
import { ElectionForm } from "@/components/elections/election-form";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { createElectionAction } from "@/server/actions/elections";
import { requirePermissionPage } from "@/server/auth/guards";

export const metadata: Metadata = { title: "New election" };

export default async function NewElectionPage() {
  await requirePermissionPage("elections.write");
  return (
    <>
      <PageHeader
        title="New election"
        description="The election starts as a draft that only administrators and the committee can see."
        backHref="/admin/elections"
        backLabel="All elections"
      />
      <Card className="max-w-4xl">
        <CardContent className="pt-6">
          <ElectionForm action={createElectionAction} isCreate />
        </CardContent>
      </Card>
    </>
  );
}
