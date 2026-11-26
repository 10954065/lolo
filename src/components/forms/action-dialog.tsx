"use client";

import { ShieldAlert } from "lucide-react";
import { useActionState, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import type { ActionState } from "@/lib/action-state";
import { confirmPasswordAction } from "@/server/actions/auth";
import { FormAlert, SubmitButton, TextField } from "./form-parts";

export type ServerAction = (prev: ActionState, formData: FormData) => Promise<ActionState>;
type ButtonVariant = "default" | "destructive" | "outline" | "secondary" | "ghost" | "link";

type ActionDialogProps = {
  action: ServerAction;
  triggerLabel: ReactNode;
  triggerVariant?: ButtonVariant;
  triggerSize?: "default" | "sm" | "lg";
  title: string;
  description?: ReactNode;
  confirmLabel: string;
  isDestructive?: boolean;
  /** When set, a required reason textarea is shown (stored in the audit log). */
  reasonLabel?: string;
  hiddenFields?: Record<string, string>;
  children?: ReactNode;
  isDisabled?: boolean;
};

type ReauthDialogProps = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  onConfirmed: () => void;
};

/** Password re-entry for sensitive actions; on success the original form is re-submitted. */
function ReauthDialog({ isOpen, onOpenChange, onConfirmed }: ReauthDialogProps) {
  const [state, formAction] = useActionState(async (prev: ActionState, formData: FormData) => {
    const result = await confirmPasswordAction(prev, formData);
    if (result?.ok) {
      onOpenChange(false);
      onConfirmed();
    }
    return result;
  }, null);
  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldAlert className="size-5 text-brand" aria-hidden /> Confirm your password
          </DialogTitle>
          <DialogDescription>This is a sensitive action. Re-enter your password to continue.</DialogDescription>
        </DialogHeader>
        <form action={formAction} className="space-y-4">
          <FormAlert state={state?.ok ? null : state} />
          <TextField
            name="password"
            label="Your password"
            type="password"
            autoComplete="current-password"
            required
            state={state}
          />
          <DialogFooter>
            <SubmitButton pendingLabel="Checking…">Confirm</SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function ActionDialog({
  action,
  triggerLabel,
  triggerVariant = "outline",
  triggerSize = "sm",
  title,
  description,
  confirmLabel,
  isDestructive,
  reasonLabel,
  hiddenFields,
  children,
  isDisabled,
}: ActionDialogProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isReauthOpen, setIsReauthOpen] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction] = useActionState(async (prev: ActionState, formData: FormData) => {
    const result = await action(prev, formData);
    if (result?.ok) {
      setIsOpen(false);
      if (result.message) toast.success(result.message);
    } else if (result?.needsReauth) {
      setIsReauthOpen(true);
    }
    return result;
  }, null);

  return (
    <>
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogTrigger asChild>
          <Button variant={triggerVariant} size={triggerSize} disabled={isDisabled}>
            {triggerLabel}
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            {description ? (
              <DialogDescription asChild>
                <div>{description}</div>
              </DialogDescription>
            ) : null}
          </DialogHeader>
          <form ref={formRef} action={formAction} className="space-y-4">
            {state && !state.ok && !state.needsReauth ? <FormAlert state={state} /> : null}
            {Object.entries(hiddenFields ?? {}).map(([k, v]) => (
              <input key={k} type="hidden" name={k} value={v} />
            ))}
            {children}
            {reasonLabel ? (
              <TextField name="reason" label={reasonLabel} isMultiline rows={3} required maxLength={2000} state={state} />
            ) : null}
            <DialogFooter className="gap-2">
              <Button type="button" variant="ghost" onClick={() => setIsOpen(false)}>
                Cancel
              </Button>
              <SubmitButton variant={isDestructive ? "destructive" : "default"} pendingLabel="Working…">
                {confirmLabel}
              </SubmitButton>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <ReauthDialog
        isOpen={isReauthOpen}
        onOpenChange={setIsReauthOpen}
        onConfirmed={() => formRef.current?.requestSubmit()}
      />
    </>
  );
}

/** A single button that runs an action immediately and reports the outcome as a toast. */
export function ActionButton({
  action,
  label,
  variant = "outline",
  size = "sm",
  hiddenFields,
  pendingLabel,
}: {
  action: ServerAction;
  label: ReactNode;
  variant?: ButtonVariant;
  size?: "default" | "sm" | "lg";
  hiddenFields?: Record<string, string>;
  pendingLabel?: string;
}) {
  const [, formAction] = useActionState(async (prev: ActionState, formData: FormData) => {
    const result = await action(prev, formData);
    if (result?.ok) toast.success(result.message ?? "Done.");
    else toast.error(result?.message ?? "The action failed.");
    return result;
  }, null);
  return (
    <form action={formAction}>
      {Object.entries(hiddenFields ?? {}).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      <SubmitButton variant={variant} size={size} pendingLabel={pendingLabel}>
        {label}
      </SubmitButton>
    </form>
  );
}
