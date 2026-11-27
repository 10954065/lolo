# Architecture — MOBA 2017 Digital Election Management System

Organization: **MOBA 2017** (Mfantsipim Old Boys Association, 2017 year group)
Developed by: **Sunleon Router Enterprise**

This document describes how the platform is put together, why, and what it
trusts. Database detail lives in [DATABASE.md](DATABASE.md); threat model and
controls live in [SECURITY.md](SECURITY.md).

---

## 1. System overview

```
                         ┌──────────────────────────────────────────────┐
  Browser (mobile/desk)  │  Next.js 16 App Router  (Vercel, Node runtime)│
  ───────────────────▶   │                                              │
  HTTPS, HttpOnly cookie │  proxy.ts ── coarse route gating (session?)  │
                         │  app/(public)   app/admin   app/committee    │
                         │  app/dashboard (voter)      app/api/*        │
                         │        │ Server Actions / Route Handlers     │
                         │        ▼                                     │
                         │  server/actions  — parse + validate (Zod)    │
                         │        ▼                                     │
                         │  server/services — authorization + business  │
                         │        │            rules + transactions     │
                         │        ├── ballot-box  (ONLY code touching   │
                         │        │                ballot tables)        │
                         │        ├── audit       (hash-chained log)    │
                         │        └── email       (outbox + Resend)     │
                         └────────┬─────────────────────────┬───────────┘
                                  │ pg (TLS)                │ HTTPS
                                  ▼                         ▼
                     Neon PostgreSQL 17              Resend (email)
                     • app role  (least privilege)   • webhooks → delivery
                     • owner role (migrations only)    status updates
```

### Request path

1. `proxy.ts` (Next.js 16 replacement for `middleware.ts`) does a **coarse**
   check only: protected prefixes require a session cookie to be present,
   otherwise redirect to `/login`. It never makes an authorization decision.
2. Every page, Server Action and Route Handler calls a **guard**
   (`requireUser`, `requireRole`, `requirePermission`) which validates the
   session against the database.
3. Every **mutating service function** re-checks permission itself
   (`assertCan(actor, "members.write")`). Committee and voter accounts are
   rejected here even if an action or endpoint is called directly.
4. Services run inside explicit database transactions where more than one
   row must change atomically.

Authorization is therefore enforced in three layers (route → action/handler →
service), and the database itself enforces ballot-table privileges (§4).

---

## 2. Technology decisions

| Concern | Choice | Why |
|---|---|---|
| Framework | Next.js 16 App Router, React 19, TypeScript strict | Server Components keep data on the server; Server Actions have built-in Origin checking (CSRF). |
| Styling | Tailwind CSS v4 + shadcn/ui + lucide-react | Accessible primitives (Radix), owned source, no runtime CSS cost. |
| ORM | **Drizzle ORM** with `pg` (node-postgres) | SQL-close, typed, first-class migrations, supports interactive transactions and row locks (`FOR UPDATE`/`FOR SHARE`) required by the voting engine. |
| Database | PostgreSQL 17 (Neon in production, Docker locally) | Constraints, row locks, `SECURITY DEFINER` functions and role privileges are all used as security controls. |
| Validation | Zod 4 | One schema per input boundary. |
| Password hashing | Argon2id via `@node-rs/argon2` | OWASP-recommended parameters (19 MiB, t=2, p=1); prebuilt native binaries run on Vercel. |
| Sessions | Database-backed opaque sessions (see ADR-1) | Revocable, server-side, HttpOnly cookie holds only a random token; DB stores its SHA-256. |
| Email | Resend + transactional outbox table | Delivery status tracked per message; retries are safe and idempotent. |
| PDF | `pdf-lib` | Pure JS, runs in serverless functions. |
| CSV | `papaparse` | Robust RFC-4180 parsing incl. Excel-exported CSV with BOM. |
| Images | `sharp` | Re-encodes candidate photos (strips EXIF/GPS, resizes, defeats polyglot files). Stored in Postgres — no extra paid storage. |
| Tests | Vitest (unit + integration against real Postgres), Playwright (E2E) | Integration tests run as the **restricted app DB role** so privilege rules are exercised. |
| Hosting | Vercel (Fluid Compute, Node runtime) + Neon + Resend + GitHub | All have free/low-cost tiers suitable for a year-group association. |

### ADR-1: Authentication implementation

**Decision:** Implement authentication in-house on vetted primitives
(`node:crypto` CSPRNG/SHA-256, `@node-rs/argon2`) following the OWASP Session
Management Cheat Sheet and the Lucia/"Copenhagen Book" session design, instead
of adopting a full auth framework.

**Context:** Accounts are provisioned only by the System Administrator (no
self-registration, no social login). Requirements include admin-issued
temporary passwords with expiry, forced first-login change, account lockout,
role-based routing for exactly three roles, step-up re-authentication for
critical actions, and "sign out everywhere". Full frameworks (Auth.js, Better
Auth) are designed around self-service sign-up and OAuth; bending them to
this model adds surface area we would still have to audit.

**Consequences:** The auth surface is small and fully covered by unit and
integration tests. We own its maintenance. Session tokens are 160-bit random
values; only their SHA-256 is stored, so a database leak does not yield usable
sessions.

### ADR-2: Ballot storage behind a database privilege boundary

**Decision:** The application connects with a least-privilege role
(`moba_app`) that may only `INSERT` into `ballots` and `ballot_selections`.
It has no `SELECT`, `UPDATE` or `DELETE` on those tables. Reading ballot data
is only possible through `SECURITY DEFINER` functions that return
**aggregates** and refuse to run while voting is open.

**Consequences:** Ballot secrecy and "no live results" do not depend solely on
application code being bug-free; even a SQL-injection bug in the app could not
read individual ballots. Migrations run with a separate owner role.

### ADR-3: Photos in Postgres, not object storage

Candidate photos are small (re-encoded WebP, typically under 80 KB) and few
(tens). Storing them in a `candidate_photos` table avoids another paid service
and keeps backups in one place. They are served via a cached Route Handler.

---

## 3. Roles and permission model

Exactly three roles exist. There is **no** separate Election Administrator.

| Role | Purpose | Can write? |
|---|---|---|
| `SYSTEM_ADMIN` | Sole operational authority | Yes — everything |
| `ELECTORAL_COMMITTEE` | Observe, review, verify | **No** — strictly read-only |
| `VOTER` | Approved member taking part in elections | Only own password, and casting their own ballot |

Permissions are declared once in `src/server/auth/permissions.ts` as a
role → permission matrix. Examples:

| Permission | Admin | Committee | Voter |
|---|:-:|:-:|:-:|
| `members.read` | ✔ | ✔ | — |
| `members.write` (add/edit/approve/suspend/import) | ✔ | — | — |
| `credentials.send` | ✔ | — | — |
| `elections.read` | ✔ | ✔ | own eligible only |
| `elections.write` / `elections.transition` | ✔ | — | — |
| `positions.write`, `candidates.write` | ✔ | — | — |
| `results.publish` | ✔ | — | — |
| `results.read.unpublished` | ✔ (after close) | — | — |
| `results.read.published` | ✔ | ✔ | per visibility setting |
| `participation.read` (aggregate + who-voted) | ✔ | ✔ | — |
| `audit.read` | ✔ | ✔ | — |
| `emails.read` | ✔ | ✔ | — |
| `reports.export` | ✔ | ✔ | — |
| `accounts.manage` (admins/committee) | ✔ | — | — |
| `settings.write` | ✔ | — | — |
| `ballot.cast` | — | — | ✔ |

No permission anywhere grants "read individual ballot" — that capability does
not exist in the application or in the app's database role.

The committee UI shows a persistent **READ-ONLY ACCESS** banner and renders no
operational controls; but the guarantee comes from the service layer, which
is covered by tests that call mutating services and endpoints with a
committee session and assert rejection.

---

## 4. Secret ballot design

### 4.1 Data separation

```
voter_participation                       ballots
───────────────────                       ───────
id          uuid v4                       id            uuid v4 (random)
election_id                               election_id
member_id   ──▶ members                   receipt_hash  sha256(receipt)   UNIQUE
voted_at    timestamptz                   (no voter, no time, no IP, no UA)
UNIQUE(election_id, member_id)
                                          ballot_selections
                                          ─────────────────
                                          id, ballot_id, election_id,
                                          position_id, candidate_id | NULL (abstain)
```

There is no column, foreign key, shared identifier or timestamp linking the
two sides.

### 4.2 Correlation channels and how each is handled

| Channel | Mitigation |
|---|---|
| Direct foreign key | None exists. |
| Predictable / time-ordered IDs | Ballot IDs are UUID **v4** (random). UUID v7/ULID are banned for ballot tables because they embed time. |
| Timestamps | Ballot rows carry **no** timestamp. Only participation has `voted_at`. |
| Receipt | Random 125-bit receipt (25 Crockford base32 characters) shown to the voter once. Only `sha256(receipt)` is stored, and only on the ballot side. It is never stored with the voter, never emailed, never logged. |
| Insertion order / physical row order (`ctid`) and transaction id (`xmin`) | While voting is open, participation and ballot rows are written in the same transaction (required for atomicity), so a **database superuser** could correlate them via system columns. The app role cannot read ballot rows at all. When the election closes, `mix_ballots()` re-writes every ballot with new random IDs in random order in one transaction (uniform `xmin`, shuffled `ctid`). |
| Application logs | The vote path logs no identifiers or selections; errors are logged with a generic code. |
| Audit log | Casting a vote is **not** written to the audit log (participation is already recorded separately). |
| Email | Participation confirmation email states only that the member voted and when; never choices or receipt. |
| Reports/exports/APIs | Results are aggregates from `election_tally()`; participation reports list who voted, never what. |
| Small-number inference | If only one voter voted, the tally trivially reveals their choice. This is inherent to any election; reports show turnout so observers can judge. |

### 4.3 Vote submission (single transaction)

```
BEGIN (READ COMMITTED)
  SELECT election ... FOR SHARE              -- closing takes FOR UPDATE → serialized
  SELECT election_voters row FOR UPDATE      -- serializes tabs/devices of same voter
  check status ∈ {SCHEDULED, OPEN} and clock_timestamp() ∈ [opens_at, closes_at)
                                              -- wall clock AFTER the locks: lock waits cannot extend the window
  check member approved+active, user active, password not temporary
  check no participation yet
  validate selections against frozen positions/approved candidates
  INSERT voter_participation  (UNIQUE(election_id, member_id) is the hard stop)
  INSERT ballots (random id, sha256(receipt))  -- driver errors replaced by a sanitized message
  INSERT ballot_selections (one row per choice / abstention)
COMMIT
→ return receipt (plaintext) once
```

Any failure rolls back everything: no participation without a ballot and no
ballot without participation. A double-click, second tab or network retry hits
the row lock and then the unique constraint and receives "You have already
voted".

### 4.4 Trust assumptions (stated honestly)

Ballot secrecy is guaranteed **against everyone using the application**:
System Administrators, Electoral Committee, voters, and anyone exploiting an
application-level bug (the app's DB role cannot read ballots).

It is **not** guaranteed against:

* someone holding the **database owner/superuser credentials or Neon account**
  who performs forensic analysis *while voting is open* (system columns) or
  afterwards of WAL, point-in-time-restore history, backups, or the dead heap
  tuples and index entries that `mix_ballots()` leaves behind until VACUUM
  (they still carry the pre-mix ids, `xmin` and physical order);
* someone who can modify and redeploy the application code during an election.

Someone able to run arbitrary SQL as the **application** role (e.g. through an
injection bug) still cannot read individual ballots. They could force an election
into `CLOSED` to obtain a tally, but a database trigger makes closing
irreversible (no reopening, no change of the voting window) and every status
change is recorded in the owner-only `election_state_log`. The tally also
requires the post-close mix. Such an attack therefore ends voting visibly; it
cannot be a silent mid-vote peek.

These parties must be restricted operationally (see SECURITY.md §6). After each
election the operator should run `VACUUM (FULL) ballots, ballot_selections` to
discard pre-mix tuples.
This system does **not** implement end-to-end verifiable cryptographic voting
(e.g. mix-nets or homomorphic tallying) and does not claim to. Receipts prove
*inclusion* of a ballot in the stored ballot box, not its content.

---

## 5. Election lifecycle

```
DRAFT ─▶ REGISTRATION ─▶ NOMINATION ─▶ CANDIDATE_APPROVAL ─▶ SCHEDULED ─▶ OPEN ─▶ CLOSED ─▶ RESULTS_PUBLISHED ─▶ ARCHIVED
  │           │               │                │                  │          │
  └───────────┴───────────────┴────────────────┴──────────────────┴──────────┴──▶ CANCELLED (reason required)
```

* All transitions are performed by the System Administrator through one
  service (`transitionElection`) with an explicit allowed-transition map.
  Intermediate preparation stages may be skipped (e.g. `DRAFT → SCHEDULED`).
* **Postpone** = `SCHEDULED` (or `OPEN` with zero ballots) → `SCHEDULED` with
  new dates and a mandatory reason.
* **Time is authoritative on the server.** Voting is accepted only when
  status is `SCHEDULED` or `OPEN` *and* the DB clock is within
  `[opens_at, closes_at)`. A scheduled job (and lazy sync on read) records
  the automatic `SCHEDULED→OPEN` and `OPEN→CLOSED` transitions in the audit
  log with actor `system`.
* **Ballot freeze:** once `opens_at` is reached (or status is `OPEN`), the
  ballot structure (positions, candidates, rules, eligible voter list) is
  locked. Edits are rejected by the service layer.
* **Emergency procedure** (documented in ADMIN_GUIDE.md): during voting the
  administrator may only (a) withdraw a candidate, (b) extend the closing
  time, or (c) cancel the election. Each requires a written reason
  (≥ 20 characters) and password re-confirmation, and is audit-logged as
  `EMERGENCY_*`. Votes already cast are never altered.
* **Close:** `CLOSED` triggers `mix_ballots()`; tallies become readable.
* **Publish:** a results snapshot (JSON + SHA-256) is frozen; published
  results always render from the snapshot.

---

## 6. Module layout

```
src/
  app/
    (public)/            landing, about, elections, candidates, guidelines, help, verify-receipt
    (auth)/              login, forgot-password, reset-password, change-password
    admin/               System Administrator dashboard
    committee/           Electoral Committee dashboard (read-only)
    dashboard/           Voter dashboard, ballot, confirmation, results
    api/                 exports, candidate photos, cron, webhooks, health
  components/            ui/ (shadcn), layout/, shared domain components
  lib/                   client-safe helpers (dates in Africa/Accra, formatting)
  server/
    db/                  client, schema
    auth/                password, session, guards, permissions, rate-limit
    services/            members, imports, credentials, elections, positions,
                         candidates, voting, ballot-box, results, reports,
                         audit, email/, settings, accounts, announcements
    actions/             thin Server Actions: Zod parse → service → revalidate
    validation/          Zod schemas shared by actions and services
  emails/                MOBA-branded HTML + text templates
drizzle/                 SQL migrations
tests/
  unit/  integration/  e2e/
```

Rule: only `src/server/services/ballot-box.ts` may import ballot tables. A
unit test scans the source tree and fails if any other file references them.

---

## 7. Time handling

* Database columns are `timestamptz`; values are stored in UTC.
* All display uses the `Africa/Accra` time zone (`src/lib/datetime.ts`).
* Admin date inputs are interpreted as Africa/Accra wall-clock time and
  converted to UTC on the server.
* Countdown timers on the client are informational only.

---

## 8. Email delivery

`email_jobs` is a transactional outbox: business operations insert a job in
the same transaction as the state change, then a dispatcher sends it.
Credential emails keep their secret part **encrypted** (AES-256-GCM,
`CREDENTIALS_ENCRYPTION_KEY`) only until delivery succeeds, then the
ciphertext is erased. Retries reuse the same ciphertext, so a retry never
generates a new password; "resend" after successful delivery is an explicit,
audited **regenerate** action. Resend webhooks (Svix-signed) update
`DELIVERED` / `BOUNCED` / `COMPLAINED`. A Vercel Cron calls the dispatcher to
retry with exponential backoff.

---

## 9. Results

* Counts come only from `election_tally(election_id)` (SECURITY DEFINER,
  refuses unless the election is `CLOSED` or later).
* Per position: candidate totals, percentage of ballots cast, abstentions,
  winner(s) by plurality (`seats = max_selections`), and **tie** detection
  when the last winning seat is shared. Ties are never auto-resolved; an
  administrator may record the outcome of MOBA's approved tie-break procedure
  as a separate, audited record that never changes the counts.
* Invalid ballots: the server rejects malformed ballots before recording, so
  the recorded count of invalid ballots is always 0 and is shown as such.
* Integrity check: `ballot count == participation count` is displayed on the
  results page for admin and committee.
