"use client";

import { useActionState } from "react";
import { toast } from "sonner";
import type { ServerAction } from "@/components/forms/action-dialog";
import { FormAlert, SubmitButton } from "@/components/forms/form-parts";
import type { ActionState } from "@/lib/action-state";

type Candidate = { id: string; fullName: string; email: string; membershipNumber: string | null };

/** Pick individual approved members to add to the voter roll. */
export function AddMembersForm({ action, members }: { action: ServerAction; members: Candidate[] }) {
  const [state, formAction] = useActionState(async (prev: ActionState, formData: FormData) => {
    const result = await action(prev, formData);
    if (result?.ok && result.message) toast.success(result.message);
    return result;
  }, null);
  if (members.length === 0) return <p className="text-sm text-muted-foreground">No matching approved members outside the roll.</p>;
  return (
    <form action={formAction} className="space-y-3">
      <FormAlert state={state?.ok ? null : state} />
      <fieldset className="max-h-72 space-y-1 overflow-y-auto rounded-lg border p-2">
        <legend className="sr-only">Members to add</legend>
        {members.map((m) => (
          <label key={m.id} className="flex items-center gap-3 rounded px-2 py-1.5 text-sm hover:bg-muted">
            <input type="checkbox" name="memberId" value={m.id} className="size-4 accent-brand" />
            <span className="min-w-0">
              <span className="font-medium">{m.fullName}</span>{" "}
              <span className="text-muted-foreground">
                {m.email}
                {m.membershipNumber ? ` · ${m.membershipNumber}` : ""}
              </span>
            </span>
          </label>
        ))}
      </fieldset>
      <SubmitButton size="sm" pendingLabel="Adding…">
        Add selected members
      </SubmitButton>
    </form>
  );
}
