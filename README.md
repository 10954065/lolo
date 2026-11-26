# MOBA 2017 Digital Election Management System

A secure digital election platform for **MOBA 2017** (Mfantsipim Old Boys Association, 2017 year group),
developed by **Sunleon Router Enterprise**.

Approved members receive individual credentials by email, review the candidates for each executive
position, and cast one secret ballot during the official voting window. The System Administrator runs the
election; the Electoral Committee observes everything in read-only mode; nobody — including
administrators — can see how an individual member voted.

## Documentation

| Document | Contents |
|---|---|
| [ARCHITECTURE.md](ARCHITECTURE.md) | System design, roles, secret-ballot design, lifecycle |
| [DATABASE.md](DATABASE.md) | Schema, roles, functions, transactions |
| [SECURITY.md](SECURITY.md) | Threat model, controls, known limitations |
| [DEVELOPMENT_PLAN.md](DEVELOPMENT_PLAN.md) | Phases, risks, decisions for MOBA 2017 |
| [TESTING.md](TESTING.md) | How to run the test suites and what they prove |

## Tech stack

Next.js 16 (App Router, TypeScript strict) · Tailwind CSS v4 + shadcn/ui · PostgreSQL 17 (Neon) via
Drizzle ORM · Argon2id · Resend · Zod · Vitest · Playwright. Hosted on Vercel.

## Local development

Prerequisites: Node.js 20.9+ (tested on 26), npm, Docker.

```bash
# 1. Start PostgreSQL 17
docker run -d --name moba-election-pg -e POSTGRES_USER=moba -e POSTGRES_PASSWORD=<owner-password> \
  -e POSTGRES_DB=moba_election -p 55432:5432 postgres:17-alpine

# 2. Configure environment
cp .env.example .env.local        # then fill in the values (see comments in the file)

# 3. Install, migrate, and create the least-privilege app role
npm install
npm run db:migrate                # owner role: applies schema + security functions
npm run db:harden                 # creates moba_app (INSERT-only on ballot tables)
npm run db:migrate                # re-applies grants to all tables

# 4. Create the first System Administrator (prints a one-time temporary password)
npm run admin:create -- --email you@example.org --name "Your Name"

# 5. Run
npm run dev                       # http://localhost:3000
```

Without `RESEND_API_KEY`, emails are written to `./.mail-outbox/` (git-ignored) instead of being sent.
This file transport is refused in production.

## Scripts

| Script | Purpose |
|---|---|
| `npm run dev` / `build` / `start` | Next.js |
| `npm run lint` / `typecheck` | ESLint / TypeScript |
| `npm test` | Unit + integration tests (integration needs the database) |
| `npm run test:e2e` | Playwright end-to-end tests |
| `npm run db:generate` | Generate a migration after changing `src/server/db/schema` |
| `npm run db:migrate` | Apply migrations with the owner role and refresh app-role grants |
| `npm run db:harden` | Create/rotate the `moba_app` role and apply least-privilege grants |
| `npm run admin:create` | Bootstrap a System Administrator or Electoral Committee account from the console |

## Status

* Phase 1 — architecture: complete
* Phase 2 — foundation (Next.js, Tailwind/shadcn, schema, migrations, DB hardening, security headers): complete
* Phase 3 — authentication (Argon2id, sessions, lockout, rate limits, reset, forced change) and member
  management (CRUD, approval, CSV import with preview, credential issuing, email outbox with Resend): complete
