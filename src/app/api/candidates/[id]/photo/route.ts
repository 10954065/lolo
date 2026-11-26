import { areCandidatesPublic } from "@/lib/election-rules";
import { can } from "@/server/auth/permissions";
import { getCurrentSession } from "@/server/auth/session";
import { getCandidatePhoto } from "@/server/services/candidates";
import { getElection } from "@/server/services/elections";

/**
 * Candidate photographs. Public once the ballot is final (approved/withdrawn candidates of a
 * scheduled-or-later election); otherwise only staff may see them.
 */
export async function GET(request: Request, ctx: RouteContext<"/api/candidates/[id]/photo">): Promise<Response> {
  const { id } = await ctx.params;
  const row = await getCandidatePhoto(id);
  if (!row) return new Response("Not found", { status: 404 });
  const election = await getElection(row.electionId);
  const isPublic = Boolean(election && areCandidatesPublic(election.status) && ["APPROVED", "WITHDRAWN"].includes(row.status));
  if (!isPublic) {
    const session = await getCurrentSession();
    if (!session || !can({ role: session.user.role }, "elections.read")) return new Response("Not found", { status: 404 });
  }
  const etag = `"${row.photo.sha256}"`;
  const cacheControl = isPublic ? "public, max-age=300, stale-while-revalidate=3600" : "private, no-store";
  if (request.headers.get("if-none-match") === etag) {
    return new Response(null, { status: 304, headers: { ETag: etag, "Cache-Control": cacheControl } });
  }
  return new Response(new Uint8Array(row.photo.data), {
    headers: {
      "Content-Type": row.photo.mimeType,
      "Content-Length": String(row.photo.data.length),
      "Cache-Control": cacheControl,
      ETag: etag,
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
    },
  });
}
