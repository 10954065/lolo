"use client";

import { useActionState } from "react";
import { FormAlert, SubmitButton, TextField } from "@/components/forms/form-parts";
import { verifyReceiptAction } from "@/server/actions/voting";

export function VerifyReceiptForm() {
  const [state, formAction] = useActionState(verifyReceiptAction, null);
  return (
    <form action={formAction} className="space-y-4" noValidate>
      <FormAlert state={state} />
      <TextField
        name="receipt"
        label="Receipt code"
        placeholder="MOBA-XXXXX-XXXXX-XXXXX-XXXXX-XXXXX"
        autoComplete="off"
        spellCheck={false}
        className="font-mono"
        required
        state={state}
      />
      <SubmitButton className="w-full" pendingLabel="Checking…">
        Verify receipt
      </SubmitButton>
    </form>
  );
}
