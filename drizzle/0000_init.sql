CREATE TYPE "public"."member_account_status" AS ENUM('ACTIVE', 'SUSPENDED', 'DEACTIVATED');--> statement-breakpoint
CREATE TYPE "public"."member_approval_status" AS ENUM('PENDING', 'APPROVED', 'REJECTED');--> statement-breakpoint
CREATE TYPE "public"."candidate_status" AS ENUM('PENDING', 'APPROVED', 'REJECTED', 'WITHDRAWN', 'DEACTIVATED');--> statement-breakpoint
CREATE TYPE "public"."credential_status" AS ENUM('NOT_ISSUED', 'QUEUED', 'SENT', 'DELIVERED', 'FAILED', 'ACTIVATED');--> statement-breakpoint
CREATE TYPE "public"."election_status" AS ENUM('DRAFT', 'REGISTRATION', 'NOMINATION', 'CANDIDATE_APPROVAL', 'SCHEDULED', 'OPEN', 'CLOSED', 'RESULTS_PUBLISHED', 'ARCHIVED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."email_status" AS ENUM('QUEUED', 'SENDING', 'SENT', 'DELIVERED', 'BOUNCED', 'COMPLAINED', 'FAILED');--> statement-breakpoint
CREATE TYPE "public"."member_import_status" AS ENUM('PREVIEW', 'COMMITTED', 'DISCARDED');--> statement-breakpoint
CREATE TYPE "public"."results_visibility" AS ENUM('ELIGIBLE_VOTERS', 'ALL_MEMBERS', 'PUBLIC');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('SYSTEM_ADMIN', 'ELECTORAL_COMMITTEE', 'VOTER');--> statement-breakpoint
CREATE TYPE "public"."user_status" AS ENUM('ACTIVE', 'SUSPENDED', 'DEACTIVATED');--> statement-breakpoint
CREATE TABLE "password_reset_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "password_reset_tokens_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "rate_limits" (
	"key" text PRIMARY KEY NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"count" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reauthenticated_at" timestamp with time zone,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"full_name" text NOT NULL,
	"role" "user_role" NOT NULL,
	"status" "user_status" DEFAULT 'ACTIVE' NOT NULL,
	"password_hash" text,
	"must_change_password" boolean DEFAULT true NOT NULL,
	"temp_password_expires_at" timestamp with time zone,
	"password_changed_at" timestamp with time zone,
	"failed_login_attempts" integer DEFAULT 0 NOT NULL,
	"locked_until" timestamp with time zone,
	"last_login_at" timestamp with time zone,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ballot_selections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ballot_id" uuid NOT NULL,
	"election_id" uuid NOT NULL,
	"position_id" uuid NOT NULL,
	"candidate_id" uuid,
	CONSTRAINT "ballot_selections_unique" UNIQUE NULLS NOT DISTINCT("ballot_id","position_id","candidate_id")
);
--> statement-breakpoint
CREATE TABLE "ballots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"election_id" uuid NOT NULL,
	"receipt_hash" text NOT NULL,
	CONSTRAINT "ballots_receipt_hash_unique" UNIQUE("receipt_hash")
);
--> statement-breakpoint
CREATE TABLE "voter_participation" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"election_id" uuid NOT NULL,
	"member_id" uuid NOT NULL,
	"voted_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "voter_participation_election_member_unique" UNIQUE("election_id","member_id")
);
--> statement-breakpoint
CREATE TABLE "announcements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"election_id" uuid,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"published_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "candidate_photos" (
	"candidate_id" uuid PRIMARY KEY NOT NULL,
	"data" "bytea" NOT NULL,
	"mime_type" text NOT NULL,
	"sha256" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "candidates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"election_id" uuid NOT NULL,
	"position_id" uuid NOT NULL,
	"member_id" uuid,
	"full_name" text NOT NULL,
	"membership_number" text,
	"biography" text DEFAULT '' NOT NULL,
	"manifesto" text DEFAULT '' NOT NULL,
	"status" "candidate_status" DEFAULT 'PENDING' NOT NULL,
	"status_reason" text,
	"decided_by" uuid,
	"decided_at" timestamp with time zone,
	"ballot_order" integer DEFAULT 0 NOT NULL,
	"registered_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "election_results" (
	"election_id" uuid PRIMARY KEY NOT NULL,
	"snapshot" jsonb NOT NULL,
	"sha256" text NOT NULL,
	"published_by" uuid,
	"published_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "election_status_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"election_id" uuid NOT NULL,
	"from_status" "election_status",
	"to_status" "election_status" NOT NULL,
	"reason" text,
	"actor_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "election_voters" (
	"election_id" uuid NOT NULL,
	"member_id" uuid NOT NULL,
	"added_by" uuid,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "election_voters_pk" PRIMARY KEY("election_id","member_id")
);
--> statement-breakpoint
CREATE TABLE "elections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"election_year" integer NOT NULL,
	"status" "election_status" DEFAULT 'DRAFT' NOT NULL,
	"opens_at" timestamp with time zone NOT NULL,
	"closes_at" timestamp with time zone NOT NULL,
	"rules" text DEFAULT '' NOT NULL,
	"instructions" text DEFAULT '' NOT NULL,
	"results_visibility" "results_visibility" DEFAULT 'ELIGIBLE_VOTERS' NOT NULL,
	"tie_break_procedure" text DEFAULT 'A run-off vote between the tied candidates will be organised by the Electoral Committee. The system will not automatically select a winner.' NOT NULL,
	"ballots_mixed_at" timestamp with time zone,
	"results_published_at" timestamp with time zone,
	"results_published_by" uuid,
	"cancelled_reason" text,
	"archived_at" timestamp with time zone,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "elections_window_check" CHECK ("elections"."closes_at" > "elections"."opens_at")
);
--> statement-breakpoint
CREATE TABLE "executive_positions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"election_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"display_order" integer DEFAULT 0 NOT NULL,
	"max_selections" integer DEFAULT 1 NOT NULL,
	"allow_abstain" boolean DEFAULT true NOT NULL,
	"max_candidates" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "executive_positions_max_selections_check" CHECK ("executive_positions"."max_selections" >= 1),
	CONSTRAINT "executive_positions_max_candidates_check" CHECK ("executive_positions"."max_candidates" is null or "executive_positions"."max_candidates" >= 1)
);
--> statement-breakpoint
CREATE TABLE "tie_resolutions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"election_id" uuid NOT NULL,
	"position_id" uuid NOT NULL,
	"winner_candidate_id" uuid NOT NULL,
	"method" text NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"recorded_by" uuid,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tie_resolutions_position_unique" UNIQUE("election_id","position_id")
);
--> statement-breakpoint
CREATE TABLE "member_imports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"file_name" text NOT NULL,
	"status" "member_import_status" DEFAULT 'PREVIEW' NOT NULL,
	"total_rows" integer DEFAULT 0 NOT NULL,
	"valid_rows" integer DEFAULT 0 NOT NULL,
	"invalid_rows" integer DEFAULT 0 NOT NULL,
	"duplicate_rows" integer DEFAULT 0 NOT NULL,
	"rows" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"summary" jsonb,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"committed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"full_name" text NOT NULL,
	"email" text NOT NULL,
	"phone" text,
	"membership_number" text,
	"gender" text,
	"approval_status" "member_approval_status" DEFAULT 'PENDING' NOT NULL,
	"account_status" "member_account_status" DEFAULT 'ACTIVE' NOT NULL,
	"credential_status" "credential_status" DEFAULT 'NOT_ISSUED' NOT NULL,
	"credential_issued_at" timestamp with time zone,
	"registered_at" timestamp with time zone DEFAULT now() NOT NULL,
	"approved_at" timestamp with time zone,
	"approved_by" uuid,
	"rejection_reason" text,
	"import_id" uuid,
	"notes" text,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "members_user_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "audit_logs_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"occurred_at" timestamp with time zone NOT NULL,
	"actor_user_id" uuid,
	"actor_role" text,
	"actor_label" text NOT NULL,
	"action" text NOT NULL,
	"resource_type" text NOT NULL,
	"resource_id" text,
	"summary" text NOT NULL,
	"reason" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"ip_address" text,
	"prev_hash" text NOT NULL,
	"hash" text NOT NULL,
	CONSTRAINT "audit_logs_hash_unique" UNIQUE("hash")
);
--> statement-breakpoint
CREATE TABLE "email_delivery_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email_job_id" uuid NOT NULL,
	"event" text NOT NULL,
	"detail" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"template" text NOT NULL,
	"to_email" text NOT NULL,
	"subject" text NOT NULL,
	"member_id" uuid,
	"user_id" uuid,
	"election_id" uuid,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"encrypted_secret" text,
	"status" "email_status" DEFAULT 'QUEUED' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 5 NOT NULL,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_error" text,
	"provider_message_id" text,
	"dedupe_key" text,
	"sent_at" timestamp with time zone,
	"delivered_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "email_jobs_dedupe_unique" UNIQUE("dedupe_key")
);
--> statement-breakpoint
CREATE TABLE "system_settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ballot_selections" ADD CONSTRAINT "ballot_selections_ballot_id_ballots_id_fk" FOREIGN KEY ("ballot_id") REFERENCES "public"."ballots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ballot_selections" ADD CONSTRAINT "ballot_selections_election_id_elections_id_fk" FOREIGN KEY ("election_id") REFERENCES "public"."elections"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ballot_selections" ADD CONSTRAINT "ballot_selections_position_id_executive_positions_id_fk" FOREIGN KEY ("position_id") REFERENCES "public"."executive_positions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ballot_selections" ADD CONSTRAINT "ballot_selections_candidate_id_candidates_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."candidates"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ballots" ADD CONSTRAINT "ballots_election_id_elections_id_fk" FOREIGN KEY ("election_id") REFERENCES "public"."elections"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voter_participation" ADD CONSTRAINT "voter_participation_election_id_elections_id_fk" FOREIGN KEY ("election_id") REFERENCES "public"."elections"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voter_participation" ADD CONSTRAINT "voter_participation_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "announcements" ADD CONSTRAINT "announcements_election_id_elections_id_fk" FOREIGN KEY ("election_id") REFERENCES "public"."elections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "announcements" ADD CONSTRAINT "announcements_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidate_photos" ADD CONSTRAINT "candidate_photos_candidate_id_candidates_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."candidates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidates" ADD CONSTRAINT "candidates_election_id_elections_id_fk" FOREIGN KEY ("election_id") REFERENCES "public"."elections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidates" ADD CONSTRAINT "candidates_position_id_executive_positions_id_fk" FOREIGN KEY ("position_id") REFERENCES "public"."executive_positions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidates" ADD CONSTRAINT "candidates_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidates" ADD CONSTRAINT "candidates_decided_by_users_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "election_results" ADD CONSTRAINT "election_results_election_id_elections_id_fk" FOREIGN KEY ("election_id") REFERENCES "public"."elections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "election_results" ADD CONSTRAINT "election_results_published_by_users_id_fk" FOREIGN KEY ("published_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "election_status_history" ADD CONSTRAINT "election_status_history_election_id_elections_id_fk" FOREIGN KEY ("election_id") REFERENCES "public"."elections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "election_status_history" ADD CONSTRAINT "election_status_history_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "election_voters" ADD CONSTRAINT "election_voters_election_id_elections_id_fk" FOREIGN KEY ("election_id") REFERENCES "public"."elections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "election_voters" ADD CONSTRAINT "election_voters_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "election_voters" ADD CONSTRAINT "election_voters_added_by_users_id_fk" FOREIGN KEY ("added_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "elections" ADD CONSTRAINT "elections_results_published_by_users_id_fk" FOREIGN KEY ("results_published_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "elections" ADD CONSTRAINT "elections_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "executive_positions" ADD CONSTRAINT "executive_positions_election_id_elections_id_fk" FOREIGN KEY ("election_id") REFERENCES "public"."elections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tie_resolutions" ADD CONSTRAINT "tie_resolutions_election_id_elections_id_fk" FOREIGN KEY ("election_id") REFERENCES "public"."elections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tie_resolutions" ADD CONSTRAINT "tie_resolutions_position_id_executive_positions_id_fk" FOREIGN KEY ("position_id") REFERENCES "public"."executive_positions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tie_resolutions" ADD CONSTRAINT "tie_resolutions_winner_candidate_id_candidates_id_fk" FOREIGN KEY ("winner_candidate_id") REFERENCES "public"."candidates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tie_resolutions" ADD CONSTRAINT "tie_resolutions_recorded_by_users_id_fk" FOREIGN KEY ("recorded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member_imports" ADD CONSTRAINT "member_imports_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "members" ADD CONSTRAINT "members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "members" ADD CONSTRAINT "members_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "members" ADD CONSTRAINT "members_import_id_member_imports_id_fk" FOREIGN KEY ("import_id") REFERENCES "public"."member_imports"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_delivery_logs" ADD CONSTRAINT "email_delivery_logs_email_job_id_email_jobs_id_fk" FOREIGN KEY ("email_job_id") REFERENCES "public"."email_jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_jobs" ADD CONSTRAINT "email_jobs_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_jobs" ADD CONSTRAINT "email_jobs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_jobs" ADD CONSTRAINT "email_jobs_election_id_elections_id_fk" FOREIGN KEY ("election_id") REFERENCES "public"."elections"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "system_settings" ADD CONSTRAINT "system_settings_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "password_reset_tokens_user_idx" ON "password_reset_tokens" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sessions_user_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sessions_expires_idx" ON "sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_unique" ON "users" USING btree (lower("email"));--> statement-breakpoint
CREATE INDEX "users_role_idx" ON "users" USING btree ("role");--> statement-breakpoint
CREATE INDEX "ballot_selections_election_idx" ON "ballot_selections" USING btree ("election_id");--> statement-breakpoint
CREATE INDEX "voter_participation_election_idx" ON "voter_participation" USING btree ("election_id");--> statement-breakpoint
CREATE INDEX "announcements_election_idx" ON "announcements" USING btree ("election_id");--> statement-breakpoint
CREATE UNIQUE INDEX "candidates_position_member_unique" ON "candidates" USING btree ("position_id","member_id") WHERE "candidates"."member_id" is not null;--> statement-breakpoint
CREATE INDEX "candidates_election_idx" ON "candidates" USING btree ("election_id");--> statement-breakpoint
CREATE INDEX "candidates_position_idx" ON "candidates" USING btree ("position_id");--> statement-breakpoint
CREATE INDEX "election_status_history_election_idx" ON "election_status_history" USING btree ("election_id");--> statement-breakpoint
CREATE INDEX "election_voters_member_idx" ON "election_voters" USING btree ("member_id");--> statement-breakpoint
CREATE INDEX "elections_status_idx" ON "elections" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "executive_positions_election_title_unique" ON "executive_positions" USING btree ("election_id",lower("title"));--> statement-breakpoint
CREATE UNIQUE INDEX "members_email_unique" ON "members" USING btree (lower("email"));--> statement-breakpoint
CREATE UNIQUE INDEX "members_membership_number_unique" ON "members" USING btree (lower("membership_number")) WHERE "members"."membership_number" is not null;--> statement-breakpoint
CREATE INDEX "members_approval_idx" ON "members" USING btree ("approval_status");--> statement-breakpoint
CREATE INDEX "members_account_idx" ON "members" USING btree ("account_status");--> statement-breakpoint
CREATE INDEX "members_name_idx" ON "members" USING btree ("full_name");--> statement-breakpoint
CREATE INDEX "audit_logs_occurred_idx" ON "audit_logs" USING btree ("occurred_at");--> statement-breakpoint
CREATE INDEX "audit_logs_action_idx" ON "audit_logs" USING btree ("action");--> statement-breakpoint
CREATE INDEX "audit_logs_resource_idx" ON "audit_logs" USING btree ("resource_type","resource_id");--> statement-breakpoint
CREATE INDEX "audit_logs_actor_idx" ON "audit_logs" USING btree ("actor_user_id");--> statement-breakpoint
CREATE INDEX "email_delivery_logs_job_idx" ON "email_delivery_logs" USING btree ("email_job_id");--> statement-breakpoint
CREATE INDEX "email_jobs_dispatch_idx" ON "email_jobs" USING btree ("status","next_attempt_at");--> statement-breakpoint
CREATE INDEX "email_jobs_member_idx" ON "email_jobs" USING btree ("member_id");--> statement-breakpoint
CREATE INDEX "email_jobs_provider_idx" ON "email_jobs" USING btree ("provider_message_id");