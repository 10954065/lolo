import { ArrowDown, ArrowUp, ListPlus, Lock, Pencil, Plus, Trash2 } from "lucide-react";
import { notFound } from "next/navigation";
import { PositionFields } from "@/components/elections/position-fields";
import { ActionButton, ActionDialog } from "@/components/forms/action-dialog";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { isBallotLocked } from "@/lib/election-rules";
import {
  addStandardPositionsAction,
  createPositionAction,
  deletePositionAction,
  movePositionAction,
  updatePositionAction,
} from "@/server/actions/elections";
import { requirePermissionPage } from "@/server/auth/guards";
import { getElection } from "@/server/services/elections";
import { listPositions } from "@/server/services/positions";

export default async function PositionsPage({ params }: PageProps<"/admin/elections/[id]/positions">) {
  await requirePermissionPage("positions.write");
  const { id } = await params;
  const election = await getElection(id);
  if (!election) notFound();
  const positions = await listPositions(id);
  const isLocked = isBallotLocked(election, new Date());

  return (
    <div className="space-y-4">
      {isLocked ? (
        <p className="flex items-center gap-2 rounded-lg border bg-muted p-3 text-sm text-muted-foreground">
          <Lock className="size-4" aria-hidden /> The ballot is locked. Positions can no longer be changed.
        </p>
      ) : (
        <div className="flex flex-wrap gap-2">
          <ActionDialog
            action={createPositionAction.bind(null, id)}
            triggerVariant="default"
            triggerSize="default"
            triggerLabel={<><Plus className="size-4" /> Add position</>}
            title="Add an executive position"
            confirmLabel="Add position"
          >
            <PositionFields />
          </ActionDialog>
          <ActionButton
            action={addStandardPositionsAction.bind(null, id)}
            size="default"
            label={<><ListPlus className="size-4" /> Add standard MOBA positions</>}
            pendingLabel="Adding…"
          />
        </div>
      )}
      {positions.length === 0 ? (
        <p className="rounded-xl border border-dashed bg-card p-8 text-center text-sm text-muted-foreground">
          No positions yet. Positions are configured per election — nothing is hard-coded.
        </p>
      ) : (
        <ol className="space-y-3">
          {positions.map(({ position: p, approvedCandidates, totalCandidates }, index) => (
            <li key={p.id}>
              <Card>
                <CardContent className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="font-semibold text-navy">
                      {index + 1}. {p.title}
                    </p>
                    {p.description ? <p className="text-sm text-muted-foreground">{p.description}</p> : null}
                    <div className="mt-2 flex flex-wrap gap-2 text-xs">
                      <Badge variant="outline">{p.maxSelections} seat{p.maxSelections === 1 ? "" : "s"}</Badge>
                      <Badge variant="outline">Abstain {p.allowAbstain ? "allowed" : "not allowed"}</Badge>
                      <Badge variant="outline">
                        {Number(approvedCandidates)} approved / {Number(totalCandidates)} candidates
                      </Badge>
                      {p.maxCandidates ? <Badge variant="outline">Max {p.maxCandidates} candidates</Badge> : null}
                    </div>
                  </div>
                  {isLocked ? null : (
                    <div className="flex flex-wrap gap-2">
                      <ActionButton action={movePositionAction.bind(null, id, p.id, "up")} label={<ArrowUp className="size-4" aria-label="Move up" />} />
                      <ActionButton action={movePositionAction.bind(null, id, p.id, "down")} label={<ArrowDown className="size-4" aria-label="Move down" />} />
                      <ActionDialog
                        action={updatePositionAction.bind(null, id, p.id)}
                        triggerLabel={<><Pencil className="size-3.5" /> Edit</>}
                        title={`Edit ${p.title}`}
                        confirmLabel="Save"
                      >
                        <PositionFields values={p} />
                      </ActionDialog>
                      <ActionDialog
                        action={deletePositionAction.bind(null, id, p.id)}
                        triggerVariant="ghost"
                        triggerLabel={<Trash2 className="size-4" aria-label="Delete" />}
                        title={`Delete ${p.title}?`}
                        description="Only positions without candidates can be deleted."
                        confirmLabel="Delete"
                        isDestructive
                      />
                    </div>
                  )}
                </CardContent>
              </Card>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
