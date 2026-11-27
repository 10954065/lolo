import {
  FileSpreadsheet,
  KeyRound,
  LayoutDashboard,
  Mail,
  ScrollText,
  Settings,
  UserCog,
  Users,
  Vote,
  type LucideIcon,
} from "lucide-react";

export type ShellArea = "admin" | "committee" | "voter";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Only highlight on an exact path match (area roots and sibling-prefixed routes). */
  isExact?: boolean;
  /** Shown in the phone bottom tab bar, under this short label. Everything else lives under "More". */
  tab?: string;
}

export interface NavSection {
  title?: string;
  items: NavItem[];
}

export const NAV: Record<ShellArea, NavSection[]> = {
  admin: [
    {
      items: [
        { href: "/admin", label: "Overview", icon: LayoutDashboard, isExact: true, tab: "Home" },
        { href: "/admin/elections", label: "Elections", icon: Vote, tab: "Elections" },
      ],
    },
    {
      title: "Members",
      items: [
        { href: "/admin/members", label: "Members", icon: Users, isExact: true, tab: "Members" },
        { href: "/admin/members/import", label: "Bulk registration", icon: FileSpreadsheet },
        { href: "/admin/credentials", label: "Credentials", icon: KeyRound },
        { href: "/admin/emails", label: "Email delivery", icon: Mail },
      ],
    },
    {
      title: "Administration",
      items: [
        { href: "/admin/reports", label: "Reports", icon: FileSpreadsheet },
        { href: "/admin/audit", label: "Audit log", icon: ScrollText },
        { href: "/admin/accounts", label: "Staff accounts", icon: UserCog },
        { href: "/admin/settings", label: "Settings", icon: Settings },
      ],
    },
  ],
  committee: [
    {
      items: [
        { href: "/committee", label: "Overview", icon: LayoutDashboard, isExact: true, tab: "Home" },
        { href: "/committee/elections", label: "Elections", icon: Vote, tab: "Elections" },
      ],
    },
    {
      title: "Records",
      items: [
        { href: "/committee/members", label: "Member records", icon: Users },
        { href: "/committee/emails", label: "Email delivery", icon: Mail },
        { href: "/committee/reports", label: "Reports", icon: FileSpreadsheet },
        { href: "/committee/audit", label: "Audit log", icon: ScrollText, tab: "Audit" },
      ],
    },
  ],
  voter: [
    {
      items: [
        { href: "/dashboard", label: "My elections", icon: LayoutDashboard, isExact: true, tab: "Elections" },
        { href: "/dashboard/profile", label: "My profile", icon: UserCog, tab: "Profile" },
        { href: "/verify-receipt", label: "Verify a receipt", icon: ScrollText, tab: "Verify" },
      ],
    },
  ],
};

export const AREA_LABEL: Record<ShellArea, string> = {
  admin: "System Administrator",
  committee: "Electoral Committee",
  voter: "Member",
};
