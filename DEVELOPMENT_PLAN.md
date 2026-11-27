# Development Plan — MOBA 2017 Digital Election Management System

## 1. Starting state (Phase 1 inspection)

* Working directory and the GitHub repository were empty: no existing
  application, dependencies, database configuration, authentication,
  environment variables or deployment configuration. Nothing to preserve or
  migrate.
* Tooling available: Node.js 26, npm 11, Git, Docker (used for a local
  PostgreSQL 17 instance).
* Branding: the Mfantsipim Old Boys Association logo (red crest and red
  "MOBA" wordmark). The interface follows Mfantsipim School's colours, crimson
  and black: crimson leads (headers, hero, navigation, primary actions), black
  carries text and the footer, on a light warm background. The school motto
  "Dwen Hwɛ Kan" (Think and look ahead) appears in the footer and menus. This
  replaces the brief's navy-and-gold suggestion.

## 2. Phases

Each phase ends with type-check, lint, tests and a commit.

| # | Phase | Deliverables | Exit criteria |
|---|---|---|---|
| 1 | Inspection and architecture | README, ARCHITECTURE, DATABASE, SECURITY, DEVELOPMENT_PLAN | Design reviewed against all requirements |
| 2 | Foundation | Next.js 16 + TS strict + Tailwind v4 + shadcn/ui, env validation, Drizzle schema + migrations incl. SQL functions, DB roles/hardening script, layout, error pages, security headers, Vitest | `db:migrate` + `db:harden` succeed on a clean DB; build passes |
| 3 | Authentication and members | Argon2id, sessions, login/logout, lockout, rate limits, password reset, forced first-login change, member CRUD, approval, CSV import with preview, credential issuing, email outbox + Resend + templates | Onboarding flow integration-tested end to end |
| 4 | Roles and permissions | Permission matrix, guards, admin/committee/voter shells, account management, committee read-only enforcement | Committee write attempts rejected at service + endpoint level (tests) |
| 5 | Elections and candidates | Lifecycle, scheduling, positions, candidates + photos, voter roll, announcements, ballot freeze, emergency procedure | Lock rules tested |
| 6 | Voting engine | Ballot UI, review + confirm, transactional submission, receipts, participation, receipt verification; security review | Concurrency + secrecy tests pass |
| 7 | Results and reporting | Tally, turnout, winners/ties, publication snapshot, tie resolutions, CSV/PDF exports | Count accuracy and visibility tests pass |
| 8 | Dashboards and UX | Public pages, complete admin/committee/voter dashboards, mobile polish, empty/loading/error states | Every control wired to a real function |
| 9 | Testing and security review | Playwright E2E for the 18 acceptance tests, full suite, review fixes | No open critical/high issues |
| 10 | Deployment readiness | DEPLOYMENT, guides, API docs, cron config, backup/recovery | Documented, reproducible deploy |

## 3. Risks

| Risk | Mitigation |
|---|---|
| Ballot-secrecy correlation via DB internals | Privilege-restricted app role, post-close mixing, documented trust boundary |
| Email deliverability (Ghana mail providers, spam filters) | Verified sending domain (SPF/DKIM/DMARC) on Resend, delivery tracking, admin-visible failures, resend flow |
| Members with limited technical experience | Plain-language UI, large touch targets, step-by-step ballot, VOTER_GUIDE |
| Load spike at opening | Small payloads, pooled connections, indexed queries; Neon autoscaling |
| Admin mistakes | Ballot freeze, confirmation dialogs, reasons on destructive actions, audit log |

## 4. Decisions MOBA 2017 must confirm

The system ships with the defaults below; each is configurable without code
changes unless noted. Please confirm or change them before the first live
election.

1. **Voter eligibility.** Default: the administrator builds each election's
   voter roll from approved, active members (one-click "add all approved
   members", or selective). Are there further criteria (e.g. dues paid)?
2. **Unopposed candidates.** Default: an unopposed candidate appears on the
   ballot with an abstain option and wins with any number of votes; results
   label them "unopposed". Should a Yes/No endorsement vote be used instead?
3. **Abstention.** Default: allowed on every position (per-position switch).
4. **Winning rule.** Default: simple plurality (most votes wins). Is an
   absolute majority or a minimum turnout (quorum) required? (Would need code.)
5. **Tie-breaking procedure.** Default text: "A run-off vote between the tied
   candidates will be organised by the Electoral Committee." Configurable per
   election; the system never auto-breaks ties.
6. **Results visibility.** Default: published results visible to eligible
   voters, the committee and the admin. Alternatives: all members or public.
   Should the Electoral Committee see provisional results *before*
   publication? Default: no (admin only, after close).
7. **Temporary credential validity.** Default: 7 days.
8. **Data retention.** Default: keep members, anonymous ballots, results and
   audit logs indefinitely; members are deactivated rather than erased. Is
   there a retention or erasure policy (Ghana Data Protection Act, 2012)?
