# AfriOrbit Learning

The learning platform for [AfriOrbit Space](https://afriorbit-website.vercel.app)'s EduSat
programme — CubeSat systems engineering, satellite-to-IoT link design, and flight
software, for a technical audience.

Built as a Next.js application on Supabase, deployed on Vercel, and designed to sit
at `learn.afriorbit.space` with an embeddable catalogue widget for the main site.

---

## What it does

**Access control**

- Registration with email confirmation, then mandatory TOTP two-factor enrolment,
  then an administrator approval gate. All three are configurable.
- Recovery codes, stored only as SHA-256 hashes and consumed single-use.
- Three roles — learner, instructor, admin — enforced in Postgres, not just in the UI.
- Invitation codes that approve a partner institution's engineers and enrol them
  in one step. An invitation can never grant admin.
- Append-only audit log covering every authentication, grading and administrative event.

**Learning**

- Tracks → courses → modules → lessons, with Markdown content, GFM tables and
  LaTeX maths (the link-budget lessons need it).
- Progress tracked per lesson and rolled up in the database, so it cannot be forged
  from the client.
- Quiz engine with a question bank, per-attempt shuffling, server-side timing and
  server-side grading. Answer keys are never sent to the browser.
- Verifiable certificates: a public verification page plus a SHA-256 integrity hash
  printed on the PDF.

**Hands-on**

- Cohorts with capacity, delivery mode and timezone.
- Hardware kit inventory with exclusive assignment, due dates and return condition.
- Lab sessions with database-enforced capacity, optional ground-station and TLE
  context for pass-scheduled work.
- Lab reports with structured measurement fields and instructor grading against a
  published rubric.
- Two in-browser sandboxes: an EduSat beacon decoder (real CRC-16/X.25, real frame
  layout) and a link-budget calculator with pass geometry and LoRa time-on-air.

**Commerce**

- Stripe Checkout for paid courses, with an idempotent webhook. Prices come from the
  database, never from the request.
- Discount and invitation codes.

---

## Quick start

```bash
# 1. Install
npm install

# 2. Configure
cp .env.example .env.local
#    Fill in the Supabase values. See "Environment" below.

# 3. Bring up the database (Docker required)
npx supabase start
npx supabase db reset      # applies every migration + the seed curriculum

# 4. Run
npm run dev
```

Open <http://localhost:3000>. Register an account — **the first account created
becomes the administrator automatically** and is activated without approval, so
you are never locked out of a fresh instance.

Emails in local development are captured by Inbucket at <http://localhost:54324>.

### Verify

```bash
npm run typecheck   # tsc
npm run lint        # eslint
npm run build       # production build
npm run db:test     # RLS + business-rule assertions against the database
npm run verify      # the first three, in order
```

`npm run db:test` is the interesting one. It exercises the security model as four
different users and asserts 30-plus properties — that a learner cannot read another
learner's profile, cannot reach an answer key, cannot forge a quiz attempt, cannot
grade their own lab report, cannot approve their own account. See
[docs/SECURITY.md](docs/SECURITY.md).

---

## Environment

| Variable | Required | Notes |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | yes | Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | yes | Public by design; RLS is the boundary |
| `SUPABASE_SERVICE_ROLE_KEY` | yes | **Bypasses RLS.** Server only |
| `NEXT_PUBLIC_SITE_URL` | yes | Canonical origin, no trailing slash |
| `IP_HASH_SALT` | yes | `openssl rand -hex 32` |
| `MFA_POLICY` | no | `all` (default) or `staff` |
| `REGISTRATION_MODE` | no | `approval` (default) or `open` |
| `EMBED_ALLOWED_ORIGINS` | no | Origins permitted to iframe `/embed/*` |
| `STRIPE_SECRET_KEY` | no | Omit to run free-only |
| `STRIPE_WEBHOOK_SECRET` | no | Required if the above is set |

---

## Repository layout

```
supabase/
  migrations/       0001 foundation → 0008 JWT claims hook
  tests/            Supabase shim + the RLS assertion suite
  config.toml       Local stack config, incl. MFA and session policy
src/
  proxy.ts          Route gate + security headers (Next 16 "proxy", ex-middleware)
  app/
    (marketing)/    Public catalogue, cohorts, certificate verification
    (auth)/         Register, sign in, reset, pending
    (app)/          Dashboard, learn, quiz, labs, certificates, account, 2FA
    (admin)/        Users, courses, grading queue, hardware, invitations, audit
    embed/          Iframe surface for afriorbit.space
    api/            Certificate PDF, checkout, Stripe webhook, embed JSON
  lib/
    auth.ts         Session guards
    security.ts     Rate limiting, audit, recovery codes, IP hashing
    actions/        Server actions, grouped by domain
    edusat/         Beacon codec and link-budget engine (pure, testable)
  components/
    sandbox/        The two interactive labs
public/embed.js     The widget you drop on the marketing site
docs/               Architecture, security, deployment, content authoring
```

---

## Documentation

- **[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)** — Supabase project setup, Vercel, DNS
  for `learn.afriorbit.space`, Stripe, and the go-live checklist.
- **[docs/SECURITY.md](docs/SECURITY.md)** — threat model, what each control does,
  what is deliberately *not* covered, and how to verify each claim.
- **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)** — data model, request lifecycle,
  and the reasoning behind the database-first authorisation design.
- **[docs/CONTENT.md](docs/CONTENT.md)** — authoring courses, quizzes, lab
  assignments and new sandboxes.
- **[docs/EMBEDDING.md](docs/EMBEDDING.md)** — putting the catalogue on
  afriorbit.space, including Squarespace instructions.

---

## Licence

Copyright © AfriOrbit Space. All rights reserved.
