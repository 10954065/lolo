/**
 * Verifies the database-level security boundary the secret ballot relies on:
 * the application role cannot read ballot rows, cannot tally an open election,
 * and cannot rewrite the audit log or participation records.
 */
import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

let app: Client;
let owner: Client;
let electionId: string;

beforeAll(async () => {
  app = new Client({ connectionString: process.env.DATABASE_URL });
  owner = new Client({ connectionString: process.env.TEST_DATABASE_OWNER_URL });
  await Promise.all([app.connect(), owner.connect()]);
  const res = await app.query<{ id: string }>(
    `INSERT INTO elections (title, election_year, status, opens_at, closes_at)
     VALUES ('Security test', 2026, 'OPEN', now() - interval '1 hour', now() + interval '1 hour') RETURNING id`,
  );
  electionId = res.rows[0].id;
});

afterAll(async () => {
  await Promise.all([app.end(), owner.end()]);
});

describe("app role privileges on the anonymous ballot box", () => {
  it("connects as the restricted role, not the owner", async () => {
    const { rows } = await app.query<{ user: string }>("SELECT current_user AS user");
    expect(rows[0].user).toBe("moba_app");
  });

  it("can insert a ballot but cannot read, update or delete ballot rows", async () => {
    const ballotId = randomUUID();
    await app.query("INSERT INTO ballots (id, election_id, receipt_hash) VALUES ($1, $2, $3)", [
      ballotId,
      electionId,
      `hash-${ballotId}`,
    ]);
    await expect(app.query("SELECT * FROM ballots")).rejects.toThrow(/permission denied/);
    await expect(app.query("SELECT * FROM ballot_selections")).rejects.toThrow(/permission denied/);
    await expect(app.query("UPDATE ballots SET receipt_hash = 'x'")).rejects.toThrow(/permission denied/);
    await expect(app.query("DELETE FROM ballots")).rejects.toThrow(/permission denied/);
  });

  it("cannot read system columns (xmin/ctid) of ballot rows either", async () => {
    await expect(app.query("SELECT xmin, ctid FROM ballots")).rejects.toThrow(/permission denied/);
  });

  it("refuses to tally while the election is open", async () => {
    await expect(app.query("SELECT * FROM election_tally($1)", [electionId])).rejects.toThrow(
      /tally is unavailable while the election is OPEN/,
    );
  });

  it("refuses to mix ballots before the election is closed", async () => {
    await expect(app.query("SELECT mix_ballots($1)", [electionId])).rejects.toThrow(/only be mixed after/);
  });

  it("can count ballots (turnout) without seeing choices", async () => {
    const { rows } = await app.query<{ n: string }>("SELECT election_ballot_count($1) AS n", [electionId]);
    expect(Number(rows[0].n)).toBe(1);
  });
});

describe("append-only records", () => {
  it("rejects UPDATE and DELETE on audit_logs even for the owner (trigger)", async () => {
    await owner.query(
      `INSERT INTO audit_logs (occurred_at, actor_label, action, resource_type, summary, prev_hash, hash)
       VALUES (now(), 'test', 'TEST', 'test', 'x', 'genesis', $1)`,
      [`h-${randomUUID()}`],
    );
    await expect(owner.query("UPDATE audit_logs SET summary = 'tampered'")).rejects.toThrow(/append-only/);
    await expect(owner.query("DELETE FROM audit_logs")).rejects.toThrow(/append-only/);
    await expect(app.query("UPDATE audit_logs SET summary = 'tampered'")).rejects.toThrow(/permission denied/);
  });

  it("rejects deleting or rewriting voter participation (which would allow a second vote)", async () => {
    await expect(app.query("DELETE FROM voter_participation")).rejects.toThrow(/permission denied/);
    await expect(app.query("UPDATE voter_participation SET voted_at = now()")).rejects.toThrow(
      /permission denied/,
    );
  });
});

describe("irreversible close (security review H1)", () => {
  it("refuses to tally a closed election until its ballots are mixed, and refuses to reopen it", async () => {
    const res = await app.query<{ id: string }>(
      `INSERT INTO elections (title, election_year, status, opens_at, closes_at)
       VALUES ('Peek test', 2026, 'OPEN', now() - interval '1 hour', now() + interval '1 hour') RETURNING id`,
    );
    const id = res.rows[0].id;
    await app.query("UPDATE elections SET status = 'CLOSED' WHERE id = $1", [id]);
    await expect(app.query("SELECT * FROM election_tally($1)", [id])).rejects.toThrow(/tally is unavailable/);
    await expect(app.query("UPDATE elections SET status = 'OPEN' WHERE id = $1", [id])).rejects.toThrow(/cannot be reopened/);
    await expect(app.query("UPDATE elections SET closes_at = now() + interval '1 day' WHERE id = $1", [id])).rejects.toThrow(
      /cannot change/,
    );
  });

  it("logs every status change in a table the app role can read but never write", async () => {
    const { rows } = await app.query<{ n: number }>("SELECT count(*)::int AS n FROM election_state_log");
    expect(rows[0].n).toBeGreaterThan(0);
    await expect(app.query("DELETE FROM election_state_log")).rejects.toThrow(/permission denied/);
    await expect(
      app.query("INSERT INTO election_state_log (election_id, new_status, new_opens_at, new_closes_at) VALUES ($1, 'OPEN', now(), now())", [
        electionId,
      ]),
    ).rejects.toThrow(/permission denied/);
  });

  it("rejects a ballot selection whose candidate belongs to another election", async () => {
    await expect(
      app.query("INSERT INTO ballot_selections (ballot_id, election_id, position_id, candidate_id) VALUES ($1, $2, $3, $4)", [
        randomUUID(),
        electionId,
        randomUUID(),
        randomUUID(),
      ]),
    ).rejects.toThrow(/foreign key/);
  });
});

describe("mixing after close", () => {
  it("re-keys every ballot and keeps the tally identical", async () => {
    const positionRes = await app.query<{ id: string }>(
      "INSERT INTO executive_positions (election_id, title) VALUES ($1, 'President') RETURNING id",
      [electionId],
    );
    const positionId = positionRes.rows[0].id;
    const candRes = await app.query<{ id: string }>(
      "INSERT INTO candidates (election_id, position_id, full_name, status) VALUES ($1, $2, 'A', 'APPROVED') RETURNING id",
      [electionId, positionId],
    );
    const candidateId = candRes.rows[0].id;
    const originalIds: string[] = [];
    for (let i = 0; i < 5; i += 1) {
      const id = randomUUID();
      originalIds.push(id);
      await app.query("INSERT INTO ballots (id, election_id, receipt_hash) VALUES ($1, $2, $3)", [
        id,
        electionId,
        `r-${id}`,
      ]);
      await app.query(
        "INSERT INTO ballot_selections (ballot_id, election_id, position_id, candidate_id) VALUES ($1, $2, $3, $4)",
        [id, electionId, positionId, i < 3 ? candidateId : null],
      );
    }
    await app.query("UPDATE elections SET status = 'CLOSED' WHERE id = $1", [electionId]);

    const mixed = await app.query<{ n: number }>("SELECT mix_ballots($1) AS n", [electionId]);
    expect(mixed.rows[0].n).toBe(6);

    const { rows: ids } = await owner.query<{ id: string }>("SELECT id FROM ballots WHERE election_id = $1", [
      electionId,
    ]);
    expect(ids.some((r) => originalIds.includes(r.id))).toBe(false);

    const tally = await app.query<{ candidate_id: string | null; votes: string }>(
      "SELECT candidate_id, votes FROM election_tally($1)",
      [electionId],
    );
    const byCandidate = Object.fromEntries(tally.rows.map((r) => [r.candidate_id ?? "abstain", Number(r.votes)]));
    expect(byCandidate).toEqual({ [candidateId]: 3, abstain: 2 });

    const xmins = await owner.query<{ n: string }>(
      "SELECT count(DISTINCT xmin::text) AS n FROM ballots WHERE election_id = $1",
      [electionId],
    );
    expect(Number(xmins.rows[0].n)).toBe(1);
  });
});
