"use client";

import { TextField } from "@/components/forms/form-parts";
import { Checkbox } from "@/components/ui/checkbox";

export interface PositionValues {
  title: string;
  description: string;
  maxSelections: number;
  allowAbstain: boolean;
  maxCandidates: number | null;
}

/** Fields shared by the create and edit position dialogs. */
export function PositionFields({ values }: { values?: PositionValues }) {
  return (
    <div className="space-y-4">
      <TextField name="title" label="Position title" required defaultValue={values?.title} />
      <TextField name="description" label="Description" isMultiline rows={2} defaultValue={values?.description} />
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          name="maxSelections"
          label="Seats (choices per voter)"
          type="number"
          min={1}
          max={10}
          required
          defaultValue={String(values?.maxSelections ?? 1)}
          hint="Normally 1 — one candidate per position."
        />
        <TextField
          name="maxCandidates"
          label="Maximum candidates"
          type="number"
          min={1}
          max={50}
          defaultValue={values?.maxCandidates ? String(values.maxCandidates) : ""}
          hint="Optional limit on approved candidates."
        />
      </div>
      <label className="flex items-start gap-3 text-sm">
        <Checkbox name="allowAbstain" defaultChecked={values?.allowAbstain ?? true} className="mt-0.5" />
        <span>
          <span className="font-medium">Allow abstention</span>
          <span className="block text-muted-foreground">Voters may choose “I abstain” for this position.</span>
        </span>
      </label>
    </div>
  );
}
