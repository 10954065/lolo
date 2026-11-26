"use client";

import { Upload } from "lucide-react";
import { useActionState } from "react";
import { FieldErrors, FormAlert, SubmitButton } from "@/components/forms/form-parts";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { uploadImportAction } from "@/server/actions/members";

export function UploadImportForm() {
  const [state, formAction] = useActionState(uploadImportAction, null);
  return (
    <form action={formAction} className="space-y-4">
      <FormAlert state={state} />
      <div className="space-y-1.5">
        <Label htmlFor="file">Member list (.csv)</Label>
        <Input id="file" name="file" type="file" accept=".csv,text/csv" required aria-describedby="file-errors" />
        <FieldErrors id="file-errors" errors={state?.fieldErrors?.file} />
      </div>
      <SubmitButton pendingLabel="Checking file…">
        <Upload className="size-4" /> Upload and preview
      </SubmitButton>
    </form>
  );
}
