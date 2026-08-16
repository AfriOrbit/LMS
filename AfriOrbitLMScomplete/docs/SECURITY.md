# Security

This document states what the platform protects, how, and what it does not
protect. Every claim marked **[verified]** has a corresponding assertion in
`supabase/tests/01_rls_security.sql`, runnable with `npm run db:test`.

---

## 1. Design principle

**The database is the security boundary, not the application.**

Row-level security is enabled *and forced* on every table in `public`
**[verified]**. The application's route guards and UI checks are conveniences —
they make the product usable and they fail fast — but if every line of
TypeScript in this repository were bypassed and an attacker spoke PostgREST
directly with a valid learner token, they would still be unable to read another
learner's data, see an answer key, or grant themselves a role.

That property is the one worth defending, because it is the only one that holds
when someone finds a bug in the UI.

Three consequences run through the codebase:

1. **Anything that grants privilege happens in a `SECURITY DEFINER` function**
   that re-checks authorisation itself — enrolment, role changes, account
   approval, invitation redemption, quiz grading, certificate issue, lab-session
   booking. There is no RLS policy that lets a learner write those tables
   directly.
2. **The service-role key is an escalation, used deliberately.** It appears in
   exactly four places: the Stripe webhook (no user session exists),
   certificate verification (rate-limited, projected view), rate-limit
   accounting, and admin recovery operations that must touch auth-owned tables.
   Each call site names the reason.
3. **Column privileges, not triggers, protect privileged columns.** An earlier
   revision used a `BEFORE UPDATE` trigger to stop learners writing
   `profiles.role`. That was wrong: the trigger ran `SECURITY DEFINER`, so
   `current_user` inside it was already the table owner and the check passed for
   everyone. It is now `REVOKE UPDATE ... GRANT UPDATE (specific, columns)`,
   which the planner enforces before any policy runs and which no execution
   context can confuse.

---

## 2. Authentication

### Password

Supabase Auth, Argon2-hashed server-side. Policy set in `supabase/config.toml`:

- Minimum 12 characters, with lower, upper, digit and symbol required.
- Leaked-password protection should be enabled in the hosted project
  (Dashboard → Authentication → Policies); it checks against HaveIBeenPwned.
- Sessions time out after 24 h idle and are hard-capped at 168 h.
- Refresh-token rotation on, with a 10 s reuse window.

Sign-in failures return a single generic message. Registration with an existing
address returns the same "check your inbox" response as a new one — the
enumeration surface is closed on both.

### Two-factor

TOTP through Supabase's MFA API. `MFA_POLICY=all` (the default) requires a
verified factor on every account; `staff` narrows it to instructors and admins.

The enforcement point is the **assurance level** in the JWT, not a boolean in
our database:

- `aal1` — password only.
- `aal2` — a second factor was presented in *this session*.

`src/proxy.ts` redirects any authenticated request whose session is `aal1` while
a factor is enrolled to the challenge page, and `app.has_mfa()` exposes the same
claim to SQL for policies that want it. `requireActiveMember()` repeats the
check server-side, so a request that somehow skipped the proxy still stops.

Recovery codes: ten per set, generated with `crypto.randomBytes`, stored as
SHA-256 hashes only, compared with `timingSafeEqual`, and removed on use.
Consuming one **unenrols the TOTP factor** and forces re-enrolment — a recovery
code proves possession once; it is not a permanent second factor.

An administrator can clear another user's MFA (`resetUserMfaAction`), but only
from a session that has itself cleared `aal2`, and the action is audited. Verify
the user's identity out of band before doing it — this is the single most
abusable operation in the product.

### Registration gate

Three sequential gates, each independently configurable:

1. Email confirmation (Supabase).
2. TOTP enrolment (`MFA_POLICY`).
3. Administrator approval (`REGISTRATION_MODE=approval`, the default).

Until an account is `active` it holds a valid JWT but reads no course content
**[verified]** — `app.is_active_member()` gates every content policy, and
`app.enroll_self()` refuses outright **[verified]**.

**Bootstrap:** the very first profile created becomes an active admin, so a
fresh instance is never unadministered. Every subsequent account is a pending
learner regardless of what the signup payload claims **[verified]** — the
`raw_user_meta_data` role/status keys are ignored by `app.handle_new_user()`,
closing the classic Supabase self-promotion hole.

---

## 3. Authorisation

### Roles

`learner` < `instructor` < `admin`, stored in `public.profiles.role`.

- Not writable by any authenticated session, including an admin's own, because
  `role` is excluded from the column-level UPDATE grant **[verified]**.
- Changed only through `app.set_user_role()`, which verifies the caller is an
  active admin and refuses self-demotion **[verified]**.
- Account status likewise moves only through `app.set_account_status()`, which
  refuses self-deactivation **[verified]**.

Roles also ride in the JWT as a custom claim (migration 0008) so the proxy can
route without a database round trip. **That claim is advisory.** It can be up to
one token lifetime stale; every real access re-checks the live `profiles` row
through RLS.

### What a learner cannot reach

| Asset | Control | |
|---|---|---|
| Another learner's profile | `profiles_self_select` | **[verified]** |
| Any profile, when anonymous | no anon policy | **[verified]** |
| Quiz answer keys | column `SELECT` revoked; learners use `quiz_questions_public` | **[verified]** |
| Lesson bodies without enrolment | `lessons_readable` redacts `content_md` | **[verified]** |
| Their own grade on a lab report | `app.guard_lab_report_grading()` | **[verified]** |
| A forged quiz attempt | no INSERT policy; `app.start_quiz_attempt()` only | **[verified]** |
| Rewriting a graded attempt | no learner UPDATE policy | **[verified]** |
| The audit log | admin-only SELECT | **[verified]** |
| Hardware inventory | staff-only | **[verified]** |
| Invitation rows | admin-only; redemption is by function | **[verified]** |
| Progress on an unentitled lesson | `WITH CHECK app.can_read_lesson()` | **[verified]** |

### Assessment integrity

Correct answers never leave Postgres. `quiz_questions.answer_key` has its
`SELECT` privilege revoked from `authenticated` at the column level; the
learner-facing view exposes everything except that column.

Grading runs in `app.grade_attempt()`, a `SECURITY DEFINER` function. A client
submits responses; the function compares them against the key and writes the
score. There is no code path in which the browser computes or supplies a score
**[verified]** — a fully correct set scores 100 and passes, an empty set scores
zero and fails, both asserted.

Timing is server-side: `expires_at` is stamped at attempt start, and a
submission arriving more than 30 seconds late is graded on the responses already
recorded rather than the late payload. Attempt caps are enforced in the same
function, and abandoned in-progress attempts are marked and counted so a learner
cannot farm unlimited fresh question draws.

Certificates are issued by `app.issue_certificate()`, which independently
re-verifies 100 % lesson completion *and* a passing attempt on every graded quiz
**[verified]**. Identity and course title are snapshotted at issue, so a later
profile edit cannot rewrite what a certificate claims.

---

## 4. Application-layer controls

### Route gating

`src/proxy.ts` runs before every matched route and decides from JWT claims
alone. It is a routing decision — the worst case for a stale claim is that
someone reaches a page which then renders nothing they are entitled to see.

Server components repeat the check with `requireUser()`,
`requireActiveMember()`, `requireStaff()`, `requireAdmin()`. Route handlers use
`requireApiUser()`, which throws a typed `ApiAuthError` rather than redirecting.

### Input validation

Every value crossing a trust boundary is parsed with Zod before it reaches a
query — see `src/lib/validation.ts`. Server actions never read raw `FormData`
fields directly into a database call.

Two specific patterns worth noting:

- **Never trust a client-supplied foreign key.** `setLessonProgressAction`
  receives a lesson id and resolves the course id from the database rather than
  accepting one, so a learner cannot attribute progress to a course they are not
  in.
- **Never trust a client-supplied amount.** The checkout route reads
  `price_cents` from the courses table; the request body carries only a course id.

### Rate limiting

Fixed-window counters in Postgres (`app.rate_limit_hit`, service-role only).
Keyed by user id where a session exists, otherwise by salted IP hash.

| Action | Limit |
|---|---|
| Sign-in, per IP | 20 / 15 min |
| Sign-in, per account | 8 / 15 min |
| Registration | 5 / hour per IP |
| Password reset | 3 / hour per address |
| MFA challenge / enrol | 10 / 15 min |
| MFA recovery code | 5 / hour |
| Certificate verification | 30 / 10 min per IP |
| Certificate PDF | 30 / 10 min |
| Quiz submission | 40 / hour |
| Checkout | 10 / hour |

Two buckets on sign-in is deliberate: per-IP blunts spraying across many
accounts, per-account blunts stuffing against one target. The limiter fails
*open* on infrastructure error rather than locking out a whole cohort, and logs
loudly when it does.

Supabase's own auth rate limits (config.toml `[auth.rate_limit]`) sit underneath
these as a second layer.

### Audit log

`public.audit_log` is append-only: no UPDATE or DELETE policy exists, and the
privileges are revoked outright so tampering raises an error rather than
silently affecting zero rows **[verified]** — even for an admin.

Covered: sign-in success and failure, rate-limit trips, MFA enrol/challenge/
failure/recovery/reset, password change, role and status changes, enrolment,
quiz attempts and scores, certificate issue and revocation, lab grading, kit
assignment and return, invitation creation and redemption, payment events.

IP addresses are stored as `sha256(salt || ip)`, never in the clear. The log
stays useful for incident review without becoming a register of learners'
network locations — which matters for a programme operating across jurisdictions
with varying data-protection regimes.

### Headers and framing

Set per-request in `src/proxy.ts`:

- `Content-Security-Policy` with `frame-ancestors 'none'` everywhere except
  `/embed/*`, which allows only `EMBED_ALLOWED_ORIGINS`. This is what keeps the
  2FA flow and session cookies out of reach of a clickjacking frame.
- `X-Frame-Options: DENY` (belt and braces for older agents), `nosniff`,
  `Referrer-Policy: strict-origin-when-cross-origin`, a restrictive
  `Permissions-Policy`, `Cross-Origin-Opener-Policy: same-origin`, and HSTS with
  preload in production.

The embed iframe is sandboxed without `allow-same-origin` — it needs no storage,
no cookies and no session.

**Known gap:** the CSP carries `script-src 'unsafe-inline'` because Next's
bootstrap scripts are inline. Tightening this to a nonce with `strict-dynamic`
is the single highest-value hardening left; see §7.

### Content rendering

Lesson and prompt Markdown renders through `react-markdown` **without**
`rehype-raw`. Raw HTML in authored content is escaped, not executed. Authors are
trusted staff roles, but a compromised instructor account still cannot inject
script into a learner's page.

### Stripe

The webhook verifies the signature against the raw body before parsing
anything, and records every event id in `webhook_events` as an idempotency
ledger — Stripe retries aggressively, and without it a retried
`checkout.session.completed` would double-enrol. On handler error the ledger row
is removed so the retry can proceed, and a 500 is returned so Stripe does retry.

Identity comes from `session.metadata`, set by our own server when the session
was created. Nothing from the browser's return trip is trusted.

### Secrets

`SUPABASE_SERVICE_ROLE_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` and
`IP_HASH_SALT` are server-only and read lazily through `src/lib/env.ts`, which
is `import 'server-only'`-guarded so an accidental client import fails the build
rather than shipping a key.

---

## 5. Privacy

- Learner IPs: hashed, never stored raw.
- Recovery codes: hashed, never stored raw.
- Invitation codes: hashed, never stored raw. The plaintext is displayed once at
  creation and cannot be recovered.
- The public certificate verification page shows the recipient name, course,
  date and score — nothing else. No email, no user id, no organisation.
- Certificate codes use a 32-character alphabet excluding `I`, `O`, `0` and `1`,
  giving ~40 bits of entropy over a 12-year namespace. Not enumerable at the
  rate limit, and unambiguous when read aloud or transcribed.

---

## 6. What this does not cover

Stated plainly, because a security document that only lists strengths is
marketing.

- **No WAF or DDoS protection** beyond what Vercel and Supabase provide by
  default.
- **No malware scanning** on lab report uploads. The `lab-uploads` bucket is
  private and MIME-restricted, but a grader downloading a submitted file is
  trusting the learner. If you expect untrusted uploads at scale, put a scanner
  in front.
- **No exam proctoring.** Timed, shuffled, capped attempts with server-side
  grading raise the cost of cheating; they do not prevent a learner opening a
  textbook or asking a friend. If a certificate needs to withstand that, pair it
  with a supervised assessment.
- **No field-level encryption at rest** beyond Supabase's disk encryption.
- **No SSO/SAML.** Add it if a partner institution requires it; Supabase
  supports SAML on its paid tiers.
- **No automated dependency scanning** wired in. Turn on Dependabot or Renovate
  on the repository.
- **The audit log is append-only within Postgres**, not externally attested.
  Anyone with direct database credentials can still alter it. For a stronger
  guarantee, ship it to an append-only external sink.
- **Session revocation is global-on-sign-out**, but there is no admin
  "sign out this user everywhere" button. Suspending the account is the current
  answer; the JWT remains valid until it expires, at which point the refresh
  fails and RLS has been refusing content since the moment of suspension.

---

## 7. Hardening backlog, in priority order

1. **Nonce-based CSP.** Replace `script-src 'unsafe-inline'` with a per-request
   nonce plus `strict-dynamic`. Next supports this; it needs the nonce threaded
   from the proxy through the document.
2. **Leaked-password protection** — enable in the hosted Supabase project.
3. **Externalise the audit log** to an append-only sink for tamper evidence.
4. **Dependabot/Renovate** and `npm audit` in CI.
5. **Alerting** on audit patterns: repeated MFA failures, an admin resetting
   another user's MFA, bulk enrolment, certificate revocation.
6. **Per-cohort data retention** policy and an automated purge job.
7. **Penetration test** before the first paid cohort.

---

## 8. Reporting a vulnerability

Email the platform maintainer rather than opening a public issue. Include
reproduction steps and the account or code you used; do not test against another
learner's data.
