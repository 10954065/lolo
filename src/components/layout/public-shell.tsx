import Link from "next/link";
import type { ReactNode } from "react";
import { BrandLockup } from "@/components/brand/brand-logo";
import { Button } from "@/components/ui/button";

const LINKS = [
  { href: "/elections", label: "Elections" },
  { href: "/candidates", label: "Candidates" },
  { href: "/guidelines", label: "Voting guidelines" },
  { href: "/about", label: "About" },
  { href: "/help", label: "Help" },
];

/** Header and footer for public pages. */
export function PublicShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-1 flex-col">
      <header className="border-b bg-background">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <Link href="/" aria-label="MOBA 2017 Elections home">
            <BrandLockup />
          </Link>
          <nav aria-label="Main" className="order-3 flex w-full gap-4 overflow-x-auto text-sm sm:order-none sm:w-auto">
            {LINKS.map((l) => (
              <Link key={l.href} href={l.href} className="whitespace-nowrap text-muted-foreground hover:text-brand">
                {l.label}
              </Link>
            ))}
          </nav>
          <Button asChild size="sm">
            <Link href="/login">Member sign in</Link>
          </Button>
        </div>
      </header>
      <main id="main-content" className="mx-auto w-full max-w-6xl flex-1 px-4 py-10">
        {children}
      </main>
      <footer className="border-t bg-navy text-white/80">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-2 px-4 py-6 text-sm sm:flex-row sm:justify-between">
          <p>MOBA 2017, Mfantsipim Old Boys Association, 2017 Year Group</p>
          <p>
            <Link href="/verify-receipt" className="underline-offset-2 hover:underline">
              Verify a ballot receipt
            </Link>{" "}
            · Developed by Sunleon Router Enterprise
          </p>
        </div>
      </footer>
    </div>
  );
}
