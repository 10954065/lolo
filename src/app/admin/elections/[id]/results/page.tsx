import { Lock, Megaphone, Undo2 } from "lucide-react";
import { notFound } from "next/navigation";
import { ActionDialog } from "@/components/forms/action-dialog";
import { NativeSelect } from "@/components/forms/native-select";
import { TextField } from "@/components/forms/form-parts";
import { ResultsView } from "@/components/results/results-view";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { publishResultsAction, recordTieResolutionAction, unpublishResultsAction } from "@/server/actions/results";
import { requirePermissionPage } from "@/server/auth/guards";
import { getElection } from "@/server/services/elections";
import { listTieResolutions, provisionalResults, publishedSnapshot, TALLY_STATUSES } from "@/server/services/results";

export default async function AdminResultsPage({ params }: PageProps<"/admin/elections/[id]/results">) {
  const { actor } = await requirePermissionPage("results.read.unpublished");
  const { id } = await params;
  const election = await getElection(id);
  if (!election) notFound();
  if (!(TALLY_STATUSES as readonly string[]).includes(election.status)) {
    return (
      <p className="flex items-center gap-2 rounded-lg border bg-muted p-4 text-sm text-muted-foreground">
        <Lock className="size-4" aria-hidden /> Results are sealed until voting closes. Nobody — including administrators — can
        see vote counts during voting. Participation is shown on the overview and voter roll.
      </p>
    );
  }
  const [published, resolutions] = await Promise.all([publishedSnapshot(id), listTieResolutions(id)]);
  const snapshot = published?.snapshot ?? (await provisionalResults(actor, id));
  const tied = snapshot.positions.filter((p) => p.hasTie);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Publication</CardTitle>
          <CardDescription>
            Publishing freezes these results as an official, hashed snapshot and notifies members according to the visibility
            setting. Requires your password.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {election.status === "CLOSED" ? (
            <ActionDialog
              action={publishResultsAction.bind(null, id)}
              triggerVariant="default"
              triggerSize="default"
              triggerLabel={<><Megaphone className="size-4" /> Publish results</>}
              title="Publish the official results?"
              description="Members and the Electoral Committee will be able to see the results. Ties remain marked as ties."
              confirmLabel="Publish"
            />
          ) : null}
          {election.status === "RESULTS_PUBLISHED" ? (
            <ActionDialog
              action={unpublishResultsAction.bind(null, id)}
              triggerSize="default"
              triggerLabel={<><Undo2 className="size-4" /> Withdraw publication</>}
              title="Withdraw the published results?"
              description="Use only to correct an error. The withdrawal and reason are recorded in the audit log."
              confirmLabel="Withdraw"
              isDestructive
              reasonLabel="Reason (at least 20 characters)"
            />
          ) : null}
          {tied.length > 0 ? (
            <ActionDialog
              action={recordTieResolutionAction.bind(null, id)}
              triggerSize="default"
              triggerLabel="Record tie-break outcome"
              title="Record the outcome of the tie-break procedure"
              description="This records MOBA's decision (for example a run-off). It never changes the vote counts."
              confirmLabel="Record outcome"
            >
              <div className="space-y-1.5">
                <Label htmlFor="tie-select">Position and declared winner</Label>
                <NativeSelect id="tie-select" name="tieChoice" required>
                  {tied.flatMap((p) =>
                    p.candidates.filter((c) => c.isTied).map((c) => (
                      <option key={`${p.positionId}:${c.candidateId}`} value={`${p.positionId}:${c.candidateId}`}>
                        {p.title}: {c.fullName}
                      </option>
                    )),
                  )}
                </NativeSelect>
              </div>
              <TextField name="method" label="How the tie was broken" required placeholder="Run-off vote held on …" />
              <TextField name="notes" label="Notes" isMultiline rows={2} />
            </ActionDialog>
          ) : null}
        </CardContent>
      </Card>
      <ResultsView
        snapshot={snapshot}
        resolutions={resolutions}
        isProvisional={!published}
        publishedAt={published?.publishedAt}
        sha256={published?.sha256}
        exportBase={`/api/exports/elections/${id}`}
      />
    </div>
  );
}
