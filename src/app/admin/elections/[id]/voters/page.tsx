import { Lock, UserMinus, UsersRound } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { AddMembersForm } from "@/components/elections/add-members-form";
import { VoterRollTable } from "@/components/elections/voter-roll-table";
import { ActionButton, ActionDialog } from "@/components/forms/action-dialog";
import { NativeSelect } from "@/components/forms/native-select";
import { Pagination } from "@/components/shared/pagination";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { isBallotLocked } from "@/lib/election-rules";
import { addAllToRollAction, addMembersToRollAction, removeFromRollAction } from "@/server/actions/elections";
import { requirePermissionPage } from "@/server/auth/guards";
import { getElection } from "@/server/services/elections";
import { listVoterRoll, membersNotOnRoll } from "@/server/services/voter-roll";

const filtersSchema = z.object({
  q: z.string().trim().max(100).optional().catch(undefined),
  voted: z.enum(["yes", "no"]).optional().catch(undefined),
  add: z.string().trim().max(100).optional().catch(undefined),
  page: z.coerce.number().int().min(1).catch(1),
});

export default async function VotersPage({ params, searchParams }: PageProps<"/admin/elections/[id]/voters">) {
  await requirePermissionPage("voters.write");
  const { id } = await params;
  const election = await getElection(id);
  if (!election) notFound();
  const filters = filtersSchema.parse(await searchParams);
  const isLocked = isBallotLocked(election, new Date());
  const [roll, candidates] = await Promise.all([
    listVoterRoll(id, filters),
    isLocked || filters.add === undefined ? Promise.resolve([]) : membersNotOnRoll(id, filters.add),
  ]);
  const basePath = `/admin/elections/${id}/voters`;

  return (
    <div className="space-y-4">
      {isLocked ? (
        <p className="flex items-center gap-2 rounded-lg border bg-muted p-3 text-sm text-muted-foreground">
          <Lock className="size-4" aria-hidden /> The voter roll is frozen. Participation is updated live below.
        </p>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Build the voter roll</CardTitle>
            <CardDescription>Only approved, active members can be added. Eligibility is re-checked when each ballot is cast.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <ActionButton
              action={addAllToRollAction.bind(null, id)}
              variant="default"
              size="default"
              label={<><UsersRound className="size-4" /> Add all approved members</>}
              pendingLabel="Adding…"
            />
            <form method="get" action={basePath} className="flex flex-wrap items-end gap-2">
              <div className="min-w-56 flex-1 space-y-1.5">
                <label htmlFor="add" className="text-sm font-medium">
                  Or find individual members
                </label>
                <Input id="add" name="add" defaultValue={filters.add ?? ""} placeholder="Name, email or membership no." />
              </div>
              <Button type="submit" variant="outline">
                Search
              </Button>
            </form>
            {filters.add !== undefined ? <AddMembersForm action={addMembersToRollAction.bind(null, id)} members={candidates} /> : null}
          </CardContent>
        </Card>
      )}

      <form method="get" action={basePath} className="flex flex-wrap items-end gap-2 rounded-xl border bg-card p-4">
        <div className="min-w-56 flex-1 space-y-1.5">
          <label htmlFor="q" className="text-sm font-medium">
            Search the roll
          </label>
          <Input id="q" name="q" defaultValue={filters.q ?? ""} />
        </div>
        <div className="w-44 space-y-1.5">
          <label htmlFor="voted" className="text-sm font-medium">
            Participation
          </label>
          <NativeSelect id="voted" name="voted" defaultValue={filters.voted ?? ""}>
            <option value="">Everyone</option>
            <option value="yes">Voted</option>
            <option value="no">Not voted</option>
          </NativeSelect>
        </div>
        <Button type="submit">Apply</Button>
        <Button variant="ghost" asChild>
          <Link href={basePath}>Reset</Link>
        </Button>
      </form>

      <VoterRollTable
        rows={roll.rows}
        renderAction={
          isLocked
            ? undefined
            : (r) => (
                <ActionDialog
                  action={removeFromRollAction.bind(null, id, r.memberId)}
                  triggerVariant="ghost"
                  triggerLabel={<UserMinus className="size-4" aria-label={`Remove ${r.fullName}`} />}
                  title={`Remove ${r.fullName} from the voter roll?`}
                  confirmLabel="Remove"
                  isDestructive
                  reasonLabel="Reason"
                />
              )
        }
      />
      <Pagination page={roll.page} pageSize={roll.pageSize} total={roll.total} params={{ q: filters.q, voted: filters.voted }} basePath={basePath} />
    </div>
  );
}
