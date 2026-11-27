import { CalendarClock, KeyRound, ListChecks, ShieldCheck, UserCheck, Vote } from "lucide-react";
import Link from "next/link";
import { BrandLogo } from "@/components/brand/brand-logo";
import { PublicShell } from "@/components/layout/public-shell";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { formatDateTime } from "@/lib/datetime";
import { effectiveStatus } from "@/lib/election-rules";
import { publicElections } from "@/server/services/public";

const STEPS = [
  { icon: UserCheck, title: "Get approved", text: "MOBA 2017 verifies your membership and the administrator approves your registration." },
  { icon: KeyRound, title: "Receive your login", text: "Personal login details are emailed to you. Choose your own password at first sign-in." },
  { icon: ListChecks, title: "Review the candidates", text: "Read each candidate's biography and manifesto for every executive position." },
  { icon: Vote, title: "Cast one secret ballot", text: "Vote once during the official voting period. Your ballot cannot be changed." },
];

export default async function HomePage() {
  const elections = (await publicElections()).slice(0, 3);
  const now = new Date();
  return (
    <PublicShell>
      <section className="grid items-center gap-10 py-6 lg:grid-cols-[3fr_2fr]">
        <div className="space-y-6">
          <p className="text-sm font-semibold uppercase tracking-wider text-brand">Official election platform</p>
          <h1 className="text-4xl font-bold leading-tight text-navy sm:text-5xl">MOBA 2017 Digital Election Management System</h1>
          <p className="max-w-xl text-lg text-muted-foreground">
            Secure, transparent elections for the executives of the 2017 year group of the Mfantsipim Old Boys Association.
          </p>
          <div className="flex flex-wrap gap-3">
            <Button asChild size="lg">
              <Link href="/login">Sign in to vote</Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href="/guidelines">How voting works</Link>
            </Button>
          </div>
          <p className="flex items-start gap-2 text-sm text-muted-foreground">
            <ShieldCheck className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
            Your vote is secret. Ballots are stored separately from member records, and nobody, including administrators,
            can see how you voted.
          </p>
        </div>
        <div className="flex justify-center rounded-2xl border bg-card p-10 shadow-sm">
          <BrandLogo variant="full" />
        </div>
      </section>

      <section className="mt-12 space-y-4" aria-labelledby="steps">
        <h2 id="steps" className="text-2xl font-semibold text-navy">
          How it works
        </h2>
        <ol className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((s, i) => (
            <li key={s.title} className="rounded-xl border bg-card p-5">
              <s.icon className="size-6 text-brand" aria-hidden />
              <p className="mt-3 font-semibold text-navy">
                {i + 1}. {s.title}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">{s.text}</p>
            </li>
          ))}
        </ol>
      </section>

      {elections.length ? (
        <section className="mt-12 space-y-4" aria-labelledby="current">
          <h2 id="current" className="text-2xl font-semibold text-navy">
            Elections
          </h2>
          <ul className="grid gap-4 md:grid-cols-3">
            {elections.map((e) => (
              <li key={e.id} className="space-y-2 rounded-xl border bg-card p-5">
                <StatusBadge status={effectiveStatus(e, now)} />
                <p className="font-semibold text-navy">{e.title}</p>
                <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                  <CalendarClock className="size-4" aria-hidden /> {formatDateTime(e.opensAt)}
                </p>
              </li>
            ))}
          </ul>
          <Link href="/elections" className="text-sm font-medium text-brand hover:underline">
            All election information
          </Link>
        </section>
      ) : null}
    </PublicShell>
  );
}
