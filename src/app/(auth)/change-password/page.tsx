import type { Metadata } from "next";
import { KeyRound } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { logoutAction } from "@/server/actions/auth";
import { requireSessionPage } from "@/server/auth/guards";
import { ChangePasswordForm } from "./change-password-form";

export const metadata: Metadata = { title: "Change password" };

export default async function ChangePasswordPage() {
  const { session } = await requireSessionPage();
  const isForced = session.user.mustChangePassword;

  return (
    <Card className="shadow-sm">
      <CardHeader>
        <CardTitle className="text-2xl text-navy">{isForced ? "Choose your own password" : "Change password"}</CardTitle>
        <CardDescription>Signed in as {session.user.email}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {isForced ? (
          <Alert>
            <KeyRound className="size-4" aria-hidden />
            <AlertTitle>One more step</AlertTitle>
            <AlertDescription>
              You signed in with a temporary password. Choose a private password of at least 10 characters before
              continuing. Every other signed-in device will be signed out.
            </AlertDescription>
          </Alert>
        ) : null}
        <ChangePasswordForm isForced={isForced} />
        <form action={logoutAction} className="text-center">
          <button type="submit" className="text-sm text-muted-foreground hover:text-foreground hover:underline">
            Sign out instead
          </button>
        </form>
      </CardContent>
    </Card>
  );
}
