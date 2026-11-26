# Database — MOBA 2017 Digital Election Management System

PostgreSQL 17 (Neon in production). Schema is defined in
`src/server/db/schema/*.ts` (Drizzle ORM) and applied through versioned SQL
migrations in `drizzle/`. Never edit the database by hand; generate a
migration (`npm run db:generate`) and apply it (`npm run db:migrate`).

---

## 1. Conventions

* Primary keys: `uuid` generated with `gen_random_uuid()` (UUID **v4**).
  Time-ordered identifiers (UUID v7, ULID, serials) are **not** used for any
  table on the ballot side.
* Timestamps: `timestamptz`, stored in UTC, displayed in `Africa/Accra`.
* Emails are stored lower-cased and trimmed; uniqueness is enforced on the
  normalized value.
* Soft deletion (`deleted_at`) is used for members only; elections can be
  hard-deleted **only** while `DRAFT`.
* Enumerations are PostgreSQL `enum` types.

## 2. Database roles

| Role | Used by | Privileges |
|---|---|---|
| owner (`DATABASE_OWNER_URL`) | migrations, `scripts/db-harden` | Owns all objects. Never configured in the running app. |
| `moba_app` (`DATABASE_URL`) | the running application | `SELECT/INSERT/UPDATE/DELETE` on operational tables; **`INSERT` only** on `ballots`, `ballot_selections`; **`SELECT/INSERT` only** on `audit_logs`; `EXECUTE` on the ballot functions. |

`npm run db:harden` creates/updates `moba_app` and applies the grants. The
admin "System health" panel reports whether hardening is active
(`has_table_privilege(current_user, 'ballots', 'SELECT')` must be false).

## 3. Entity overview

```
users ─1───0..1─ members ─┬─< election_voters >─ elections ─┬─< executive_positions ─< candidates ─1─0..1─ candidate_photos
  │                       │                                  ├─< election_status_history
  ├─< sessions            ├─< voter_participation >──────────┤
  ├─< password_reset_tokens                                  ├─< announcements
  └─< audit_logs (actor)  └─< email_jobs ─< email_delivery_logs
                                                             ├─< tie_resolutions
                                                             ├─1 election_results (published snapshot)
member_imports                                               └─< ballots ─< ballot_selections   (anonymous side;
system_settings, rate_limits                                                                     no link to members)
```

## 4. Tables

### Identity and access

**users** — login accounts for all three roles.
`id`, `email` (unique), `full_name`, `role` (`SYSTEM_ADMIN` |
`ELECTORAL_COMMITTEE` | `VOTER`), `status` (`ACTIVE` | `SUSPENDED` |
`DEACTIVATED`), `password_hash` (Argon2id PHC string, nullable until
credentials issued), `must_change_password`, `temp_password_expires_at`,
`password_changed_at`, `failed_login_attempts`, `locked_until`,
`last_login_at`, `created_by`, `created_at`, `updated_at`.

**sessions** — `id` = SHA-256 of the session token (hex), `user_id`,
`expires_at`, `last_seen_at`, `reauthenticated_at` (step-up), `user_agent`
(truncated), `created_at`. Index on `user_id`, `expires_at`.

**password_reset_tokens** — `id`, `user_id`, `token_hash` (unique, SHA-256),
`expires_at` (30 min), `used_at`, `created_at`.

**rate_limits** — `key` (PK, e.g. `login:ip:<hmac>`), `window_start`, `count`.
Fixed-window counters updated with a single `INSERT … ON CONFLICT` statement.

### Members

**members** — `id`, `user_id` (unique, nullable), `full_name`, `email`
(unique), `phone`, `membership_number` (unique when present), `gender`
(optional, never used for eligibility), `approval_status` (`PENDING` |
`APPROVED` | `REJECTED`), `account_status` (`ACTIVE` | `SUSPENDED` |
`DEACTIVATED`), `credential_status` (`NOT_ISSUED` | `QUEUED` | `SENT` |
`DELIVERED` | `FAILED` | `ACTIVATED`), `credential_issued_at`,
`registered_at`, `approved_at`, `approved_by`, `rejection_reason`,
`import_id`, `notes`, `deleted_at`, `created_at`, `updated_at`.

**member_imports** — CSV import batches: `id`, `file_name`, `status`
(`PREVIEW` | `COMMITTED` | `DISCARDED`), row counts, `rows` (jsonb with
per-row validation result), `summary`, `created_by`, `created_at`,
`committed_at`.

### Elections

**elections** — `id`, `title`, `description`, `election_year`, `status`
(`DRAFT` | `REGISTRATION` | `NOMINATION` | `CANDIDATE_APPROVAL` |
`SCHEDULED` | `OPEN` | `CLOSED` | `RESULTS_PUBLISHED` | `ARCHIVED` |
`CANCELLED`), `opens_at`, `closes_at` (CHECK `closes_at > opens_at`),
`rules`, `instructions`, `results_visibility` (`ELIGIBLE_VOTERS` |
`ALL_MEMBERS` | `PUBLIC`), `tie_break_procedure`, `ballots_mixed_at`,
`results_published_at`, `results_published_by`, `cancelled_reason`,
`archived_at`, `created_by`, `created_at`, `updated_at`.

**election_status_history** — every transition with `from_status`,
`to_status`, `reason`, `actor_user_id` (null = system), `created_at`.

**election_voters** — eligible voter roll. PK (`election_id`, `member_id`),
`added_by`, `added_at`. Frozen when the ballot locks.

**executive_positions** — per election: `id`, `election_id`, `title`
(unique per election), `description`, `display_order`, `max_selections`
(default 1, = seats), `allow_abstain` (default true), `max_candidates`
(nullable), timestamps.

**candidates** — `id`, `election_id`, `position_id`, `member_id` (nullable,
unique per position), `full_name`, `membership_number`, `biography`,
`manifesto`, `status` (`PENDING` | `APPROVED` | `REJECTED` | `WITHDRAWN` |
`DEACTIVATED`), `status_reason`, `decided_by`, `decided_at`, `ballot_order`,
`registered_at`, timestamps.

**candidate_photos** — `candidate_id` (PK), `data` (bytea, WebP),
`mime_type`, `sha256`, `updated_at`.

**announcements** — `id`, `election_id` (nullable = general), `title`,
`body`, `published_at`, `created_by`, timestamps.

### Anonymous ballot side

**voter_participation** — `id`, `election_id`, `member_id`, `voted_at`.
`UNIQUE (election_id, member_id)` — the database-level guarantee of one vote
per member per election.

**ballots** — `id` (uuid v4), `election_id`, `receipt_hash` (unique).
No voter reference, no timestamp, no network metadata.

**ballot_selections** — `id`, `ballot_id` (FK cascade), `election_id`,
`position_id`, `candidate_id` (nullable; `NULL` = abstention).
`UNIQUE (ballot_id, position_id, candidate_id)`.

### Results

**election_results** — published snapshot: `election_id` (PK), `snapshot`
(jsonb), `sha256`, `published_by`, `published_at`.

**tie_resolutions** — `id`, `election_id`, `position_id`,
`winner_candidate_id`, `method`, `notes`, `recorded_by`, `recorded_at`.
Never modifies counts.

### Operations

**email_jobs** — outbox: `id`, `template`, `to_email`, `subject`,
`member_id`, `user_id`, `election_id`, `payload` (non-secret variables),
`encrypted_secret` (AES-256-GCM ciphertext for credentials; erased after
delivery), `status` (`QUEUED` | `SENDING` | `SENT` | `DELIVERED` |
`BOUNCED` | `COMPLAINED` | `FAILED`), `attempts`, `next_attempt_at`,
`last_error`, `provider_message_id`, `dedupe_key` (unique), `sent_at`,
timestamps.

**email_delivery_logs** — `id`, `email_job_id`, `event`, `detail`,
`created_at`.

**audit_logs** — `id` (bigint identity; gives a total order for the hash
chain), `occurred_at`, `actor_user_id`, `actor_role`, `actor_label`,
`action`, `resource_type`, `resource_id`, `summary`, `reason`, `metadata`
(jsonb), `ip_address`, `prev_hash`, `hash`. A trigger rejects `UPDATE` and
`DELETE`. `hash = sha256(prev_hash || canonical_json(entry))`; inserts take
`pg_advisory_xact_lock` so the chain is linear.

**system_settings** — `key` (PK), `value` (jsonb), `updated_by`,
`updated_at`.

## 5. Database functions (SECURITY DEFINER)

All are owned by the owner role, have `search_path` pinned, and are the only
way the app role can read the ballot tables.

| Function | Returns | Guard |
|---|---|---|
| `election_tally(election_id)` | `(position_id, candidate_id, votes)` — `candidate_id NULL` = abstentions | Raises unless election status ∈ `CLOSED`, `RESULTS_PUBLISHED`, `ARCHIVED`. |
| `election_ballot_count(election_id)` | `bigint` | none (count only — turnout is already visible). |
| `mix_ballots(election_id)` | `integer` (ballots rewritten) | Raises unless status is `CLOSED`. Re-inserts ballots with new random IDs in random order in one transaction. |
| `verify_receipt(receipt_hash)` | `election_id` or NULL | none (inclusion proof only; returns no selections). |

## 6. Key constraints and indexes

* `users_email_unique`, `members_email_unique`, `members_membership_number_unique` (partial, non-null).
* `voter_participation_election_member_unique` — one vote per member.
* `ballots_receipt_hash_unique`.
* `ballot_selections_unique` on (`ballot_id`, `position_id`, `candidate_id`).
* `executive_positions_election_title_unique`.
* `candidates_position_member_unique` (partial, non-null member).
* CHECK `elections.closes_at > opens_at`; CHECK `max_selections >= 1`.
* Indexes on all foreign keys and on common filters (`members.approval_status`,
  `email_jobs.status, next_attempt_at`, `audit_logs.occurred_at`).

## 7. Transactions

| Operation | Boundary |
|---|---|
| Cast ballot | One transaction: election `FOR SHARE`, voter roll row `FOR UPDATE`, participation insert, ballot + selections insert. |
| Close election | Election `FOR UPDATE`, status change, history, audit, `mix_ballots()`. |
| Publish results | Election `FOR UPDATE`, compute tally, insert snapshot, status change, audit, enqueue emails. |
| Issue credentials | Per member: hash new password, update user, insert encrypted email job, audit. |
| Commit CSV import | One transaction for all valid rows; duplicates re-checked inside. |
| Audit insert | Inside the caller's transaction, under an advisory lock. |

## 8. Retention

Defaults (to be confirmed by MOBA 2017 — see DEVELOPMENT_PLAN.md §4):
members, elections, anonymous ballots and audit logs are retained
indefinitely; members are soft-deleted. Expired sessions, used/expired reset
tokens and stale rate-limit windows are purged by the maintenance cron.
Credential ciphertext is erased immediately after successful delivery.
