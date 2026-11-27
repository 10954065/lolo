import { asc, eq } from "drizzle-orm";
import { formatDateTime } from "@/lib/datetime";
import { requireActiveAction } from "@/server/auth/guards";
import { can } from "@/server/auth/permissions";
import { getCurrentSession } from "@/server/auth/session";
import { getDb } from "@/server/db/client";
import { candidates, executivePositions } from "@/server/db/schema";
import { forbidden, notFound } from "@/server/errors";
import { handleRoute } from "@/server/http";
import { csvResponse, toCsv } from "@/server/reports/csv";
import { buildPdfReport, pdfResponse } from "@/server/reports/pdf";
import { audit } from "@/server/services/audit";
import {
  canViewPublishedResults,
  computeResults,
  getElectionOr404,
  publishedSnapshot,
  TALLY_STATUSES,
  type ResultsSnapshot,
} from "@/server/services/results";
import { exportVoterRoll } from "@/server/services/voter-roll";

const REPORTS = ["results.csv", "results.pdf", "participation.csv", "participation.pdf", "candidates.csv"] as const;
type Report = (typeof REPORTS)[number];

function resultsCsv(s: ResultsSnapshot): string {
  const rows: unknown[][] = [];
  for (const p of s.positions) {
    for (const c of p.candidates) {
      rows.push([p.title, c.fullName, c.status, c.votes, c.percent, c.isWinner ? "Elected" : c.isTied ? "Tied" : ""]);
    }
    rows.push([p.title, "(Abstentions)", "", p.abstentions, p.abstentionPercent, ""]);
  }
  rows.push([], ["Eligible voters", s.eligibleVoters], ["Ballots cast", s.ballotsCast], ["Turnout %", s.turnoutPercent], ["Invalid ballots", 0]);
  return toCsv(["Position", "Candidate", "Status", "Votes", "Percent of ballots", "Outcome"], rows);
}

async function resultsPdf(s: ResultsSnapshot, label: string): Promise<Uint8Array> {
  return buildPdfReport(`Results - ${s.electionTitle}`, `${label}. Voting ${formatDateTime(s.opensAt)} to ${formatDateTime(s.closesAt)}.`, [
    {
      heading: "Summary",
      paragraphs: [
        `Eligible voters: ${s.eligibleVoters}. Ballots cast: ${s.ballotsCast}. Turnout: ${s.turnoutPercent}%. Invalid ballots: 0.`,
        s.isConsistent ? "Integrity check: ballots match participation records." : "INTEGRITY WARNING: ballots do not match participation records.",
      ],
    },
    ...s.positions.map((p) => ({
      heading: p.title + (p.hasTie ? " (TIE - not automatically resolved)" : ""),
      table: {
        headers: ["Candidate", "Votes", "%", "Outcome"],
        widths: [5, 1.2, 1.2, 1.6],
        rows: [
          ...p.candidates.map((c) => [
            c.fullName + (c.status === "WITHDRAWN" ? " (withdrawn)" : ""),
            String(c.votes),
            String(c.percent),
            c.isWinner ? "Elected" : c.isTied ? "Tied" : "",
          ]),
          ["Abstentions", String(p.abstentions), String(p.abstentionPercent), ""],
        ],
      },
      paragraphs: p.hasTie ? [`Tie-break procedure: ${s.tieBreakProcedure}`] : [],
    })),
    { paragraphs: ["Computed from anonymous ballots only. No ballot can be linked to a member."] },
  ]);
}

/** Election reports. Participation reports show WHO voted and WHEN — never choices. */
export async function GET(_request: Request, ctx: RouteContext<"/api/exports/elections/[id]/[report]">): Promise<Response> {
  return handleRoute("electionReport", async () => {
    const { id, report: raw } = await ctx.params;
    if (!(REPORTS as readonly string[]).includes(raw)) throw notFound("Unknown report.");
    const report = raw as Report;
    const election = await getElectionOr404(id);
    const slug = election.title.replace(/[^a-z0-9]+/gi, "-").toLowerCase();

    if (report.startsWith("results")) {
      const session = await getCurrentSession();
      let snapshot: ResultsSnapshot;
      let label: string;
      if (session && can({ role: session.user.role }, "results.read.unpublished") && (TALLY_STATUSES as readonly string[]).includes(election.status)) {
        const published = await publishedSnapshot(id);
        snapshot = published?.snapshot ?? (await computeResults(getDb(), election));
        label = published ? `Official results published ${formatDateTime(published.publishedAt)}` : "PROVISIONAL - NOT PUBLISHED";
      } else {
        const published = await publishedSnapshot(id);
        if (!published || !(await canViewPublishedResults(session, election))) throw forbidden("Results are not available.");
        snapshot = published.snapshot;
        label = `Official results published ${formatDateTime(published.publishedAt)}`;
      }
      if (session) {
        await audit(
          { userId: session.user.id, role: session.user.role, label: `${session.user.fullName} <${session.user.email}>` },
          { action: "REPORT_EXPORTED", resourceType: "report", resourceId: `${id}:${report}`, summary: `Exported ${report} for “${election.title}”` },
        );
      }
      return report === "results.csv"
        ? csvResponse(`${slug}-results.csv`, resultsCsv(snapshot))
        : pdfResponse(`${slug}-results.pdf`, await resultsPdf(snapshot, label));
    }

    const { actor } = await requireActiveAction();
    if (!can(actor, "reports.export")) throw forbidden();
    await audit(actor, { action: "REPORT_EXPORTED", resourceType: "report", resourceId: `${id}:${report}`, summary: `Exported ${report} for “${election.title}”` });

    if (report === "candidates.csv") {
      const rows = await getDb()
        .select({ position: executivePositions.title, c: candidates })
        .from(candidates)
        .innerJoin(executivePositions, eq(executivePositions.id, candidates.positionId))
        .where(eq(candidates.electionId, id))
        .orderBy(asc(executivePositions.displayOrder), asc(candidates.fullName));
      return csvResponse(
        `${slug}-candidates.csv`,
        toCsv(
          ["Position", "Candidate", "Membership no.", "Status", "Reason", "Registered (UTC)", "Decided (UTC)"],
          rows.map((r) => [r.position, r.c.fullName, r.c.membershipNumber, r.c.status, r.c.statusReason, r.c.registeredAt, r.c.decidedAt]),
        ),
      );
    }

    const roll = await exportVoterRoll(id);
    const voted = roll.filter((r) => r.votedAt).length;
    if (report === "participation.csv") {
      return csvResponse(
        `${slug}-participation.csv`,
        toCsv(
          ["Member", "Email", "Membership no.", "Account", "Voted", "Voted at (UTC)"],
          roll.map((r) => [r.fullName, r.email, r.membershipNumber, r.accountStatus, r.votedAt ? "Yes" : "No", r.votedAt]),
        ),
      );
    }
    const pdf = await buildPdfReport(`Voter participation - ${election.title}`, `${voted} of ${roll.length} eligible members voted. Shows who voted and when - never how.`, [
      {
        table: {
          headers: ["Member", "Membership no.", "Voted at (GMT)"],
          widths: [4, 2, 3],
          rows: roll.map((r) => [r.fullName, r.membershipNumber ?? "", r.votedAt ? formatDateTime(r.votedAt) : "Not voted"]),
        },
      },
    ]);
    return pdfResponse(`${slug}-participation.pdf`, pdf);
  });
}
