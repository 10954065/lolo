import type { Metadata } from "next";
import Link from "next/link";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { isResetTokenUsable } from "@/server/services/auth";
import { ResetPasswordForm } from "./reset-password-form";

export const metadata: Metadata = { title: "Choose a new password" };

export default async function ResetPasswordPage({ searchParams }: PageProps<"/reset-password">) {
  const params = await searchParams;
  const token = typeof params.token === "string" ? params.token : "";
  const isUsable = await isResetTokenUsable(token);

  return (
    <Card className="shadow-sm">
      <CardHeader>
        <CardTitle className="text-2xl text-navy">Choose a new password</CardTitle>
        <CardDescription>
          Use at least 10 characters. A short sentence is easy to remember and hard to guess.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isUsable ? (
          <ResetPasswordForm token={token} />
        ) : (
          <div className="space-y-4">
            <Alert variant="destructive" role="alert">
              <AlertDescription>This password reset link is invalid, already used, or has expired.</AlertDescription>
            </Alert>
            <Link href="/forgot-password" className="font-medium text-brand hover:underline">
              Request a new link
            </Link>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
