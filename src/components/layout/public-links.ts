import { BookOpenCheck, HelpCircle, Info, ReceiptText, UsersRound, Vote, type LucideIcon } from "lucide-react";

export type PublicLink = { href: string; label: string; hint: string; icon: LucideIcon };

/** Public pages, shared by the header menu (client) and the footer (server). */
export const PUBLIC_LINKS: PublicLink[] = [
  { href: "/elections", label: "Elections", hint: "Dates, status and results", icon: Vote },
  { href: "/candidates", label: "Candidates", hint: "Profiles and manifestos", icon: UsersRound },
  { href: "/guidelines", label: "Voting guidelines", hint: "How to vote, step by step", icon: BookOpenCheck },
  { href: "/verify-receipt", label: "Verify a receipt", hint: "Confirm your ballot was counted", icon: ReceiptText },
  { href: "/about", label: "About", hint: "MOBA 2017 and this platform", icon: Info },
  { href: "/help", label: "Help", hint: "Answers and support contacts", icon: HelpCircle },
];
