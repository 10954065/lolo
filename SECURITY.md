# Security — MOBA 2017 Digital Election Management System

This document is the threat model and control inventory. Every control
listed as **Implemented** has an automated test referenced in
[TESTING.md](TESTING.md). Anything not yet implemented is listed under
§7 Known limitations — nothing here is claimed without being built.

---

## 1. Assets

1. **Ballot secrecy** — the link between a member and their choices.
2. **Ballot integrity** — every valid ballot counted exactly once; no other ballots.
3. **Eligibility** — only approved, eligible members vote, once.
4. **Result confidentiality before publication.**
5. **Member personal data** (names, emails, phone numbers).
6. **Administrative control** of the platform.
7. **Audit trail** integrity.

## 2. Actors and threats

| Actor | Example threats |
|---|---|
| Anonymous internet user | credential stuffing, brute force, enumeration, XSS/CSRF, DoS on login |
| Voter | double voting, voting outside window, reading others' data, tampering ballot payload, viewing unpublished results |
| Electoral Committee member | attempting write operations via direct API/Server Action calls; trying to learn individual votes |
| System Administrator | trying to learn individual votes; covering tracks in the audit log; changing ballots after voting starts |
| Compromised admin account | mass changes, credential re-issue, early result exposure |
| Database operator / Neon account holder | forensic correlation of participation and ballots (see §6) |
| Email provider | sees recipients and email content (credentials are therefore temporary and must be changed on first login) |

## 3. Controls

### Authentication
* Argon2id (`m=19456 KiB, t=2, p=1`), PHC string storage, constant-time verify.
* Temporary passwords: 12 characters from a 54-symbol unambiguous alphabet
  using `crypto.randomInt` (≈ 69 bits), expire after the configured number of
  days (default 7), and force a change on first login.
* Password policy: minimum 10 characters, maximum 128, must not equal the
  temporary password, checked against a small list of common passwords.
* Login responses are generic ("Invalid email or password") for unknown
  users, wrong passwords and locked accounts alike; unknown-user attempts still
  run an Argon2 verification against a dummy hash to equalize timing.
* Account lockout: 5 consecutive failures → 15-minute lock (configurable).
* Rate limiting (DB-backed fixed window): login per IP and per email, password
  reset requests per IP and per email, receipt verification per IP.
* Password reset: 256-bit token, only SHA-256 stored, 30-minute expiry,
  single use, all sessions revoked on reset; response never reveals whether an
  account exists.

### Sessions
* 160-bit random token in an `HttpOnly`, `Secure` (production),
  `SameSite=Lax`, `Path=/` cookie (`__Host-` prefix in production).
* Server stores only `sha256(token)`; sessions are revocable.
* Absolute lifetime: 12 h voters, 8 h staff; idle timeout 30 min for staff.
* New session on login (fixation defence); all sessions revoked on password
  change/reset, suspension and role change.
* Step-up re-authentication (password re-entry within the last 10 minutes)
  for emergency election actions, credential regeneration and account
  management.

### Authorization
* Single permission matrix; checked in pages/actions **and** inside every
  mutating service function.
* Committee: zero write permissions; tested against every mutating service
  and every mutating endpoint.
* Voters see only their own profile and only elections they are eligible for.
* `proxy.ts` is a convenience redirect only, never the control.

### Ballot secrecy
See [ARCHITECTURE.md §4](ARCHITECTURE.md#4-secret-ballot-design). Summary:
separate tables with no linking key or timestamp, random IDs, receipt hash
only on the ballot side, app DB role cannot read ballot rows, aggregate-only
SECURITY DEFINER functions, post-close mixing, no vote events in audit logs
or application logs, no choices in emails/receipts/exports.

### Integrity
* One-vote guarantee: unique constraint + row lock + transactional insert.
* Window enforcement uses the database wall clock (`clock_timestamp()`) read
  after the vote transaction holds its locks; closing takes a conflicting row
  lock so a vote is either fully before the close or rejected.
* Closing is irreversible at the database level; tallies require the
  post-close mix; ballot and participation counts are reconciled at close
  (mismatch → `INTEGRITY_WARNING` audit entry and publication is refused).
* Composite foreign keys tie every ballot selection to a position and
  candidate of the same election.
* Ballot structure frozen at opening; emergency changes restricted, reasoned,
  re-authenticated and audited.
* Selections validated server-side against approved candidates of the
  correct position and per-position min/max/abstain rules.
* Published results frozen as a hashed snapshot.

### Input handling
* Zod validation at every boundary; length limits on all strings.
* Drizzle parameterized queries only; no string-built SQL from input.
* React escaping for all output; manifestos/biographies are rendered as plain
  text with line breaks (no HTML/Markdown rendering).
* CSV upload: size limit 2 MB, max 5 000 rows, MIME/extension check, parsed
  server-side; formula-injection-safe CSV export (cells starting with
  `= + - @ \t \r` are prefixed with `'`).
* Image upload: 5 MB limit, magic-byte sniffing (JPEG/PNG/WebP only),
  re-encoded by `sharp` to WebP (strips metadata, defeats polyglots).

### Transport and headers
* HSTS (production), `Content-Security-Policy` with per-request nonce,
  `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`,
  `X-Frame-Options: DENY` / `frame-ancestors 'none'`, `Permissions-Policy`
  denying camera/mic/geolocation.
* CSRF: Server Actions validate `Origin` against `Host` (Next.js built-in);
  state-changing Route Handlers validate `Origin`; cookies are `SameSite=Lax`.

### Secrets
* All secrets come from environment variables validated at startup
  (`src/server/env.ts`); none are `NEXT_PUBLIC_*`. `server-only` imports
  prevent server modules from being bundled for the browser.
* `.env*` files are git-ignored; `.env.example` contains no values.

### Audit
* Append-only `audit_logs` (trigger blocks UPDATE/DELETE), SHA-256 hash
  chain verifiable from the admin and committee dashboards.
* Never contains passwords, tokens, receipts, session IDs or ballot choices.

### Error handling
* Domain errors carry user-safe messages; unexpected errors are logged
  server-side with a correlation ID and shown to the user as a generic message
  with that ID.

## 4. Edge cases covered

Duplicate registration, invalid emails, incomplete CSV rows, failed imports,
email provider outage (outbox retry), expired temporary passwords, locked
accounts, unapproved voters, early/late voting, double submit, multiple tabs,
dropped connection during submit, simultaneous submissions at close,
candidate withdrawal during voting, postponement, cancellation, ties,
committee calling admin endpoints directly. See TESTING.md for the test list.

## 5. Administrator account compromise

Mitigations: strong unique passwords + lockout, short idle sessions,
step-up re-authentication for critical actions, "sign out all sessions",
full audit trail visible to the committee, inability of any admin to read
individual ballots or alter the audit log, and the ballot freeze preventing
silent ballot changes once voting starts. Recommended: at least two admin
accounts held by different people, each reviewing the audit log.

## 6. Operational requirements (outside the code)

1. Only the hosting operator holds `DATABASE_OWNER_URL`; it is **not** set in
   Vercel. The app runs with `moba_app` (`npm run db:harden`).
2. Neon/Vercel/Resend accounts use MFA and are held by named people agreed
   by MOBA 2017.
3. No code deployments during an open election window except emergency fixes
   approved by the Electoral Committee.
4. Database console access during an election is logged and avoided.

## 7. Known limitations

* No end-to-end cryptographic verifiability (see ARCHITECTURE.md §4.4).
* A database superuser can correlate rows via system columns while voting is
  open; point-in-time history, backups and not-yet-vacuumed dead tuples retain
  pre-mix state (run `VACUUM (FULL) ballots, ballot_selections` after each
  election).
* The app role can still force an election closed early (visible and
  irreversible, logged in `election_state_log`); it cannot read ballots or reopen.
* A candidate withdrawn in the instant between ballot validation and commit can
  still receive that one vote (reported transparently with the withdrawn label).
* Phase 6 security review (2026-11-27) findings H1, H2, M1, M2, L1, L3, L4 were
  fixed in migration `0002_ballot_hardening` and the voting service; see TESTING.md.
* Email is not end-to-end confidential; temporary credentials rely on
  expiry + forced change.
* No multi-factor authentication for staff accounts in this release; it is
  the top recommended follow-up.
* Rate limiting is per-instance-agnostic but DB-backed; a large distributed
  attack should additionally be mitigated by the Vercel Firewall.

## 8. Reporting a vulnerability

Contact Sunleon Router Enterprise privately. Do not open a public issue.
