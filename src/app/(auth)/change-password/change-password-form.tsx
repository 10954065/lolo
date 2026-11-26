"use client";

import { useActionState } from "react";
import { FormAlert, SubmitButton, TextField } from "@/components/forms/form-parts";
import { changePasswordAction } from "@/server/actions/auth";

export function ChangePasswordForm({ isForced }: { isForced: boolean }) {
  const [state, formAction] = useActionState(changePasswordAction, null);
  return (
    <form action={formAction} className="space-y-5" noValidate>
      <FormAlert state={state} />
      <TextField
        name="currentPassword"
        label={isForced ? "Temporary password (from your email)" : "Current password"}
        type="password"
        autoComplete="current-password"
        required
        state={state}
      />
      <TextField
        name="newPassword"
        label="New password"
        type="password"
        autoComplete="new-password"
        hint="At least 10 characters. Do not use your name or email address."
        required
        minLength={10}
        state={state}
      />
      <TextField name="confirmPassword" label="Confirm new password" type="password" autoComplete="new-password" required state={state} />
      <SubmitButton className="h-11 w-full" pendingLabel="Saving…">
        Save password and continue
      </SubmitButton>
    </form>
  );
}
