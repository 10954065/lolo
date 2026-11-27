"use client";

import { Eye, LogOut, Menu, ShieldCheck, UserRound, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import { BrandLogo } from "@/components/brand/brand-logo";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { logoutAction } from "@/server/actions/auth";
import { AREA_LABEL, NAV, type NavItem, type ShellArea } from "./nav-config";

type AppShellProps = {
  area: ShellArea;
  userName: string;
  userEmail: string;
  children: ReactNode;
};

const HOME: Record<ShellArea, string> = { admin: "/admin", committee: "/committee", voter: "/dashboard" };

function isActive(pathname: string, item: NavItem): boolean {
  if (item.isExact) return pathname === item.href;
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
}

function NavLinks({ area, onNavigate }: { area: ShellArea; onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav aria-label={`${AREA_LABEL[area]} navigation`} className="space-y-6">
      {NAV[area].map((section, i) => (
        <div key={section.title ?? i} className="space-y-1">
          {section.title ? (
            <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-white/60">{section.title}</p>
          ) : null}
          {section.items.map((item) => {
            const isCurrent = isActive(pathname, item);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onNavigate}
                aria-current={isCurrent ? "page" : undefined}
                className={cn(
                  "group relative flex min-h-11 items-center gap-3 rounded-lg px-3 text-[0.95rem] font-medium transition-colors lg:min-h-10 lg:text-sm",
                  isCurrent
                    ? "bg-white/15 text-white shadow-[inset_0_0_0_1px_oklch(1_0_0/12%)]"
                    : "text-sidebar-foreground/85 hover:bg-white/10 hover:text-white",
                )}
              >
                {isCurrent ? <span className="absolute inset-y-2 left-0 w-1 rounded-r-full bg-white" aria-hidden /> : null}
                <Icon className={cn("size-[18px] shrink-0", isCurrent ? "text-white" : "text-sidebar-foreground/70")} aria-hidden />
                {item.label}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}

function SidebarBody({
  area,
  userName,
  userEmail,
  onNavigate,
  onClose,
}: {
  area: ShellArea;
  userName: string;
  userEmail: string;
  onNavigate?: () => void;
  onClose?: () => void;
}) {
  return (
    <div className="flex h-full flex-col bg-linear-to-b from-sidebar to-brand-deep text-sidebar-foreground">
      <div className="h-1 bg-ink" aria-hidden />
      <div className="flex items-center justify-between gap-2 px-5 pb-6 pt-6">
        <Link href={HOME[area]} className="flex items-center gap-3" onClick={onNavigate}>
          <BrandLogo isInverted />
          <span className="flex flex-col leading-tight">
            <span className="text-sm font-semibold text-white">MOBA 2017</span>
            <span className="text-xs text-sidebar-foreground/60">Elections</span>
          </span>
        </Link>
        {onClose ? (
          <button
            type="button"
            onClick={onClose}
            className="flex size-10 items-center justify-center rounded-full text-white/80 hover:bg-white/10 hover:text-white"
            aria-label="Close menu"
          >
            <X className="size-5" aria-hidden />
          </button>
        ) : null}
      </div>
      <div className="px-5 pb-5">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] font-medium text-sidebar-foreground/80">
          <span className="size-1.5 rounded-full bg-white" aria-hidden />
          {AREA_LABEL[area]}
        </span>
      </div>
      <div className="flex-1 overflow-y-auto px-3">
        <NavLinks area={area} onNavigate={onNavigate} />
      </div>
      <div className="space-y-3 border-t border-white/10 p-4 pb-safe">
        <div className="flex items-center gap-3 rounded-xl bg-black/15 p-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-ink text-sm font-semibold text-white">
            {initialsOf(userName)}
          </span>
          <span className="min-w-0 flex-1 leading-tight">
            <span className="block truncate text-sm font-medium text-white">{userName}</span>
            <span className="block truncate text-xs text-sidebar-foreground/60">{userEmail}</span>
          </span>
          <form action={logoutAction}>
            <button
              type="submit"
              className="flex size-9 items-center justify-center rounded-lg text-sidebar-foreground/70 hover:bg-white/10 hover:text-white"
              aria-label="Sign out"
            >
              <LogOut className="size-4" aria-hidden />
            </button>
          </form>
        </div>
        <p className="flex items-start gap-2 px-1 text-[11px] leading-snug text-sidebar-foreground/50">
          <ShieldCheck className="mt-px size-3.5 shrink-0 text-white/70" aria-hidden />
          Secret ballot protected. No one can see how any member voted.
        </p>
        <p className="px-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-white/70">
          Dwen Hwɛ Kan <span className="font-normal normal-case tracking-normal text-white/50">· Think and look ahead</span>
        </p>
      </div>
    </div>
  );
}

function BottomTabs({ area, onMore }: { area: ShellArea; onMore: () => void }) {
  const pathname = usePathname();
  const items = NAV[area].flatMap((s) => s.items).filter((i) => i.tab);
  const hasMore = NAV[area].flatMap((s) => s.items).length > items.length;
  const columns = items.length + (hasMore ? 1 : 0);
  const tabClass = "relative flex flex-col items-center justify-center gap-1 pt-2 pb-1.5 text-[11px] font-medium";

  return (
    <nav
      aria-label="Quick navigation"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-white/10 bg-brand pb-safe shadow-[0_-8px_24px_-12px_oklch(0.16_0.01_25/45%)] lg:hidden"
    >
      <div className="mx-auto grid max-w-lg" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
        {items.map((item) => {
          const isCurrent = isActive(pathname, item);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isCurrent ? "page" : undefined}
              className={cn(tabClass, isCurrent ? "text-white" : "text-white/70")}
            >
              {isCurrent ? <span className="absolute top-0 h-0.5 w-8 rounded-b-full bg-white" aria-hidden /> : null}
              <span className={cn("flex h-7 w-12 items-center justify-center rounded-full transition-colors", isCurrent && "bg-white/20")}>
                <Icon className="size-5" aria-hidden />
              </span>
              {item.tab}
            </Link>
          );
        })}
        {hasMore ? (
          <button type="button" onClick={onMore} className={cn(tabClass, "text-white/70")}>
            <span className="flex h-7 w-12 items-center justify-center rounded-full">
              <Menu className="size-5" aria-hidden />
            </span>
            More
          </button>
        ) : null}
      </div>
    </nav>
  );
}

export function AppShell({ area, userName, userEmail, children }: AppShellProps) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const pathname = usePathname();
  const isReadOnly = area === "committee";
  // The ballot is a focused flow with its own sticky submit bar, so the tab bar steps aside.
  const showTabs = !pathname.endsWith("/ballot");
  const closeMenu = () => setIsMenuOpen(false);

  return (
    <div className="flex min-h-dvh flex-1">
      <aside className="sticky top-0 hidden h-dvh w-72 shrink-0 lg:block">
        <SidebarBody area={area} userName={userName} userEmail={userEmail} />
      </aside>

      <Sheet open={isMenuOpen} onOpenChange={setIsMenuOpen}>
        <SheetContent side="left" showCloseButton={false} className="w-[86vw] max-w-80 border-0 p-0">
          <SheetHeader className="sr-only">
            <SheetTitle>Menu</SheetTitle>
            <SheetDescription>All sections of the {AREA_LABEL[area]} area.</SheetDescription>
          </SheetHeader>
          <SidebarBody area={area} userName={userName} userEmail={userEmail} onNavigate={closeMenu} onClose={closeMenu} />
        </SheetContent>
      </Sheet>

      <div className={cn("flex min-w-0 flex-1 flex-col", showTabs && "pb-[calc(4.25rem+env(safe-area-inset-bottom))] lg:pb-0")}>
        {isReadOnly ? (
          <div
            role="status"
            className="flex items-center justify-center gap-2 border-b border-warning/30 bg-warning-soft px-4 py-2 text-center text-xs font-semibold text-warning sm:text-sm"
          >
            <Eye className="size-4 shrink-0" aria-hidden />
            <span>
              READ-ONLY ACCESS<span className="hidden sm:inline">: Electoral Committee observers can view but cannot change anything.</span>
            </span>
          </div>
        ) : null}

        <header className="sticky top-0 z-30 border-b border-white/10 bg-brand text-white shadow-[0_8px_24px_-16px_oklch(0.16_0.01_25/60%)]">
          <div className="flex h-14 items-center gap-2 px-3 sm:px-6 lg:h-16 lg:px-8">
            <Button variant="ghost" size="icon" className="text-white hover:bg-white/10 hover:text-white lg:hidden" aria-label="Open navigation menu" onClick={() => setIsMenuOpen(true)}>
              <Menu className="size-5" />
            </Button>
            <Link href={HOME[area]} className="flex items-center gap-2 lg:hidden" aria-label="Home">
              <BrandLogo isInverted className="[&>span:first-child]:text-xl" />
              <span className="hidden text-sm font-semibold text-white min-[380px]:inline">2017 Elections</span>
            </Link>
            <p className="hidden text-sm font-medium text-white/80 lg:block">{AREA_LABEL[area]}</p>
            <div className="ml-auto">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" className="h-10 gap-2 rounded-full pl-1 pr-1 text-white hover:bg-white/10 hover:text-white aria-expanded:bg-white/10 aria-expanded:text-white sm:pr-3" aria-label="Account menu">
                    <span className="flex size-8 items-center justify-center rounded-full bg-ink text-xs font-semibold text-white">
                      {initialsOf(userName) || <UserRound className="size-4" aria-hidden />}
                    </span>
                    <span className="hidden max-w-48 truncate text-sm font-medium sm:inline">{userName}</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-64">
                  <DropdownMenuLabel className="space-y-0.5">
                    <p className="truncate font-medium">{userName}</p>
                    <p className="truncate text-xs font-normal text-muted-foreground">{userEmail}</p>
                    <p className="text-xs font-normal text-muted-foreground">{AREA_LABEL[area]}</p>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild>
                    <Link href="/change-password">Change password</Link>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <form action={logoutAction}>
                    <DropdownMenuItem asChild>
                      <button type="submit" className="w-full">
                        <LogOut className="size-4" aria-hidden /> Sign out
                      </button>
                    </DropdownMenuItem>
                  </form>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </header>

        <main id="main-content" className="mx-auto w-full max-w-7xl flex-1 px-4 py-5 sm:px-6 sm:py-6 lg:px-8 lg:py-8">
          {children}
        </main>
        <footer className="hidden border-t px-4 py-4 text-center text-xs text-muted-foreground sm:block sm:px-6">
          MOBA 2017 Digital Election Management System · Developed by Sunleon Router Enterprise
        </footer>
      </div>

      {showTabs ? <BottomTabs area={area} onMore={() => setIsMenuOpen(true)} /> : null}
    </div>
  );
}
