"use client";

import Link from "next/link";
import { useActionState } from "react";
import { FormAlert, SubmitButton, TextField } from "@/components/forms/form-parts";
import { forgotPasswordAction } from "@/server/actions/auth";

export function ForgotPasswordForm() {
  const [state, formAction] = useActionState(forgotPasswordAction, null);
  return (
    <form action={formAction} className="space-y-5" noValidate>
      <FormAlert state={state} />
      {state?.ok ? null : (
        <>
          <TextField name="email" label="Email address" type="email" autoComplete="email" required state={state} />
          <SubmitButton className="h-11 w-full" pendingLabel="Sending…">
            Send reset link
          </SubmitButton>
        </>
      )}
      <p className="text-center text-sm">
        <Link href="/login" className="font-medium text-brand hover:underline">
          Back to sign in
        </Link>
      </p>
    </form>
  );
}
