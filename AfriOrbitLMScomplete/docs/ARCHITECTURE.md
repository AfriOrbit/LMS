# Architecture

## Stack

| Layer | Choice | Why |
|---|---|---|
| Framework | Next.js 16, App Router, React 19 | Server components keep data access on the server; server actions remove a whole class of hand-written API surface |
| Language | TypeScript, strict | |
| Styling | Tailwind CSS v4 with CSS custom properties | Tokens in `globals.css`, so the palette can be re-themed without touching components |
| Database | Supabase Postgres | RLS is the authorisation model, not an afterthought |
| Auth | Supabase Auth | Native TOTP MFA with an assurance level in the JWT |
| Storage | Supabase Storage | Private bucket for lab uploads, public for course media |
| Payments | Stripe Checkout | Optional; the app runs free-only without it |
| PDF | pdf-lib | Pure JS, no headless browser, runs in a serverless function |
| Hosting | Vercel | |

---

## The central decision: authorisation lives in Postgres

The alternative — enforcing permissions in application code — is more familiar
and faster to write. It was rejected because it has one failure mode that this
design does not: a single missed check anywhere in the codebase exposes data.

Concretely, `src/lib/actions/learning.ts` could be deleted and replaced with
something malicious, and a learner still could not read another learner's
profile, see an answer key, or grant themselves a role — because those are
refused by row-level security in the database, under the learner's own JWT.

What this costs: more SQL, a real migration discipline, and a test suite that
speaks Postgres. What it buys is that the security review has a small, auditable
surface — `supabase/migrations/0006_rls.sql` and the `SECURITY DEFINER`
functions — rather than every route handler in the application.

### The three-layer pattern

```
┌──────────────────────────────────────────────────────────┐
│ src/proxy.ts                                             │
│   Routing decision from JWT claims. No DB round trip.    │
│   Wrong answer costs: a redirect that need not happen.   │
├──────────────────────────────────────────────────────────┤
│ requireActiveMember() / requireStaff() / requireAdmin()  │
│   Server-side check against the live profiles row.       │
│   Wrong answer costs: a page renders that shows nothing. │
├──────────────────────────────────────────────────────────┤
│ Row-level security + SECURITY DEFINER functions          │
│   The actual boundary. Wrong answer costs: a breach.     │
└──────────────────────────────────────────────────────────┘
```

Each layer is allowed to be wrong. Only the bottom one is allowed to be trusted.

---

## Data model

```
tracks
  └── courses ──────────── course_instructors ── profiles
        ├── modules
        │     └── lessons ──── lesson_progress
        ├── quizzes
        │     ├── quiz_questions   (answer_key: staff only)
        │     └── quiz_attempts    (written only by SECURITY DEFINER fns)
        ├── lab_assignments
        │     └── lab_reports      (grading fields: staff only)
        ├── enrollments
        ├── certificates
        ├── cohorts
        │     └── lab_sessions ──── lab_bookings
        └── orders

hardware_kits ── kit_assignments ── profiles
telemetry_captures ── profiles
invitations · discount_codes · announcements
audit_log (append-only) · rate_limits (service role) · webhook_events (idempotency)
```

### Design notes worth knowing

**`profiles` mirrors `auth.users`.** A trigger copies new users across. The
application never queries the `auth` schema. Role and status default to
`learner`/`pending` regardless of signup metadata.

**`lessons_readable` is the view the app reads.** It returns the syllabus to
everybody — so the catalogue and the embed widget work for anonymous visitors —
and the lesson body only to someone entitled to it. That keeps one query serving
both the marketing and the learning path without branching in application code.

**`quiz_questions_public` omits `answer_key`.** The underlying column has its
`SELECT` privilege revoked from `authenticated`, so the omission is enforced by
the database, not by remembering to write the right `select()` list.

**Progress is derived, not asserted.** `lesson_progress` rows carry a boolean;
`enrollments.progress_pct` is recomputed by trigger. A client that POSTs
`progress_pct: 100` changes nothing.

**Kit assignment uses a partial unique index** — `unique (kit_id) where
returned_at is null` — so a kit cannot be on loan to two people, enforced by the
index rather than by application logic.

**Lab session capacity takes a row lock** (`select ... for update` inside
`app.book_lab_session`), so two learners clicking simultaneously on the last
seat cannot both get it.

---

## Request lifecycle

### Page render

```
Browser
  → proxy.ts        refresh session cookie, check claims, set CSP
  → layout          requireUser()
  → page            requireActiveMember() → data via the user's own client
  → Postgres        RLS applied under the learner's JWT
```

### Server action

```
Client component
  → server action    requireActiveMember() → Zod parse → RPC or query
  → Postgres         SECURITY DEFINER function re-checks authorisation
  → audit            app.write_audit()
  → revalidatePath   → client refresh
```

### Stripe webhook

```
Stripe
  → /api/webhooks/stripe   verify signature over the RAW body
  → webhook_events         insert event id (idempotency; PK rejects retries)
  → service-role client    update order, upsert enrollment
  → audit
```

---

## Directory map

```
src/
  proxy.ts                  Route gate + security headers
  app/
    (marketing)/            Public: catalogue, cohorts, verification
    (auth)/                 Register, login, reset, pending, verify-email
    (app)/                  Authenticated learner surface
    (admin)/                Staff surface
    embed/                  Iframe surface, own stylesheet, no app CSS
    api/                    Certificate PDF, checkout, webhook, embed JSON
  lib/
    env.ts                  Validated config; server-only accessors are lazy
    auth.ts                 Session guards
    security.ts             Rate limit, audit, recovery codes, IP hashing
    validation.ts           Every Zod schema
    stripe.ts               Lazily constructed, optional
    certificate-pdf.ts      pdf-lib renderer
    supabase/               server / client / admin factories
    actions/                auth · learning · admin
    edusat/                 beacon.ts, link-budget.ts — pure, no I/O
  components/
    ui/primitives.tsx       Buttons, cards, fields, badges, alerts
    markdown.tsx            GFM + KaTeX, raw HTML disabled
    learn/                  Sidebar, lesson footer
    sandbox/                Beacon decoder, link budget, mount registry
  types/db.ts               Hand-maintained schema types
```

### Why `lib/edusat` is separate

`beacon.ts` and `link-budget.ts` contain the domain maths — CRC-16/X.25, frame
encode/decode, free-space path loss, G/T, Eb/N0, slant range, pass duration,
LoRa airtime. They are pure functions with no imports from React, Next or
Supabase.

That means the same code backs the browser sandbox, could back a ground-station
tool, and can be unit-tested without a rendering environment. It also means the
numbers a learner sees in the sandbox are the numbers a grader would compute —
there is one implementation of the physics, not two.

---

## Conventions

**Server components by default.** `'use client'` only where interaction demands
it — forms with `useActionState`, the sandboxes, the grading card.

**Server actions over route handlers.** Route handlers exist only where
something external calls in (Stripe), where a non-JSON response is needed
(certificate PDF), or where a third party needs CORS (embed JSON).

**Data fetching in the page, not the component.** Pages query and pass plain
props down. No component reaches for its own data.

**Errors are messages, not exceptions.** Server actions return
`{ ok, message }`; the UI renders it. Guards redirect. Only genuinely
exceptional conditions throw.

**Comments explain why.** The code says what it does. Comments exist where the
reasoning is not recoverable from reading it — an off-by-one in a spec, a
security property that depends on an ordering, a trade-off that looks arbitrary.

---

## Extension points

**A new sandbox.** Write the pure logic in `lib/edusat/`, the component in
`components/sandbox/`, register it in `sandbox-mount.tsx`, then set
`lessons.simulation_key` on a lesson of kind `simulation`. See
[CONTENT.md](CONTENT.md).

**A new role.** Add to the `app_role` enum, update the `RANK` map in
`lib/auth.ts` and the checks in `proxy.ts`, then write policies. Do not
special-case a role in application code without a matching policy.

**Real telemetry ingest.** `telemetry_captures` already models a decoded frame
with RSSI, SNR and validity. An ingest endpoint would authenticate a ground
station, validate the frame, and insert with `source = 'ground_station'`. Keep
the payload path architecturally incapable of triggering any spacecraft or
platform action — the same rule the curriculum teaches.

**SCORM/xAPI or an external LRS.** Emit from the same places that call
`app.write_audit()`. The event vocabulary is already close to xAPI verbs.
