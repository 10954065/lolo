"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

/** Section tabs: a swipeable pill strip on phones, an underlined bar on larger screens. */
export function ElectionTabs({ basePath, tabs }: { basePath: string; tabs: Array<{ segment: string; label: string }> }) {
  const pathname = usePathname();
  // Keep the active tab in view when the strip is wider than the screen.
  const revealIfActive = (el: HTMLAnchorElement | null) => {
    if (el?.getAttribute("aria-current") === "page") el.scrollIntoView({ block: "nearest", inline: "center" });
  };
  return (
    <nav aria-label="Election sections" className="no-scrollbar -mx-4 mb-6 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      <div className="flex w-max gap-2 sm:w-auto sm:gap-1 sm:border-b">
        {tabs.map((t) => {
          const href = t.segment ? `${basePath}/${t.segment}` : basePath;
          const isActive = t.segment ? pathname.startsWith(href) : pathname === basePath;
          return (
            <Link
              key={t.segment}
              href={href}
              ref={revealIfActive}
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "whitespace-nowrap text-sm font-medium transition-colors",
                "rounded-full border px-4 py-2 sm:-mb-px sm:rounded-none sm:border-0 sm:border-b-2 sm:px-3",
                isActive
                  ? "border-navy bg-navy text-white sm:border-brand sm:bg-transparent sm:text-brand"
                  : "border-border bg-card text-muted-foreground hover:text-navy sm:border-transparent sm:bg-transparent",
              )}
            >
              {t.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
