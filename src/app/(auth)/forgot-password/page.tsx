import type { Metadata } from "next";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ForgotPasswordForm } from "./forgot-password-form";

export const metadata: Metadata = { title: "Forgot password" };

export default function ForgotPasswordPage() {
  return (
    <Card className="shadow-sm">
      <CardHeader>
        <CardTitle className="text-2xl text-ink">Forgot your password?</CardTitle>
        <CardDescription>
          Enter the email address you use to sign in. If it belongs to an active account, we will email you a link to
          choose a new password.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ForgotPasswordForm />
      </CardContent>
    </Card>
  );
}
