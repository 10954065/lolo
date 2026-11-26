"use client";

import { useActionState } from "react";
import { toast } from "sonner";
import type { ServerAction } from "@/components/forms/action-dialog";
import { FieldErrors, FormAlert, SubmitButton, TextField } from "@/components/forms/form-parts";
import { NativeSelect } from "@/components/forms/native-select";
import { Label } from "@/components/ui/label";
import type { ActionState } from "@/lib/action-state";

export interface ElectionFormValues {
  title: string;
  description: string;
  electionYear: string;
  opensAt: string;
  closesAt: string;
  rules: string;
  instructions: string;
  resultsVisibility: string;
  tieBreakProcedure: string;
}

const DEFAULT_TIE_BREAK =
  "A run-off vote between the tied candidates will be organised by the Electoral Committee. The system will not automatically select a winner.";

type ElectionFormProps = { action: ServerAction; defaults?: ElectionFormValues; isCreate?: boolean };

export function ElectionForm({ action, defaults, isCreate }: ElectionFormProps) {
  const [state, formAction] = useActionState(async (prev: ActionState, formData: FormData) => {
    const result = await action(prev, formData);
    if (result?.ok && result.message) toast.success(result.message);
    return result;
  }, null);

  return (
    <form action={formAction} className="space-y-6" noValidate>
      <FormAlert state={state?.ok ? null : state} />
      <div className="grid gap-5 sm:grid-cols-3">
        <TextField
          name="title"
          label="Election title"
          required
          defaultValue={defaults?.title}
          placeholder="MOBA 2017 Executive Elections 2026"
          className="sm:col-span-2"
          state={state}
        />
        <TextField
          name="electionYear"
          label="Election year"
          type="number"
          min={2017}
          max={2100}
          required
          defaultValue={defaults?.electionYear ?? String(new Date().getFullYear())}
          state={state}
        />
        <TextField
          name="description"
          label="Description"
          isMultiline
          rows={3}
          defaultValue={defaults?.description}
          className="sm:col-span-3"
          state={state}
        />
      </div>
      <fieldset className="grid gap-5 sm:grid-cols-2">
        <legend className="mb-2 text-sm font-semibold text-navy">Voting period (Africa/Accra time, GMT)</legend>
        <TextField name="opensAt" label="Voting opens" type="datetime-local" required defaultValue={defaults?.opensAt} state={state} />
        <TextField name="closesAt" label="Voting closes" type="datetime-local" required defaultValue={defaults?.closesAt} state={state} />
      </fieldset>
      <div className="grid gap-5">
        <TextField
          name="instructions"
          label="Voting instructions for members"
          isMultiline
          rows={4}
          defaultValue={defaults?.instructions}
          hint="Shown above the ballot. Plain text."
          state={state}
        />
        <TextField name="rules" label="Election rules" isMultiline rows={5} defaultValue={defaults?.rules} state={state} />
        <TextField
          name="tieBreakProcedure"
          label="Tie-break procedure"
          isMultiline
          rows={3}
          required
          defaultValue={defaults?.tieBreakProcedure ?? DEFAULT_TIE_BREAK}
          hint="Ties are never resolved automatically. This text is shown with any tied result."
          state={state}
        />
        <div className="space-y-1.5">
          <Label htmlFor="resultsVisibility">Who can see published results</Label>
          <NativeSelect id="resultsVisibility" name="resultsVisibility" defaultValue={defaults?.resultsVisibility ?? "ELIGIBLE_VOTERS"}>
            <option value="ELIGIBLE_VOTERS">Members on this election&apos;s voter roll</option>
            <option value="ALL_MEMBERS">All approved members</option>
            <option value="PUBLIC">Everyone (public results page)</option>
          </NativeSelect>
          <FieldErrors id="resultsVisibility-errors" errors={state?.fieldErrors?.resultsVisibility} />
        </div>
      </div>
      <SubmitButton pendingLabel="Saving…">{isCreate ? "Create election" : "Save changes"}</SubmitButton>
    </form>
  );
}
