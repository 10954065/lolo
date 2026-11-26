"use client";

import Link from "next/link";
import { useActionState } from "react";
import { FormAlert, SubmitButton, TextField } from "@/components/forms/form-parts";
import { loginAction } from "@/server/actions/auth";

export function LoginForm({ next }: { next: string }) {
  const [state, formAction] = useActionState(loginAction, null);
  return (
    <form action={formAction} className="space-y-5" noValidate>
      <FormAlert state={state} />
      <input type="hidden" name="next" value={next} />
      <TextField
        name="email"
        label="Email address"
        type="email"
        autoComplete="username"
        inputMode="email"
        required
        autoFocus
        state={state}
      />
      <TextField
        name="password"
        label="Password"
        type="password"
        autoComplete="current-password"
        required
        state={state}
      />
      <div className="flex justify-end">
        <Link href="/forgot-password" className="text-sm font-medium text-brand hover:underline">
          Forgot your password?
        </Link>
      </div>
      <SubmitButton className="h-11 w-full text-base" pendingLabel="Signing in…">
        Sign in
      </SubmitButton>
    </form>
  );
}
