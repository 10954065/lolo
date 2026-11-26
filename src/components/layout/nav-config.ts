import {
  FileSpreadsheet,
  KeyRound,
  LayoutDashboard,
  Mail,
  ScrollText,
  Settings,
  UserCog,
  Users,
  type LucideIcon,
} from "lucide-react";

export type ShellArea = "admin" | "committee" | "voter";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Only highlight on an exact path match (area roots and sibling-prefixed routes). */
  isExact?: boolean;
}

export interface NavSection {
  title?: string;
  items: NavItem[];
}

export const NAV: Record<ShellArea, NavSection[]> = {
  admin: [
    { items: [{ href: "/admin", label: "Overview", icon: LayoutDashboard, isExact: true }] },
    {
      title: "Members",
      items: [
        { href: "/admin/members", label: "Members", icon: Users, isExact: true },
        { href: "/admin/members/import", label: "Bulk registration", icon: FileSpreadsheet },
        { href: "/admin/credentials", label: "Credentials", icon: KeyRound },
        { href: "/admin/emails", label: "Email delivery", icon: Mail },
      ],
    },
    {
      title: "Administration",
      items: [
        { href: "/admin/audit", label: "Audit log", icon: ScrollText },
        { href: "/admin/accounts", label: "Staff accounts", icon: UserCog },
        { href: "/admin/settings", label: "Settings", icon: Settings },
      ],
    },
  ],
  committee: [
    { items: [{ href: "/committee", label: "Overview", icon: LayoutDashboard, isExact: true }] },
    {
      title: "Records",
      items: [
        { href: "/committee/members", label: "Member records", icon: Users },
        { href: "/committee/emails", label: "Email delivery", icon: Mail },
        { href: "/committee/audit", label: "Audit log", icon: ScrollText },
      ],
    },
  ],
  voter: [{ items: [{ href: "/dashboard", label: "Home", icon: LayoutDashboard, isExact: true }] }],
};

export const AREA_LABEL: Record<ShellArea, string> = {
  admin: "System Administrator",
  committee: "Electoral Committee",
  voter: "Member",
};
