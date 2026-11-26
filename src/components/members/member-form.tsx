"use client";

import { useActionState, useEffect, useRef } from "react";
import { toast } from "sonner";
import type { ServerAction } from "@/components/forms/action-dialog";
import { FieldErrors, FormAlert, SubmitButton, TextField } from "@/components/forms/form-parts";
import { NativeSelect } from "@/components/forms/native-select";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import type { ActionState } from "@/lib/action-state";

const GENDERS = ["Male", "Female", "Other", "Prefer not to say"];

export interface MemberFormValues {
  fullName: string;
  email: string;
  phone: string;
  membershipNumber: string;
  gender: string;
  notes: string;
}

type MemberFormProps = {
  action: ServerAction;
  defaults?: MemberFormValues;
  isCreate?: boolean;
};

export function MemberForm({ action, defaults, isCreate = false }: MemberFormProps) {
  const [state, formAction] = useActionState(action, null);
  const handledRef = useRef<ActionState>(null);
  useEffect(() => {
    if (state?.ok && state.message && handledRef.current !== state) {
      handledRef.current = state;
      toast.success(state.message);
    }
  }, [state]);

  return (
    <form action={formAction} className="space-y-5" noValidate>
      <FormAlert state={state?.ok ? null : state} />
      <div className="grid gap-5 sm:grid-cols-2">
        <TextField name="fullName" label="Full name" required defaultValue={defaults?.fullName} autoComplete="off" state={state} className="sm:col-span-2" />
        <TextField name="email" label="Email address" type="email" required defaultValue={defaults?.email} hint="Login details are sent to this address." state={state} />
        <TextField name="phone" label="Phone number" type="tel" defaultValue={defaults?.phone} hint="Optional, e.g. +233 24 123 4567" state={state} />
        <TextField name="membershipNumber" label="Membership / ID number" defaultValue={defaults?.membershipNumber} hint="Optional" state={state} />
        <div className="space-y-1.5">
          <Label htmlFor="gender">Gender</Label>
          <NativeSelect id="gender" name="gender" defaultValue={defaults?.gender ?? ""} aria-describedby="gender-hint">
            <option value="">Not specified</option>
            {GENDERS.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </NativeSelect>
          <p id="gender-hint" className="text-xs text-muted-foreground">
            Optional. Never used to decide eligibility.
          </p>
          <FieldErrors id="gender-errors" errors={state?.fieldErrors?.gender} />
        </div>
        <TextField name="notes" label="Internal notes" isMultiline rows={3} defaultValue={defaults?.notes} maxLength={1000} className="sm:col-span-2" state={state} />
      </div>
      {isCreate ? (
        <fieldset className="space-y-3 rounded-lg border p-4">
          <legend className="px-1 text-sm font-medium">Registration options</legend>
          <label className="flex items-start gap-3 text-sm">
            <Checkbox name="approve" className="mt-0.5" />
            <span>
              <span className="font-medium">Approve immediately</span>
              <span className="block text-muted-foreground">Use when the member has already been verified by MOBA 2017.</span>
            </span>
          </label>
          <label className="flex items-start gap-3 text-sm">
            <Checkbox name="notify" defaultChecked className="mt-0.5" />
            <span>
              <span className="font-medium">Email the member</span>
              <span className="block text-muted-foreground">Sends a registration (or approval) confirmation. Login details are sent separately.</span>
            </span>
          </label>
        </fieldset>
      ) : null}
      <SubmitButton pendingLabel="Saving…">{isCreate ? "Register member" : "Save changes"}</SubmitButton>
    </form>
  );
}
