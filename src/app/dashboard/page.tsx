import { ShieldCheck } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { requireRolePage } from "@/server/auth/guards";

export default async function VoterHomePage() {
  const { session } = await requireRolePage("VOTER");
  return (
    <>
      <PageHeader
        title={`Welcome, ${session.user.fullName.split(" ")[0]}`}
        description="This is your MOBA 2017 election dashboard."
      />
      <Card>
        <CardContent className="flex items-start gap-3 pt-6 text-sm">
          <ShieldCheck className="mt-0.5 size-5 shrink-0 text-success" aria-hidden />
          <p>
            Your account is active. When an election is announced you will see it here, together with the candidates and
            the official voting times.
          </p>
        </CardContent>
      </Card>
    </>
  );
}
