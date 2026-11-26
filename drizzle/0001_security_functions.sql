-- =====================================================================================
-- Security functions and triggers.
-- See ARCHITECTURE.md §4 (secret ballot) and DATABASE.md §5.
-- All SECURITY DEFINER functions pin search_path to prevent search-path hijacking.
-- =====================================================================================

-- 1. Audit log is append-only -------------------------------------------------------
CREATE OR REPLACE FUNCTION audit_logs_block_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'audit_logs is append-only (% rejected)', TG_OP
    USING ERRCODE = 'insufficient_privilege';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER audit_logs_no_update_delete
  BEFORE UPDATE OR DELETE ON audit_logs
  FOR EACH ROW EXECUTE FUNCTION audit_logs_block_mutation();
--> statement-breakpoint
CREATE TRIGGER audit_logs_no_truncate
  BEFORE TRUNCATE ON audit_logs
  FOR EACH STATEMENT EXECUTE FUNCTION audit_logs_block_mutation();
--> statement-breakpoint

-- 2. Participation rows are permanent (deleting one would allow a second vote) -------
CREATE OR REPLACE FUNCTION voter_participation_block_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'voter_participation is append-only (% rejected)', TG_OP
    USING ERRCODE = 'insufficient_privilege';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER voter_participation_no_update_delete
  BEFORE UPDATE OR DELETE ON voter_participation
  FOR EACH ROW EXECUTE FUNCTION voter_participation_block_mutation();
--> statement-breakpoint

-- 3. Aggregate tally — refuses while voting can still happen ---------------------------
CREATE OR REPLACE FUNCTION election_tally(p_election_id uuid)
RETURNS TABLE (position_id uuid, candidate_id uuid, votes bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
#variable_conflict use_column
DECLARE
  v_status election_status;
BEGIN
  SELECT e.status INTO v_status FROM elections e WHERE e.id = p_election_id;
  IF v_status IS NULL THEN
    RAISE EXCEPTION 'election % not found', p_election_id USING ERRCODE = 'no_data_found';
  END IF;
  IF v_status NOT IN ('CLOSED', 'RESULTS_PUBLISHED', 'ARCHIVED') THEN
    RAISE EXCEPTION 'tally is unavailable while the election is %', v_status
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN QUERY
    SELECT s.position_id, s.candidate_id, count(*)::bigint
    FROM ballot_selections s
    WHERE s.election_id = p_election_id
    GROUP BY s.position_id, s.candidate_id;
END;
$$;
--> statement-breakpoint

-- 4. Ballot count (turnout is already visible to staff; a count reveals no choices) ----
CREATE OR REPLACE FUNCTION election_ballot_count(p_election_id uuid)
RETURNS bigint
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT count(*)::bigint FROM ballots b WHERE b.election_id = p_election_id;
$$;
--> statement-breakpoint

-- 5. Receipt inclusion check — returns only which election the receipt belongs to ------
CREATE OR REPLACE FUNCTION verify_receipt(p_receipt_hash text)
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT b.election_id FROM ballots b WHERE b.receipt_hash = p_receipt_hash;
$$;
--> statement-breakpoint

-- 6. Post-close mixing: rewrite every ballot of the election with fresh random ids in a
--    random physical order inside ONE transaction. Afterwards all ballot rows share one
--    xmin and their ctid order is shuffled, so they can no longer be correlated with the
--    transactions that wrote voter_participation rows.
CREATE OR REPLACE FUNCTION mix_ballots(p_election_id uuid)
RETURNS integer
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_status election_status;
  v_count integer;
BEGIN
  SELECT e.status INTO v_status FROM elections e WHERE e.id = p_election_id FOR UPDATE;
  IF v_status IS DISTINCT FROM 'CLOSED' THEN
    RAISE EXCEPTION 'ballots can only be mixed after the election is closed (status %)', v_status
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  DROP TABLE IF EXISTS pg_temp._mix_map;
  DROP TABLE IF EXISTS pg_temp._mix_sel;

  CREATE TEMP TABLE _mix_map ON COMMIT DROP AS
    SELECT b.id AS old_id, gen_random_uuid() AS new_id, b.receipt_hash
    FROM ballots b WHERE b.election_id = p_election_id;

  CREATE TEMP TABLE _mix_sel ON COMMIT DROP AS
    SELECT m.new_id AS ballot_id, s.position_id, s.candidate_id
    FROM ballot_selections s JOIN _mix_map m ON m.old_id = s.ballot_id;

  DELETE FROM ballots b WHERE b.election_id = p_election_id; -- cascades to selections

  INSERT INTO ballots (id, election_id, receipt_hash)
    SELECT m.new_id, p_election_id, m.receipt_hash FROM _mix_map m ORDER BY random();

  INSERT INTO ballot_selections (id, ballot_id, election_id, position_id, candidate_id)
    SELECT gen_random_uuid(), x.ballot_id, p_election_id, x.position_id, x.candidate_id
    FROM _mix_sel x ORDER BY random();

  SELECT count(*) INTO v_count FROM _mix_map;
  UPDATE elections SET ballots_mixed_at = now() WHERE id = p_election_id;
  RETURN v_count;
END;
$$;
--> statement-breakpoint

-- 7. Nobody gets implicit access; db:harden grants the minimum to the app role ---------
REVOKE ALL ON ballots, ballot_selections FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON FUNCTION election_tally(uuid) FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON FUNCTION election_ballot_count(uuid) FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON FUNCTION verify_receipt(text) FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON FUNCTION mix_ballots(uuid) FROM PUBLIC;
