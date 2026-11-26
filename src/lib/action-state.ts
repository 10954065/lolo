/** Result shape returned by every Server Action used with useActionState. */
export type ActionState = {
  ok: boolean;
  message?: string;
  fieldErrors?: Record<string, string[]>;
  /** Set when the action needs the user to confirm their password first (step-up). */
  needsReauth?: boolean;
  data?: Record<string, string | number | boolean | null>;
} | null;

export const initialActionState: ActionState = null;
