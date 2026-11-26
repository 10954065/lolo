"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export function ElectionTabs({ basePath, tabs }: { basePath: string; tabs: Array<{ segment: string; label: string }> }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Election sections" className="-mx-1 mb-6 flex gap-1 overflow-x-auto border-b">
      {tabs.map((t) => {
        const href = t.segment ? `${basePath}/${t.segment}` : basePath;
        const isActive = t.segment ? pathname.startsWith(href) : pathname === basePath;
        return (
          <Link
            key={t.segment}
            href={href}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium transition-colors",
              isActive ? "border-brand text-brand" : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
