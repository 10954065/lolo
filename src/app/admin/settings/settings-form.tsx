"use client";

import { useActionState } from "react";
import { toast } from "sonner";
import { FormAlert, SubmitButton, TextField } from "@/components/forms/form-parts";
import type { ActionState } from "@/lib/action-state";
import { updateSettingsAction } from "@/server/actions/accounts";

export interface SettingsValues {
  organizationName: string;
  supportEmail: string;
  supportPhone: string;
  tempPasswordValidityDays: number;
  maxFailedLogins: number;
  lockoutMinutes: number;
}

export function SettingsForm({ values }: { values: SettingsValues }) {
  const [state, formAction] = useActionState(async (prev: ActionState, formData: FormData) => {
    const result = await updateSettingsAction(prev, formData);
    if (result?.ok) toast.success(result.message ?? "Saved.");
    return result;
  }, null);
  return (
    <form action={formAction} className="space-y-6" noValidate>
      <FormAlert state={state?.ok ? null : state} />
      <fieldset className="grid gap-5 sm:grid-cols-2">
        <legend className="mb-3 text-sm font-semibold text-navy">Organisation &amp; support</legend>
        <TextField
          name="organizationName"
          label="Organisation name"
          required
          defaultValue={values.organizationName}
          state={state}
          className="sm:col-span-2"
        />
        <TextField
          name="supportEmail"
          label="Support email"
          type="email"
          defaultValue={values.supportEmail}
          hint="Shown on the help page and in emails."
          state={state}
        />
        <TextField name="supportPhone" label="Support phone" type="tel" defaultValue={values.supportPhone} state={state} />
      </fieldset>
      <fieldset className="grid gap-5 sm:grid-cols-3">
        <legend className="mb-3 text-sm font-semibold text-navy">Account security</legend>
        <TextField
          name="tempPasswordValidityDays"
          label="Temporary password validity (days)"
          type="number"
          min={1}
          max={30}
          required
          defaultValue={values.tempPasswordValidityDays}
          state={state}
        />
        <TextField
          name="maxFailedLogins"
          label="Failed sign-ins before lockout"
          type="number"
          min={3}
          max={20}
          required
          defaultValue={values.maxFailedLogins}
          state={state}
        />
        <TextField
          name="lockoutMinutes"
          label="Lockout duration (minutes)"
          type="number"
          min={1}
          max={1440}
          required
          defaultValue={values.lockoutMinutes}
          state={state}
        />
      </fieldset>
      <SubmitButton pendingLabel="Saving…">Save settings</SubmitButton>
    </form>
  );
}
