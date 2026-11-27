"use client";

import { ChevronRight, LogIn, Menu, ShieldCheck, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { BrandLogo } from "@/components/brand/brand-logo";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { PUBLIC_LINKS } from "./public-links";

const isCurrent = (pathname: string, href: string) => pathname === href || pathname.startsWith(`${href}/`);

/** Inline links on desktops; a navy side panel on phones and tablets. */
export function PublicNav() {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);
  const close = () => setIsOpen(false);

  return (
    <>
      <nav aria-label="Main" className="hidden items-center gap-1 lg:flex">
        {PUBLIC_LINKS.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            aria-current={isCurrent(pathname, l.href) ? "page" : undefined}
            className={cn(
              "rounded-full px-3 py-1.5 text-sm font-medium transition-colors",
              isCurrent(pathname, l.href) ? "bg-brand-soft text-brand" : "text-muted-foreground hover:bg-secondary hover:text-navy",
            )}
          >
            {l.label}
          </Link>
        ))}
      </nav>

      <Button
        variant="outline"
        className="h-10 gap-2 rounded-full px-3.5 lg:hidden"
        aria-label="Open menu"
        onClick={() => setIsOpen(true)}
      >
        <Menu className="size-4" aria-hidden />
        <span className="text-sm font-semibold">Menu</span>
      </Button>

      <Sheet open={isOpen} onOpenChange={setIsOpen}>
        <SheetContent
          side="left"
          showCloseButton={false}
          className="w-[88vw] max-w-sm gap-0 border-0 bg-linear-to-b from-sidebar to-navy-deep p-0 text-sidebar-foreground"
        >
          <SheetHeader className="sr-only">
            <SheetTitle>Menu</SheetTitle>
            <SheetDescription>Public pages of the MOBA 2017 election platform.</SheetDescription>
          </SheetHeader>
          <div className="h-1 bg-linear-to-r from-brand via-brand to-gold" aria-hidden />
          <div className="flex items-center justify-between px-5 pb-4 pt-5">
            <Link href="/" onClick={close} className="flex items-center gap-3">
              <BrandLogo isInverted />
              <span className="flex flex-col leading-tight">
                <span className="text-sm font-semibold text-white">MOBA 2017</span>
                <span className="text-xs text-sidebar-foreground/60">Elections</span>
              </span>
            </Link>
            <button
              type="button"
              onClick={close}
              className="flex size-10 items-center justify-center rounded-full text-white/80 hover:bg-white/10 hover:text-white"
              aria-label="Close menu"
            >
              <X className="size-5" aria-hidden />
            </button>
          </div>

          <p className="px-6 pb-2 pt-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-gold/80">Explore</p>
          <nav aria-label="Main" className="flex-1 space-y-1 overflow-y-auto px-3">
            {PUBLIC_LINKS.map((l) => {
              const isActive = isCurrent(pathname, l.href);
              const Icon = l.icon;
              return (
                <Link
                  key={l.href}
                  href={l.href}
                  onClick={close}
                  aria-current={isActive ? "page" : undefined}
                  className={cn(
                    "group relative flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors",
                    isActive ? "bg-white/10 shadow-[inset_0_0_0_1px_oklch(1_0_0/8%)]" : "hover:bg-white/5",
                  )}
                >
                  {isActive ? <span className="absolute inset-y-2.5 left-0 w-1 rounded-r-full bg-brand" aria-hidden /> : null}
                  <span
                    className={cn(
                      "flex size-10 shrink-0 items-center justify-center rounded-lg",
                      isActive ? "bg-brand text-white" : "bg-white/5 text-gold",
                    )}
                  >
                    <Icon className="size-[18px]" aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1 leading-tight">
                    <span className="block text-[0.95rem] font-medium text-white">{l.label}</span>
                    <span className="block truncate text-xs text-sidebar-foreground/60">{l.hint}</span>
                  </span>
                  <ChevronRight className="size-4 text-white/30 transition-transform group-hover:translate-x-0.5" aria-hidden />
                </Link>
              );
            })}
          </nav>

          <div className="space-y-3 border-t border-white/10 p-4 pb-safe">
            <Button asChild size="lg" className="w-full">
              <Link href="/login" onClick={close}>
                <LogIn className="size-4" aria-hidden /> Member sign in
              </Link>
            </Button>
            <p className="flex items-start gap-2 px-1 text-[11px] leading-snug text-sidebar-foreground/55">
              <ShieldCheck className="mt-px size-3.5 shrink-0 text-gold/70" aria-hidden />
              Your vote is secret. No one can see how any member voted.
            </p>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
