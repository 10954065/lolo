"use client";

import { useActionState } from "react";
import { toast } from "sonner";
import type { ServerAction } from "@/components/forms/action-dialog";
import { FieldErrors, FormAlert, SubmitButton, TextField } from "@/components/forms/form-parts";
import { NativeSelect } from "@/components/forms/native-select";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ActionState } from "@/lib/action-state";

export interface CandidateFormValues {
  positionId: string;
  fullName: string;
  membershipNumber: string;
  memberEmail: string;
  biography: string;
  manifesto: string;
}

type CandidateFormProps = {
  action: ServerAction;
  positions: Array<{ id: string; title: string }>;
  defaults?: CandidateFormValues;
  isCreate?: boolean;
};

export function CandidateForm({ action, positions, defaults, isCreate }: CandidateFormProps) {
  const [state, formAction] = useActionState(async (prev: ActionState, formData: FormData) => {
    const result = await action(prev, formData);
    if (result?.ok && result.message) toast.success(result.message);
    return result;
  }, null);

  return (
    <form action={formAction} className="space-y-5" noValidate>
      <FormAlert state={state?.ok ? null : state} />
      <div className="grid gap-5 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="positionId">
            Position<span className="text-brand"> *</span>
          </Label>
          <NativeSelect id="positionId" name="positionId" defaultValue={defaults?.positionId ?? ""} required>
            <option value="" disabled>
              Choose a position
            </option>
            {positions.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title}
              </option>
            ))}
          </NativeSelect>
          <FieldErrors id="positionId-errors" errors={state?.fieldErrors?.positionId} />
        </div>
        <TextField name="fullName" label="Candidate full name" required defaultValue={defaults?.fullName} state={state} />
        <TextField
          name="memberEmail"
          label="Member email (links to the member record)"
          type="email"
          defaultValue={defaults?.memberEmail}
          hint="Optional but recommended: confirms the candidate is an approved member."
          state={state}
        />
        <TextField name="membershipNumber" label="Membership / ID number" defaultValue={defaults?.membershipNumber} state={state} />
      </div>
      <TextField name="biography" label="Short biography" isMultiline rows={4} maxLength={3000} defaultValue={defaults?.biography} state={state} />
      <TextField name="manifesto" label="Manifesto" isMultiline rows={8} maxLength={10000} defaultValue={defaults?.manifesto} hint="Plain text. Shown to voters exactly as written." state={state} />
      <div className="space-y-1.5">
        <Label htmlFor="photo">Photograph</Label>
        <Input id="photo" name="photo" type="file" accept="image/jpeg,image/png,image/webp" aria-describedby="photo-hint photo-errors" />
        <p id="photo-hint" className="text-xs text-muted-foreground">
          JPEG, PNG or WebP, up to 5 MB. It is cropped to a square and all hidden metadata is removed.
        </p>
        <FieldErrors id="photo-errors" errors={state?.fieldErrors?.photo} />
      </div>
      {isCreate ? (
        <label className="flex items-start gap-3 text-sm">
          <Checkbox name="approve" className="mt-0.5" />
          <span>
            <span className="font-medium">Approve immediately</span>
            <span className="block text-muted-foreground">Only if the nomination has already been vetted.</span>
          </span>
        </label>
      ) : null}
      <SubmitButton pendingLabel="Saving…">{isCreate ? "Register candidate" : "Save candidate"}</SubmitButton>
    </form>
  );
}
