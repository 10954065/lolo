"use client";

import { AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { ActionState } from "@/lib/action-state";
import { cn } from "@/lib/utils";

type SubmitButtonProps = ComponentProps<typeof Button> & { pendingLabel?: string };

export function SubmitButton({ children, pendingLabel, disabled, ...props }: SubmitButtonProps) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending || disabled} aria-busy={pending} {...props}>
      {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
      {pending ? (pendingLabel ?? "Please wait…") : children}
    </Button>
  );
}

export function FormAlert({ state, className }: { state: ActionState; className?: string }) {
  if (!state?.message) return null;
  return (
    <Alert
      variant={state.ok ? "default" : "destructive"}
      className={cn(state.ok && "border-success/40 bg-success-soft text-success", className)}
      role={state.ok ? "status" : "alert"}
    >
      {state.ok ? <CheckCircle2 className="size-4" aria-hidden /> : <AlertCircle className="size-4" aria-hidden />}
      <AlertDescription className={cn(state.ok && "text-success")}>{state.message}</AlertDescription>
    </Alert>
  );
}

export function FieldErrors({ id, errors }: { id: string; errors?: string[] }) {
  if (!errors?.length) return null;
  return (
    <ul id={id} className="mt-1 space-y-0.5 text-sm text-destructive">
      {errors.map((e) => (
        <li key={e}>{e}</li>
      ))}
    </ul>
  );
}

type TextFieldProps = Omit<ComponentProps<typeof Input>, "name"> & {
  name: string;
  label: string;
  hint?: ReactNode;
  state?: ActionState;
  isMultiline?: boolean;
  rows?: number;
};

/** Labelled input with hint and server-side field errors wired to aria-describedby. */
export function TextField({
  name,
  label,
  hint,
  state,
  isMultiline,
  rows = 4,
  className,
  required,
  ...props
}: TextFieldProps) {
  const errors = state?.fieldErrors?.[name];
  const errorId = `${name}-errors`;
  const hintId = `${name}-hint`;
  const describedBy = [hint ? hintId : null, errors?.length ? errorId : null].filter(Boolean).join(" ") || undefined;
  const common = {
    id: name,
    name,
    required,
    "aria-invalid": errors?.length ? true : undefined,
    "aria-describedby": describedBy,
  };
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label htmlFor={name}>
        {label}
        {required ? (
          <span className="text-brand" aria-hidden>
            {" "}
            *
          </span>
        ) : null}
      </Label>
      {isMultiline ? (
        <Textarea
          {...common}
          rows={rows}
          defaultValue={props.defaultValue as string | undefined}
          placeholder={props.placeholder}
          maxLength={props.maxLength}
        />
      ) : (
        <Input {...common} {...props} />
      )}
      {hint ? (
        <p id={hintId} className="text-xs text-muted-foreground">
          {hint}
        </p>
      ) : null}
      <FieldErrors id={errorId} errors={errors} />
    </div>
  );
}
