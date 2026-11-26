"use client";

import { useActionState } from "react";
import { FormAlert, SubmitButton, TextField } from "@/components/forms/form-parts";
import { resetPasswordAction } from "@/server/actions/auth";

export function ResetPasswordForm({ token }: { token: string }) {
  const [state, formAction] = useActionState(resetPasswordAction, null);
  return (
    <form action={formAction} className="space-y-5" noValidate>
      <FormAlert state={state} />
      <input type="hidden" name="token" value={token} />
      <TextField name="newPassword" label="New password" type="password" autoComplete="new-password" required minLength={10} state={state} />
      <TextField name="confirmPassword" label="Confirm new password" type="password" autoComplete="new-password" required state={state} />
      <SubmitButton className="h-11 w-full" pendingLabel="Saving…">
        Save new password
      </SubmitButton>
    </form>
  );
}
