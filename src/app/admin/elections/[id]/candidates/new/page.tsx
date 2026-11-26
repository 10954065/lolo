import { notFound } from "next/navigation";
import { CandidateForm } from "@/components/elections/candidate-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { createCandidateAction } from "@/server/actions/elections";
import { requirePermissionPage } from "@/server/auth/guards";
import { getElection } from "@/server/services/elections";
import { listPositions } from "@/server/services/positions";

export default async function NewCandidatePage({ params }: PageProps<"/admin/elections/[id]/candidates/new">) {
  await requirePermissionPage("candidates.write");
  const { id } = await params;
  const election = await getElection(id);
  if (!election) notFound();
  const positions = await listPositions(id);
  return (
    <Card className="max-w-3xl">
      <CardHeader>
        <CardTitle>Register a candidate</CardTitle>
      </CardHeader>
      <CardContent>
        <CandidateForm
          action={createCandidateAction.bind(null, id)}
          positions={positions.map((p) => ({ id: p.position.id, title: p.position.title }))}
          isCreate
        />
      </CardContent>
    </Card>
  );
}
