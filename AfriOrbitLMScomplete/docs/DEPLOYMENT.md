# Deployment

Target topology:

```
afriorbit.space              Squarespace (existing marketing site)
  └── /training              embeds public/embed.js  →  iframe
learn.afriorbit.space        Vercel  →  this application
  └── Supabase               Postgres + Auth + Storage
```

The LMS runs on its own subdomain rather than inside the marketing site. That is
a security decision as much as a practical one: two-factor flows, session
cookies and file uploads all behave badly in a third-party iframe, and Safari's
third-party cookie handling would break sign-in outright. The embed widget gives
you the catalogue on afriorbit.space; clicking through lands on the real app.

---

## 1. Supabase project

### Create it

1. <https://supabase.com/dashboard> → **New project**.
2. Pick the region closest to your learners. For an African cohort,
   `eu-central-1` (Frankfurt) or `eu-west-2` (London) usually beat US regions on
   latency; `af-south-1` (Cape Town) is best if available on your plan.
3. Save the database password somewhere durable.

### Apply the schema

```bash
npm install -g supabase        # or: npx supabase
supabase login
supabase link --project-ref <your-project-ref>
supabase db push               # applies supabase/migrations in order
```

`db push` runs migrations 0001–0008, which create the schema, the RLS policies,
the storage buckets, the seed curriculum and the JWT claims hook.

### Enable the JWT claims hook

Migration 0008 creates `public.custom_access_token_hook` but cannot enable it —
that is a project setting.

**Dashboard → Authentication → Hooks → Customize Access Token (JWT)** → select
`public.custom_access_token_hook` → Enable.

Without this the app still works, but the proxy has no `user_role` claim and
falls back to treating everyone as a pending learner until their first page
render. Do not skip it.

### Authentication settings

**Dashboard → Authentication → Providers → Email**

- Confirm email: **on**
- Secure email change: **on**
- Minimum password length: **12**
- Password requirements: lower, upper, digits, symbols

**Dashboard → Authentication → Policies**

- Leaked password protection: **on** (checks HaveIBeenPwned)

**Dashboard → Authentication → MFA**

- TOTP enroll: **on**
- TOTP verify: **on**

**Dashboard → Authentication → Sessions**

- Time-box: **168 hours**
- Inactivity timeout: **24 hours**

**Dashboard → Authentication → URL Configuration**

- Site URL: `https://learn.afriorbit.space`
- Redirect URLs: `https://learn.afriorbit.space/auth/callback`
  (add `http://localhost:3000/auth/callback` while developing)

### Email delivery

Supabase's built-in SMTP is rate-limited and unsuitable for production — new
learners will silently not receive confirmations during an intake week.
Configure a custom SMTP provider under **Project Settings → Authentication →
SMTP Settings**. Resend, Postmark and SES all work. Verify SPF, DKIM and DMARC
for `afriorbit.space`, or institutional mail filters will quarantine you.

Customise the email templates (**Authentication → Email Templates**) so the
confirmation message looks like AfriOrbit rather than Supabase — this measurably
improves confirmation rates.

### Collect the keys

**Project Settings → API**

- Project URL → `NEXT_PUBLIC_SUPABASE_URL`
- `anon` `public` key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `service_role` `secret` key → `SUPABASE_SERVICE_ROLE_KEY`

The service-role key bypasses row-level security. It belongs in Vercel's
environment variables and nowhere else — not in the repository, not in a Slack
message, not in a screenshot.

---

## 2. GitHub

```bash
cd afriorbit-lms
git init
git add .
git commit -m "AfriOrbit LMS: initial platform"
git branch -M main
git remote add origin https://github.com/AfriOrbit/LMS.git
git push -u origin main
```

Recommended repository settings:

- Branch protection on `main`: require a pull request, require the CI check.
- Secret scanning and push protection: **on** (Settings → Code security).
- Dependabot alerts and security updates: **on**.

`.env.local` is git-ignored. Confirm with `git status` before your first push.

---

## 3. Vercel

1. <https://vercel.com/new> → import `AfriOrbit/LMS`.
2. Framework preset: **Next.js**. Leave the build settings alone.
3. Add environment variables for **Production**, **Preview** and **Development**:

```
NEXT_PUBLIC_SUPABASE_URL       https://<ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY  <anon key>
SUPABASE_SERVICE_ROLE_KEY      <service role key>
NEXT_PUBLIC_SITE_URL           https://learn.afriorbit.space
NEXT_PUBLIC_BRAND_NAME         AfriOrbit Space
NEXT_PUBLIC_SUPPORT_EMAIL      learn@afriorbit.space
IP_HASH_SALT                   <openssl rand -hex 32>
MFA_POLICY                     all
REGISTRATION_MODE              approval
EMBED_ALLOWED_ORIGINS          https://www.afriorbit.space,https://afriorbit.space
```

Use a **separate Supabase project** for preview deployments if you can. Pointing
previews at production means a preview branch can write real learner data.

4. Deploy.

### Custom domain

**Vercel → Project → Settings → Domains** → add `learn.afriorbit.space`.

Then at your DNS provider (wherever `afriorbit.space` is hosted — for
Squarespace-managed DNS this is Settings → Domains → DNS Settings):

| Type | Host | Value |
|---|---|---|
| CNAME | `learn` | `cname.vercel-dns.com` |

Propagation is usually minutes. Vercel issues the TLS certificate automatically.
Once it resolves, set `NEXT_PUBLIC_SITE_URL` to the final origin and redeploy —
certificate verification URLs and auth redirects are built from it.

---

## 4. Stripe (optional)

Skip entirely if every course is free; the checkout endpoint returns 503 and the
UI degrades cleanly.

1. Stripe Dashboard → **Developers → API keys** → copy the secret key into
   `STRIPE_SECRET_KEY`.
2. **Developers → Webhooks → Add endpoint**
   - URL: `https://learn.afriorbit.space/api/webhooks/stripe`
   - Events: `checkout.session.completed`, `checkout.session.expired`,
     `charge.refunded`
3. Copy the signing secret into `STRIPE_WEBHOOK_SECRET`.
4. Redeploy.

Test locally with the Stripe CLI:

```bash
stripe listen --forward-to localhost:3000/api/webhooks/stripe
stripe trigger checkout.session.completed
```

Set a course price by updating `courses.price_cents` (in minor units — 25000 is
$250.00).

---

## 5. First administrator

Register normally at `https://learn.afriorbit.space/register`. **The first
account created on a fresh database becomes an active administrator**, so the
instance is never left without one.

Immediately after:

1. Complete TOTP enrolment and store the recovery codes somewhere that is not
   the same device as the authenticator.
2. Create a second administrator. One admin with one phone is a single point of
   failure for the whole platform.
3. Visit `/admin/audit` and confirm your own registration and sign-in are
   recorded.

---

## 6. Go-live checklist

**Database**

- [ ] All migrations applied (`supabase db push`)
- [ ] JWT claims hook enabled in the dashboard
- [ ] `npm run db:test` passes against the deployed schema
- [ ] Point-in-time recovery enabled (paid tiers) or a scheduled `pg_dump` in place

**Authentication**

- [ ] Custom SMTP configured, SPF/DKIM/DMARC verified
- [ ] Confirmation email received end-to-end from a real external address
- [ ] Leaked-password protection on
- [ ] TOTP enrol and verify on
- [ ] Session time-box and inactivity timeout set
- [ ] Site URL and redirect URLs match the production origin

**Application**

- [ ] All environment variables set in Vercel Production
- [ ] `IP_HASH_SALT` is a fresh random value, not the example
- [ ] Custom domain resolving with a valid certificate
- [ ] Registration → confirmation → 2FA → approval walked through as a real user
- [ ] Enrol, complete a lesson, pass a quiz, claim a certificate, verify the code
- [ ] Certificate PDF downloads and the integrity hash on it matches `/verify`
- [ ] A second admin exists

**Security**

- [ ] Headers verified at <https://securityheaders.com>
- [ ] `learn.afriorbit.space` refuses to frame (check with a test page)
- [ ] `/embed/catalog` frames only from afriorbit.space
- [ ] Service-role key absent from the repository and from client bundles
- [ ] GitHub secret scanning and push protection on

**Content**

- [ ] Seed courses reviewed and edited to match your actual delivery
- [ ] At least one cohort published with real dates
- [ ] Hardware kits registered with real asset tags
- [ ] Terms of use page written (currently a placeholder link)

---

## 7. Operations

### Backups

Supabase takes daily backups on paid tiers; point-in-time recovery is available
above that. On the free tier, schedule your own:

```bash
supabase db dump --linked -f "backup-$(date +%F).sql"
```

Test a restore before you need one.

### Monitoring

- Vercel Analytics and Logs for request-level errors.
- Supabase Dashboard → Logs for auth failures and Postgres errors.
- `/admin/audit` for behavioural signals. The ones worth watching: repeated MFA
  failures on one account, an admin resetting another user's MFA, bulk enrolment
  outside an intake window, certificate revocation.

### Schema changes

Never edit an applied migration. Add a new one:

```bash
supabase migration new add_something
# edit supabase/migrations/<timestamp>_add_something.sql
supabase db reset      # verify locally from scratch
npm run db:test        # verify the security properties still hold
supabase db push       # apply to the linked project
```

`db:test` after every schema change is not optional. It is the thing that will
tell you a new table shipped without RLS.

### Rotating the service-role key

Supabase Dashboard → Project Settings → API → Reset. Update the Vercel variable
and redeploy in the same window; the Stripe webhook and certificate verification
will fail while the old key is live and the new one is not deployed.

### Rotating `IP_HASH_SALT`

Resets every rate-limit bucket and breaks correlation with older audit entries.
Both are acceptable, but do it deliberately rather than by accident.
