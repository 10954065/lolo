# API Documentation — MOBA 2017 Digital Election Management System

The user interface talks to the server through **Next.js Server Actions** (POST, same-origin, CSRF-checked
by Origin) and a small set of **Route Handlers**. There is no public write API.

Every operation authenticates with the HttpOnly session cookie and authorizes on the server in three layers:
page/action/route guard → service-level `assertCan` → database privileges. Responses never include ballot
choices.

## Route handlers

| Method & path | Who | Description |
|---|---|---|
| `GET /api/health` | anyone | `{"status":"ok"}` or 503. No configuration details. |
| `GET /api/candidates/{id}/photo` | public once the ballot is final; staff otherwise | Re-encoded WebP photo with ETag; `404` when not visible. |
| `GET /api/exports/members?includeDeactivated=0\|1` | admin, committee (`members.read`) | Member register CSV. Audited. |
| `GET /api/exports/imports/{importId}/failed` | admin (`members.write`) | Rejected rows of a CSV import. |
| `GET /api/exports/audit?q=&action=&from=&to=` | admin, committee (`audit.read`) | Audit log CSV incl. hash chain. Audited. |
| `GET /api/exports/elections/{id}/candidates.csv` | admin, committee (`reports.export`) | Candidate list. |
| `GET /api/exports/elections/{id}/participation.csv\|pdf` | admin, committee | Who voted and when — never choices. |
| `GET /api/exports/elections/{id}/results.csv\|pdf` | admin after close (provisional or published); others only for published results they may view | Aggregated results. |
| `GET /api/cron/elections` | Vercel Cron (`Authorization: Bearer CRON_SECRET`) | Persist automatic open/close. |
| `GET /api/cron/emails` | Vercel Cron | Retry email outbox; purge expired sessions and rate-limit windows. |
| `POST /api/webhooks/resend` | Resend (Svix signature) | Delivery status updates. `401` on bad signature. |

Errors are JSON `{ "error": "<safe message>" }` with status 400/401/403/404/409/429, or 500 with a reference.

## Server Actions (by module)

All return `{ ok, message?, fieldErrors?, needsReauth?, data? }`. `needsReauth` asks the UI to collect the
password (step-up) and resubmit. Every action except the four public ones calls a server-side guard — this is
enforced by `tests/unit/action-guards.test.ts`.

| Module | Actions | Permission |
|---|---|---|
| `actions/auth.ts` | `loginAction`, `logoutAction`, `forgotPasswordAction`, `resetPasswordAction` (public); `changePasswordAction`, `confirmPasswordAction` (signed in) | — |
| `actions/members.ts` | create, update, approve, reject, suspend, reactivate, deactivate; CSV upload/commit/discard | `members.write` |
| `actions/credentials.ts` | issue credentials, regenerate (step-up), retry email, send queued emails | `credentials.send`, `emails.write` |
| `actions/accounts.ts` | staff accounts (step-up), revoke sessions, settings | `accounts.manage`, `settings.write` |
| `actions/elections.ts` | elections, lifecycle, postpone/extend/cancel (step-up), positions, candidates, voter roll, announcements | `elections.*`, `positions.write`, `candidates.write`, `voters.write`, `announcements.write` |
| `actions/voting.ts` | `castBallotAction` (voter); `verifyReceiptAction` (public, rate-limited) | `ballot.cast` |
| `actions/results.ts` | publish / withdraw publication / record tie-break (step-up) | `results.publish` |

## Database functions (SECURITY DEFINER)

| Function | Returns | Guard |
|---|---|---|
| `election_tally(uuid)` | `(position_id, candidate_id, votes)` | election closed **and** ballots mixed |
| `election_ballot_count(uuid)` | `bigint` | — |
| `verify_receipt(text)` | election id or NULL | — |
| `mix_ballots(uuid)` | ballots rewritten | election CLOSED |

## Rate limits

Login: 30/15 min per IP, 10/15 min per email · Password reset: 10/h per IP, 3/h per email · Ballot submission:
20/15 min per member · Receipt check: 30/15 min per IP · Step-up: 10/15 min per user.
