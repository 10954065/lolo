# Testing — MOBA 2017 Digital Election Management System

Only results that were actually executed are recorded here.

## Suites

| Suite | Command | Needs | Location |
|---|---|---|---|
| Unit | `npm run test:unit` | nothing | `tests/unit` |
| Integration | `npm run test:integration` | PostgreSQL (owner URL + app role) | `tests/integration` |
| End-to-end | `npm run test:e2e` | PostgreSQL + built app | `tests/e2e` |

Integration tests recreate a dedicated database (`moba_election_test`) on every run, apply all migrations
and the production privilege hardening, and then connect as the restricted `moba_app` role — the same
role the deployed application uses. Security properties of the database are therefore tested as they
run in production, not as a superuser.

### Windows notes

* Run the test commands from a shell whose current directory uses an upper-case drive letter
  (`E:\onion\election`, not `e:\onion\election`). With a lower-case drive letter Node resolves Vitest twice
  and every suite fails with "Vitest failed to find the runner".
* `@node-rs/argon2` and `sharp` need the **Microsoft Visual C++ 2015–2022 Redistributable (x64)**
  (`VCRUNTIME140_1.dll`). If tests fail with "Cannot find native binding", install or repair it
  (`winget install Microsoft.VCRedist.2015+.x64`). Linux hosts such as Vercel are not affected.

## Coverage of security properties

| Property | Test |
|---|---|
| App role cannot read, update or delete ballots (incl. `xmin`/`ctid`) | `tests/integration/db-security.test.ts` |
| Tally refused while an election is open | `tests/integration/db-security.test.ts` |
| Mixing refused before close; after close re-keys ballots, preserves tally, uniform `xmin` | `tests/integration/db-security.test.ts` |
| Audit log append-only even for the owner role | `tests/integration/db-security.test.ts` |
| Participation rows cannot be deleted or rewritten | `tests/integration/db-security.test.ts` |
| Argon2id parameters, verification, salting | `tests/unit/password.test.ts` |
| Temporary passwords: CSPRNG, unambiguous alphabet, character classes, uniqueness | `tests/unit/password.test.ts` |
| AES-256-GCM secret storage with context binding and tamper detection | `tests/unit/crypto.test.ts` |
| Africa/Accra time conversion | `tests/unit/datetime.test.ts` |
| Committee has zero write permissions; no permission exposes ballots | `tests/unit/permissions.test.ts` |
| Committee cannot register, approve, suspend or issue credentials (service level) | `tests/integration/onboarding.test.ts` |
| Unapproved / rejected / suspended members cannot sign in; sessions revoked on suspension | `tests/integration/onboarding.test.ts` |
| Temporary credentials force a password change; old sessions revoked; expiry enforced | `tests/integration/onboarding.test.ts` |
| Identical error for unknown account and wrong password; lockout; per-email rate limit | `tests/integration/onboarding.test.ts` |
| Plaintext temporary password never stored; ciphertext erased after delivery | `tests/integration/onboarding.test.ts` |
| Failed delivery retries with backoff, then FAILED; retry re-sends without new password | `tests/integration/onboarding.test.ts` |
| Password reset: no account enumeration, link single-use, token not stored readable | `tests/integration/onboarding.test.ts` |
| Audit hash chain verifies and contains no secrets | `tests/integration/onboarding.test.ts` |
| CSV formula-injection protection; CSV import header aliases, duplicates, invalid rows | `tests/unit/csv-and-templates.test.ts` |
| Email templates escape all variables and allow only http(s) links | `tests/unit/csv-and-templates.test.ts` |
| Every exported Server Action calls a server-side guard (static scan) | `tests/unit/action-guards.test.ts` |
| Committee rejected by all 19 mutating services and leaves no trace; voters likewise | `tests/integration/roles.test.ts` |
| Staff management needs step-up; last active admin protected; no self role/status change | `tests/integration/roles.test.ts` |
| Voting window is half-open `[opensAt, closesAt)`; votes need status AND clock; transition map | `tests/unit/election-rules.test.ts` |
| Scheduling readiness checks; ballot, candidates, roll and details lock at the opening time (DB clock) | `tests/integration/elections.test.ts` |
| Automatic open/close on the DB clock, voter notifications, ballots mixed at close | `tests/integration/elections.test.ts` |
| Emergency withdrawal needs step-up + 20-char reason; extend, postpone, cancel recorded | `tests/integration/elections.test.ts` |
| Candidate photos re-encoded to 600×600 WebP; non-images rejected by magic bytes | `tests/integration/elections.test.ts` |
| Committee rejected by every election, position, candidate and roll operation | `tests/integration/elections.test.ts` |
| Unapproved / off-roll / suspended / staff accounts cannot vote | `tests/integration/voting.test.ts` |
| No voting before opening or after closing (DB clock); closure stops new ballots | `tests/integration/voting.test.ts` |
| Second ballot rejected; 10 concurrent submissions by one member → exactly 1 ballot | `tests/integration/voting.test.ts` |
| 20 voters concurrently → 20 ballots = 20 participation records | `tests/integration/voting.test.ts` |
| Invalid ballots (missing/extra/foreign/too many/abstain rules/withdrawn) record nothing | `tests/integration/voting.test.ts` |
| Failure after participation insert rolls back everything (no partial ballot) | `tests/integration/voting.test.ts` |
| Close racing with 15 in-flight votes keeps ballots = participation | `tests/integration/voting.test.ts` |
| Ballot tables have no voter/time/IP columns; receipt only hashed; email has no choices | `tests/integration/voting.test.ts` |
| Only ballot-box.ts touches ballot tables; voting never logs/audits; UUID v4 ids | `tests/unit/ballot-isolation.test.ts` |
| Closing irreversible for the app role; tally needs mix; state log append-only; composite FKs | `tests/integration/db-security.test.ts` |
| Production environment guards (https, Resend, cron secret, no file transport) | `tests/unit/env-and-errors.test.ts` |

## Results log

| Date | Phase | Result |
|---|---|---|
| 2026-11-26 | 2 | 5 files, 39 tests passed (unit + integration). `tsc --noEmit` clean, `eslint .` clean, `next build` succeeded. Manual smoke test: CSP nonce header present, `/admin` without session → 307 to `/login`. |
| 2026-11-26 | 3 | 8 files, 72 tests passed. Typecheck, lint and build clean (no warnings). Smoke test on `next start`: `/login` 200, invalid reset link handled, `/api/health` 200, `/admin` 307, unauthenticated export 401, cron without secret 401. `admin:create` verified against the dev database. |
| 2026-11-26 | 4 | 10 files, 141 tests passed. Typecheck, lint and build clean. |
| 2026-11-26 | 5 | 12 files, 185 tests passed. Typecheck, lint and build clean. |
| 2026-11-27 | 6 | 15 files, 220 tests passed (incl. security-review regression tests). Typecheck, lint and build clean. Independent security review of the ballot path: no critical findings; H1, H2, M1, M2, L1, L3, L4 fixed. |
