import { ArrowRight, CalendarClock, KeyRound, ListChecks, LockKeyhole, ShieldCheck, UserCheck, Vote } from "lucide-react";
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

const PROMISES = [
  { icon: LockKeyhole, text: "Secret ballot" },
  { icon: UserCheck, text: "One member, one vote" },
  { icon: ShieldCheck, text: "Independently audited" },
];

function Hero() {
  return (
    <section className="bg-crest text-white" aria-labelledby="hero-title">
      <div className="mx-auto grid w-full max-w-6xl items-center gap-10 px-4 pb-12 pt-10 sm:px-6 sm:pb-16 sm:pt-14 lg:grid-cols-[1.35fr_1fr] lg:pb-20 lg:pt-20">
        <div className="space-y-6">
          <p className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-white">
            <span className="size-1.5 rounded-full bg-white" aria-hidden /> Official election platform
          </p>
          <h1 id="hero-title" className="text-[2.15rem] font-bold leading-[1.1] sm:text-5xl lg:text-[3.4rem]">
            Your voice in the MOBA 2017 executive elections
          </h1>
          <p className="max-w-xl text-base leading-relaxed text-white/80 sm:text-lg">
            Secure, transparent elections for the 2017 year group of the Mfantsipim Old Boys Association. Vote from your phone in
            a few minutes.
          </p>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Button asChild size="lg" className="h-12 w-full bg-white text-base text-brand shadow-lift hover:bg-white/90 sm:w-auto">
              <Link href="/login">
                Sign in to vote <ArrowRight className="size-4" aria-hidden />
              </Link>
            </Button>
            <Button
              asChild
              size="lg"
              variant="outline"
              className="h-12 w-full border-white/25 bg-white/5 text-base text-white shadow-none hover:bg-white/10 hover:text-white sm:w-auto"
            >
              <Link href="/guidelines">How voting works</Link>
            </Button>
          </div>
          <ul className="flex flex-wrap gap-x-5 gap-y-2 pt-1 text-sm text-white/75">
            {PROMISES.map((p) => (
              <li key={p.text} className="flex items-center gap-2">
                <p.icon className="size-4 text-white" aria-hidden /> {p.text}
              </li>
            ))}
          </ul>
        </div>
        <div className="relative hidden lg:block" aria-hidden>
          <div className="absolute -inset-6 rounded-[2rem] bg-linear-to-br from-black/35 to-white/10 blur-2xl" />
          <div className="relative flex flex-col items-center gap-5 rounded-3xl border border-white/10 bg-white p-10 text-center shadow-lift">
            <BrandLogo variant="full" />
            <div className="h-px w-24 bg-linear-to-r from-transparent via-brand to-transparent" />
            <p className="text-sm font-medium text-ink">2017 Year Group · Executive Elections</p>
          </div>
        </div>
      </div>
    </section>
  );
}

export default async function HomePage() {
  const elections = (await publicElections()).slice(0, 3);
  const now = new Date();
  return (
    <PublicShell hero={<Hero />}>
      {elections.length ? (
        <section className="space-y-4" aria-labelledby="current">
          <div className="flex items-end justify-between gap-4">
            <h2 id="current" className="text-2xl font-semibold text-ink sm:text-3xl">
              Elections
            </h2>
            <Link href="/elections" className="inline-flex items-center gap-1 text-sm font-semibold text-brand hover:underline">
              View all <ArrowRight className="size-4" aria-hidden />
            </Link>
          </div>
          <ul className="grid gap-3 sm:gap-4 md:grid-cols-3">
            {elections.map((e) => (
              <li key={e.id}>
                <Link
                  href="/elections"
                  className="group flex h-full flex-col gap-3 rounded-xl border bg-card p-5 shadow-card transition-all hover:-translate-y-0.5 hover:border-brand/30 hover:shadow-lift"
                >
                  <StatusBadge status={effectiveStatus(e, now)} />
                  <p className="text-lg font-semibold leading-snug text-ink">{e.title}</p>
                  <p className="mt-auto flex items-center gap-1.5 text-sm text-muted-foreground">
                    <CalendarClock className="size-4 shrink-0" aria-hidden /> Opens {formatDateTime(e.opensAt)}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className={elections.length ? "mt-12 space-y-5 sm:mt-16" : "space-y-5"} aria-labelledby="steps">
        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand">Four simple steps</p>
          <h2 id="steps" className="text-2xl font-semibold text-ink sm:text-3xl">
            How it works
          </h2>
        </div>
        <ol className="grid gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-4">
          {STEPS.map((s, i) => (
            <li key={s.title} className="relative flex gap-4 overflow-hidden rounded-xl border bg-card p-5 shadow-card sm:flex-col sm:gap-3">
              <span
                className="pointer-events-none absolute -right-2 -top-4 font-[family-name:var(--font-display)] text-7xl font-bold text-secondary"
                aria-hidden
              >
                {i + 1}
              </span>
              <span className="relative flex size-11 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-brand">
                <s.icon className="size-5" aria-hidden />
              </span>
              <div className="relative">
                <p className="font-semibold text-ink">
                  <span className="sr-only">Step {i + 1}: </span>
                  {s.title}
                </p>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{s.text}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="mt-12 overflow-hidden rounded-2xl border bg-card shadow-card sm:mt-16">
        <div className="flex flex-col gap-5 p-6 sm:flex-row sm:items-center sm:justify-between sm:p-8">
          <div className="flex items-start gap-4">
            <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-success-soft text-success">
              <ShieldCheck className="size-6" aria-hidden />
            </span>
            <div className="space-y-1">
              <h2 className="text-xl font-semibold text-ink">Your vote is secret</h2>
              <p className="max-w-xl text-sm leading-relaxed text-muted-foreground">
                Ballots are stored separately from member records, and nobody, including administrators, can see how you voted.
                After voting you can check your receipt at any time.
              </p>
            </div>
          </div>
          <Button asChild variant="outline" size="lg" className="w-full sm:w-auto">
            <Link href="/verify-receipt">Verify a receipt</Link>
          </Button>
        </div>
      </section>
    </PublicShell>
  );
}
