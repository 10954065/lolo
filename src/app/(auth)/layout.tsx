import { LockKeyhole, ShieldCheck, Vote } from "lucide-react";
import Link from "next/link";
import { BrandLogo } from "@/components/brand/brand-logo";

const PROMISES = [
  { icon: ShieldCheck, text: "Your ballot is secret. Nobody, including the administrators, can see how you voted." },
  { icon: Vote, text: "One member, one vote. Your ballot cannot be changed once submitted." },
  { icon: LockKeyhole, text: "Never share your password. Election officials will never ask for it." },
];

export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="grid min-h-dvh flex-1 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
      <aside className="relative hidden overflow-hidden bg-crest text-white lg:flex lg:flex-col lg:justify-between lg:p-12">
        <div className="absolute inset-y-0 right-0 w-1.5 bg-linear-to-b from-brand via-brand to-gold" aria-hidden />
        <Link href="/" className="w-fit">
          <BrandLogo variant="full" isInverted />
        </Link>
        <div className="max-w-md space-y-8">
          <h2 className="text-4xl font-bold leading-tight">MOBA 2017 executive elections</h2>
          <ul className="space-y-5 text-white/85">
            {PROMISES.map((p) => (
              <li key={p.text} className="flex gap-3">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-white/10">
                  <p.icon className="size-4 text-gold" aria-hidden />
                </span>
                <span className="pt-1.5 text-sm leading-relaxed">{p.text}</span>
              </li>
            ))}
          </ul>
        </div>
        <p className="text-xs text-white/55">Mfantsipim Old Boys Association · 2017 Year Group · Sunleon Router Enterprise</p>
      </aside>

      <main id="main-content" className="flex flex-col">
        <div className="bg-crest px-4 pb-20 pt-10 text-center text-white lg:hidden">
          <Link href="/" className="inline-block">
            <BrandLogo variant="full" isInverted />
          </Link>
          <p className="mt-3 text-sm text-white/75">2017 Year Group · Executive Elections</p>
        </div>
        <div className="-mt-12 flex flex-1 flex-col items-center px-4 pb-10 sm:px-8 lg:mt-0 lg:justify-center lg:py-10">
          <div className="w-full max-w-md [&>[data-slot=card]]:shadow-lift">{children}</div>
          <nav className="mt-8 flex gap-6 text-sm text-muted-foreground" aria-label="Help">
            <Link className="hover:text-foreground hover:underline" href="/guidelines">
              Voting guidelines
            </Link>
            <Link className="hover:text-foreground hover:underline" href="/help">
              Help &amp; support
            </Link>
          </nav>
        </div>
      </main>
    </div>
  );
}
