"use client";

import { CheckCircle2, ClipboardCopy, Lock, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useActionState, useMemo, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { CandidatePhoto } from "@/components/elections/candidate-photo";
import { FormAlert } from "@/components/forms/form-parts";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { ActionState } from "@/lib/action-state";
import { cn } from "@/lib/utils";

const ABSTAIN = "ABSTAIN";

export interface BallotFormPosition {
  id: string;
  title: string;
  description: string;
  maxSelections: number;
  allowAbstain: boolean;
  candidates: Array<{ id: string; fullName: string; hasPhoto: boolean; photoVersion: string | null }>;
}

type BallotFormProps = {
  electionId: string;
  electionTitle: string;
  positions: BallotFormPosition[];
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
};

type Selections = Record<string, string[]>;
type Step = "choose" | "review";

export function BallotForm({ electionId, electionTitle, positions, action }: BallotFormProps) {
  const [selections, setSelections] = useState<Selections>({});
  const [step, setStep] = useState<Step>("choose");
  const [missing, setMissing] = useState<string[]>([]);
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [isCopied, setIsCopied] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction] = useActionState(action, null);

  const votable = useMemo(() => positions.filter((p) => p.candidates.length > 0), [positions]);

  function choose(position: BallotFormPosition, value: string) {
    setSelections((prev) => {
      const current = prev[position.id] ?? [];
      if (value === ABSTAIN || position.maxSelections === 1) return { ...prev, [position.id]: [value] };
      const withoutAbstain = current.filter((v) => v !== ABSTAIN);
      if (withoutAbstain.includes(value)) return { ...prev, [position.id]: withoutAbstain.filter((v) => v !== value) };
      if (withoutAbstain.length >= position.maxSelections) return prev;
      return { ...prev, [position.id]: [...withoutAbstain, value] };
    });
    setMissing((m) => m.filter((id) => id !== position.id));
  }

  function goToReview() {
    const unanswered = votable.filter((p) => !(selections[p.id]?.length)).map((p) => p.id);
    setMissing(unanswered);
    if (unanswered.length) {
      document.getElementById(`position-${unanswered[0]}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    setStep("review");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  // ---- Success: show the receipt once ------------------------------------------------------
  if (state?.ok && state.data?.receipt) {
    const receipt = String(state.data.receipt);
    return (
      <Card className="border-success/40">
        <CardHeader className="items-center text-center">
          <CheckCircle2 className="size-14 text-success" aria-hidden />
          <CardTitle className="text-2xl text-ink">Your vote has been recorded</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5 text-center">
          <p>
            Thank you for voting in <strong>{String(state.data.electionTitle)}</strong>.
            <br />
            Submitted on <strong>{String(state.data.votedAt)}</strong>.
          </p>
          <div className="mx-auto max-w-md space-y-2 rounded-xl border bg-muted p-4">
            <p className="text-sm font-medium">Your ballot receipt</p>
            <p className="break-all font-mono text-lg font-semibold tracking-wider text-ink" data-testid="ballot-receipt">
              {receipt}
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={async () => {
                await navigator.clipboard?.writeText(receipt);
                setIsCopied(true);
              }}
            >
              <ClipboardCopy className="size-4" /> {isCopied ? "Copied" : "Copy receipt"}
            </Button>
          </div>
          <ul className="mx-auto max-w-md space-y-2 text-left text-sm text-muted-foreground">
            <li className="flex gap-2">
              <Lock className="mt-0.5 size-4 shrink-0" aria-hidden /> Your ballot cannot be changed.
            </li>
            <li className="flex gap-2">
              <ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden /> The receipt is not linked to your name. Write it
              down now if you want to confirm later that your ballot was counted. It will not be shown again or emailed.
            </li>
          </ul>
          <div className="flex flex-wrap justify-center gap-2">
            <Button asChild>
              <Link href="/dashboard">Back to my dashboard</Link>
            </Button>
            <Button variant="outline" asChild>
              <Link href="/verify-receipt">Verify a receipt</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  const isReview = step === "review";
  return (
    <form ref={formRef} action={formAction} className="space-y-6" aria-label={`Ballot for ${electionTitle}`}>
      <FormAlert state={state} />
      {Object.entries(selections).flatMap(([positionId, values]) =>
        values.map((v) => <input key={`${positionId}:${v}`} type="hidden" name={`position:${positionId}`} value={v} />),
      )}

      {isReview ? (
        <Card>
          <CardHeader>
            <CardTitle>Review your choices</CardTitle>
            <p className="text-sm text-muted-foreground">Check carefully. Once submitted, your ballot cannot be changed.</p>
          </CardHeader>
          <CardContent>
            <dl className="divide-y">
              {votable.map((p) => {
                const chosen = selections[p.id] ?? [];
                const names = chosen.includes(ABSTAIN)
                  ? ["I abstain"]
                  : chosen.map((id) => p.candidates.find((c) => c.id === id)?.fullName ?? "");
                return (
                  <div key={p.id} className="flex flex-col gap-1 py-3 sm:flex-row sm:justify-between">
                    <dt className="font-medium text-ink">{p.title}</dt>
                    <dd className="font-semibold">{names.join(", ")}</dd>
                  </div>
                );
              })}
            </dl>
            <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button type="button" variant="outline" className="h-11" onClick={() => setStep("choose")}>
                Change my choices
              </Button>
              <Button type="button" className="h-11" onClick={() => setIsConfirmOpen(true)}>
                Submit my vote
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <>
          {votable.map((p, index) => {
            const chosen = selections[p.id] ?? [];
            const isMissing = missing.includes(p.id);
            const isMulti = p.maxSelections > 1;
            return (
              <fieldset
                key={p.id}
                id={`position-${p.id}`}
                className={cn("rounded-xl border bg-card p-4 sm:p-6", isMissing && "border-destructive ring-2 ring-destructive/30")}
                aria-describedby={isMissing ? `position-${p.id}-error` : undefined}
              >
                <legend className="px-1 text-lg font-semibold text-ink">
                  {index + 1}. {p.title}
                </legend>
                <p className="mb-4 text-sm text-muted-foreground">
                  {isMulti ? `Choose up to ${p.maxSelections} candidates.` : "Choose one candidate."}
                  {p.description ? ` ${p.description}` : ""}
                </p>
                {isMissing ? (
                  <p id={`position-${p.id}-error`} className="mb-3 text-sm font-medium text-destructive" role="alert">
                    Please make a choice for {p.title}.
                  </p>
                ) : null}
                <div className="grid gap-3">
                  {p.candidates.map((c) => {
                    const isChosen = chosen.includes(c.id);
                    return (
                      <label
                        key={c.id}
                        className={cn(
                          "flex min-h-16 cursor-pointer items-center gap-4 rounded-xl border-2 bg-card p-3 shadow-xs transition-all active:scale-[0.99]",
                          isChosen ? "border-brand bg-brand-soft shadow-card ring-4 ring-brand/10" : "border-border hover:border-brand/40",
                        )}
                      >
                        <input
                          type={isMulti ? "checkbox" : "radio"}
                          name={`choice-${p.id}`}
                          value={c.id}
                          checked={isChosen}
                          onChange={() => choose(p, c.id)}
                          className="size-5 shrink-0 accent-brand"
                        />
                        <CandidatePhoto candidateId={c.id} name={c.fullName} hasPhoto={c.hasPhoto} version={c.photoVersion} size="sm" />
                        <span className="text-base font-medium">{c.fullName}</span>
                      </label>
                    );
                  })}
                  {p.allowAbstain ? (
                    <label
                      className={cn(
                        "flex min-h-12 cursor-pointer items-center gap-4 rounded-xl border-2 border-dashed p-3 text-muted-foreground",
                        chosen.includes(ABSTAIN) ? "border-ink bg-secondary text-foreground" : "border-border",
                      )}
                    >
                      <input
                        type={isMulti ? "checkbox" : "radio"}
                        name={`choice-${p.id}`}
                        value={ABSTAIN}
                        checked={chosen.includes(ABSTAIN)}
                        onChange={() => choose(p, ABSTAIN)}
                        className="size-5 shrink-0 accent-ink"
                      />
                      I abstain for this position
                    </label>
                  ) : null}
                </div>
              </fieldset>
            );
          })}
          <div className="sticky bottom-0 -mx-4 border-t bg-background/95 px-4 pt-3 pb-safe shadow-[0_-8px_24px_-16px_oklch(0.16_0.01_25/35%)] backdrop-blur-md sm:static sm:shadow-none sm:mx-0 sm:border-0 sm:bg-transparent sm:p-0">
            <Button type="button" className="h-12 w-full text-base sm:w-auto" onClick={goToReview}>
              Review my choices
            </Button>
          </div>
        </>
      )}

      <AlertDialog open={isConfirmOpen} onOpenChange={setIsConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Submit your vote?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to submit your vote? Once submitted, your ballot cannot be changed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Go back</AlertDialogCancel>
            <Button
              type="button"
              data-testid={`confirm-ballot-${electionId}`}
              onClick={() => {
                setIsConfirmOpen(false);
                formRef.current?.requestSubmit();
              }}
            >
              Yes, submit my vote
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <PendingOverlay />
    </form>
  );
}

/** Blocks the page while the ballot is in flight so it cannot be submitted twice. */
function PendingOverlay() {
  const { pending } = useFormStatus();
  if (!pending) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80" role="status" aria-live="assertive">
      <p className="rounded-lg border bg-card px-6 py-4 font-medium shadow">Submitting your ballot… please do not close this page.</p>
    </div>
  );
}
