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

### Windows note

Run the test commands from a shell whose current directory uses an upper-case drive letter
(`E:\onion\election`, not `e:\onion\election`). With a lower-case drive letter Node resolves Vitest twice
and every suite fails with "Vitest failed to find the runner".

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
| Production environment guards (https, Resend, cron secret, no file transport) | `tests/unit/env-and-errors.test.ts` |

## Results log

| Date | Phase | Result |
|---|---|---|
| 2026-11-26 | 2 | 5 files, 39 tests passed (unit + integration). `tsc --noEmit` clean, `eslint .` clean, `next build` succeeded. Manual smoke test: CSP nonce header present, `/admin` without session → 307 to `/login`. |
| 2026-11-26 | 3 | 8 files, 72 tests passed. Typecheck, lint and build clean (no warnings). Smoke test on `next start`: `/login` 200, invalid reset link handled, `/api/health` 200, `/admin` 307, unauthenticated export 401, cron without secret 401. `admin:create` verified against the dev database. |
