import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { homePathForRole } from "@/server/auth/permissions";
import { getCurrentSession } from "@/server/auth/session";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

const NOTICES: Record<string, string> = {
  signedOut: "You have been signed out.",
  reset: "Your password has been reset. Sign in with your new password.",
};

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const session = await getCurrentSession();
  if (session) redirect(session.user.mustChangePassword ? "/change-password" : homePathForRole(session.user.role));

  const params = await searchParams;
  const next = typeof params.next === "string" ? params.next.slice(0, 200) : "";
  const notice = Object.keys(NOTICES).find((k) => params[k] === "1");

  return (
    <Card className="shadow-sm">
      <CardHeader>
        <CardTitle className="text-2xl text-navy">Sign in</CardTitle>
        <CardDescription>Use the email address and password sent to you by the election administrator.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {notice ? (
          <Alert role="status">
            <AlertDescription>{NOTICES[notice]}</AlertDescription>
          </Alert>
        ) : null}
        <LoginForm next={next} />
      </CardContent>
    </Card>
  );
}
