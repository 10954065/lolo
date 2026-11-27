"use client";

import { Eye, LogOut, Menu, UserRound } from "lucide-react";
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
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { logoutAction } from "@/server/actions/auth";
import { AREA_LABEL, NAV, type NavItem, type ShellArea } from "./nav-config";

type AppShellProps = {
  area: ShellArea;
  userName: string;
  userEmail: string;
  children: ReactNode;
};

function isActive(pathname: string, item: NavItem): boolean {
  if (item.isExact) return pathname === item.href;
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

function NavLinks({ area, onNavigate }: { area: ShellArea; onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav aria-label={`${AREA_LABEL[area]} navigation`} className="space-y-6">
      {NAV[area].map((section, i) => (
        <div key={section.title ?? i} className="space-y-1">
          {section.title ? (
            <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-sidebar-foreground/50">
              {section.title}
            </p>
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
                  "group relative flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  isCurrent
                    ? "bg-sidebar-accent text-white"
                    : "text-sidebar-foreground/80 hover:bg-sidebar-accent/60 hover:text-white",
                )}
              >
                {isCurrent ? <span className="absolute inset-y-1.5 left-0 w-1 rounded-full bg-brand" aria-hidden /> : null}
                <Icon className="size-4 shrink-0" aria-hidden />
                {item.label}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}

function SidebarBody({ area, onNavigate }: { area: ShellArea; onNavigate?: () => void }) {
  return (
    <div className="flex h-full flex-col gap-8 bg-sidebar px-4 py-6 text-sidebar-foreground">
      <Link href={`/${area === "voter" ? "dashboard" : area}`} className="flex items-center gap-3 px-2" onClick={onNavigate}>
        <BrandLogo isInverted />
        <span className="flex flex-col leading-tight">
          <span className="text-sm font-semibold text-white">MOBA 2017</span>
          <span className="text-xs text-sidebar-foreground/70">{AREA_LABEL[area]}</span>
        </span>
      </Link>
      <div className="flex-1 overflow-y-auto">
        <NavLinks area={area} onNavigate={onNavigate} />
      </div>
      <p className="px-2 text-[11px] leading-snug text-sidebar-foreground/50">
        Secret ballot protected. No one can see how any member voted.
      </p>
    </div>
  );
}

export function AppShell({ area, userName, userEmail, children }: AppShellProps) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const isReadOnly = area === "committee";

  return (
    <div className="flex min-h-dvh flex-1">
      <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 lg:block">
        <SidebarBody area={area} />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {isReadOnly ? (
          <div
            role="status"
            className="flex items-center justify-center gap-2 bg-warning-soft px-4 py-2 text-center text-sm font-semibold text-warning"
          >
            <Eye className="size-4" aria-hidden />
            READ-ONLY ACCESS: Electoral Committee observers can view but cannot change anything.
          </div>
        ) : null}

        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b bg-background/95 px-4 backdrop-blur sm:px-6">
          <Sheet open={isMenuOpen} onOpenChange={setIsMenuOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Open navigation menu">
                <Menu className="size-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-72 border-0 p-0">
              <SheetHeader className="sr-only">
                <SheetTitle>Navigation</SheetTitle>
              </SheetHeader>
              <SidebarBody area={area} onNavigate={() => setIsMenuOpen(false)} />
            </SheetContent>
          </Sheet>
          <span className="text-sm font-semibold text-navy lg:hidden">MOBA 2017 Elections</span>
          <div className="ml-auto">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="gap-2 px-2" aria-label="Account menu">
                  <span className="flex size-8 items-center justify-center rounded-full bg-brand-soft text-brand">
                    <UserRound className="size-4" aria-hidden />
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
        </header>

        <main id="main-content" className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          {children}
        </main>
        <footer className="border-t px-4 py-4 text-center text-xs text-muted-foreground sm:px-6">
          MOBA 2017 Digital Election Management System · Developed by Sunleon Router Enterprise
        </footer>
      </div>
    </div>
  );
}
