# Deployment — MOBA 2017 Digital Election Management System

Target: **Vercel** (application) · **Neon** (PostgreSQL 17) · **Resend** (email) · **GitHub** (source).
No secret appears in this repository; every value below is set in the provider dashboards.

## 1. Accounts (one-time)

* Create the Neon, Vercel and Resend accounts under an organisational email agreed by MOBA 2017 and enable
  multi-factor authentication on all three. Record who holds each account.
* Choose the production domain (e.g. `vote.moba2017.org`).

## 2. Database (Neon)

1. Create a project close to Ghana (e.g. an EU region), PostgreSQL 17.
2. Copy the **owner** connection string — keep it only on the operator's machine.
3. From a trusted machine with the repository checked out:

   ```bash
   npm ci
   export DATABASE_OWNER_URL='postgres://<owner>:…@…neon.tech/neondb?sslmode=require'
   export MOBA_APP_DB_PASSWORD="$(openssl rand -base64 30)"   # store in a password manager
   npm run db:migrate     # schema + security functions
   npm run db:harden      # creates moba_app (INSERT-only ballots, append-only audit)
   npm run db:migrate     # refreshes grants
   ```

4. Build the **app** connection string for role `moba_app` using Neon's **pooled** host and `sslmode=require`.
   This is `DATABASE_URL` for Vercel.
5. Keep Neon point-in-time restore enabled.

`DATABASE_OWNER_URL` must **never** be configured on Vercel.

## 3. Email (Resend)

1. Add and verify the sending domain (SPF, DKIM and a DMARC record).
2. Create an API key with sending access only → `RESEND_API_KEY`.
3. Add a webhook to `https://<domain>/api/webhooks/resend` for the `email.*` delivery events; copy the
   signing secret → `RESEND_WEBHOOK_SECRET`.
4. `EMAIL_FROM="MOBA 2017 Elections <elections@<verified-domain>>"`.

## 4. Application (Vercel)

1. Import the GitHub repository (framework detected: Next.js; Node.js 24).
2. Environment variables (Production; use separate values for Preview):

   | Variable | Value |
   |---|---|
   | `DATABASE_URL` | `moba_app` pooled connection string |
   | `DATABASE_POOL_MAX` | `5` |
   | `APP_URL` | `https://<domain>` |
   | `APP_SECRET` | `openssl rand -base64 48` |
   | `CREDENTIALS_ENCRYPTION_KEY` | `openssl rand -base64 32` |
   | `EMAIL_TRANSPORT` | `resend` |
   | `RESEND_API_KEY`, `RESEND_WEBHOOK_SECRET`, `EMAIL_FROM`, `EMAIL_REPLY_TO` | from Resend |
   | `CRON_SECRET` | `openssl rand -base64 24` |

   The app refuses to start in production without https, Resend and a cron secret (`src/server/env.ts`).
3. Add the custom domain; Vercel issues the TLS certificate. HSTS is sent automatically.
4. Deploy, then open `https://<domain>/api/health` → `{"status":"ok"}`.

### Scheduled jobs

`vercel.json` registers two crons (Vercel sends `Authorization: Bearer $CRON_SECRET`):

* `/api/cron/elections` — persists automatic opening/closing (votes never depend on it; pages also sync lazily).
* `/api/cron/emails` — retries queued/failed emails and purges expired sessions.

The committed schedules are **daily**, which every Vercel plan accepts. Emails are normally sent immediately
after each action; the cron only retries failures. During an election run both more often:

* **Vercel Pro:** change the schedules to `*/5 * * * *` (elections) and `*/10 * * * *` (emails), or
* **Any plan:** use an external scheduler to call both URLs every 5 minutes with the header
  `Authorization: Bearer <CRON_SECRET>`.

## 5. First administrator

On the operator machine, with the production environment variables exported:

```bash
npm run admin:create -- --email admin@example.org --name "Full Name"
```

The temporary password is printed once, expires in 24 hours and must be changed at first sign-in. Create a
second administrator and the Electoral Committee accounts from **Staff accounts** in the app. Then open
**Settings** and confirm “Database protection: Hardened”.

## 6. Branding

Place the official MOBA logo at `public/brand/moba-logo.png` (transparent PNG, about 600 px wide) and redeploy.
Until then the interface shows a red “MOBA” wordmark.

## 7. Before every election

* Settings → Database protection shows **Hardened**.
* Audit log → **Verify integrity** succeeds.
* Test email delivery with one administrator-owned member account.
* Freeze code deployments for the voting window (SECURITY.md §6).
* Confirm both cron jobs run at the higher frequency.

## 8. After every election

* Publish results; download the results and participation PDFs/CSVs for MOBA's records.
* Run `VACUUM (FULL) ballots, ballot_selections;` with the owner role to discard pre-mix row versions.
* Archive the election.

## 9. Backups and recovery

* **Neon point-in-time history** is the primary backup. For an offline copy, the operator may run
  `pg_dump --format=custom` with the owner URL after each election and store it encrypted.
* **Restore:** create a Neon branch at the desired time, verify it, run `npm run db:harden` against it, then
  point `DATABASE_URL` at it.
* **Application rollback:** Vercel → Deployments → promote a previous deployment.
* **Email outage:** emails stay queued; use “Send queued emails now” (Credentials page) or wait for the cron.

## 10. Monitoring

* Vercel logs: errors are JSON with a short `reference` that users also see. Logs never contain passwords,
  tokens, receipts or ballot choices.
* Resend logs and the app's Email delivery page for delivery problems.
* Optionally add an uptime monitor on `/api/health`.
