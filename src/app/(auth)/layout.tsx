import { LockKeyhole, ShieldCheck, Vote } from "lucide-react";
import Link from "next/link";
import { BrandLogo } from "@/components/brand/brand-logo";

export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="grid min-h-dvh flex-1 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
      <aside className="relative hidden overflow-hidden bg-navy text-white lg:flex lg:flex-col lg:justify-between lg:p-12">
        <div className="absolute inset-y-0 right-0 w-1.5 bg-brand" aria-hidden />
        <Link href="/" className="w-fit">
          <BrandLogo variant="full" isInverted />
        </Link>
        <div className="max-w-md space-y-6">
          <h2 className="text-3xl font-semibold leading-tight">MOBA 2017 Digital Election Management System</h2>
          <ul className="space-y-4 text-white/85">
            <li className="flex gap-3">
              <ShieldCheck className="mt-0.5 size-5 shrink-0 text-brand-soft" aria-hidden />
              Your ballot is secret. Nobody, including the administrators, can see how you voted.
            </li>
            <li className="flex gap-3">
              <Vote className="mt-0.5 size-5 shrink-0 text-brand-soft" aria-hidden />
              One member, one vote. Your ballot cannot be changed once submitted.
            </li>
            <li className="flex gap-3">
              <LockKeyhole className="mt-0.5 size-5 shrink-0 text-brand-soft" aria-hidden />
              Never share your password. Election officials will never ask for it.
            </li>
          </ul>
        </div>
        <p className="text-xs text-white/60">
          Mfantsipim Old Boys Association · 2017 Year Group · Sunleon Router Enterprise
        </p>
      </aside>
      <main id="main-content" className="flex flex-col items-center justify-center px-4 py-10 sm:px-8">
        <div className="mb-8 lg:hidden">
          <Link href="/">
            <BrandLogo variant="full" />
          </Link>
        </div>
        <div className="w-full max-w-md">{children}</div>
        <nav className="mt-8 flex gap-4 text-sm text-muted-foreground" aria-label="Help">
          <Link className="hover:text-foreground hover:underline" href="/guidelines">
            Voting guidelines
          </Link>
          <Link className="hover:text-foreground hover:underline" href="/help">
            Help &amp; support
          </Link>
        </nav>
      </main>
    </div>
  );
}
