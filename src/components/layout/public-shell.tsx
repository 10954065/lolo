import { ShieldCheck } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { BrandLockup } from "@/components/brand/brand-logo";
import { Button } from "@/components/ui/button";
import { PUBLIC_LINKS } from "./public-links";
import { PublicNav } from "./public-nav";

type PublicShellProps = {
  children: ReactNode;
  /** Optional full-width band rendered between the header and the page content. */
  hero?: ReactNode;
};

/** Header and footer for public pages. */
export function PublicShell({ children, hero }: PublicShellProps) {
  return (
    <div className="flex min-h-dvh flex-1 flex-col">
      <header className="sticky top-0 z-30 border-b bg-background/85 backdrop-blur-md">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center gap-3 px-4 sm:px-6">
          <Link href="/" aria-label="MOBA 2017 Elections home" className="mr-auto">
            <BrandLockup />
          </Link>
          <PublicNav />
          <Button asChild className="hidden sm:inline-flex">
            <Link href="/login">Member sign in</Link>
          </Button>
        </div>
      </header>
      {hero}
      <main id="main-content" className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6 sm:py-12">
        {children}
      </main>
      <footer className="bg-crest text-white/80">
        <div className="h-1 bg-linear-to-r from-brand via-brand to-gold" aria-hidden />
        <div className="mx-auto grid w-full max-w-6xl gap-8 px-4 py-10 sm:grid-cols-[1.4fr_1fr] sm:px-6">
          <div className="space-y-3">
            <p className="font-[family-name:var(--font-display)] text-2xl font-semibold text-white">MOBA 2017</p>
            <p className="max-w-sm text-sm leading-relaxed">
              The official election platform of the 2017 year group of the Mfantsipim Old Boys Association.
            </p>
            <p className="flex items-center gap-2 text-sm text-white/70">
              <ShieldCheck className="size-4 text-gold" aria-hidden /> Secret ballot. One member, one vote.
            </p>
          </div>
          <nav aria-label="Footer" className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
            {PUBLIC_LINKS.map((l) => (
              <Link key={l.href} href={l.href} className="py-1 hover:text-white hover:underline underline-offset-4">
                {l.label}
              </Link>
            ))}
          </nav>
        </div>
        <div className="border-t border-white/10">
          <p className="mx-auto w-full max-w-6xl px-4 py-4 pb-safe text-xs text-white/55 sm:px-6">
            Mfantsipim Old Boys Association, 2017 Year Group · Developed by Sunleon Router Enterprise
          </p>
        </div>
      </footer>
    </div>
  );
}
