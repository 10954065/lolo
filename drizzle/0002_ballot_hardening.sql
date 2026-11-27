-- =====================================================================================
-- Hardening after the Phase 6 security review.
-- H1: closing is irreversible at the database level, so the app role cannot "peek" at a
--     tally mid-vote by flipping status and back; tally also requires the post-close mix.
--     Every status/window change is recorded in an owner-only log the app cannot alter.
-- L3: composite foreign keys keep ballot selections consistent with their election.
-- L4: participation cannot be truncated.
-- =====================================================================================

-- 1. Final states are irreversible; the voting window is immutable after closing. -----
CREATE OR REPLACE FUNCTION elections_guard_transitions() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status IN ('CLOSED', 'RESULTS_PUBLISHED', 'ARCHIVED') THEN
    IF NEW.status NOT IN ('CLOSED', 'RESULTS_PUBLISHED', 'ARCHIVED') THEN
      RAISE EXCEPTION 'a closed election cannot be reopened' USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF NEW.opens_at IS DISTINCT FROM OLD.opens_at OR NEW.closes_at IS DISTINCT FROM OLD.closes_at THEN
      RAISE EXCEPTION 'the voting window of a closed election cannot change' USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;
  IF OLD.status = 'CANCELLED' AND NEW.status <> 'CANCELLED' THEN
    RAISE EXCEPTION 'a cancelled election cannot be revived' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF OLD.ballots_mixed_at IS NOT NULL AND NEW.ballots_mixed_at IS NULL THEN
    RAISE EXCEPTION 'ballots_mixed_at cannot be cleared' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER elections_guard_transitions
  BEFORE UPDATE ON elections
  FOR EACH ROW EXECUTE FUNCTION elections_guard_transitions();
--> statement-breakpoint

-- 2. Owner-only, append-only log of every status / voting-window change. ---------------
CREATE TABLE election_state_log (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  election_id uuid NOT NULL,
  old_status election_status,
  new_status election_status NOT NULL,
  old_opens_at timestamptz,
  new_opens_at timestamptz NOT NULL,
  old_closes_at timestamptz,
  new_closes_at timestamptz NOT NULL,
  db_role text NOT NULL DEFAULT session_user,
  logged_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
--> statement-breakpoint
CREATE INDEX election_state_log_election_idx ON election_state_log (election_id);
--> statement-breakpoint
CREATE OR REPLACE FUNCTION election_state_log_write() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF TG_OP = 'INSERT' OR NEW.status IS DISTINCT FROM OLD.status
     OR NEW.opens_at IS DISTINCT FROM OLD.opens_at OR NEW.closes_at IS DISTINCT FROM OLD.closes_at THEN
    INSERT INTO election_state_log (election_id, old_status, new_status, old_opens_at, new_opens_at, old_closes_at, new_closes_at)
    VALUES (NEW.id,
            CASE WHEN TG_OP = 'UPDATE' THEN OLD.status END, NEW.status,
            CASE WHEN TG_OP = 'UPDATE' THEN OLD.opens_at END, NEW.opens_at,
            CASE WHEN TG_OP = 'UPDATE' THEN OLD.closes_at END, NEW.closes_at);
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER elections_state_log
  AFTER INSERT OR UPDATE ON elections
  FOR EACH ROW EXECUTE FUNCTION election_state_log_write();
--> statement-breakpoint
CREATE TRIGGER election_state_log_no_update_delete
  BEFORE UPDATE OR DELETE ON election_state_log
  FOR EACH ROW EXECUTE FUNCTION audit_logs_block_mutation();
--> statement-breakpoint
REVOKE ALL ON election_state_log FROM PUBLIC;
--> statement-breakpoint

-- 3. Tally only after the irreversible close AND the post-close mix. --------------------
CREATE OR REPLACE FUNCTION election_tally(p_election_id uuid)
RETURNS TABLE (position_id uuid, candidate_id uuid, votes bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
#variable_conflict use_column
DECLARE
  v_status election_status;
  v_mixed timestamptz;
BEGIN
  SELECT e.status, e.ballots_mixed_at INTO v_status, v_mixed FROM elections e WHERE e.id = p_election_id;
  IF v_status IS NULL THEN
    RAISE EXCEPTION 'election % not found', p_election_id USING ERRCODE = 'no_data_found';
  END IF;
  IF v_status NOT IN ('CLOSED', 'RESULTS_PUBLISHED', 'ARCHIVED') OR v_mixed IS NULL THEN
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
REVOKE ALL ON FUNCTION election_tally(uuid) FROM PUBLIC;
--> statement-breakpoint

-- 4. Composite keys: a selection must belong to its ballot's election, and the position
--    and candidate must belong to that election (abstentions have candidate_id NULL). -----
ALTER TABLE ballots ADD CONSTRAINT ballots_id_election_unique UNIQUE (id, election_id);
--> statement-breakpoint
ALTER TABLE executive_positions ADD CONSTRAINT executive_positions_id_election_unique UNIQUE (id, election_id);
--> statement-breakpoint
ALTER TABLE candidates ADD CONSTRAINT candidates_id_position_election_unique UNIQUE (id, position_id, election_id);
--> statement-breakpoint
ALTER TABLE ballot_selections
  ADD CONSTRAINT ballot_selections_ballot_election_fk FOREIGN KEY (ballot_id, election_id)
  REFERENCES ballots (id, election_id) ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE ballot_selections
  ADD CONSTRAINT ballot_selections_position_election_fk FOREIGN KEY (position_id, election_id)
  REFERENCES executive_positions (id, election_id);
--> statement-breakpoint
ALTER TABLE ballot_selections
  ADD CONSTRAINT ballot_selections_candidate_position_election_fk FOREIGN KEY (candidate_id, position_id, election_id)
  REFERENCES candidates (id, position_id, election_id);
--> statement-breakpoint

-- 5. Participation cannot be truncated either. -------------------------------------------
CREATE TRIGGER voter_participation_no_truncate
  BEFORE TRUNCATE ON voter_participation
  FOR EACH STATEMENT EXECUTE FUNCTION voter_participation_block_mutation();
